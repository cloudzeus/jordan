import 'server-only';
// Δεδομένα των widgets της αρχικής (/admin). ΚΑΝΟΝΑΣ: τίποτα εδώ δεν καλεί το SoftOne — μόνο η βάση
// της εφαρμογής (καθρέφτες, στιγμιότυπα). Κάθε widget φορτώνει μόνο του (δικό του Suspense), οπότε
// ένα αργό ή αποτυχημένο δεν κρατά την υπόλοιπη σελίδα.
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { zonedParts, zonedToUtc, addDays } from '@/lib/appointments-core';
import { schedule, dateOnly, phaseOf, PHASES, type PhaseKey } from '@/lib/project-tasks-core';
import { loadDashboard } from '@/lib/dashboard/stats';
import { countOpenQuestions } from '@/lib/accounting/questions';
import { listOffers } from '@/lib/container-offers';
import type { ProjectProfit } from '@/lib/project-profit/calc';
import { financeTotals, monthlySeries, monthToDate, projectsAtRisk, toLite, totalAgeing } from './finance';

export const todayAthens = () => zonedParts(new Date()).date;

// ── Οικονομικά έργων (στιγμιότυπο ProjectFinancials) ─────────────────────────

export const loadFinance = cache(async () => {
  const [rows, projects] = await Promise.all([
    prisma.projectFinancials.findMany({
      select: { prjc: true, revenue: true, collected: true, openAmount: true, costs: true, overhead: true, netProfit: true, marginPct: true, issues: true, computedAt: true, data: true },
    }),
    prisma.softoneProject.findMany({ where: { isActive: true }, select: { prjc: true, code: true, name: true } }),
  ]);
  const today = todayAthens();
  const lites = rows.map((r) => toLite(r.data as unknown as ProjectProfit));
  const months = monthlySeries(lites, today, 12);
  const computedAt = rows.reduce<Date | null>((m, r) => (!m || r.computedAt > m ? r.computedAt : m), null);
  const names = new Map(projects.map((p) => [p.prjc, { code: p.code, name: p.name }]));
  const allRisk = projectsAtRisk(rows, names, 1_000);
  return {
    mtd: monthToDate(lites, today),
    computedAt: computedAt?.toISOString() ?? null,
    projects: rows.length,
    totals: financeTotals(rows),
    months,
    ageing: totalAgeing(lites),
    risk: projectsAtRisk(rows, names, 6),
    // «Σε κίνδυνο» για το νούμερο = οικονομικός κίνδυνος· οι ελλείψεις δεδομένων μετρούν χωριστά.
    riskCount: allRisk.filter((r) => r.reasons.some((x) => x !== 'issues')).length,
    issuesOnly: allRisk.filter((r) => r.reasons.every((x) => x === 'issues')).length,
  };
});
export type FinanceData = Awaited<ReturnType<typeof loadFinance>>;

// ── Ραντεβού: σήμερα + 7 ημέρες ──────────────────────────────────────────────

export async function loadAppointments(userId: string) {
  const today = todayAthens();
  const from = zonedToUtc(today, '00:00');
  const to = zonedToUtc(addDays(today, 8), '00:00');
  const [rows, pending] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: from, lt: to }, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { startsAt: 'asc' },
      take: 40,
      select: { id: true, number: true, startsAt: true, endsAt: true, status: true, name: true, company: true, topic: true, place: true, assignedToId: true },
    }),
    prisma.appointment.count({ where: { status: 'PENDING', startsAt: { gt: new Date() } } }),
  ]);
  return {
    today,
    pending,
    items: rows.map((a) => ({
      ...a, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(),
      day: zonedParts(a.startsAt).date, mine: a.assignedToId === userId,
    })),
  };
}
export type AppointmentsData = Awaited<ReturnType<typeof loadAppointments>>;

// ── Εργασίες έργων ───────────────────────────────────────────────────────────

export type TaskRow = { id: string; prjc: number; projectCode: string; projectName: string; name: string; end: string; start: string; progress: number; phase: PhaseKey };

