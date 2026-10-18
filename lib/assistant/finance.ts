// lib/assistant/finance.ts — SERVER. Οικονομικές ερωτήσεις του Air Jordan: τζίρος/αγορές περιόδου και
// υπόλοιπο πελάτη σε έργο. ΜΟΝΟ ανάγνωση (GetTable + στιγμιότυπο κερδοφορίας).
//
// Τζίρος = παραστατικά πωλήσεων (FINDOC SOSOURCE 1351, ISCANCEL=0) της περιόδου που είναι ΤΙΜΟΛΟΓΙΑ ή
// ΑΠΟΔΕΙΞΕΙΣ, μείον ΠΙΣΤΩΤΙΚΑ — ο τύπος βγαίνει από τη σειρά (lib/purchase-kinds · docKindMap), ίδιος
// κανόνας με την κερδοφορία έργων. Παραγγελίες, προσφορές, δελτία ΔΕΝ μετρούν (αλλιώς η ίδια πώληση
// μετριέται 2–3 φορές)· αναφέρονται χωριστά ως «εκτός τζίρου». Καθαρά = NETAMNT, μικτά = SUMAMNT.
import 'server-only';
import { prisma } from '@/lib/db';
import { softoneGetTable, s1DateOrNull } from '@/lib/softone';
import { docKindMap, PURCHASE_KIND_LABEL, type PurchaseKind } from '@/lib/purchase-kinds';
import { getProjectFinancials } from '@/lib/project-profit';
import { s1Date, type Period } from './period';

const SALES = 1351;
const PURCHASES = 1251;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: string | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type TurnoverDoc = { findoc: number; fincode: string; date: string | null; series: string; seriesName: string | null; kind: PurchaseKind; trader: string | null; project: string | null; net: number; gross: number };

export interface Turnover {
  side: 'sales' | 'purchases';
  period: Period;
  filter: { trader: string | null; project: string | null };
  /** Τιμολόγια/αποδείξεις μείον πιστωτικά. */
  net: number;
  gross: number;
  invoices: { count: number; net: number; gross: number };
  credits: { count: number; net: number; gross: number };
  byMonth: { month: string; net: number; gross: number; docs: number }[];
  topTraders: { name: string; net: number; docs: number }[];
  largest: TurnoverDoc[];
  /** Παραστατικά που ΔΕΝ μετρούν (παραγγελίες, προσφορές, δελτία) — μόνο για ενημέρωση. */
  excluded: { kind: string; count: number; net: number }[];
  /** Σειρές που η εφαρμογή δεν γνωρίζει — αν υπάρχουν, ο τζίρος μπορεί να είναι ελλιπής. */
  unknownSeries: string[];
  fetchedAt: string;
}

