// lib/contracts/stock-core.ts — ΚΑΘΑΡΟ. Απόθεμα έναντι αναγκών μιας προσφοράς/συνταγής: πόσο χρειάζεται
// κάθε είδος (άθροισμα γραμμών υλικών), πόσο έχουμε (καθρέφτης SoftOne) και πόσο πρέπει να παραγγελθεί.
// Η σύγκριση γίνεται μόνο όταν η μονάδα της γραμμής ταιριάζει με τη μονάδα αποθήκης του είδους.

export type StockInfo = { qty: number; unit: string | null; syncedAt: string | null };
export type NeedLine = { kind: 'MATERIAL' | 'SERVICE'; mtrl: number | null; code: string | null; name: string; unit: string | null; qty: number };

export type StockNeed = {
  mtrl: number; code: string | null; name: string; unit: string | null;
  need: number; have: number; stockUnit: string | null;
  /** Η μονάδα γραμμής = μονάδα αποθήκης (ή μία από τις δύο λείπει) ⇒ η σύγκριση έχει νόημα. */
  comparable: boolean;
  /** Ποσότητα προς παραγγελία (0 όταν επαρκεί ή δεν συγκρίνεται). */
  short: number;
  status: 'ok' | 'short' | 'none' | 'unknown';
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** «m2», «τ.μ.», «Τετραγωνικά» → «m2» κ.λπ. — αρκετό για να ταιριάξουν οι συνήθεις γραφές. */
export function normUnit(u: string | null | undefined): string | null {
  if (!u) return null;
  const s = u.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s.]/g, '').replace('²', '2').replace('³', '3');
  if (['m2', 'tm', 'τμ', 'τετραγωνικα', 'τετρμετρα', 'τετραγωνικαμετρα', 'τετραγωνικομετρο', 'sqm'].includes(s)) return 'm2';
  if (['m3', 'κμ', 'κυβικα'].includes(s)) return 'm3';
  if (['m', 'μ', 'μετρα', 'μετρο', 'τρεχοντα', 'τρμ'].includes(s)) return 'm';
  if (['τεμ', 'τεμαχια', 'τεμαχιο', 'pcs', 'τμχ', 'τεμαχ'].includes(s)) return 'pcs';
  if (['kg', 'κιλα', 'κιλο', 'χλγ'].includes(s)) return 'kg';
  if (['lt', 'l', 'λιτρα', 'λιτ'].includes(s)) return 'l';
  if (['σακ', 'σακι', 'σακια', 'σακος'].includes(s)) return 'bag';
  return s;
}

/** Ανάγκες ανά είδος (μόνο γραμμές υλικών με είδος μητρώου), με το απόθεμα και το έλλειμμα. */
export function stockNeeds(lines: NeedLine[], stock: Record<number, StockInfo | undefined>): StockNeed[] {
  const by = new Map<number, StockNeed>();
  for (const l of lines) {
    if (l.kind !== 'MATERIAL' || l.mtrl == null || !(l.qty > 0)) continue;
    const cur = by.get(l.mtrl);
    if (cur) { cur.need = r3(cur.need + l.qty); continue; }
    by.set(l.mtrl, { mtrl: l.mtrl, code: l.code, name: l.name, unit: l.unit, need: r3(l.qty), have: 0, stockUnit: null, comparable: true, short: 0, status: 'unknown' });
  }
  for (const n of by.values()) {
    const s = stock[n.mtrl];
    if (!s) continue;
    n.have = s.qty;
    n.stockUnit = s.unit;
    const a = normUnit(n.unit), b = normUnit(s.unit);
    n.comparable = !a || !b || a === b;
    if (!n.comparable) { n.status = 'unknown'; continue; }
    n.short = r3(Math.max(0, n.need - Math.max(0, s.qty)));
    n.status = n.short === 0 ? 'ok' : s.qty <= 0 ? 'none' : 'short';
  }
  return [...by.values()];
}