export const loadTasks = cache(async (userId: string) => {
  // Μόνο έργα με ανοιχτή εργασία — αλλά το πρόγραμμα χρειάζεται ΟΛΕΣ τις εργασίες τους (εξαρτήσεις).
  const open = await prisma.projectTask.findMany({ where: { progress: { lt: 100 } }, select: { prjc: true }, distinct: ['prjc'] });
  const prjcs = open.map((o) => o.prjc);
  if (!prjcs.length) return { today: todayAthens(), mine: [] as TaskRow[], overdue: [] as TaskRow[], soon: [] as TaskRow[], phases: PHASES.filter((p) => p.key !== 'DONE').map((p) => ({ key: p.key as PhaseKey, label: p.label, count: 0 })), open: 0 };
  const [tasks, projects] = await Promise.all([
    prisma.projectTask.findMany({
      where: { prjc: { in: prjcs } },
      select: { id: true, prjc: true, name: true, startDate: true, durationValue: true, durationUnit: true, progress: true, dependsOn: { select: { dependsOnId: true } }, parties: { select: { kind: true, userId: true } } },
    }),
    prisma.softoneProject.findMany({ where: { prjc: { in: prjcs } }, select: { prjc: true, code: true, name: true, fromDate: true } }),
  ]);
  const today = todayAthens();
  const soonLimit = addDays(today, 7);
  const pBy = new Map(projects.map((p) => [p.prjc, p]));
  const rows: (TaskRow & { mineFlag: boolean })[] = [];
  for (const prjc of prjcs) {
    const list = tasks.filter((t) => t.prjc === prjc);
    const p = pBy.get(prjc);
    const sched = schedule(list.map((t) => ({ id: t.id, startDate: dateOnly(t.startDate), durationValue: t.durationValue, durationUnit: t.durationUnit, dependsOn: t.dependsOn.map((d) => d.dependsOnId) })), dateOnly(p?.fromDate) ?? today);
    for (const t of list) {
      if (t.progress >= 100) continue;
      const s = sched.rows.get(t.id);
      if (!s) continue;
      rows.push({
        id: t.id, prjc, projectCode: p?.code ?? String(prjc), projectName: p?.name ?? `Έργο ${prjc}`, name: t.name,
        start: s.start, end: s.end, progress: t.progress, phase: phaseOf(t.progress),
        mineFlag: t.parties.some((x) => x.kind === 'EMPLOYEE' && x.userId === userId),
      });
    }
  }
  const byEnd = (a: TaskRow, b: TaskRow) => a.end.localeCompare(b.end);
  const strip = ({ mineFlag: _m, ...r }: TaskRow & { mineFlag: boolean }): TaskRow => r;
  const counts = new Map<PhaseKey, number>();
  for (const r of rows) counts.set(r.phase, (counts.get(r.phase) ?? 0) + 1);
  return {
    today,
    open: rows.length,
    mine: rows.filter((r) => r.mineFlag).sort(byEnd).map(strip),
    overdue: rows.filter((r) => r.end < today).sort(byEnd).map(strip),
    soon: rows.filter((r) => r.end >= today && r.end <= soonLimit).sort(byEnd).map(strip),
    phases: PHASES.filter((p) => p.key !== 'DONE').map((p) => ({ key: p.key as PhaseKey, label: p.label, count: counts.get(p.key) ?? 0 })),
  };
});
export type TasksData = Awaited<ReturnType<typeof loadTasks>>;

// ── Αιτήματα παραγγελίας ─────────────────────────────────────────────────────

