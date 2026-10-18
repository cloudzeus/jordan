// lib/assistant/daily.ts — SERVER. Καθημερινές λειτουργίες του Air Jordan, πάνω σε ό,τι ήδη υπολογίζει η
// εφαρμογή (widgets αρχικής: lib/dashboard/home-data — μόνο βάση, χωρίς SoftOne). ΜΟΝΟ ανάγνωση.
//  • «τι έχω σήμερα»: ραντεβού, οι εργασίες μου, καθυστερήσεις, εκκρεμότητες ανά ενότητα
//  • εκκρεμότητες: OCR προς έλεγχο/αποτυχίες, αιτήματα παραγγελίας, κρατήσεις, προσφορές που λήγουν,
//    ερωτήματα λογιστή, θέματα integrator
//  • εργασίες έργων · παραστατικό με κωδικό (καθρέφτης πρώτα, μετά SoftOne) · κατάσταση λογαριασμού πελάτη
import 'server-only';
import { prisma } from '@/lib/db';
import { softoneGetTable } from '@/lib/softone';
import { loadAccounting, loadAppointments, loadOffers, loadOrderRequests, loadTasks } from '@/lib/dashboard/home-data';
import { loadAccountingQuestions } from '@/lib/accounting/questions';
import { addDays, appointmentCode, formatSlotEl, zonedParts } from '@/lib/appointments-core';
import { fetchDocumentDetail } from '@/lib/document-detail';
import { loadStatement } from '@/lib/statement/server';
import { overdue as statementOverdue } from '@/lib/statement/core';

const dayEl = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : null);

/** OCR: έγγραφα που θέλουν έλεγχο (REVIEW/BLOCKED/άγνωστη φόρμα) ή απέτυχαν — ίδια κριτήρια με το dashboard. */
async function ocrPending() {
  const [review, failed, toPost] = await Promise.all([
    prisma.ocrDocument.count({ where: { OR: [
      { reviewFlags: { path: ['runStatus'], equals: 'REVIEW' } },
      { reviewFlags: { path: ['runStatus'], equals: 'BLOCKED' } },
      { reviewFlags: { path: ['unknownForm'], equals: true } },
    ] } }),
    prisma.ocrDocument.count({ where: { status: 'FAILED' } }),
    prisma.ocrDocument.count({ where: { status: 'COMPLETED', postStatus: { in: ['NONE', 'FAILED'] } } }).catch(() => 0),
  ]);
  return { review, failed, toPost };
}

export async function todayOverview(userId: string) {
  const [appts, tasks, orders, offers, accounting, ocr] = await Promise.all([
    loadAppointments(userId), loadTasks(userId), loadOrderRequests(), loadOffers(), loadAccounting(), ocrPending(),
  ]);
  const today = appts.today;
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  const appt = (a: (typeof appts.items)[number]) => ({
    code: appointmentCode(a.number), when: formatSlotEl(a.startsAt, a.endsAt), with: a.company && a.company !== a.name ? `${a.name} (${a.company})` : a.name,
    topic: a.topic, place: a.place === 'customer' ? 'στον πελάτη' : 'στο atelier', status: a.status === 'PENDING' ? 'περιμένει επιβεβαίωση' : 'επιβεβαιωμένο', mine: a.mine,
  });
  const task = (t: (typeof tasks.mine)[number]) => ({ task: t.name, project: `${t.projectCode} · ${t.projectName}`, due: dayEl(t.end), progress: `${t.progress}%` });
  return {
    date: dayEl(today),
    appointmentsToday: appts.items.filter((a) => a.day === today).map(appt),
    appointmentsTomorrow: appts.items.filter((a) => a.day === tomorrow).map(appt),
    appointmentsAwaitingConfirmation: appts.pending,
    myTasksDueThisWeek: tasks.mine.filter((t) => t.end >= today && t.end <= weekEnd).slice(0, 10).map(task),
    myOverdueTasks: tasks.mine.filter((t) => t.end < today).slice(0, 10).map(task),
    overdueTasks: { count: tasks.overdue.length, top: tasks.overdue.slice(0, 6).map(task) },
    openTasks: tasks.open,
    pending: {
      orderRequests: { count: orders.pending, latest: orders.items.map((o) => ({ number: `ΑΠ-${String(o.number).padStart(6, '0')}`, customer: o.trader, lines: o.lines })) },
      reservationRequests: offers.requests,
      offersClosingThisWeek: offers.items.filter((o) => o.closesAt && o.closesAt.slice(0, 10) <= weekEnd).map((o) => ({ title: o.title, closes: dayEl(o.closesAt), filled: `${o.percent}%` })),
      ocr,
      accountantQuestions: accounting.questions,
      integratorItems: { open: accounting.integrator, high: accounting.high },
    },
    links: { calendar: '/admin/appointments', tasks: '/admin/tasks', ocr: '/admin/ocr/pending', orders: '/admin/order-requests', offers: '/admin/dynamic-offers', accountant: '/admin/accounting/questions' },
  };
}

