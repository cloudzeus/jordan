// lib/contracts/revisions.ts — SERVER. Εκδόσεις προσφοράς/σύμβασης: «πάγωμα» της τρέχουσας μορφής
// (στιγμιότυπο σε σχήμα contractInput), ιστορικό, επαναφορά παλιάς έκδοσης και νέα προσφορά από έκδοση.
// Κανόνας: μια παγωμένη έκδοση δεν αλλάζει ποτέ — η επόμενη αποθήκευση της φόρμας γίνεται στην revision + 1.
import 'server-only';
import { prisma } from '@/lib/db';
import { contractInput, totals, type ContractInput } from './core';
import { ContractError, createContract, getContract, updateContract, type ContractView } from './service';

export type RevisionReason = 'MANUAL' | 'SENT' | 'DOCUMENT' | 'RESTORE';

/** Η φόρμα όπως είναι τώρα, στο σχήμα του contractInput (ό,τι χρειάζεται για να ξαναστηθεί ακριβώς). */
export function viewToInput(c: ContractView): ContractInput {
  return contractInput.parse({
    title: c.title, summary: c.summary, customerText: c.customerText, kind: c.kind, trdr: c.trdr,
    customerName: c.customerName, customerEmail: c.customerEmail, customerPhone: c.customerPhone, site: c.site,
    startDate: c.startDate, endDate: c.endDate, validUntil: c.validUntil, vatRate: c.vatRate, terms: c.terms,
    floorPlanId: c.floorPlanId,
    roomMaterials: c.floorPlan ? c.floorPlan.rooms.map((r) => ({ roomId: r.id, material: r.material })) : undefined,
    lines: c.lines.map(({ id: _id, ...l }) => l),
    parties: c.parties, members: c.members.map((m) => m.id),
    milestones: c.milestones.map((m) => ({ id: m.id, partyKey: m.partyKey, title: m.title, deliverables: m.deliverables, dueDate: m.dueDate, amount: m.amount, status: m.status })),
    tasks: c.tasks.map(({ projectTaskId: _p, ...t }) => t),
  });
}

/** Παγώνει την τρέχουσα έκδοση (αν δεν είναι ήδη παγωμένη) και επιστρέφει τον αριθμό της. */
export async function freezeRevision(id: string, reason: RevisionReason, userId: string | null, note: string | null = null): Promise<number> {
  const c = await getContract(id);
  if (!c) throw new ContractError('Η σύμβαση δεν βρέθηκε', 404);
  const exists = await prisma.contractRevision.findUnique({ where: { contractId_revision: { contractId: id, revision: c.revision } }, select: { id: true } });
  if (exists) return c.revision;
  const input = viewToInput(c);
  const t = totals(input.lines, input.vatRate);
  await prisma.contractRevision.create({
    data: { contractId: id, revision: c.revision, reason, note, snapshot: input as unknown as object, net: t.net, gross: t.gross, lineCount: input.lines.length, createdById: userId },
  });
  return c.revision;
}

export async function listRevisions(id: string) {
  const rows = await prisma.contractRevision.findMany({ where: { contractId: id }, orderBy: { revision: 'desc' } });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))] } }, select: { id: true, name: true, email: true } });
  const who = new Map(users.map((u) => [u.id, u.name || u.email]));
  return rows.map((r) => ({
    revision: r.revision, reason: r.reason as RevisionReason, note: r.note, net: r.net, gross: r.gross, lineCount: r.lineCount,
    createdAt: r.createdAt.toISOString(), createdBy: r.createdById ? who.get(r.createdById) ?? null : null,
  }));
}
export type RevisionRow = Awaited<ReturnType<typeof listRevisions>>[number];

export async function getRevision(id: string, revision: number) {
  const r = await prisma.contractRevision.findUnique({ where: { contractId_revision: { contractId: id, revision } } });
  if (!r) throw new ContractError('Η έκδοση δεν βρέθηκε', 404);
  const input = contractInput.parse(r.snapshot);
  return { revision: r.revision, reason: r.reason as RevisionReason, note: r.note, createdAt: r.createdAt.toISOString(), input, totals: totals(input.lines, input.vatRate) };
}
export type RevisionDetail = Awaited<ReturnType<typeof getRevision>>;

/** Πριν από την αποδοχή μόνο: η φόρμα γίνεται ξανά όπως στην έκδοση `revision` (ως νέα έκδοση). */
export async function restoreRevision(id: string, revision: number, userId: string) {
  const c = await prisma.contract.findUnique({ where: { id }, select: { stage: true, status: true } });
  if (!c) throw new ContractError('Η σύμβαση δεν βρέθηκε', 404);
  if (c.stage !== 'OFFER' || !['DRAFT', 'SENT'].includes(c.status)) throw new ContractError('Επαναφορά έκδοσης γίνεται μόνο σε προσφορά πριν από την αποδοχή', 409);
  const target = await getRevision(id, revision);
  // Η τρέχουσα μορφή κρατιέται στο ιστορικό πριν αντικατασταθεί.
  await freezeRevision(id, 'MANUAL', userId, `Πριν από την επαναφορά της έκδ. ${revision}`);
  await updateContract(id, target.input, userId);
}

/** Νέα, ανεξάρτητη προσφορά (πρόχειρη) από την τρέχουσα μορφή ή από μια παλιά έκδοση. */
export async function duplicateContract(id: string, revision: number | null, userId: string): Promise<string> {
  let input: ContractInput;
  if (revision != null) input = (await getRevision(id, revision)).input;
  else {
    const c = await getContract(id);
    if (!c) throw new ContractError('Η σύμβαση δεν βρέθηκε', 404);
    input = viewToInput(c);
  }
  // Τα συνεργεία/milestones παίρνουν νέα κλειδιά — καμία σύνδεση με τις εγγραφές της αρχικής.
  const keyMap = new Map(input.parties.map((p, i) => [p.key, `copy-${i}-${p.key}`]));
  const taskKey = new Map((input.tasks ?? []).map((t, i) => [t.key, `copy-${i}-${t.key}`]));
  return createContract({
    ...input,
    title: `${input.title} — αντίγραφο`.slice(0, 200),
    roomMaterials: undefined,
    parties: input.parties.map((p) => ({ ...p, key: keyMap.get(p.key)! })),
    lines: input.lines.map((l) => ({ ...l, partyKey: l.partyKey ? keyMap.get(l.partyKey) ?? null : null })),
    milestones: input.milestones.map((m) => ({ ...m, id: null, status: 'PENDING', partyKey: m.partyKey ? keyMap.get(m.partyKey) ?? null : null })),
    tasks: input.tasks?.map((t) => ({ ...t, key: taskKey.get(t.key)!, dependsOn: t.dependsOn.map((k) => taskKey.get(k)).filter((x): x is string => !!x) })),
  }, userId);
}
