// lib/trader-class-select.ts — ΚΑΘΑΡΟ. Συσχετιζόμενες επιλογές εμπορικής κατηγορίας (TRDBUSINESS) στις
// φόρμες συναλλασσομένου, πάνω στις γραμμές `TraderClass` μιας πλευράς (SODTYPE).
//
// Το δέντρο έχει μεταβλητό βάθος (π.χ. «Ιδιώτες» είναι φύλλο στο 2ο επίπεδο, «Πλακίδια & πέτρα» στο 3ο).
// Η ρίζα (Πελάτες / Προμηθευτές) δεν επιλέγεται· εμφανίζεται ένα combo ανά επίπεδο κάτω από αυτήν,
// όσο ο επιλεγμένος κόμβος έχει παιδιά. Στην καρτέλα γράφεται ΜΟΝΟ φύλλο, και μόνο αν υπάρχει ήδη στο
// SoftOne (`softoneId`)· αλλιώς η επιλογή κρατιέται στη βάση μας μέχρι να δημιουργηθεί.

export interface ClassRow {
  id: number;
  key: string;
  level: number;
  code: string;
  name: string;
  parentId: number | null;
  softoneId: number | null;
  sohCode?: string | null;
}

/** Η επιλογή = η διαδρομή κόμβων κάτω από τη ρίζα (ids, από το γενικό στο ειδικό). */
export type ClassPath = number[];

export const rootOf = (rows: ClassRow[]) => rows.find((r) => r.parentId == null) ?? null;
export const childrenOf = (rows: ClassRow[], id: number | null) => (id == null ? [] : rows.filter((r) => r.parentId === id));
export const isLeafRow = (rows: ClassRow[], id: number) => !rows.some((r) => r.parentId === id);

/** Οι λίστες επιλογών που εμφανίζονται: μία για κάθε επίπεδο, όσο ο επιλεγμένος κόμβος έχει παιδιά. */
export function levelOptions(rows: ClassRow[], path: ClassPath): ClassRow[][] {
  const root = rootOf(rows);
  if (!root) return [];
  const out: ClassRow[][] = [];
  let parent: number | null = root.id;
  for (let i = 0; parent != null; i++) {
    const opts = childrenOf(rows, parent);
    if (!opts.length) break;
    out.push(opts);
    parent = path[i] != null && opts.some((o) => o.id === path[i]) ? path[i] : null;
  }
  return out;
}

/** Επιλογή στο επίπεδο `depth` (0 = κάτω από τη ρίζα): κρατά τα από πάνω, καθαρίζει τα από κάτω. */
export function choose(path: ClassPath, depth: number, id: number | null): ClassPath {
  const head = path.slice(0, depth);
  return id == null ? head : [...head, id];
}

/** Η διαδρομή (κάτω από τη ρίζα) μέχρι έναν κόμβο. */
export function pathTo(rows: ClassRow[], id: number | null): ClassPath {
  const out: number[] = [];
  for (let n = rows.find((r) => r.id === id); n && n.parentId != null; n = rows.find((r) => r.id === n!.parentId)) out.unshift(n.id);
  return out;
}

/** Το φύλλο της επιλογής — `null` αν η διαδρομή δεν έχει φτάσει σε φύλλο. */
export function leafOf(rows: ClassRow[], path: ClassPath): number | null {
  const last = path[path.length - 1];
  return last != null && isLeafRow(rows, last) ? last : null;
}

/** Από το κλειδί που έχει η καρτέλα στο SoftOne (TRDR.TRDBUSINESS). */
export function pathFromSoftone(rows: ClassRow[], trdBusiness: string | number | null | undefined): ClassPath {
  const n = Number(trdBusiness);
  if (!Number.isInteger(n) || n <= 0) return [];
  const row = rows.find((r) => r.softoneId === n);
  return row ? pathTo(rows, row.id) : [];
}

export interface SoftoneClassValue {
  /** `trdBusiness` μόνο όταν το φύλλο υπάρχει στο SoftOne· απόν = «δεν αγγίζω». */
  values: { trdBusiness?: string };
  /** Επιλέχθηκε φύλλο που δεν έχει δημιουργηθεί ακόμα στο SoftOne. */
  pending: ClassRow | null;
}

export function softoneValue(rows: ClassRow[], path: ClassPath): SoftoneClassValue {
  const leaf = leafOf(rows, path);
  const row = leaf != null ? rows.find((r) => r.id === leaf) : undefined;
  if (!row) return { values: {}, pending: null };
  return row.softoneId != null ? { values: { trdBusiness: String(row.softoneId) }, pending: null } : { values: {}, pending: row };
}

/** «Οικοδομικών Υλικών › Πλακίδια & πέτρα» */
export function pathLabel(rows: ClassRow[], path: ClassPath): string {
  return path.map((id) => rows.find((r) => r.id === id)?.name).filter(Boolean).join(' › ');
}

export const samePath = (a: ClassPath, b: ClassPath) => a.length === b.length && a.every((x, i) => x === b[i]);
