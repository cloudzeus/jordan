// lib/contracts/service.ts — SERVER. Συμβάσεις & Προσφορές: αποθήκευση, συνεργεία, μεταβάσεις και
// milestones → εργασίες έργου (ProjectTask, στο ημερολόγιο). ΚΑΜΙΑ εγγραφή στο SoftOne εδώ — η
// δημιουργία PRJC ζει στο lib/contracts/softone.ts και θέλει ρητή επιβεβαίωση.
import 'server-only';
import { prisma } from '@/lib/db';
import { createTask, deleteTask, updateTask, TaskError } from '@/lib/project-tasks';
import { saveProjectSite } from '@/lib/project-site';
import {
  canTransition, contractRef, stageAfter, totals, transitionTo, type ContractAction, type ContractInput,
} from './core';

export class ContractError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const d = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);
const ds = (v: Date | null) => (v ? v.toISOString().slice(0, 10) : null);

// ── Προβολή ────────────────────────────────────────────────────────────────────────────────────
export async function getContract(id: string) {
  const c = await prisma.contract.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      parties: { orderBy: { sortOrder: 'asc' } },
      members: true,
      milestones: { orderBy: { sortOrder: 'asc' } },
      documents: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!c) return null;
  const [trader, project, users, files] = await Promise.all([
    c.trdr ? prisma.softoneTrader.findUnique({ where: { trdr: c.trdr }, select: { code: true, name: true, email: true, phone: true, afm: true } }) : null,
    c.prjc ? prisma.softoneProject.findUnique({ where: { prjc: c.prjc }, select: { code: true, name: true } }) : null,
    c.members.length ? prisma.user.findMany({ where: { id: { in: c.members.map((m) => m.userId) } }, select: { id: true, name: true, email: true } }) : [],
    prisma.entityFile.findMany({ where: { id: { in: c.documents.map((x) => x.fileId).filter((x): x is string => !!x) } }, select: { id: true, size: true } }),
  ]);
  const fileSize = new Map(files.map((f) => [f.id, f.size]));
  const t = totals(c.lines, c.vatRate);
  return {
    id: c.id, number: c.number, ref: contractRef(c.number), title: c.title, summary: c.summary, kind: c.kind, stage: c.stage, status: c.status,
    trdr: c.trdr, customer: trader ? { code: trader.code, name: trader.name, email: trader.email, phone: trader.phone, afm: trader.afm } : null,
    customerName: c.customerName, customerEmail: c.customerEmail, customerPhone: c.customerPhone,
    prjc: c.prjc, project: project ? { code: project.code, name: project.name } : null,
    site: c.siteLat != null && c.siteLng != null ? {
      address: c.siteAddress, zip: c.siteZip, district: c.siteDistrict, city: c.siteCity, formatted: c.siteFormatted,
      lat: c.siteLat, lng: c.siteLng, source: (c.siteSource ?? 'geocode') as 'geocode' | 'marker' | 'manual', precision: (c.sitePrecision ?? null) as 'exact' | 'street' | 'area' | null,
    } : null,
    startDate: ds(c.startDate), endDate: ds(c.endDate), validUntil: ds(c.validUntil), vatRate: c.vatRate, terms: c.terms,
    acceptedAt: c.acceptedAt?.toISOString() ?? null, activatedAt: c.activatedAt?.toISOString() ?? null, completedAt: c.completedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    totals: t,
    lines: c.lines.map((l) => ({
      id: l.id, kind: l.kind as 'MATERIAL' | 'SERVICE', mtrl: l.mtrl, code: l.code, name: l.name, unit: l.unit, qty: l.qty, unitPrice: l.unitPrice,
      discount: l.discount, notes: l.notes, partyKey: l.partyId, crewFee: l.crewFee,
    })),
    parties: c.parties.map((p) => ({
      key: p.id, kind: p.kind as 'SUPPLIER' | 'PARTNER', trdr: p.trdr, partnerId: p.partnerId, name: p.name, email: p.email, phone: p.phone,
      afm: p.afm, specialty: p.specialty, scope: p.scope,
    })),
    members: users.map((u) => ({ id: u.id, label: u.name || u.email, email: u.email })),
    milestones: c.milestones.map((m) => ({
      id: m.id, partyKey: m.partyId, title: m.title, deliverables: m.deliverables, dueDate: ds(m.dueDate), amount: m.amount,
      status: m.status as 'PENDING' | 'DONE' | 'PAID', taskId: m.taskId,
    })),
    documents: c.documents.map((x) => ({
      id: x.id, audience: x.audience as 'CUSTOMER' | 'PARTY', partyId: x.partyId, stage: x.stage, version: x.version, model: x.model,
      fileId: x.fileId, fileName: x.fileName, size: x.fileId ? fileSize.get(x.fileId) ?? null : null,
      sends: (Array.isArray(x.sends) ? x.sends : []) as { to: string; at: string; by: string; result: string }[],
      createdAt: x.createdAt.toISOString(),
    })),
  };
}
export type ContractView = NonNullable<Awaited<ReturnType<typeof getContract>>>;

