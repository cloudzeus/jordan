// lib/product-registry-core.ts — ΚΑΘΑΡΟ. Οι κανόνες εγγραφής στα αντικείμενα-ΛΙΣΤΑ του SoftOne
// (`$ITEMARK` μάρκες, `$MTRMANFCTR` κατασκευαστές). Η επικοινωνία ζει στο `product-registry.ts`.
//
// ΤΟ ΚΡΙΣΙΜΟ (επιβεβαιωμένο ζωντανά, atelier 2026-10-28): το `getData` με ΟΠΟΙΟΔΗΠΟΤΕ KEY επιστρέφει
// ΟΛΗ τη λίστα, και το `setData` ΑΝΤΙΚΑΘΙΣΤΑ ΟΛΗ τη λίστα με ό,τι στείλεις: **γραμμή που παραλείπεις
// ΣΒΗΝΕΤΑΙ**. Έτσι χάθηκε η ομάδα «Βασική Ομάδα» παλιότερα. Γι' αυτό κάθε εγγραφή εδώ φτιάχνεται ΜΟΝΟ
// από τη λίστα που μόλις διαβάστηκε — ποτέ από μία μεμονωμένη γραμμή.
import { z } from 'zod';

export const REGISTRY_KINDS = {
  MTRMARK: { object: '$ITEMARK', table: 'ITEMARK', idField: 'MTRMARK', label: 'μάρκα', sodtype: '51' },
  MTRMANFCTR: { object: '$MTRMANFCTR', table: 'MTRMANFCTR', idField: 'MTRMANFCTR', label: 'κατασκευαστής', sodtype: null },
} as const;
export type RegistryKind = keyof typeof REGISTRY_KINDS;
export const isRegistryKind = (v: unknown): v is RegistryKind => v === 'MTRMARK' || v === 'MTRMANFCTR';

export type RegistryRow = Record<string, string>;

export const registryInput = z.object({
  code: z.string().trim().min(1, 'Ο κωδικός είναι υποχρεωτικός').max(32, 'Έως 32 χαρακτήρες'),
  name: z.string().trim().min(1, 'Η ονομασία είναι υποχρεωτική').max(128, 'Έως 128 χαρακτήρες'),
  isActive: z.boolean().default(true),
});
export type RegistryInput = z.infer<typeof registryInput>;

/** Ο επόμενος ελεύθερος αριθμός της λίστας. */
export function nextRegistryId(rows: RegistryRow[], idField: string): number {
  const ids = rows.map((r) => Number(r[idField])).filter((n) => Number.isInteger(n));
  return (ids.length ? Math.max(...ids) : 0) + 1;
}

/** Υπάρχει ήδη ο κωδικός (εκτός από τη γραμμή που αλλάζουμε); */
export const codeTaken = (rows: RegistryRow[], idField: string, code: string, exceptId?: number) =>
  rows.some((r) => r.CODE?.trim().toLowerCase() === code.trim().toLowerCase() && Number(r[idField]) !== exceptId);

/**
 * Η ΠΛΗΡΗΣ λίστα προς αποστολή για νέα γραμμή: όλες οι υπάρχουσες αυτούσιες + η νέα στο τέλος.
 * Τα πεδία της νέας αντιγράφονται από υπάρχουσα γραμμή, ώστε να μη λείπει καμία στήλη του tenant.
 */
export function withNewRow(rows: RegistryRow[], kind: RegistryKind, input: RegistryInput): { list: RegistryRow[]; id: number } {
  const k = REGISTRY_KINDS[kind];
  const id = nextRegistryId(rows, k.idField);
  const shape = rows[0] ?? {};
  const row: RegistryRow = {
    ...Object.fromEntries(Object.keys(shape).map((f) => [f, shape[f]])),
    COMPANY: shape.COMPANY ?? '1000',
    ...(k.sodtype ? { SODTYPE: k.sodtype } : {}),
    [k.idField]: String(id),
    CODE: input.code.trim(),
    NAME: input.name.trim(),
    ISACTIVE: input.isActive ? '1' : '0',
  };
  return { list: [...rows, row], id };
}

/** Η ΠΛΗΡΗΣ λίστα με αλλαγμένη ΜΟΝΟ τη γραμμή `id` — οι υπόλοιπες αυτούσιες. */
export function withPatchedRow(rows: RegistryRow[], kind: RegistryKind, id: number, input: RegistryInput): RegistryRow[] {
  const k = REGISTRY_KINDS[kind];
  return rows.map((r) => (Number(r[k.idField]) === id
    ? { ...r, CODE: input.code.trim(), NAME: input.name.trim(), ISACTIVE: input.isActive ? '1' : '0' }
    : r));
}

/** Η ΠΛΗΡΗΣ λίστα χωρίς τη γραμμή `id` (η παράλειψη τη σβήνει στο SoftOne). */
export const withoutRow = (rows: RegistryRow[], kind: RegistryKind, id: number) =>
  rows.filter((r) => Number(r[REGISTRY_KINDS[kind].idField]) !== id);

/**
 * Έλεγχος ζημιάς μετά την εγγραφή: ποιες από τις γραμμές που ΔΕΝ πειράξαμε χάθηκαν ή άλλαξαν.
 * Κενό = η εγγραφή ήταν καθαρή.
 */
export function collateralDamage(before: RegistryRow[], after: RegistryRow[], kind: RegistryKind, touchedId: number | null): RegistryRow[] {
  const idField = REGISTRY_KINDS[kind].idField;
  return before
    .filter((b) => Number(b[idField]) !== touchedId)
    .filter((b) => !after.some((a) => a[idField] === b[idField] && a.CODE === b.CODE && a.NAME === b.NAME && a.ISACTIVE === b.ISACTIVE));
}
