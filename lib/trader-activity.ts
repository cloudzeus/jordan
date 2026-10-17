import 'server-only';
import { prisma } from '@/lib/db';
import { softoneGetTable, s1DateOrNull, sosourceLabel } from '@/lib/softone';
import { docKindMap, PURCHASE_KIND_LABEL, type PurchaseKind } from '@/lib/purchase-kinds';

/**
 * Η καρτέλα ενός συναλλασσομένου, ζωντανά από το SoftOne.
 *
 * Πηγές (επιβεβαιωμένες ζωντανά, atelier 2026-10-17):
 *  • FINDOC με TRDR=x — τιμολόγια, πιστωτικά, εισπράξεις/πληρωμές, παραγγελίες, προσφορές…
 *  • TRDTLINES με TRDR=x — οι γραμμές των ΕΜΒΑΣΜΑΤΩΝ: η κεφαλή του εμβάσματος έχει την τράπεζα,
 *    ο πελάτης/προμηθευτής είναι στη γραμμή (αλλιώς οι εισπράξεις μέσω τράπεζας δεν φαίνονται).
 *  • TRDBALSHEET — τα επίσημα σύνολα χρέωσης/πίστωσης ανά χρήση και περίοδο. Με αυτά ελέγχεται
 *    η ανασύνθεση: για πελάτη 142 και προμηθευτές 39, 232 ταιριάζει στο λεπτό.
 *
 * Χρέωση/πίστωση ανά κίνηση: «επιβάρυνση» (τιμολόγιο, απόδειξη, δαπάνη) χρεώνει τον πελάτη και
 * πιστώνει τον προμηθευτή· «εξόφληση» (είσπραξη, πληρωμή, έμβασμα, πιστωτικό) το αντίθετο· μια
 * «επιστροφή» πληρωμής αντιστρέφει την εξόφληση· «Χρέωση/Πίστωση Έναρξης» ό,τι λέει το όνομα.
 * Παραγγελίες, προσφορές και δελτία ΔΕΝ μπαίνουν στην καρτέλα.
 */

const PAYMENT_SOURCES = new Set([1281, 1381, 1412, 1413, 1415, 1416]);
const TRADE = new Set([1251, 1351]);

export type LedgerSide = 'D' | 'C' | null;

export type TraderDoc = {
  findoc: number;
  fincode: string;
  date: string | null;
  sosource: number;
  family: string;
  series: string;
  seriesName: string | null;
  kind: PurchaseKind | 'payment' | 'other';
  kindLabel: string;
  amount: number;
  side: LedgerSide;
  /** Υπόλοιπο μετά την κίνηση (μόνο για κινήσεις καρτέλας). */
  balance: number | null;
  project: string | null;
  prjc: number | null;
  viaRemittance: boolean;
};

export type TraderProject = {
  prjc: number; code: string; name: string; role: string; isActive: boolean;
  fromDate: string | null; finalDate: string | null; invoiced: number; docs: number;
};

export type TraderActivity = {
  side: 'customer' | 'supplier';
  ledger: TraderDoc[];
  orders: TraderDoc[];
  quotes: TraderDoc[];
  totals: { debit: number; credit: number; balance: number };
  /** Τα επίσημα σύνολα του SoftOne (TRDBALSHEET) και αν συμφωνεί η ανασύνθεση. */
  softone: { debit: number; credit: number; balance: number; matches: boolean; diff: number };
  byYear: { year: number; debit: number; credit: number }[];
  projects: TraderProject[];
  lastPayment: { date: string | null; amount: number; fincode: string } | null;
  fetchedAt: string;
};

