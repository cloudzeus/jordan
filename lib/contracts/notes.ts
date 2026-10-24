// lib/contracts/notes.ts — SERVER. Σημειώσεις / ειδικές οδηγίες σε σημεία της προσφοράς (γενικά, χώρος,
// πληρωμή, εργασία). Γράφουν ο χρήστης (STAFF) και ο πελάτης από το portal (CUSTOMER). Κοινοποίηση ανά
// σημείωση: εμείς βλέπουμε πάντα όλες· ο πελάτης όσες έχουν CUSTOMER (και τις δικές του)· ένα συνεργείο
// όσες έχουν PARTY:<id>. Οι «ειδικές οδηγίες» μπαίνουν και στη σύνταξη των εγγράφων όσων τις βλέπουν.
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { uploadEntityFile } from '@/lib/entity-files/service';
import { ContractError } from './service';
import { logContractEvent } from './history';

export const NOTE_TARGETS = ['CONTRACT', 'ROOM', 'MILESTONE', 'TASK', 'LINE'] as const;
export const NOTE_KINDS = ['NOTE', 'INSTRUCTION', 'QUESTION', 'CHANGE'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export type NoteTarget = (typeof NOTE_TARGETS)[number];
export type NoteViewer = { kind: 'STAFF' } | { kind: 'CUSTOMER' } | { kind: 'PARTY'; partyId: string };
type Author = { kind: 'STAFF' | 'CUSTOMER'; id: string; name: string | null; email: string };

const MAX_PHOTOS = 8;
export const noteInput = z.object({
  targetType: z.enum(NOTE_TARGETS).default('CONTRACT'),
  targetId: z.string().max(64).nullish().transform((v) => v || null),
  targetLabel: z.string().trim().max(200).nullish().transform((v) => v || null),
  kind: z.enum(NOTE_KINDS).default('NOTE'),
  replyToId: z.string().max(64).nullish().transform((v) => v || null),
  body: z.string().trim().min(1, 'Γράψτε τη σημείωση').max(4000),
  shareWith: z.array(z.string().regex(/^(CUSTOMER|PARTY:[\w-]{1,64})$/)).max(30).default([]),
});
export type NoteInput = z.infer<typeof noteInput>;

const visibleTo = (v: NoteViewer) => (v.kind === 'STAFF'
  ? {}
  : v.kind === 'CUSTOMER'
    ? { OR: [{ shareWith: { has: 'CUSTOMER' } }, { authorKind: 'CUSTOMER' }] }
    : { shareWith: { has: `PARTY:${v.partyId}` } });

export async function listNotes(contractId: string, viewer: NoteViewer) {
  const rows = await prisma.contractNote.findMany({ where: { contractId, ...visibleTo(viewer) }, orderBy: { createdAt: 'asc' } });
  return rows.map((n) => ({
    id: n.id, targetType: n.targetType as NoteTarget, targetId: n.targetId, targetLabel: n.targetLabel, kind: n.kind as NoteKind,
    replyToId: n.replyToId, revision: n.revision,
    body: n.body, shareWith: n.shareWith, photoFileIds: n.photoFileIds, taskId: n.taskId,
    authorKind: n.authorKind as 'STAFF' | 'CUSTOMER', authorName: n.authorName, resolved: !!n.resolvedAt, createdAt: n.createdAt.toISOString(),
  }));
}
export type NoteView = Awaited<ReturnType<typeof listNotes>>[number];

/** Νέα σημείωση με (προαιρετικά) φωτογραφίες στα αρχεία του έργου ή του πελάτη, φάκελος «Σημειώσεις». */
export async function addNote(contractId: string, input: NoteInput, photos: File[], author: Author) {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { prjc: true, trdr: true, status: true, revision: true } });
  if (!c) throw new ContractError('Η προσφορά δεν βρέθηκε', 404);
  // Απάντηση: ίδια προσφορά, ίδιο σημείο· ο πελάτης απαντά μόνο σε ό,τι βλέπει.
  const parent = input.replyToId
    ? await prisma.contractNote.findFirst({ where: { id: input.replyToId, contractId, ...(author.kind === 'CUSTOMER' ? visibleTo({ kind: 'CUSTOMER' }) : {}) } })
    : null;
  if (input.replyToId && !parent) throw new ContractError('Η συζήτηση δεν βρέθηκε', 404);
  if (photos.length > MAX_PHOTOS) throw new ContractError(`Έως ${MAX_PHOTOS} φωτογραφίες ανά σημείωση`);
  const owner = c.prjc ? { type: 'PROJECT' as const, id: c.prjc } : c.trdr ? { type: 'TRADER' as const, id: c.trdr } : null;
  if (photos.length && !owner) throw new ContractError('Επιλέξτε πρώτα πελάτη — οι φωτογραφίες αποθηκεύονται στον φάκελό του', 409);
  const ids: string[] = [];
  for (const f of photos) {
    if (!f.type.startsWith('image/')) throw new ContractError(`Το «${f.name}» δεν είναι φωτογραφία`, 415);
    const file = await uploadEntityFile({ ...owner!, buffer: Buffer.from(await f.arrayBuffer()), name: f.name, subfolder: 'Σημειώσεις', notes: input.body.slice(0, 200), user: author });
    ids.push(file.id);
  }
  // Ο πελάτης γράφει πάντα «προς εμάς» — η σημείωσή του δεν κοινοποιείται σε συνεργεία. Η απάντησή μας σε
  // κάτι που βλέπει ο πελάτης πάει και σε αυτόν.
  const toCustomer = !!parent && (parent.authorKind === 'CUSTOMER' || parent.shareWith.includes('CUSTOMER'));
  const shareWith = author.kind === 'CUSTOMER' ? ['CUSTOMER'] : [...new Set([...input.shareWith, ...(toCustomer ? ['CUSTOMER'] : [])])];
  // Ο πελάτης: σημείωση / ερώτηση / αίτημα αλλαγής. Εμείς: σημείωση / ειδική οδηγία. Οι απαντήσεις είναι σημειώσεις.
  const kind: NoteKind = parent ? 'NOTE' : author.kind === 'CUSTOMER'
    ? (input.kind === 'QUESTION' || input.kind === 'CHANGE' ? input.kind : 'NOTE')
    : (input.kind === 'INSTRUCTION' ? 'INSTRUCTION' : 'NOTE');
  const target = parent
    ? { targetType: parent.targetType, targetId: parent.targetId, targetLabel: parent.targetLabel }
    : { targetType: input.targetType, targetId: input.targetType === 'CONTRACT' ? null : input.targetId, targetLabel: input.targetLabel };
  return prisma.contractNote.create({
    data: {
      contractId, ...target, replyToId: parent?.id ?? null, revision: c.revision,
      kind, body: input.body, shareWith, photoFileIds: ids,
      authorKind: author.kind, authorId: author.id, authorName: author.name || author.email,
    },
    select: { id: true },
  });
}

