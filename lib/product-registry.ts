import 'server-only';
import { prisma } from '@/lib/db';
import { softoneCall, SoftoneError } from '@/lib/softone';
import {
  codeTaken, collateralDamage, REGISTRY_KINDS, registryInput, withNewRow, withoutRow, withPatchedRow,
  type RegistryInput, type RegistryKind, type RegistryRow,
} from './product-registry-core';

/**
 * Μάρκες (`$ITEMARK`) και κατασκευαστές (`$MTRMANFCTR`) στο SoftOne — ΕΓΓΡΑΦΗ.
 *
 * Είναι αντικείμενα-ΛΙΣΤΑ: το setData αντικαθιστά ΟΛΗ τη λίστα και ό,τι παραλείψεις ΣΒΗΝΕΤΑΙ.
 * Κάθε λειτουργία εδώ ακολουθεί αυστηρά: **διάβασε όλη τη λίστα → άλλαξε μία γραμμή → στείλε όλη τη
 * λίστα → ξαναδιάβασε και επιβεβαίωσε** (το `success:true` δεν αποδεικνύει εγγραφή). Αν χαθεί ή
 * αλλάξει γραμμή που δεν πειράξαμε, η λίστα επαναφέρεται και η ενέργεια αποτυγχάνει.
 */

export class RegistryError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

type ListResult = { success?: boolean; errorcode?: number; error?: string; data?: Record<string, RegistryRow[] | undefined> };

/** Όλη η λίστα, όπως τη δίνει το SoftOne (όλα τα πεδία — χρειάζονται για το echo). */
export async function readRegistry(kind: RegistryKind): Promise<RegistryRow[]> {
  const k = REGISTRY_KINDS[kind];
  const res = await softoneCall<ListResult>('getData', { OBJECT: k.object, KEY: '1' });
  return res.data?.[k.table] ?? [];
}

async function writeRegistry(kind: RegistryKind, list: RegistryRow[]) {
  const k = REGISTRY_KINDS[kind];
  const res = await softoneCall<{ success?: boolean; error?: string; errorcode?: number }>('setData', {
    OBJECT: k.object, KEY: '1', data: { [k.table]: list },
  });
  if (res.success === false) throw new SoftoneError(res.error ?? `setData ${k.object} απέτυχε (code ${res.errorcode ?? '?'})`);
}

/** Ο τοπικός καθρέφτης (`SoftoneLookup`) για το είδος, από τη λίστα που μόλις επιβεβαιώσαμε. */
async function mirror(kind: RegistryKind, rows: RegistryRow[]) {
  const idField = REGISTRY_KINDS[kind].idField;
  const live = rows.filter((r) => r.ISACTIVE !== '0');
  await prisma.$transaction([
    prisma.softoneLookup.deleteMany({ where: { kind } }),
    ...(live.length
      ? [prisma.softoneLookup.createMany({
          data: live.map((r, i) => ({ kind, code: String(r[idField]), name: (r.NAME || r.CODE || '').trim(), order: i })),
          skipDuplicates: true,
        })]
      : []),
  ]);
}

/**
 * Εκτελεί μια αλλαγή στη λίστα με πλήρη προστασία. `build` παίρνει την τρέχουσα λίστα και επιστρέφει
 * την πλήρη νέα· `touchedId` είναι η μόνη γραμμή που επιτρέπεται να αλλάξει.
 */
async function mutate(kind: RegistryKind, touchedId: number | null, build: (rows: RegistryRow[]) => RegistryRow[]) {
  const before = await readRegistry(kind);
  if (!before.length) throw new RegistryError('Το μητρώο δεν διαβάστηκε από το SoftOne — δοκιμάστε ξανά', 502);
  const next = build(before);
  await writeRegistry(kind, next);

  const after = await readRegistry(kind);
  const damage = collateralDamage(before, after, kind, touchedId);
  if (damage.length) {
    // Επαναφορά στην κατάσταση που διαβάσαμε πριν — και μετά σφάλμα, ώστε να μην περάσει σιωπηλά.
    await writeRegistry(kind, before).catch((e) => console.error('[product-registry] restore failed', e));
    const idField = REGISTRY_KINDS[kind].idField;
    throw new RegistryError(`Η εγγραφή επηρέασε άλλες γραμμές (${damage.map((d) => d[idField]).join(', ')}) — έγινε επαναφορά και δεν αποθηκεύτηκε`, 409);
  }
  await mirror(kind, after).catch((e) => console.error('[product-registry] mirror', e));
  return after;
}

export async function createRegistryRow(kind: RegistryKind, raw: unknown): Promise<{ id: number }> {
  const input: RegistryInput = registryInput.parse(raw);
  const k = REGISTRY_KINDS[kind];
  let id = 0;
  const after = await mutate(kind, null, (rows) => {
    if (codeTaken(rows, k.idField, input.code)) throw new RegistryError(`Ο κωδικός «${input.code}» υπάρχει ήδη`);
    const out = withNewRow(rows, kind, input);
    id = out.id;
    return out.list;
  });
  if (!after.some((r) => Number(r[k.idField]) === id)) throw new RegistryError(`Ο νέος ${k.label} δεν επιβεβαιώθηκε στο SoftOne`, 502);
  return { id };
}

export async function updateRegistryRow(kind: RegistryKind, id: number, raw: unknown): Promise<void> {
  const input: RegistryInput = registryInput.parse(raw);
  const k = REGISTRY_KINDS[kind];
  const after = await mutate(kind, id, (rows) => {
    if (!rows.some((r) => Number(r[k.idField]) === id)) throw new RegistryError(`Ο ${k.label} ${id} δεν βρέθηκε`, 404);
    if (codeTaken(rows, k.idField, input.code, id)) throw new RegistryError(`Ο κωδικός «${input.code}» υπάρχει ήδη`);
    return withPatchedRow(rows, kind, id, input);
  });
  const row = after.find((r) => Number(r[k.idField]) === id);
  if (!row || row.NAME !== input.name.trim() || row.CODE !== input.code.trim()) {
    throw new RegistryError(`Η αλλαγή δεν επιβεβαιώθηκε στο SoftOne — ξαναδείτε το μητρώο`, 502);
  }
}

/** Διαγραφή γραμμής: στέλνουμε τη λίστα ΧΩΡΙΣ αυτήν (η παράλειψη τη σβήνει). */
export async function deleteRegistryRow(kind: RegistryKind, id: number): Promise<void> {
  const k = REGISTRY_KINDS[kind];
  const after = await mutate(kind, id, (rows) => {
    if (!rows.some((r) => Number(r[k.idField]) === id)) throw new RegistryError(`Ο ${k.label} ${id} δεν βρέθηκε`, 404);
    return withoutRow(rows, kind, id);
  });
  if (after.some((r) => Number(r[k.idField]) === id)) throw new RegistryError(`Η διαγραφή δεν επιβεβαιώθηκε στο SoftOne`, 502);
}
