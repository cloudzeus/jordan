import 'server-only';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { listTasks } from '@/lib/project-tasks';
import { contractRef, crewTotal, docTitle, STATUS_LABEL, type ContractStatus } from '@/lib/contracts/core';
import type { PartyRef } from '@/lib/rbac';

/**
 * Δεδομένα του portal για όσους ΕΚΤΕΛΟΥΝ: συνεργάτες (Partner) και συνεργεία (προμηθευτές SoftOne).
 *
 * Ο κανόνας: βλέπουν μόνο ό,τι τους ανατέθηκε — τις δικές τους γραμμές με την ΑΜΟΙΒΗ τους (`crewFee`,
 * ποτέ την τιμή πώλησης στον πελάτη), τα δικά τους ορόσημα πληρωμής, τα έγγραφα «ανάθεσης» και τις
 * εργασίες έργων όπου είναι εμπλεκόμενοι. Τίποτα από αυτά δεν έρχεται από τον client — η ταυτότητα
 * βγαίνει από τον χρήστη (`partyOf`).
 */

/** Συμβάσεις που «τρέχουν»: το συνεργείο τις βλέπει από την αποδοχή και μετά (όχι πρόχειρα / απλές προσφορές). */
const VISIBLE_STATUSES = ['ACCEPTED', 'ACTIVE', 'COMPLETED'] as const;

// Ποτέ φίλτρο με null: ένας «κενός» TRDR θα ταίριαζε με όλα τα μέρη χωρίς TRDR (-1 δεν υπάρχει).
const supplierOf = (p: PartyRef) => p.supplierTrdr ?? -1;

const contractPartyWhere = (p: PartyRef): Prisma.ContractPartyWhereInput =>
  p.partnerId ? { partnerId: p.partnerId } : { kind: 'SUPPLIER', trdr: supplierOf(p) };

const taskPartyWhere = (p: PartyRef): Prisma.ProjectTaskPartyWhereInput =>
  p.partnerId ? { kind: 'PARTNER', partnerId: p.partnerId } : { kind: 'SUPPLIER', trdr: supplierOf(p) };

const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export type PartyMilestone = { id: string; title: string; deliverables: string | null; dueDate: string | null; amount: number; status: string; paidAt: string | null };
export type PartyAssignment = {
  contractId: string; ref: string; title: string; status: string; statusLabel: string;
  startDate: string | null; endDate: string | null;
  site: { line: string | null; lat: number | null; lng: number | null };
  prjc: number | null; projectName: string | null; customerName: string | null;
  specialty: string | null; scope: string | null;
  lines: { id: string; name: string; qty: number; unit: string | null; fee: number | null; notes: string | null }[];
  feeTotal: number;
  milestones: PartyMilestone[];
  documents: { id: string; title: string; version: number; createdAt: string; hasFile: boolean }[];
};

const siteLine = (c: { siteFormatted: string | null; siteAddress: string | null; siteCity: string | null }) =>
  c.siteFormatted || [c.siteAddress, c.siteCity].filter(Boolean).join(', ') || null;