export async function updateNote(contractId: string, noteId: string, patch: { shareWith?: string[]; resolved?: boolean; kind?: 'NOTE' | 'INSTRUCTION' }, actor?: { id: string; name: string | null }) {
  const n = await prisma.contractNote.findFirst({ where: { id: noteId, contractId }, select: { id: true, authorKind: true, kind: true, body: true, resolvedAt: true } });
  if (!n) throw new ContractError('Η σημείωση δεν βρέθηκε', 404);
  await prisma.contractNote.update({
    where: { id: noteId },
    data: {
      ...(patch.shareWith ? { shareWith: [...new Set(patch.shareWith)] } : {}),
      ...(patch.kind ? { kind: patch.kind } : {}),
      ...(patch.resolved !== undefined ? { resolvedAt: patch.resolved ? new Date() : null } : {}),
    },
  });
  // Κλείσιμο/άνοιγμα αιτήματος του πελάτη: μένει στο ιστορικό και το βλέπει και εκείνος.
  if (patch.resolved !== undefined && n.authorKind === 'CUSTOMER' && patch.resolved !== !!n.resolvedAt) {
    await logContractEvent(contractId, {
      type: patch.resolved ? 'RESOLVED' : 'REOPENED', actor: { kind: 'STAFF', id: actor?.id, name: actor?.name }, customer: true, refId: noteId,
      summary: `${patch.resolved ? 'Ολοκληρώθηκε' : 'Άνοιξε ξανά'}: «${n.body.slice(0, 120)}${n.body.length > 120 ? '…' : ''}»`,
    });
  }
}