export async function listContracts() {
  const rows = await prisma.contract.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { lines: { select: { qty: true, unitPrice: true, discount: true } }, _count: { select: { parties: true, milestones: true, documents: true } } },
    take: 1000,
  });
  const trdrs = [...new Set(rows.map((r) => r.trdr).filter((x): x is number => x != null))];
  const prjcs = [...new Set(rows.map((r) => r.prjc).filter((x): x is number => x != null))];
  const [traders, projects] = await Promise.all([
    prisma.softoneTrader.findMany({ where: { trdr: { in: trdrs } }, select: { trdr: true, name: true } }),
    prisma.softoneProject.findMany({ where: { prjc: { in: prjcs } }, select: { prjc: true, code: true } }),
  ]);
  const tn = new Map(traders.map((t) => [t.trdr, t.name]));
  const pc = new Map(projects.map((p) => [p.prjc, p.code]));
  return rows.map((r) => ({
    id: r.id, ref: contractRef(r.number), title: r.title, kind: r.kind, stage: r.stage, status: r.status,
    customer: (r.trdr ? tn.get(r.trdr) : null) ?? r.customerName ?? '—',
    prjc: r.prjc, projectCode: r.prjc ? pc.get(r.prjc) ?? null : null,
    city: r.siteCity, startDate: ds(r.startDate), endDate: ds(r.endDate),
    gross: totals(r.lines, r.vatRate).gross,
    parties: r._count.parties, milestones: r._count.milestones, documents: r._count.documents,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
export type ContractListRow = Awaited<ReturnType<typeof listContracts>>[number];

/** Συμβάσεις ενός έργου SoftOne (για τη σελίδα του έργου). */
export async function contractsOfProject(prjc: number) {
  return (await listContracts()).filter((c) => c.prjc === prjc);
}

// ── Αποθήκευση ─────────────────────────────────────────────────────────────────────────────────
function headerData(input: ContractInput) {
  const s = input.site;
  return {
    title: input.title, summary: input.summary, kind: input.kind, trdr: input.trdr,
    customerName: input.customerName, customerEmail: input.customerEmail, customerPhone: input.customerPhone,
    siteAddress: s?.address ?? null, siteZip: s?.zip ?? null, siteDistrict: s?.district ?? null, siteCity: s?.city ?? null,
    siteFormatted: s?.formatted ?? null, siteLat: s?.lat ?? null, siteLng: s?.lng ?? null, siteSource: s?.source ?? null, sitePrecision: s?.precision ?? null,
    startDate: d(input.startDate), endDate: d(input.endDate), validUntil: d(input.validUntil), vatRate: input.vatRate, terms: input.terms,
  };
}

async function snapshotCustomer(input: ContractInput): Promise<ContractInput> {
  if (!input.trdr) return input;
  const t = await prisma.softoneTrader.findUnique({ where: { trdr: input.trdr }, select: { name: true, email: true, phone: true, sodtype: true } });
  if (!t) throw new ContractError('Ο πελάτης δεν βρέθηκε στον καθρέφτη του SoftOne', 404);
  return { ...input, customerName: t.name, customerEmail: input.customerEmail ?? t.email ?? null, customerPhone: input.customerPhone ?? t.phone ?? null };
}

export async function createContract(raw: ContractInput, userId: string): Promise<string> {
  const input = await snapshotCustomer(raw);
  const c = await prisma.contract.create({ data: { ...headerData(input), createdById: userId } });
  await saveChildren(c.id, input);
  return c.id;
}

export async function updateContract(id: string, raw: ContractInput, userId: string): Promise<void> {
  const cur = await prisma.contract.findUnique({ where: { id }, select: { status: true, prjc: true } });
  if (!cur) throw new ContractError('Η σύμβαση δεν βρέθηκε', 404);
  if (cur.status === 'COMPLETED' || cur.status === 'CANCELLED') throw new ContractError('Η σύμβαση είναι κλειστή — ανοίξτε τη ξανά για αλλαγές', 409);
  const input = await snapshotCustomer(raw);
  await prisma.contract.update({ where: { id }, data: headerData(input) });
  await saveChildren(id, input);
  if (cur.prjc && input.site) await saveProjectSite(cur.prjc, input.site, userId).catch((e) => console.error('[contracts] site', e));
  if (cur.status === 'ACTIVE') await syncMilestoneTasks(id, userId);
}

/** Συνεργεία/milestones κρατούν id (σε αυτά δείχνουν έγγραφα και tasks)· γραμμές & μέλη ξαναγράφονται. */
async function saveChildren(id: string, input: ContractInput) {
  const existingParties = await prisma.contractParty.findMany({ where: { contractId: id }, select: { id: true } });
  const existingIds = new Set(existingParties.map((p) => p.id));
  const keyToId = new Map<string, string>();
  for (const [i, p] of input.parties.entries()) {
    const data = {
      kind: p.kind, trdr: p.kind === 'SUPPLIER' ? p.trdr : null, partnerId: p.kind === 'PARTNER' ? p.partnerId : null,
      name: p.name, email: p.email, phone: p.phone, afm: p.afm, specialty: p.specialty, scope: p.scope, sortOrder: i,
    };
    if (existingIds.has(p.key)) {
      await prisma.contractParty.update({ where: { id: p.key }, data });
      keyToId.set(p.key, p.key);
    } else {
      keyToId.set(p.key, (await prisma.contractParty.create({ data: { ...data, contractId: id } })).id);
    }
  }
  const keep = new Set(keyToId.values());
  const removedParties = existingParties.filter((p) => !keep.has(p.id)).map((p) => p.id);

  // Milestones: διατήρηση id· όσα φεύγουν σβήνουν και το task τους.
  const existingMs = await prisma.contractMilestone.findMany({ where: { contractId: id }, select: { id: true, taskId: true, partyId: true } });
  const inputMsIds = new Set(input.milestones.map((m) => m.id).filter(Boolean));
  const dropped = existingMs.filter((m) => !inputMsIds.has(m.id) || (m.partyId && removedParties.includes(m.partyId)));
  await dropMilestoneTasks(id, dropped.map((m) => m.taskId).filter((x): x is string => !!x));

  await prisma.$transaction(async (tx) => {
    await tx.contractMilestone.deleteMany({ where: { id: { in: dropped.map((m) => m.id) } } });
    if (removedParties.length) await tx.contractParty.deleteMany({ where: { id: { in: removedParties } } });
    for (const [i, m] of input.milestones.entries()) {
      const data = {
        partyId: m.partyKey ? keyToId.get(m.partyKey) ?? null : null, title: m.title, deliverables: m.deliverables,
        dueDate: d(m.dueDate), amount: m.amount, status: m.status, sortOrder: i,
      };
      const prev = m.id ? existingMs.find((x) => x.id === m.id && !dropped.includes(x)) : null;
      if (prev) await tx.contractMilestone.update({ where: { id: prev.id }, data });
      else await tx.contractMilestone.create({ data: { ...data, contractId: id } });
    }
    await tx.contractLine.deleteMany({ where: { contractId: id } });
    if (input.lines.length) {
      await tx.contractLine.createMany({
        data: input.lines.map((l, i) => ({
          contractId: id, kind: l.kind, mtrl: l.mtrl, code: l.code, name: l.name, unit: l.unit, qty: l.qty, unitPrice: l.unitPrice,
          discount: l.discount, notes: l.notes, partyId: l.partyKey ? keyToId.get(l.partyKey) ?? null : null,
          crewFee: l.partyKey ? l.crewFee : null, sortOrder: i,
        })),
      });
    }
    await tx.contractMember.deleteMany({ where: { contractId: id } });
    const members = [...new Set(input.members)];
    if (members.length) await tx.contractMember.createMany({ data: members.map((userId) => ({ contractId: id, userId })) });
    await tx.contract.update({ where: { id }, data: { updatedAt: new Date() } });
  });
}

export async function deleteContract(id: string) {
  const c = await prisma.contract.findUnique({ where: { id }, include: { milestones: { select: { taskId: true } } } });
  if (!c) throw new ContractError('Η σύμβαση δεν βρέθηκε', 404);
  if (c.status === 'ACTIVE') throw new ContractError('Η σύμβαση είναι σε εξέλιξη — ακυρώστε τη πρώτα', 409);
  await dropMilestoneTasks(id, c.milestones.map((m) => m.taskId).filter((x): x is string => !!x));
  await prisma.contract.delete({ where: { id } });
}

// ── Μεταβάσεις ─────────────────────────────────────────────────────────────────────────────────
export async function transition(id: string, action: ContractAction, userId: string) {
  const c = await prisma.contract.findUnique({ where: { id }, include: { milestones: true } });
  if (!c) throw new ContractError('Η σύμβαση δεν βρέθηκε', 404);
  if (!canTransition(c.status, action)) throw new ContractError('Η ενέργεια δεν επιτρέπεται σε αυτή την κατάσταση', 409);
  if (action === 'activate') {
    if (!c.prjc) throw new ContractError('Συνδέστε πρώτα τη σύμβαση με έργο SoftOne (υπάρχον ή νέο) — εκεί γράφονται οι εργασίες και τα αρχεία', 409);
    if (!c.milestones.length) throw new ContractError('Ορίστε τουλάχιστον ένα milestone πριν από την ενεργοποίηση', 409);
  }
  const now = new Date();
  await prisma.contract.update({
    where: { id },
    data: {
      status: transitionTo(action),
      stage: stageAfter(action, c.stage, !!c.activatedAt),
      ...(action === 'accept' ? { acceptedAt: now } : {}),
      ...(action === 'activate' ? { activatedAt: now } : {}),
      ...(action === 'complete' ? { completedAt: now } : {}),
      ...(action === 'reopen' ? { completedAt: null } : {}),
    },
  });
  if (action === 'activate') await syncMilestoneTasks(id, userId);
  if (action === 'cancel') await dropMilestoneTasks(id, c.milestones.map((m) => m.taskId).filter((x): x is string => !!x));
}

/** Αλλαγή κατάστασης ενός milestone (παραδόθηκε/εξοφλήθηκε) — ενημερώνει και το task. */
export async function setMilestoneStatus(id: string, milestoneId: string, status: 'PENDING' | 'DONE' | 'PAID') {
  const m = await prisma.contractMilestone.findFirst({ where: { id: milestoneId, contractId: id }, include: { contract: { select: { prjc: true } } } });
  if (!m) throw new ContractError('Το milestone δεν βρέθηκε', 404);
  const now = new Date();
  await prisma.contractMilestone.update({
    where: { id: m.id },
    data: { status, doneAt: status === 'PENDING' ? null : m.doneAt ?? now, paidAt: status === 'PAID' ? m.paidAt ?? now : null },
  });
  if (m.taskId && m.contract.prjc) {
    await updateTask(m.contract.prjc, m.taskId, { progress: status === 'PENDING' ? 0 : 100 }).catch((e) => {
      if (!(e instanceof TaskError)) throw e;
    });
  }
}

// ── Milestones → εργασίες έργου (ημερολόγιο + .ics στους επιλεγμένους υπαλλήλους) ─────────────────
const taskName = (ref: string, title: string, party: string | null) => `${party ? `${party} · ` : ''}${title} (${ref})`;

export async function syncMilestoneTasks(id: string, userId: string) {
  const c = await prisma.contract.findUnique({ where: { id }, include: { milestones: { include: { party: true } }, members: true } });
  if (!c?.prjc) return;
  const ref = contractRef(c.number);
  const employees = c.members.map((m) => ({ kind: 'EMPLOYEE' as const, ref: m.userId }));
  for (const m of c.milestones) {
    const parties = [
      ...employees,
      ...(m.party?.kind === 'SUPPLIER' && m.party.trdr ? [{ kind: 'SUPPLIER' as const, ref: String(m.party.trdr) }] : []),
      ...(m.party?.kind === 'PARTNER' && m.party.partnerId ? [{ kind: 'PARTNER' as const, ref: m.party.partnerId }] : []),
      ...(!m.party && c.trdr ? [{ kind: 'CUSTOMER' as const, ref: String(c.trdr) }] : []),
    ];
    const input = {
      name: taskName(ref, m.title, m.party?.name ?? null).slice(0, 200),
      description: [m.deliverables ? `Παραδοτέα: ${m.deliverables}` : null, m.amount ? `Πληρωμή ${m.party ? 'προς συνεργείο' : 'πελάτη'}: ${m.amount.toFixed(2)} €` : null, `Σύμβαση ${ref} · ${c.title}`].filter(Boolean).join('\n'),
      startDate: ds(m.dueDate),
      durationValue: 1, durationUnit: 'DAYS' as const,
      progress: (m.status === 'PENDING' ? 0 : 100) as 0 | 100,
      customerVisible: !m.party, inCalendar: !!m.dueDate,
      dependsOn: [], parties,
    };
    if (m.taskId) {
      try {
        // Η πρόοδος που έδωσε κάποιος στο Kanban μένει — εκτός αν το milestone παραδόθηκε.
        await updateTask(c.prjc, m.taskId, { ...input, progress: m.status === 'PENDING' ? undefined : 100 });
        continue;
      } catch (e) {
        if (!(e instanceof TaskError) || e.status !== 404) throw e; // σβήστηκε από το Kanban → νέο
      }
    }
    const t = await createTask(c.prjc, input, userId);
    await prisma.contractMilestone.update({ where: { id: m.id }, data: { taskId: t.id } });
  }
}

async function dropMilestoneTasks(id: string, taskIds: string[]) {
  if (!taskIds.length) return;
  const c = await prisma.contract.findUnique({ where: { id }, select: { prjc: true } });
  if (!c?.prjc) return;
  for (const t of taskIds) await deleteTask(c.prjc, t).catch(() => null);
  await prisma.contractMilestone.updateMany({ where: { taskId: { in: taskIds } }, data: { taskId: null } });
}

// ── Επιλογές ──────────────────────────────────────────────────────────────────────────────────
export type CrewOption = { kind: 'SUPPLIER' | 'PARTNER'; ref: string; name: string; sub: string | null; email: string | null; phone: string | null; afm: string | null; crew: boolean };

/**
 * Συνεργεία: προμηθευτές στην εμπορική κατηγορία «Οικοδομικών Εργασιών» (20.3: συνεργεία, τεχνίτες)
 * και οι Συνεργάτες της εφαρμογής. Με αναζήτηση ≥ 2 χαρακτήρων ψάχνει και σε όλους τους προμηθευτές.
 */
export async function crewOptions(q: string): Promise<CrewOption[]> {
  const s = q.trim();
  const classes = await prisma.traderClass.findMany({ where: { sohCode: { startsWith: '20.3' } }, select: { id: true, name: true } });
  const assigned = await prisma.traderClassAssignment.findMany({ where: { leafId: { in: classes.map((c) => c.id) } }, select: { trdr: true, leafId: true } });
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const crewTrdr = new Map(assigned.map((a) => [a.trdr, className.get(a.leafId!) ?? null]));
  const textWhere = s.length >= 2 ? { OR: [{ name: { contains: s, mode: 'insensitive' as const } }, { code: { contains: s } }, { afm: { contains: s } }] } : {};
  const [crewSup, otherSup, partners] = await Promise.all([
    prisma.softoneTrader.findMany({ where: { trdr: { in: [...crewTrdr.keys()] }, isActive: true, ...textWhere }, select: { trdr: true, name: true, code: true, email: true, phone: true, afm: true, profession: true }, orderBy: { name: 'asc' }, take: 60 }),
    s.length >= 2
      ? prisma.softoneTrader.findMany({ where: { sodtype: 12, isActive: true, trdr: { notIn: [...crewTrdr.keys()] }, ...textWhere }, select: { trdr: true, name: true, code: true, email: true, phone: true, afm: true, profession: true }, orderBy: { name: 'asc' }, take: 15 })
      : [],
    prisma.partner.findMany({
      where: { isActive: true, ...(s.length >= 2 ? { OR: [{ name: { contains: s, mode: 'insensitive' } }, { specialty: { contains: s, mode: 'insensitive' } }] } : {}) },
      select: { id: true, name: true, specialty: true, email: true, mobile: true, phone: true, afm: true }, orderBy: { name: 'asc' }, take: 40,
    }),
  ]);
  return [
    ...crewSup.map((t) => ({ kind: 'SUPPLIER' as const, ref: String(t.trdr), name: t.name, sub: crewTrdr.get(t.trdr) ?? t.profession ?? t.code, email: t.email, phone: t.phone, afm: t.afm, crew: true })),
    ...partners.map((p) => ({ kind: 'PARTNER' as const, ref: p.id, name: p.name, sub: p.specialty, email: p.email, phone: p.mobile || p.phone, afm: p.afm, crew: true })),
    ...otherSup.map((t) => ({ kind: 'SUPPLIER' as const, ref: String(t.trdr), name: t.name, sub: t.profession ?? t.code, email: t.email, phone: t.phone, afm: t.afm, crew: false })),
  ];
}

export async function staffOptions() {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { OR: [{ key: null }, { key: { in: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'] } }] } },
    select: { id: true, name: true, email: true }, orderBy: { name: 'asc' },
  });
  return users.map((u) => ({ id: u.id, label: u.name || u.email, email: u.email }));
}

export async function searchCustomers(q: string) {
  const s = q.trim();
  if (s.length < 2) return [];
  const rows = await prisma.softoneTrader.findMany({
    where: { sodtype: 13, isActive: true, OR: [{ name: { contains: s, mode: 'insensitive' } }, { code: { contains: s } }, { afm: { contains: s } }] },
    select: { trdr: true, name: true, code: true, email: true, phone: true, city: true }, orderBy: { name: 'asc' }, take: 12,
  });
  return rows.map((t) => ({ trdr: t.trdr, name: t.name, code: t.code, email: t.email, phone: t.phone, city: t.city }));
}

/** Σύνδεση με υπάρχον έργο SoftOne (από τον καθρέφτη) — αντιγράφει και την τοποθεσία στο έργο. */
export async function linkProject(id: string, prjc: number, userId: string) {
  const [c, p] = await Promise.all([
    prisma.contract.findUnique({ where: { id } }),
    prisma.softoneProject.findUnique({ where: { prjc }, select: { prjc: true } }),
  ]);
  if (!c) throw new ContractError('Η σύμβαση δεν βρέθηκε', 404);
  if (!p) throw new ContractError('Το έργο δεν βρέθηκε στον καθρέφτη του SoftOne', 404);
  if (c.status === 'ACTIVE' && c.prjc && c.prjc !== prjc) throw new ContractError('Η σύμβαση είναι σε εξέλιξη σε άλλο έργο', 409);
  await prisma.contract.update({ where: { id }, data: { prjc } });
  if (c.siteLat != null && c.siteLng != null) {
    await saveProjectSite(prjc, {
      address: c.siteAddress, zip: c.siteZip, district: c.siteDistrict, city: c.siteCity, formatted: c.siteFormatted,
      lat: c.siteLat, lng: c.siteLng, source: (c.siteSource ?? 'geocode') as 'geocode', precision: (c.sitePrecision ?? null) as 'exact' | null,
    }, userId).catch((e) => console.error('[contracts] site copy', e));
  }
}

export async function projectChoices(q: string) {
  const s = q.trim();
  const rows = await prisma.softoneProject.findMany({
    where: { isActive: true, ...(s ? { OR: [{ name: { contains: s, mode: 'insensitive' } }, { code: { contains: s } }] } : {}) },
    select: { prjc: true, code: true, name: true }, orderBy: { code: 'desc' }, take: 20,
  });
  return rows;
}

/** Τιμή λιανικής και μονάδα (ετικέτα) ενός είδους/υπηρεσίας — για προσυμπλήρωση γραμμής. */
export async function itemDefaults(mtrl: number) {
  const it = await prisma.softoneItem.findUnique({ where: { mtrl }, select: { code: true, name: true, price: true, unit1: true, unitSell: true, isService: true } });
  if (!it) return null;
  const code = it.unitSell || it.unit1;
  const unit = code ? (await prisma.softoneLookup.findUnique({ where: { kind_code: { kind: 'MTRUNIT', code } }, select: { name: true } }))?.name ?? null : null;
  return { code: it.code, name: it.name, price: it.price ?? 0, unit, isService: it.isService };
}