async function loadAssignments(p: PartyRef, contractId?: string): Promise<PartyAssignment[]> {
  const rows = await prisma.contractParty.findMany({
    where: { ...contractPartyWhere(p), contract: { status: { in: [...VISIBLE_STATUSES] }, ...(contractId ? { id: contractId } : {}) } },
    include: {
      contract: { select: {
        id: true, number: true, title: true, status: true, startDate: true, endDate: true, prjc: true, customerName: true,
        siteFormatted: true, siteAddress: true, siteCity: true, siteLat: true, siteLng: true,
      } },
      lines: { where: { inactive: false }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, qty: true, unit: true, crewFee: true, notes: true, partyId: true, unitPrice: true } },
      milestones: { orderBy: [{ sortOrder: 'asc' }, { dueDate: 'asc' }] },
      documents: { where: { audience: 'PARTY' }, orderBy: { createdAt: 'desc' }, select: { id: true, stage: true, version: true, createdAt: true, fileId: true } },
    },
    orderBy: { contract: { startDate: 'desc' } },
  });
  const prjcs = [...new Set(rows.map((r) => r.contract.prjc).filter((x): x is number => x != null))];
  const projects = prjcs.length ? await prisma.softoneProject.findMany({ where: { prjc: { in: prjcs } }, select: { prjc: true, name: true } }) : [];
  const pname = new Map(projects.map((x) => [x.prjc, x.name]));
  return rows.map((r) => {
    const c = r.contract;
    return {
      contractId: c.id, ref: contractRef(c.number), title: c.title, status: c.status, statusLabel: STATUS_LABEL[c.status as ContractStatus] ?? c.status,
      startDate: dateOnly(c.startDate), endDate: dateOnly(c.endDate),
      site: { line: siteLine(c), lat: c.siteLat, lng: c.siteLng },
      prjc: c.prjc, projectName: c.prjc != null ? pname.get(c.prjc) ?? null : null, customerName: c.customerName,
      specialty: r.specialty, scope: r.scope,
      lines: r.lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, unit: l.unit, fee: l.crewFee, notes: l.notes })),
      feeTotal: crewTotal(r.lines, r.id),
      milestones: r.milestones.map((m) => ({ id: m.id, title: m.title, deliverables: m.deliverables, dueDate: dateOnly(m.dueDate), amount: m.amount, status: m.status, paidAt: m.paidAt?.toISOString() ?? null })),
      documents: r.documents.map((d) => ({ id: d.id, title: docTitle(d.stage, 'PARTY'), version: d.version, createdAt: d.createdAt.toISOString(), hasFile: !!d.fileId })),
    };
  });
}

export const partyAssignments = (p: PartyRef) => loadAssignments(p);
export const partyAssignment = async (p: PartyRef, contractId: string) => (await loadAssignments(p, contractId))[0] ?? null;

export type PartyTask = {
  id: string; prjc: number; projectName: string; name: string; description: string | null;
  start: string; end: string; progress: number; phase: string; files: { id: string; name: string; ext: string }[];
};

/** Εργασίες έργων όπου ο συνεργάτης/το συνεργείο είναι εμπλεκόμενος — με το υπολογισμένο πρόγραμμα. */
export async function partyTasks(p: PartyRef): Promise<PartyTask[]> {
  const links = await prisma.projectTaskParty.findMany({ where: taskPartyWhere(p), select: { taskId: true, task: { select: { prjc: true } } }, take: 500 });
  if (!links.length) return [];
  const mine = new Set(links.map((l) => l.taskId));
  const prjcs = [...new Set(links.map((l) => l.task.prjc))].slice(0, 40);
  const [lists, projects] = await Promise.all([
    Promise.all(prjcs.map((x) => listTasks(x))),
    prisma.softoneProject.findMany({ where: { prjc: { in: prjcs } }, select: { prjc: true, name: true } }),
  ]);
  const pname = new Map(projects.map((x) => [x.prjc, x.name]));
  return lists.flatMap((l) => l.tasks)
    .filter((t) => mine.has(t.id))
    .map((t) => ({
      id: t.id, prjc: t.prjc, projectName: pname.get(t.prjc) ?? `Έργο ${t.prjc}`, name: t.name, description: t.description,
      start: t.sched.start, end: t.sched.end, progress: t.progress, phase: t.phase, files: t.files.map((f) => ({ id: f.id, name: f.name, ext: f.ext })),
    }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, 'el'));
}

/** Αρχείο εργασίας για λήψη: μόνο αν η εργασία έχει τον χρήστη ως εμπλεκόμενο. */
export async function partyTaskFile(p: PartyRef, fileId: string) {
  const link = await prisma.projectTaskFile.findFirst({
    where: { fileId, task: { parties: { some: taskPartyWhere(p) } } },
    include: { file: true },
  });
  return link?.file ?? null;
}