/** Διαγραφή μόνο εσωτερικής σημείωσης χωρίς απαντήσεις: ό,τι έγραψε ή είδε ο πελάτης μένει στο ιστορικό. */
export async function deleteNote(contractId: string, noteId: string) {
  const n = await prisma.contractNote.findFirst({ where: { id: noteId, contractId }, select: { authorKind: true, shareWith: true } });
  if (!n) return;
  if (n.authorKind === 'CUSTOMER' || n.shareWith.includes('CUSTOMER')) {
    throw new ContractError('Ό,τι έγραψε ή είδε ο πελάτης μένει στο ιστορικό — σημειώστε το ως «Επιλύθηκε» αντί για διαγραφή', 409);
  }
  if (await prisma.contractNote.count({ where: { replyToId: noteId } })) throw new ContractError('Η σημείωση έχει απαντήσεις — δεν διαγράφεται', 409);
  await prisma.contractNote.delete({ where: { id: noteId } });
}

/**
 * Σημείωση → εργασία: η εργασία φτιάχνεται στη φόρμα (με το key της ως id) και εδώ κρατάμε τη σύνδεση,
 * ώστε η σημείωση να δείχνει «έγινε εργασία».
 */
export async function linkNoteTask(contractId: string, noteId: string, taskKey: string | null) {
  const n = await prisma.contractNote.findFirst({ where: { id: noteId, contractId }, select: { id: true } });
  if (!n) throw new ContractError('Η σημείωση δεν βρέθηκε', 404);
  await prisma.contractNote.update({ where: { id: noteId }, data: { taskId: taskKey } });
}

/** Ειδικές οδηγίες για τη σύνταξη εγγράφων: του πελάτη (CUSTOMER) ή ενός συνεργείου (PARTY). */
export async function instructionsFor(contractId: string, viewer: NoteViewer): Promise<string[]> {
  const rows = await prisma.contractNote.findMany({ where: { contractId, kind: 'INSTRUCTION', resolvedAt: null, ...visibleTo(viewer) }, orderBy: { createdAt: 'asc' } });
  return rows.map((n) => `${n.targetLabel ? `[${n.targetLabel}] ` : ''}${n.body}`);
}

/**
 * Φωτογραφία για τον πελάτη: από σημείωση που βλέπει ή από απόδειξη παράδοσης δικής του δόσης (όχι
 * συνεργείου), πάντα σε προσφορά/σύμβαση δική του.
 */
export async function customerNoteFile(trdr: number, fileId: string) {
  const [n, m] = await Promise.all([
    prisma.contractNote.findFirst({
      where: { photoFileIds: { has: fileId }, contract: { trdr }, OR: [{ shareWith: { has: 'CUSTOMER' } }, { authorKind: 'CUSTOMER' }] },
      select: { id: true },
    }),
    prisma.contractMilestone.findFirst({ where: { proofFileIds: { has: fileId }, partyId: null, contract: { trdr } }, select: { id: true } }),
  ]);
  if (!n && !m && !(await deviceOfCustomer(trdr, fileId))) return null;
  return prisma.entityFile.findUnique({ where: { id: fileId } });
}

/** Φωτογραφία συσκευής (ηλεκτρολογικά/δίκτυο) στην κάτοψη αποδεκτής σύμβασης του πελάτη — για τον τεχνικό φάκελο. */
async function deviceOfCustomer(trdr: number, fileId: string): Promise<boolean> {
  const plans = await prisma.floorPlan.findMany({
    where: { contracts: { some: { trdr, status: { in: ['ACCEPTED', 'ACTIVE', 'COMPLETED'] } } } },
    select: { data: true },
  });
  return plans.some((p) => {
    const devs = (p.data as { devices?: Array<{ photoFileIds?: unknown }> } | null)?.devices;
    return Array.isArray(devs) && devs.some((d) => Array.isArray(d.photoFileIds) && d.photoFileIds.includes(fileId));
  });
}
