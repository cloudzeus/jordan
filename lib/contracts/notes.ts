// lib/contracts/notes.ts — SERVER. Σημειώσεις / ειδικές οδηγίες σε σημεία της προσφοράς (γενικά, χώρος,
// πληρωμή, εργασία). Γράφουν ο χρήστης (STAFF) και ο πελάτης από το portal (CUSTOMER). Κοινοποίηση ανά
// σημείωση: εμείς βλέπουμε πάντα όλες· ο πελάτης όσες έχουν CUSTOMER (και τις δικές του)· ένα συνεργείο
// όσες έχουν PARTY:<id>. Οι «ειδικές οδηγίες» μπαίνουν και στη σύνταξη των εγγράφων όσων τις βλέπουν.
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { uploadEntityFile } from '@/lib/entity-files/service';
import { ContractError } from './service';

export const NOTE_TARGETS = ['CONTRACT', 'ROOM', 'MILESTONE', 'TASK'] as const;
export type NoteTarget = (typeof NOTE_TARGETS)[number];
export type NoteViewer = { kind: 'STAFF' } | { kind: 'CUSTOMER' } | { kind: 'PARTY'; partyId: string };
type Author = { kind: 'STAFF' | 'CUSTOMER'; id: string; name: string | null; email: string };

const MAX_PHOTOS = 8;
export const noteInput = z.object({
  targetType: z.enum(NOTE_TARGETS).default('CONTRACT'),
  targetId: z.string().max(64).nullish().transform((v) => v || null),
  targetLabel: z.string().trim().max(200).nullish().transform((v) => v || null),
  kind: z.enum(['NOTE', 'INSTRUCTION']).default('NOTE'),
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
    id: n.id, targetType: n.targetType as NoteTarget, targetId: n.targetId, targetLabel: n.targetLabel, kind: n.kind as 'NOTE' | 'INSTRUCTION',
    body: n.body, shareWith: n.shareWith, photoFileIds: n.photoFileIds, taskId: n.taskId,
    authorKind: n.authorKind as 'STAFF' | 'CUSTOMER', authorName: n.authorName, resolved: !!n.resolvedAt, createdAt: n.createdAt.toISOString(),
  }));
}
export type NoteView = Awaited<ReturnType<typeof listNotes>>[number];

/** Νέα σημείωση με (προαιρετικά) φωτογραφίες στα αρχεία του έργου ή του πελάτη, φάκελος «Σημειώσεις». */
export async function addNote(contractId: string, input: NoteInput, photos: File[], author: Author) {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { prjc: true, trdr: true, status: true } });
  if (!c) throw new ContractError('Η προσφορά δεν βρέθηκε', 404);
  if (photos.length > MAX_PHOTOS) throw new ContractError(`Έως ${MAX_PHOTOS} φωτογραφίες ανά σημείωση`);
  const owner = c.prjc ? { type: 'PROJECT' as const, id: c.prjc } : c.trdr ? { type: 'TRADER' as const, id: c.trdr } : null;
  if (photos.length && !owner) throw new ContractError('Επιλέξτε πρώτα πελάτη — οι φωτογραφίες αποθηκεύονται στον φάκελό του', 409);
  const ids: string[] = [];
  for (const f of photos) {
    if (!f.type.startsWith('image/')) throw new ContractError(`Το «${f.name}» δεν είναι φωτογραφία`, 415);
    const file = await uploadEntityFile({ ...owner!, buffer: Buffer.from(await f.arrayBuffer()), name: f.name, subfolder: 'Σημειώσεις', notes: input.body.slice(0, 200), user: author });
    ids.push(file.id);
  }
  // Ο πελάτης γράφει πάντα «προς εμάς» — η σημείωσή του δεν κοινοποιείται σε συνεργεία.
  const shareWith = author.kind === 'CUSTOMER' ? ['CUSTOMER'] : [...new Set(input.shareWith)];
  return prisma.contractNote.create({
    data: {
      contractId, targetType: input.targetType, targetId: input.targetType === 'CONTRACT' ? null : input.targetId, targetLabel: input.targetLabel,
      kind: author.kind === 'CUSTOMER' ? 'NOTE' : input.kind, body: input.body, shareWith, photoFileIds: ids,
      authorKind: author.kind, authorId: author.id, authorName: author.name || author.email,
    },
    select: { id: true },
  });
}

export async function updateNote(contractId: string, noteId: string, patch: { shareWith?: string[]; resolved?: boolean; kind?: 'NOTE' | 'INSTRUCTION' }) {
  const n = await prisma.contractNote.findFirst({ where: { id: noteId, contractId }, select: { id: true } });
  if (!n) throw new ContractError('Η σημείωση δεν βρέθηκε', 404);
  await prisma.contractNote.update({
    where: { id: noteId },
    data: {
      ...(patch.shareWith ? { shareWith: [...new Set(patch.shareWith)] } : {}),
      ...(patch.kind ? { kind: patch.kind } : {}),
      ...(patch.resolved !== undefined ? { resolvedAt: patch.resolved ? new Date() : null } : {}),
    },
  });
}

export async function deleteNote(contractId: string, noteId: string) {
  await prisma.contractNote.deleteMany({ where: { id: noteId, contractId } });
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

/** Φωτογραφία σημείωσης για τον πελάτη: μόνο από σημείωση που βλέπει, σε προσφορά δική του. */
export async function customerNoteFile(trdr: number, fileId: string) {
  const n = await prisma.contractNote.findFirst({
    where: { photoFileIds: { has: fileId }, contract: { trdr }, OR: [{ shareWith: { has: 'CUSTOMER' } }, { authorKind: 'CUSTOMER' }] },
    select: { id: true },
  });
  if (!n) return null;
  return prisma.entityFile.findUnique({ where: { id: fileId } });
}