export type PendingArea = 'all' | 'ocr' | 'orders' | 'reservations' | 'offers' | 'accounting';

export async function pendingWork(area: PendingArea) {
  const out: Record<string, unknown> = {};
  if (area === 'all' || area === 'ocr') {
    const [counts, docs] = await Promise.all([
      ocrPending(),
      prisma.ocrDocument.findMany({
        where: { OR: [{ status: 'FAILED' }, { reviewFlags: { path: ['runStatus'], equals: 'REVIEW' } }, { reviewFlags: { path: ['runStatus'], equals: 'BLOCKED' } }] },
        orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, fileName: true, status: true, createdAt: true },
      }).catch(() => []),
    ]);
    out.ocr = { ...counts, latest: docs.map((d) => ({ file: d.fileName, status: d.status === 'FAILED' ? 'απέτυχε' : 'θέλει έλεγχο', date: dayEl(d.createdAt.toISOString()), link: `/admin/ocr/${d.id}` })), page: '/admin/ocr/pending' };
  }
  if (area === 'all' || area === 'orders') {
    const o = await loadOrderRequests();
    out.orderRequests = { count: o.pending, latest: o.items.map((x) => ({ number: `ΑΠ-${String(x.number).padStart(6, '0')}`, customer: x.trader, lines: x.lines, date: dayEl(x.createdAt), delivery: dayEl(x.deliveryDate) })), page: '/admin/order-requests' };
  }
  if (area === 'all' || area === 'reservations' || area === 'offers') {
    const o = await loadOffers();
    out.offers = { reservationRequests: o.requests, drafts: o.drafts, live: o.items.map((x) => ({ title: x.title, status: x.status, closes: dayEl(x.closesAt), filled: `${x.percent}%`, customers: x.customers })), page: '/admin/dynamic-offers' };
  }
  if (area === 'all' || area === 'accounting') {
    const [qs, items] = await Promise.all([
      loadAccountingQuestions().catch(() => []),
      prisma.integratorItem.findMany({ where: { status: 'OPEN' }, orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }], take: 8, select: { title: true, severity: true } }),
    ]);
    const open = qs.filter((q) => !q.answer || q.answer.stale);
    out.accounting = {
      accountantQuestions: { count: open.length, top: open.slice(0, 6).map((q) => ({ title: q.title, question: q.question })), page: '/admin/accounting/questions' },
      integrator: { count: items.length, top: items.map((i) => ({ title: i.title, severity: i.severity })), page: '/admin/accounting/integrator' },
    };
  }
  return out;
}