/** Έγγραφο ανάθεσης (PDF) για λήψη: μόνο του ίδιου, σε σύμβαση που τρέχει. */
export async function partyContractDocFile(p: PartyRef, docId: string) {
  const d = await prisma.contractDocument.findFirst({
    where: { id: docId, audience: 'PARTY', party: contractPartyWhere(p), contract: { status: { in: [...VISIBLE_STATUSES] } } },
    select: { fileId: true },
  });
  return d?.fileId ? prisma.entityFile.findUnique({ where: { id: d.fileId } }) : null;
}

/** Ποιον βλέπει ο χρήστης στην κεφαλίδα: επωνυμία συνεργάτη ή προμηθευτή. */
export async function partyName(p: PartyRef): Promise<string | null> {
  if (p.partnerId) return (await prisma.partner.findUnique({ where: { id: p.partnerId }, select: { name: true } }))?.name ?? null;
  return (await prisma.softoneTrader.findUnique({ where: { trdr: supplierOf(p) }, select: { name: true } }))?.name ?? null;
}

/** Συνεργάτης: τα έργα και οι πελάτες με τους οποίους τον έχει συνδέσει η εταιρία. */
export async function partnerNetwork(partnerId: string) {
  const [pp, pc] = await Promise.all([
    prisma.partnerProject.findMany({ where: { partnerId }, select: { prjc: true, role: true } }),
    prisma.partnerCustomer.findMany({ where: { partnerId }, select: { trdr: true } }),
  ]);
  const [projects, traders] = await Promise.all([
    pp.length ? prisma.softoneProject.findMany({ where: { prjc: { in: pp.map((x) => x.prjc) } }, select: { prjc: true, code: true, name: true, isActive: true, fromDate: true, finalDate: true } }) : [],
    pc.length ? prisma.softoneTrader.findMany({ where: { trdr: { in: pc.map((x) => x.trdr) } }, select: { trdr: true, name: true, city: true } }) : [],
  ]);
  const role = new Map(pp.map((x) => [x.prjc, x.role]));
  return {
    projects: projects.map((x) => ({ prjc: x.prjc, code: x.code, name: x.name, active: x.isActive, role: role.get(x.prjc) ?? null, from: dateOnly(x.fromDate), to: dateOnly(x.finalDate) })),
    customers: traders.map((t) => ({ trdr: t.trdr, name: t.name, city: t.city })).sort((a, b) => a.name.localeCompare(b.name, 'el')),
  };
}

/** Επερχόμενα ραντεβού του συνεργάτη (τα συνεργεία δεν έχουν ραντεβού στο atelier). */
export async function partnerAppointments(partnerId: string) {
  const rows = await prisma.appointment.findMany({
    where: { partnerId, status: { in: ['PENDING', 'CONFIRMED'] }, endsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' }, take: 6,
    select: { id: true, startsAt: true, endsAt: true, status: true, place: true, location: true, topic: true },
  });
  return rows.map((a) => ({ ...a, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString() }));
}

/** Σύνοψη πληρωμών από τα ορόσημα: τι πληρώθηκε, τι οφείλεται (παραδόθηκε), τι έρχεται. */
export function paymentSummary(assignments: PartyAssignment[]) {
  const all = assignments.flatMap((a) => a.milestones.map((m) => ({ ...m, contractId: a.contractId, contractTitle: a.title, ref: a.ref })));
  const sum = (s: string) => all.filter((m) => m.status === s).reduce((t, m) => t + m.amount, 0);
  return {
    paid: sum('PAID'), due: sum('DONE'), upcoming: sum('PENDING'),
    next: all.filter((m) => m.status !== 'PAID').sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    history: all.filter((m) => m.status === 'PAID').sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '')),
  };
}
