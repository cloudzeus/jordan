/**
 * Κατάσταση λογαριασμού πελάτη — ΚΑΘΑΡΗ λογική (χωρίς SoftOne/DB), για tests, email και PDF.
 *
 * Είσοδος: οι κινήσεις καρτέλας του `traderActivity` (χρέωση = τιμολόγιο, πίστωση = είσπραξη/πιστωτικό),
 * ήδη ελεγμένες απέναντι στο TRDBALSHEET του SoftOne. Εδώ γίνονται μόνο:
 *  • περίοδος: προηγούμενο υπόλοιπο (όλα πριν το «από»), κινήσεις περιόδου με τρέχον υπόλοιπο,
 *    υπόλοιπο τέλους·
 *  • ανοιχτά παραστατικά: οι πιστώσεις (εισπράξεις/πιστωτικά) εξοφλούν τα ΠΑΛΑΙΟΤΕΡΑ τιμολόγια πρώτα
 *    (FIFO) — ό,τι μένει είναι το ανεξόφλητο κάθε τιμολογίου. Είναι ενδεικτικό (το SoftOne δεν
 *    κρατά αντιστοίχιση εξόφλησης ανά τιμολόγιο εδώ), το σύνολό του ισούται πάντα με το υπόλοιπο·
 *  • ενηλικίωση: ηλικία κάθε ανοιχτού υπολοίπου από την ημερομηνία του τιμολογίου (0–30, 31–60,
 *    61–90, 90+ ημέρες).
 * Τίποτα από αυτά δεν γράφεται πουθενά — μόνο ανάγνωση.
 */

export type StatementEntry = {
  findoc: number;
  fincode: string;
  /** ISO (μέρα ή πλήρες). */
  date: string | null;
  kindLabel: string;
  seriesName?: string | null;
  project?: string | null;
  amount: number;
  side: 'D' | 'C';
};

export type StatementLine = StatementEntry & { day: string | null; debit: number; credit: number; balance: number };
export type OpenItem = { findoc: number; fincode: string; day: string | null; kindLabel: string; project: string | null; amount: number; open: number; days: number | null };
export type AgingBucket = { key: 'current' | 'd31' | 'd61' | 'd90'; label: string; amount: number };

export type Statement = {
  from: string | null;
  to: string;
  opening: number;
  lines: StatementLine[];
  periodDebit: number;
  periodCredit: number;
  closing: number;
  open: OpenItem[];
  aging: AgingBucket[];
  /** Υπόλοιπο υπέρ του πελάτη (πιστωτικό) — δεν υπάρχουν ανοιχτά τιμολόγια. */
  inCredit: boolean;
  lastPayment: { day: string | null; amount: number; fincode: string } | null;
};

export const r2 = (n: number) => Math.round(n * 100) / 100;
const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const chrono = (a: StatementEntry, b: StatementEntry) => (a.date ?? '').localeCompare(b.date ?? '') || a.findoc - b.findoc;

export const AGING_LABEL: Record<AgingBucket['key'], string> = { current: 'Έως 30 ημέρες', d31: '31–60 ημέρες', d61: '61–90 ημέρες', d90: 'Άνω των 90 ημερών' };
export const agingKey = (days: number | null): AgingBucket['key'] => (days == null || days <= 30 ? 'current' : days <= 60 ? 'd31' : days <= 90 ? 'd61' : 'd90');

/**
 * @param entries κινήσεις καρτέλας (οποιαδήποτε σειρά)
 * @param period  `from` (συμπεριλαμβάνεται, null = από την αρχή) και `to` (συμπεριλαμβάνεται) σε YYYY-MM-DD
 */
export function buildStatement(entries: StatementEntry[], period: { from?: string | null; to: string }): Statement {
  const from = period.from || null;
  const to = period.to;
  const upTo = entries.filter((e) => { const d = dayOf(e.date); return !d || d <= to; }).sort(chrono);

  let opening = 0;
  let run = 0;
  const lines: StatementLine[] = [];
  for (const e of upTo) {
    const d = dayOf(e.date);
    const signed = e.side === 'D' ? e.amount : -e.amount;
    if (from && d && d < from) { opening += signed; run += signed; continue; }
    run += signed;
    lines.push({ ...e, day: d, debit: e.side === 'D' ? r2(e.amount) : 0, credit: e.side === 'C' ? r2(e.amount) : 0, balance: r2(run) });
  }
  const periodDebit = r2(lines.reduce((s, l) => s + l.debit, 0));
  const periodCredit = r2(lines.reduce((s, l) => s + l.credit, 0));
  const closing = r2(run);

  // FIFO: οι πιστώσεις καλύπτουν τις παλαιότερες χρεώσεις (έως το τέλος της περιόδου).
  const charges = upTo.filter((e) => e.side === 'D' && e.amount > 0).map((e) => ({ e, left: e.amount }));
  // Αρνητικές χρεώσεις (σπάνιες διορθώσεις) λειτουργούν ως πιστώσεις, και το αντίστροφο.
  let pool = upTo.reduce((s, e) => s + (e.side === 'C' ? e.amount : e.amount < 0 ? -e.amount : 0), 0);
  for (const c of charges) {
    if (pool <= 0) break;
    const take = Math.min(pool, c.left);
    c.left -= take;
    pool -= take;
  }
  const open: OpenItem[] = charges.filter((c) => c.left > 0.005).map((c) => {
    const d = dayOf(c.e.date);
    return { findoc: c.e.findoc, fincode: c.e.fincode, day: d, kindLabel: c.e.kindLabel, project: c.e.project ?? null, amount: r2(c.e.amount), open: r2(c.left), days: d ? Math.max(0, daysBetween(d, to)) : null };
  });

  const buckets = new Map<AgingBucket['key'], number>([['current', 0], ['d31', 0], ['d61', 0], ['d90', 0]]);
  for (const o of open) buckets.set(agingKey(o.days), (buckets.get(agingKey(o.days)) ?? 0) + o.open);
  const aging = [...buckets.entries()].map(([key, amount]) => ({ key, label: AGING_LABEL[key], amount: r2(amount) }));

  const pays = upTo.filter((e) => e.side === 'C' && /είσπραξ|πληρωμ|εμβασμ|έμβασμ/i.test(`${e.kindLabel} ${e.seriesName ?? ''}`));
  const last = pays.at(-1);

  return {
    from, to, opening: r2(opening), lines, periodDebit, periodCredit, closing,
    open: open.reverse(), aging, inCredit: closing < -0.005,
    lastPayment: last ? { day: dayOf(last.date), amount: r2(last.amount), fincode: last.fincode } : null,
  };
}

/** Ληξιπρόθεσμο = ανοιχτά άνω των `days` ημερών (προεπιλογή 30). */
export const overdue = (s: Statement, days = 30) => r2(s.open.filter((o) => (o.days ?? 0) > days).reduce((t, o) => t + o.open, 0));

export const eurEl = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** «2026-10-18» → «18/10/2026». */
export const dayEl = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
export const periodLabel = (s: Pick<Statement, 'from' | 'to'>) => (s.from ? `${dayEl(s.from)} – ${dayEl(s.to)}` : `έως ${dayEl(s.to)}`);

/** Μορφή υπολοίπου για τον πελάτη: «1.234,56 €» ή «1.234,56 € (υπέρ σας)». */
export const balanceEl = (n: number) => (n < -0.005 ? `${eurEl(-n)} πιστωτικό` : eurEl(n));