export async function tasksView(userId: string, scope: 'mine' | 'overdue' | 'soon' | 'all', prjc?: number | null) {
  const t = await loadTasks(userId);
  const pick = scope === 'mine' ? t.mine : scope === 'overdue' ? t.overdue : scope === 'soon' ? t.soon : [...t.overdue, ...t.soon];
  const rows = (prjc ? [...t.mine, ...t.overdue, ...t.soon].filter((x, i, arr) => x.prjc === prjc && arr.findIndex((y) => y.id === x.id) === i) : pick);
  return {
    today: dayEl(t.today), scope, open: t.open, overdueCount: t.overdue.length,
    tasks: rows.slice(0, 25).map((x) => ({ task: x.name, project: `${x.projectCode} · ${x.projectName}`, start: dayEl(x.start), due: dayEl(x.end), progress: `${x.progress}%`, late: x.end < t.today })),
    phases: t.phases,
    page: prjc ? `/admin/projects/${prjc}` : '/admin/tasks',
  };
}

/** Κωδικός παραστατικού → FINDOC: πρώτα ο τοπικός καθρέφτης (γρήγορα), μετά ζωντανά από το SoftOne. */
export async function findocByCode(code: string): Promise<number | null> {
  const c = code.trim().toLocaleUpperCase('el');
  const m = await prisma.softoneFindoc.findFirst({ where: { fincode: { equals: c, mode: 'insensitive' } }, select: { findoc: true } }).catch(() => null);
  if (m) return m.findoc;
  if (!/^[\p{L}\p{N}\-./ ]{2,30}$/u.test(c)) return null;
  const rows = await softoneGetTable('FINDOC', ['FINDOC'], `FINCODE='${c.replace(/'/g, "''")}'`);
  return rows[0] ? Number(rows[0].FINDOC) || null : null;
}

export async function documentView(findoc: number) {
  const d = await fetchDocumentDetail(findoc);
  if (!d) return null;
  return {
    fincode: d.fincode, date: dayEl(d.date), type: d.seriesName ?? d.family, family: d.family, cancelled: d.cancelled || undefined,
    trader: d.trader ? `${d.trader.code ?? ''} · ${d.trader.name}` : null, project: d.project ? `${d.project.code} · ${d.project.name}` : null,
    net: d.net, vat: d.vat, total: d.total, discount: d.docDiscount || undefined, mark: d.mark, comments: d.comments,
    lines: d.lines.slice(0, 40).map((l) => l),
    linesCount: d.lines.length,
    fromDocuments: d.sources.map((s) => s.fincode),
    pdf: d.mark ? `/api/admin/projects/documents/${d.findoc}/pdf` : null,
    refs: { trdr: d.trader?.trdr ?? null, prjc: d.project?.prjc ?? null },
  };
}

/** Κατάσταση λογαριασμού πελάτη (ίδια με «Emails & PDF → Κατάσταση λογαριασμού»). Μόνο ανάγνωση. */
export async function statementView(trdr: number, from?: string | null, to?: string | null) {
  const d = await loadStatement(trdr, { from, to });
  const s = d.statement;
  return {
    customer: `${d.customer.code} · ${d.customer.name}`, email: d.customer.email,
    period: s.from ? `${dayEl(s.from)} – ${dayEl(s.to)}` : `έως ${dayEl(s.to)}`,
    opening: s.opening, charges: s.periodDebit, payments: s.periodCredit,
    balance: s.closing, balanceMeaning: s.closing > 0.005 ? 'ο πελάτης χρωστά' : s.closing < -0.005 ? 'πιστωτικό υπόλοιπο (έχει πληρώσει παραπάνω)' : 'εξοφλημένος',
    overdueOver30Days: statementOverdue(s),
    ageing: s.aging.filter((a) => Math.abs(a.amount) >= 0.01).map((a) => ({ label: a.label, amount: a.amount })),
    lastPayment: s.lastPayment ? { date: dayEl(s.lastPayment.day), amount: s.lastPayment.amount, document: s.lastPayment.fincode } : null,
    openItems: s.open.slice(0, 15).map((o) => ({ document: o.fincode, date: dayEl(o.day), kind: o.kindLabel, project: o.project, amount: o.amount, stillOpen: o.open, daysOld: o.days })),
    pdf: `/api/admin/statements/${trdr}/pdf`,
    sendPage: `/admin/emails?tab=statement&trdr=${trdr}`,
  };
}

export const todayIso = () => zonedParts(new Date()).date;
