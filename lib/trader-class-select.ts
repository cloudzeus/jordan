// lib/trader-class-select.ts — ΚΑΘΑΡΟ. Συσχετιζόμενες επιλογές κατηγορίας (επ.1 → επ.2 → επ.3) στις
// φόρμες συναλλασσομένου, πάνω στις γραμμές `TraderClass` μιας πλευράς (SODTYPE).
//
// Κανόνες:
// - Επ.2 = παιδιά του επ.1. Για ξένο επ.1 (ΕΕ/τρίτες χώρες) προστίθενται και οι κλάδοι του «εσωτερικού»:
//   ο κλάδος ενός ξένου προμηθευτή (π.χ. πλακάκια από Ισπανία) μένει ίδιος, αλλάζει μόνο η λογ. κατηγορία.
// - Επ.3 = παιδιά του επ.2.
// - Αλλαγή γονέα που δεν «χωρά» πια το παιδί → το παιδί καθαρίζει.
// - Στο SoftOne γράφεται ένα επίπεδο ΜΟΝΟ αν η εγγραφή του υπάρχει εκεί (`softoneId`)· αλλιώς μένει
//   στη βάση μας ως εκκρεμότητα (pending) μέχρι να δημιουργηθεί.

export interface ClassRow {
  id: number;
  key: string;
  level: number;
  code: string;
  name: string;
  parentId: number | null;
  softoneId: number | null;
}

export interface ClassSelection { l1: number | null; l2: number | null; l3: number | null }
export const EMPTY_SELECTION: ClassSelection = { l1: null, l2: null, l3: null };

const isForeignL1 = (n: ClassRow | undefined) => !!n && n.level === 1 && /_(EU|THIRD)$/.test(n.key);
const isDomesticL1 = (n: ClassRow) => n.level === 1 && /_DOMESTIC$/.test(n.key);

export function level1Options(rows: ClassRow[]): ClassRow[] {
  return rows.filter((r) => r.level === 1);
}

export function level2Options(rows: ClassRow[], l1: number | null): ClassRow[] {
  if (l1 == null) return [];
  const parent = rows.find((r) => r.id === l1);
  const parents = new Set([l1]);
  if (isForeignL1(parent)) for (const r of rows) if (isDomesticL1(r)) parents.add(r.id);
  return rows.filter((r) => r.level === 2 && r.parentId != null && parents.has(r.parentId));
}

export function level3Options(rows: ClassRow[], l2: number | null): ClassRow[] {
  if (l2 == null) return [];
  return rows.filter((r) => r.level === 3 && r.parentId === l2);
}

/** Νέα επιλογή σε ένα επίπεδο· τα κατώτερα μένουν μόνο αν ακόμα ταιριάζουν. */
export function changeLevel(rows: ClassRow[], sel: ClassSelection, level: 1 | 2 | 3, id: number | null): ClassSelection {
  if (level === 1) {
    const l2 = sel.l2 != null && level2Options(rows, id).some((r) => r.id === sel.l2) ? sel.l2 : null;
    return { l1: id, l2, l3: l2 == null ? null : sel.l3 };
  }
  if (level === 2) {
    const l3 = sel.l3 != null && level3Options(rows, id).some((r) => r.id === sel.l3) ? sel.l3 : null;
    return { ...sel, l2: id, l3 };
  }
  return { ...sel, l3: id };
}

/**
 * Πλήρης επιλογή από ένα φύλλο (π.χ. την πρόταση ΚΑΔ). `l1` = η λογ. κατηγορία που ήδη ισχύει, αν είναι
 * συμβατή (π.χ. ξένος προμηθευτής κρατά «ΕΕ»)· αλλιώς ο γονέας του κλάδου.
 */
export function selectionFromLeaf(rows: ClassRow[], leafId: number | null, keepL1: number | null = null): ClassSelection {
  const l3 = rows.find((r) => r.id === leafId && r.level === 3);
  if (!l3) return keepL1 != null ? { l1: keepL1, l2: null, l3: null } : EMPTY_SELECTION;
  const l2 = rows.find((r) => r.id === l3.parentId);
  if (!l2) return EMPTY_SELECTION;
  const l1 = keepL1 != null && level2Options(rows, keepL1).some((r) => r.id === l2.id) ? keepL1 : l2.parentId;
  return { l1, l2: l2.id, l3: l3.id };
}

/** Επιλογή από τα κλειδιά που έχει ήδη η καρτέλα στο SoftOne (TRDCATEGORY / TRDBUSINESS / TRDGROUP). */
export function selectionFromSoftone(
  rows: ClassRow[], s: { trdCategory?: string | number | null; trdBusiness?: string | number | null; trdGroup?: string | number | null },
): ClassSelection {
  const find = (level: number, v: unknown) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return rows.find((r) => r.level === level && r.softoneId === n)?.id ?? null;
  };
  let sel: ClassSelection = { l1: find(1, s.trdCategory), l2: null, l3: null };
  sel = changeLevel(rows, sel, 2, find(2, s.trdBusiness));
  return changeLevel(rows, sel, 3, find(3, s.trdGroup));
}

export interface SoftoneClassValues {
  /** Μόνο όσα επίπεδα ΥΠΑΡΧΟΥΝ στο SoftOne· απόν κλειδί = «δεν αγγίζω». */
  values: Partial<Record<'trdCategory' | 'trdBusiness' | 'trdGroup', string>>;
  /** Επίπεδα που επιλέχθηκαν αλλά δεν έχουν δημιουργηθεί ακόμα στο SoftOne. */
  pending: ClassRow[];
}

const FIELD_BY_LEVEL = { 1: 'trdCategory', 2: 'trdBusiness', 3: 'trdGroup' } as const;

export function softoneValues(rows: ClassRow[], sel: ClassSelection): SoftoneClassValues {
  const out: SoftoneClassValues = { values: {}, pending: [] };
  for (const level of [1, 2, 3] as const) {
    const id = sel[`l${level}`];
    if (id == null) continue;
    const row = rows.find((r) => r.id === id);
    if (!row) continue;
    if (row.softoneId != null) out.values[FIELD_BY_LEVEL[level]] = String(row.softoneId);
    else out.pending.push(row);
  }
  return out;
}

/** «Χονδρικής Εσωτερικού › Ξενοδοχεία & … › Ξενοδοχεία» */
export function selectionLabel(rows: ClassRow[], sel: ClassSelection): string {
  return [sel.l1, sel.l2, sel.l3].map((id) => rows.find((r) => r.id === id)?.name).filter(Boolean).join(' › ');
}

export const sameSelection = (a: ClassSelection, b: ClassSelection) => a.l1 === b.l1 && a.l2 === b.l2 && a.l3 === b.l3;