export async function turnover(input: { period: Period; side?: 'sales' | 'purchases'; trdr?: number | null; prjc?: number | null }): Promise<Turnover> {
  const side = input.side ?? 'sales';
  const sosource = side === 'sales' ? SALES : PURCHASES;
  const conds = [`SOSOURCE=${sosource}`, 'ISCANCEL=0', `TRNDATE>='${s1Date(input.period.from)}'`, `TRNDATE<'${s1Date(input.period.to)}'`];
  if (input.trdr) conds.push(`TRDR=${Math.trunc(input.trdr)}`);
  if (input.prjc) conds.push(`PRJC=${Math.trunc(input.prjc)}`);

  const [rows, kinds, series, purchaseTypes] = await Promise.all([
    softoneGetTable('FINDOC', ['FINDOC', 'FINCODE', 'TRNDATE', 'SERIES', 'TRDR', 'PRJC', 'NETAMNT', 'SUMAMNT'], conds.join(' AND ')),
    docKindMap(),
    prisma.softoneDocSeries.findMany({ where: { sosource }, select: { code: true, name: true } }),
    side === 'purchases' ? prisma.purchaseDocType.findMany({ select: { code: true, name: true } }) : Promise.resolve([]),
  ]);
  const seriesName = new Map<string, string>([...series, ...purchaseTypes].map((s) => [s.code, s.name]));
  const trIds = [...new Set(rows.map((r) => Number(r.TRDR)).filter((n) => n > 0))];
  const pjIds = [...new Set(rows.map((r) => Number(r.PRJC)).filter((n) => n > 0))];
  const [traders, projects, ft, fp] = await Promise.all([
    prisma.softoneTrader.findMany({ where: { trdr: { in: trIds } }, select: { trdr: true, name: true } }),
    prisma.softoneProject.findMany({ where: { prjc: { in: pjIds } }, select: { prjc: true, code: true, name: true } }),
    input.trdr ? prisma.softoneTrader.findUnique({ where: { trdr: input.trdr }, select: { code: true, name: true } }) : null,
    input.prjc ? prisma.softoneProject.findUnique({ where: { prjc: input.prjc }, select: { code: true, name: true } }) : null,
  ]);
  const tName = new Map(traders.map((t) => [t.trdr, t.name]));
  const pName = new Map(projects.map((p) => [p.prjc, `${p.code} · ${p.name}`]));

  const docs: TurnoverDoc[] = rows.map((r) => {
    const date = s1DateOrNull(r.TRNDATE);
    return {
      findoc: num(r.FINDOC), fincode: r.FINCODE || `#${r.FINDOC}`, date: date ? date.toISOString().slice(0, 10) : null,
      series: r.SERIES, seriesName: seriesName.get(r.SERIES) ?? null, kind: kinds.get(`${sosource}:${r.SERIES}`) ?? 'movement',
      trader: tName.get(Number(r.TRDR)) ?? null, project: pName.get(Number(r.PRJC)) ?? null,
      net: num(r.NETAMNT), gross: num(r.SUMAMNT),
    };
  });
  const unknownSeries = [...new Set(docs.filter((d) => !kinds.has(`${sosource}:${d.series}`)).map((d) => d.series))];

  const counted = docs.filter((d) => d.kind === 'invoice' || d.kind === 'credit');
  const sign = (d: TurnoverDoc) => (d.kind === 'credit' ? -1 : 1);
  const inv = counted.filter((d) => d.kind === 'invoice');
  const cre = counted.filter((d) => d.kind === 'credit');
  const sum = (xs: TurnoverDoc[], k: 'net' | 'gross') => round2(xs.reduce((s, d) => s + d[k], 0));

  const months = new Map<string, { net: number; gross: number; docs: number }>();
  const byTrader = new Map<string, { net: number; docs: number }>();
  for (const d of counted) {
    const key = d.date?.slice(0, 7) ?? '—';
    const m = months.get(key) ?? { net: 0, gross: 0, docs: 0 };
    m.net += sign(d) * d.net; m.gross += sign(d) * d.gross; m.docs++;
    months.set(key, m);
    const tk = d.trader ?? '—';
    const t = byTrader.get(tk) ?? { net: 0, docs: 0 };
    t.net += sign(d) * d.net; t.docs++;
    byTrader.set(tk, t);
  }
  const excluded = new Map<string, { count: number; net: number }>();
  for (const d of docs) {
    if (d.kind === 'invoice' || d.kind === 'credit') continue;
    const e = excluded.get(d.kind) ?? { count: 0, net: 0 };
    e.count++; e.net += d.net;
    excluded.set(d.kind, e);
  }

  return {
    side, period: input.period,
    filter: { trader: ft ? `${ft.code} · ${ft.name}` : null, project: fp ? `${fp.code} · ${fp.name}` : null },
    net: round2(sum(inv, 'net') - sum(cre, 'net')),
    gross: round2(sum(inv, 'gross') - sum(cre, 'gross')),
    invoices: { count: inv.length, net: sum(inv, 'net'), gross: sum(inv, 'gross') },
    credits: { count: cre.length, net: sum(cre, 'net'), gross: sum(cre, 'gross') },
    byMonth: [...months.entries()].sort().map(([month, v]) => ({ month, net: round2(v.net), gross: round2(v.gross), docs: v.docs })),
    topTraders: [...byTrader.entries()].map(([name, v]) => ({ name, net: round2(v.net), docs: v.docs })).sort((a, b) => b.net - a.net).slice(0, 8),
    largest: [...counted].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 10),
    excluded: [...excluded.entries()].map(([k, v]) => ({ kind: PURCHASE_KIND_LABEL[k as PurchaseKind] ?? k, count: v.count, net: round2(v.net) })),
    unknownSeries,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Υπόλοιπο ΠΕΛΑΤΗ ΣΕ ΕΡΓΟ από το στιγμιότυπο κερδοφορίας (ProjectFinancials): μικτά τιμολογημένα −
 * εισπράξεις (εμβάσματα πελατών με το έργο), με παλαιότητα. Μετρούν μόνο παραστατικά δεμένα με το έργο —
 * τα «Δεδομένα που λείπουν» του έργου λένε τι μπορεί να λείπει.
 */
export async function projectCustomerBalance(prjc: number) {
  const [p, fin] = await Promise.all([
    prisma.softoneProject.findUnique({ where: { prjc }, select: { prjc: true, code: true, name: true, trdr: true } }),
    getProjectFinancials(prjc),
  ]);
  if (!p) return null;
  const customer = p.trdr ? await prisma.softoneTrader.findUnique({ where: { trdr: p.trdr }, select: { trdr: true, code: true, name: true } }) : null;
  if (!fin) return { project: p, customer, computed: false as const };
  const pf = fin.profit;
  return {
    project: p,
    customer,
    computed: true as const,
    computedAt: fin.computedAt,
    invoicedGross: round2(pf.revenue.gross),
    invoicedNet: round2(pf.revenue.net),
    received: round2(pf.collections.received),
    refunds: round2(pf.collections.refunds),
    collected: round2(pf.collections.collected),
    open: round2(pf.collections.open),
    ageing: pf.collections.ageing.filter((a) => Math.abs(a.amount) >= 0.01).map((a) => ({ label: a.label, amount: round2(a.amount) })),
    invoices: pf.revenue.docs.map((d) => ({ fincode: d.fincode, date: d.date?.slice(0, 10) ?? null, kind: d.kind, gross: round2(d.gross), partial: d.partial || undefined })),
    collections: pf.collections.docs.map((d) => ({ fincode: d.fincode, date: d.date?.slice(0, 10) ?? null, gross: round2(d.gross) })),
    missingData: fin.issues.map((i) => ({ title: i.title, detail: i.detail.slice(0, 300) })),
  };
}