export async function loadOrderRequests() {
  const [pending, latest] = await Promise.all([
    prisma.orderRequest.count({ where: { status: 'SUBMITTED' } }),
    prisma.orderRequest.findMany({
      where: { status: 'SUBMITTED' }, orderBy: { createdAt: 'desc' }, take: 5,
      select: { id: true, number: true, trdr: true, createdAt: true, deliveryDate: true, _count: { select: { lines: true } } },
    }),
  ]);
  const traders = latest.length ? await prisma.softoneTrader.findMany({ where: { trdr: { in: latest.map((l) => l.trdr) } }, select: { trdr: true, name: true } }) : [];
  const tn = new Map(traders.map((t) => [t.trdr, t.name]));
  return {
    pending,
    items: latest.map((l) => ({ id: l.id, number: l.number, trader: tn.get(l.trdr) ?? `TRDR ${l.trdr}`, lines: l._count.lines, createdAt: l.createdAt.toISOString(), deliveryDate: l.deliveryDate?.toISOString() ?? null })),
  };
}

// ── Δυναμικές προσφορές & κρατήσεις ──────────────────────────────────────────

export async function loadOffers() {
  const [offers, requests] = await Promise.all([
    listOffers(),
    prisma.containerReservation.count({ where: { status: 'PENDING', offer: { status: { in: ['OPEN', 'SCHEDULED'] } } } }),
  ]);
  const live = offers.filter((o) => o.status === 'OPEN' || o.status === 'SCHEDULED');
  return {
    requests,
    drafts: offers.filter((o) => o.status === 'DRAFT').length,
    items: live
      .sort((a, b) => (a.closesAt ?? '9999').localeCompare(b.closesAt ?? '9999'))
      .slice(0, 4)
      .map((o) => ({ id: o.id, title: o.title, status: o.status, closesAt: o.closesAt, percent: o.percent, filled: o.filled, capacity: o.capacity, customers: o.customers })),
  };
}

// ── OCR ──────────────────────────────────────────────────────────────────────

export const loadOcr = cache(() => loadDashboard(30));

// ── Λογιστήριο & integrator ──────────────────────────────────────────────────

export async function loadAccounting() {
  const [questions, items] = await Promise.all([
    countOpenQuestions(),
    prisma.integratorItem.groupBy({ by: ['severity'], where: { status: 'OPEN' }, _count: true }),
  ]);
  const sev = Object.fromEntries(items.map((i) => [i.severity, i._count])) as Record<string, number>;
  return { questions, integrator: items.reduce((s, i) => s + i._count, 0), high: sev.high ?? 0, mid: sev.mid ?? 0, low: sev.low ?? 0 };
}

// ── Leads & newsletter ───────────────────────────────────────────────────────

export async function loadLeads() {
  const today = todayAthens();
  const start = addDays(today, -83); // 12 πλήρεις εβδομάδες, η τελευταία τελειώνει σήμερα
  const since = zonedToUtc(start, '00:00');
  const [recent, latest, subscribers, toSoftone] = await Promise.all([
    prisma.lead.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, name: true, email: true, company: true, sources: true, createdAt: true, softoneStatus: true } }),
    prisma.newsletterSubscriber.count({ where: { status: 'CONFIRMED' } }),
    prisma.lead.count({ where: { softoneStatus: { in: ['PENDING', 'FAILED'] } } }),
  ]);
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: addDays(start, i * 7), count: 0 }));
  const startMs = Date.parse(`${start}T00:00:00Z`);
  for (const l of recent) {
    const d = Date.parse(`${zonedParts(l.createdAt).date}T00:00:00Z`);
    const i = Math.floor((d - startMs) / (7 * 86_400_000));
    if (i >= 0 && i < 12) weeks[i].count++;
  }
  const last30 = recent.filter((l) => l.createdAt.getTime() >= Date.now() - 30 * 86_400_000).length;
  return {
    weeks, last30, subscribers, toSoftone,
    latest: latest.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
  };
}

// ── Δραστηριότητα & Air Jordan ───────────────────────────────────────────────

export async function loadActivity() {
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, userEmail: true, action: true, resource: true, resourceId: true, createdAt: true } });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function loadAssistant(userId: string) {
  const rows = await prisma.assistantConversation.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 3, select: { id: true, title: true, updatedAt: true } });
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}