const fold = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '');
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Επιβάρυνση ή εξόφληση; null = δεν μπαίνει στην καρτέλα. Το «χρέωση/πίστωση έναρξης» επιστρέφει πλευρά απευθείας. */
export function ledgerEffect(sosource: number, name: string, kind: PurchaseKind | null): 'charge' | 'settle' | 'D' | 'C' | null {
  const n = fold(name);
  if (/χρεωση εναρξης/.test(n)) return 'D';
  if (/πιστωση εναρξης/.test(n)) return 'C';
  if (PAYMENT_SOURCES.has(sosource)) return /επιστροφ/.test(n) ? 'charge' : 'settle';
  if (TRADE.has(sosource)) return kind === 'invoice' ? 'charge' : kind === 'credit' ? 'settle' : null;
  if (/πιστωτικ/.test(n)) return 'settle';
  if (/τιμολ|αποδειξ|δαπαν|απυ|εγγραφ/.test(n)) return 'charge';
  return null;
}

export async function traderActivity(trdr: number): Promise<TraderActivity> {
  const trader = await prisma.softoneTrader.findUnique({ where: { trdr }, select: { sodtype: true } });
  // Πελάτες (13) και χρεώστες (15) χρεώνονται με τις πωλήσεις· οι υπόλοιποι λειτουργούν ως προμηθευτές.
  const side: 'customer' | 'supplier' = trader && (trader.sodtype === 13 || trader.sodtype === 15) ? 'customer' : 'supplier';

  const FIELDS = ['FINDOC', 'FINCODE', 'TRNDATE', 'SERIES', 'SOSOURCE', 'SUMAMNT', 'ISCANCEL', 'PRJC'];
  const [heads, tlines, bal] = await Promise.all([
    softoneGetTable('FINDOC', FIELDS, `TRDR=${trdr} AND ISCANCEL=0`),
    softoneGetTable('TRDTLINES', ['TRDR', 'FINDOC', 'LINEVAL', 'PRJC'], `TRDR=${trdr}`),
    softoneGetTable('TRDBALSHEET', ['TRDR', 'FISCPRD', 'PERIOD', 'LDEBIT', 'LCREDIT'], `TRDR=${trdr}`),
  ]);
  const remitIds = [...new Set(tlines.map((l) => Number(l.FINDOC)).filter((n) => n > 0))];
  const remitHeads = remitIds.length
    ? await softoneGetTable('FINDOC', FIELDS, `ISCANCEL=0 AND FINDOC IN (${remitIds.join(',')})`)
    : [];
  const remitHeadById = new Map(remitHeads.map((h) => [Number(h.FINDOC), h]));

  const [kinds, series, purchaseTypes] = await Promise.all([
    docKindMap(),
    prisma.softoneDocSeries.findMany({ select: { sosource: true, code: true, name: true } }),
    prisma.purchaseDocType.findMany({ select: { code: true, name: true } }),
  ]);
  const seriesName = new Map(series.map((s) => [`${s.sosource}:${s.code}`, s.name]));
  for (const p of purchaseTypes) seriesName.set(`1251:${p.code}`, p.name);

  type Raw = { h: Record<string, string>; amount: number; prjc: number | null; via: boolean };
  const raws: Raw[] = [
    ...heads.map((h) => ({ h, amount: Number(h.SUMAMNT) || 0, prjc: Number(h.PRJC) || null, via: false })),
    ...tlines.flatMap((l) => {
      const h = remitHeadById.get(Number(l.FINDOC));
      return h ? [{ h, amount: Number(l.LINEVAL) || 0, prjc: Number(l.PRJC) || Number(h.PRJC) || null, via: true }] : [];
    }),
  ];

  const prjcIds = [...new Set(raws.map((r) => r.prjc).filter((n): n is number => !!n))];
  const projects = await prisma.softoneProject.findMany({
    where: { OR: [{ trdr }, { trdrSu: trdr }, { prjc: { in: prjcIds } }] },
  });
  const projectById = new Map(projects.map((p) => [p.prjc, p]));

  const docs: TraderDoc[] = raws.map(({ h, amount, prjc, via }) => {
    const sosource = Number(h.SOSOURCE);
    const name = seriesName.get(`${sosource}:${h.SERIES}`) ?? '';
    const tk = TRADE.has(sosource) ? kinds.get(`${sosource}:${h.SERIES}`) ?? 'movement' : null;
    const eff = ledgerEffect(sosource, name, tk);
    const sideOf: LedgerSide = eff === 'D' || eff === 'C' ? eff
      : eff === 'charge' ? (side === 'customer' ? 'D' : 'C')
        : eff === 'settle' ? (side === 'customer' ? 'C' : 'D') : null;
    const kind: TraderDoc['kind'] = tk ?? (PAYMENT_SOURCES.has(sosource) ? 'payment' : 'other');
    const date = s1DateOrNull(h.TRNDATE);
    const p = prjc ? projectById.get(prjc) : undefined;
    return {
      findoc: Number(h.FINDOC), fincode: h.FINCODE || `#${h.FINDOC}`, date: date ? date.toISOString() : null,
      sosource, family: sosourceLabel(sosource), series: h.SERIES, seriesName: name || null,
      kind, kindLabel: tk ? PURCHASE_KIND_LABEL[tk] : kind === 'payment' ? (side === 'customer' ? 'Είσπραξη' : 'Πληρωμή') : sosourceLabel(sosource),
      amount, side: sideOf, balance: null,
      project: p ? `${p.code} · ${p.name}` : prjc ? `Έργο #${prjc}` : null, prjc, viaRemittance: via,
    };
  });

  // Καρτέλα: χρονολογικά για το τρέχον υπόλοιπο, μετά ανάποδα για εμφάνιση (νεότερα πρώτα).
  const ledger = docs.filter((d) => d.side).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.findoc - b.findoc);
  let run = 0;
  for (const d of ledger) {
    run += d.side === 'D' ? d.amount : -d.amount;
    d.balance = round2(run);
  }
  const debit = round2(ledger.filter((d) => d.side === 'D').reduce((s, d) => s + d.amount, 0));
  const credit = round2(ledger.filter((d) => d.side === 'C').reduce((s, d) => s + d.amount, 0));

  const years = new Map<number, { debit: number; credit: number }>();
  for (const r of bal) {
    const y = Number(r.FISCPRD);
    const e = years.get(y) ?? { debit: 0, credit: 0 };
    e.debit += Number(r.LDEBIT) || 0;
    e.credit += Number(r.LCREDIT) || 0;
    years.set(y, e);
  }
  const sDebit = round2([...years.values()].reduce((s, y) => s + y.debit, 0));
  const sCredit = round2([...years.values()].reduce((s, y) => s + y.credit, 0));
  const diff = round2((debit - credit) - (sDebit - sCredit));

  const pays = ledger.filter((d) => d.kind === 'payment' && d.side === (side === 'customer' ? 'C' : 'D'));
  const last = pays.at(-1);

  const invoicedByProject = new Map<number, { v: number; n: number }>();
  for (const d of ledger) {
    if (!d.prjc || d.kind !== 'invoice') continue;
    const e = invoicedByProject.get(d.prjc) ?? { v: 0, n: 0 };
    e.v += d.amount; e.n++;
    invoicedByProject.set(d.prjc, e);
  }

  return {
    side,
    ledger: ledger.reverse(),
    orders: docs.filter((d) => d.kind === 'order').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    quotes: docs.filter((d) => d.kind === 'quote').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    totals: { debit, credit, balance: round2(debit - credit) },
    softone: { debit: sDebit, credit: sCredit, balance: round2(sDebit - sCredit), matches: Math.abs(diff) < 0.01, diff },
    byYear: [...years.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, debit: round2(v.debit), credit: round2(v.credit) })),
    projects: projects.map((p) => ({
      prjc: p.prjc, code: p.code, name: p.name, isActive: p.isActive,
      role: p.trdr === trdr ? 'Πελάτης' : p.trdrSu === trdr ? 'Προμηθευτής' : 'Σε παραστατικά',
      fromDate: p.fromDate?.toISOString() ?? null, finalDate: p.finalDate?.toISOString() ?? null,
      invoiced: round2(invoicedByProject.get(p.prjc)?.v ?? 0), docs: invoicedByProject.get(p.prjc)?.n ?? 0,
    })).sort((a, b) => b.code.localeCompare(a.code)),
    lastPayment: last ? { date: last.date, amount: last.amount, fincode: last.fincode } : null,
    fetchedAt: new Date().toISOString(),
  };
}
