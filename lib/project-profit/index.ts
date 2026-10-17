import 'server-only';
import { prisma } from '@/lib/db';
import { getSetting, setSetting } from '@/lib/settings';
import { softoneGetTable, s1DateOrNull } from '@/lib/softone';
import { lastPurchasePrices } from '@/lib/last-purchase-price';
import { docKindMap, purchaseSeriesMap } from '@/lib/purchase-kinds';
import {
  buildContext, computeProject, CUSTOMER_REMITTANCES, PURCHASES, SALES, STORE, SUPPLIER_REMITTANCES,
  type DocKind, type FinDoc, type FinLine, type ProjectProfit, type ProjectRef,
} from './calc';
import { detectIssues, type DataIssue } from './issues';

/**
 * ΚΕΡΔΟΦΟΡΙΑ ΕΡΓΩΝ — φόρτωση από το SoftOne (ΜΟΝΟ ανάγνωση, GetTable) και στιγμιότυπο στη βάση.
 *
 * Όλα τα έργα υπολογίζονται ΜΑΖΙ με 2 GetTable (κεφαλές + γραμμές με έργο, ~2 δευτ.) — όχι ένα ανά
 * έργο. Το αποτέλεσμα αποθηκεύεται (`ProjectFinancials`) ώστε η λίστα να ταξινομείται χωρίς ζωντανή
 * κλήση· ξαναϋπολογίζεται όταν παλιώσει (FRESH_MS) ή με «Ανανέωση οικονομικών».
 *
 * Τα «Δεδομένα που λείπουν» (lib/project-profit/issues) αποθηκεύονται στη ρύθμιση ISSUES_KEY και
 * διαβάζονται από τα «Ερωτήματα λογιστή» (ομάδα «Έργα») και την «Αναφορά integrator».
 */

const FRESH_MS = 20 * 60_000;
const ISSUES_KEY = 'projects.financialIssues';
const COMPUTED_KEY = 'projects.financialsComputedAt';
const SOURCES = [SALES, PURCHASES, CUSTOMER_REMITTANCES, SUPPLIER_REMITTANCES, STORE];

const DOC_FIELDS = ['FINDOC', 'FINCODE', 'TRNDATE', 'SERIES', 'SOSOURCE', 'TRDR', 'PRJC', 'NETAMNT', 'VATAMNT', 'SUMAMNT', 'ISCANCEL'];
const LINE_FIELDS = ['FINDOC', 'MTRL', 'PRJC', 'QTY1', 'LINEVAL', 'SODTYPE', 'FINDOCS'];

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const id = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const plain = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Εμβάσματα: επιστροφή = αρνητικό. Αποθήκη: εξαγωγή/ανάλωση = προς το έργο, εισαγωγή/επιστροφή = πίσω. */
function kindOf(sosource: number, seriesName: string | null, fromMap: DocKind | undefined): DocKind {
  const s = plain(seriesName ?? '');
  if (sosource === CUSTOMER_REMITTANCES || sosource === SUPPLIER_REMITTANCES) return /επιστροφ/.test(s) ? 'credit' : 'invoice';
  if (sosource === STORE) return /εξαγωγ|αναλωσ/.test(s) ? 'invoice' : /εισαγωγ|επιστροφ/.test(s) ? 'credit' : 'movement';
  return fromMap ?? 'movement';
}

export type FinancialsRun = { computedAt: string; projects: number; issues: number };
export type StoredIssues = { computedAt: string; issues: DataIssue[] };

async function computeAll(): Promise<FinancialsRun> {
  const [heads, lineRows] = await Promise.all([
    softoneGetTable('FINDOC', DOC_FIELDS, `SOSOURCE IN (${SOURCES.join(',')})`),
    // Γραμμές με έργο + γραμμές παραστατικών με έργο στην κεφαλή + γραμμές που μετασχηματίστηκαν από άλλο.
    softoneGetTable('MTRLINES', LINE_FIELDS, 'PRJC>0 OR FINDOCS>0 OR FINDOC IN (SELECT FINDOC FROM FINDOC WHERE PRJC>0)'),
  ]);

  const [series, purchaseSeries, kinds, projects, budget, rates] = await Promise.all([
    prisma.softoneDocSeries.findMany({ select: { sosource: true, code: true, name: true } }),
    purchaseSeriesMap(),
    docKindMap(),
    prisma.softoneProject.findMany({ select: { prjc: true, code: true, name: true, trdr: true, crdDate: true, fromDate: true } }),
    prisma.projectBudgetLine.findMany({ select: { prjc: true, qty: true, unitPrice: true } }),
    prisma.overheadRate.findMany(),
  ]);
  const seriesName = new Map(series.map((s) => [`${s.sosource}:${s.code}`, s.name]));
  for (const [code, v] of purchaseSeries) seriesName.set(`${PURCHASES}:${code}`, v.name);

  const trdrs = [...new Set(heads.map((r) => id(r.TRDR)).filter((v): v is number => v != null))];
  const mtrls = [...new Set(lineRows.map((r) => id(r.MTRL)).filter((v): v is number => v != null))];
  const [traders, items] = await Promise.all([
    prisma.softoneTrader.findMany({ where: { trdr: { in: trdrs } }, select: { trdr: true, name: true } }),
    prisma.softoneItem.findMany({ where: { mtrl: { in: mtrls } }, select: { mtrl: true, code: true, name: true, isService: true } }),
  ]);
  const traderName = new Map(traders.map((t) => [t.trdr, t.name]));
  const itemBy = new Map(items.map((i) => [i.mtrl, i]));

  const docs: FinDoc[] = heads.map((r) => {
    const sosource = num(r.SOSOURCE);
    const key = `${sosource}:${r.SERIES}`;
    const name = seriesName.get(key) ?? null;
    const trdr = id(r.TRDR);
    return {
      findoc: num(r.FINDOC),
      fincode: r.FINCODE || `#${r.FINDOC}`,
      date: s1DateOrNull(r.TRNDATE)?.toISOString() ?? null,
      sosource,
      series: r.SERIES,
      seriesName: name,
      kind: kindOf(sosource, name, kinds.get(key)),
      trdr,
      traderName: trdr != null ? traderName.get(trdr) ?? null : null,
      prjc: id(r.PRJC),
      net: num(r.NETAMNT),
      vat: num(r.VATAMNT),
      total: num(r.SUMAMNT),
      cancelled: num(r.ISCANCEL) !== 0,
    };
  });
  const lines: FinLine[] = lineRows.map((r) => {
    const mtrl = id(r.MTRL);
    const it = mtrl != null ? itemBy.get(mtrl) : undefined;
    return {
      findoc: num(r.FINDOC), mtrl, prjc: id(r.PRJC), qty: num(r.QTY1), value: num(r.LINEVAL),
      isService: it ? it.isService : num(r.SODTYPE) === 52, sourceFindoc: id(r.FINDOCS),
    };
  });

  // Τελευταίο κόστος μόνο για ό,τι χρειάζεται: υλικά σε πωλήσεις/αποθήκη με έργο.
  const docById = new Map(docs.map((d) => [d.findoc, d]));
  const needCost = [...new Set(lines.filter((l) => {
    const d = docById.get(l.findoc);
    return l.mtrl != null && !l.isService && d && (d.sosource === SALES || d.sosource === STORE);
  }).map((l) => l.mtrl!))];
  const lp = await lastPurchasePrices(needCost).catch(() => new Map());
  const lastCost = new Map([...lp.values()].map((v) => [v.mtrl, v.unitCost]));

  const asOf = new Date().toISOString();
  const ctx = buildContext({
    docs, lines, lastCost, asOf,
    rates: rates.map((r) => ({ validFrom: r.validFrom.toISOString(), validTo: r.validTo?.toISOString() ?? null, percent: r.percent, category: r.category })),
  });
  const budgetBy = new Map<number, number>();
  for (const b of budget) budgetBy.set(b.prjc, (budgetBy.get(b.prjc) ?? 0) + b.qty * b.unitPrice);

  const refs: ProjectRef[] = projects.map((p) => {
    const dates = [p.crdDate, p.fromDate].filter((d): d is Date => d != null).map((d) => d.toISOString()).sort();
    return { prjc: p.prjc, code: p.code, name: p.name, trdr: p.trdr, since: dates[0] ?? null };
  });
  const profits = new Map(refs.map((p) => [p.prjc, computeProject(p.prjc, ctx, budgetBy.get(p.prjc) ?? 0)]));
  const issues = detectIssues(ctx, refs, profits, {
    itemName: (m) => { const it = itemBy.get(m); return it ? `${it.code} «${it.name}»` : `είδος #${m}`; },
  });
  const issuesPer = new Map<number, number>();
  for (const i of issues) for (const p of i.prjcs) issuesPer.set(p, (issuesPer.get(p) ?? 0) + 1);

  const computedAt = new Date(asOf);
  await prisma.$transaction([
    prisma.projectFinancials.deleteMany({ where: { prjc: { notIn: refs.map((r) => r.prjc) } } }),
    ...[...profits.values()].map((r) => {
      const data = {
        revenue: r.revenue.net, collected: r.collections.collected, openAmount: r.collections.open, costs: r.costs.total,
        overhead: r.overhead.total, netProfit: r.netProfit, marginPct: r.marginPct, paid: r.payments.paid,
        issues: issuesPer.get(r.prjc) ?? 0, data: r as unknown as object, computedAt,
      };
      return prisma.projectFinancials.upsert({ where: { prjc: r.prjc }, update: data, create: { prjc: r.prjc, ...data } });
    }),
  ]);
  await setSetting(ISSUES_KEY, { computedAt: asOf, issues } satisfies StoredIssues);
  await setSetting(COMPUTED_KEY, asOf);
  return { computedAt: asOf, projects: profits.size, issues: issues.length };
}

const g = globalThis as unknown as { __projectFinancialsRun?: Promise<FinancialsRun> | null };

/** Υπολογισμός όλων των έργων — ένας τη φορά (ταυτόχρονες κλήσεις μοιράζονται τον ίδιο). */
export function refreshProjectFinancials(): Promise<FinancialsRun> {
  if (g.__projectFinancialsRun) return g.__projectFinancialsRun;
  g.__projectFinancialsRun = computeAll().finally(() => { g.__projectFinancialsRun = null; });
  return g.__projectFinancialsRun;
}

/**
 * Φρέσκα στοιχεία αν το στιγμιότυπο παλιώσει. Αν το SoftOne δεν απαντήσει, κρατάμε το προηγούμενο
 * στιγμιότυπο και επιστρέφουμε το σφάλμα για να το δείξει η σελίδα — ποτέ κενά νούμερα σαν μηδέν.
 */
export async function ensureFreshFinancials(): Promise<{ computedAt: string | null; error: string | null }> {
  const last = await getSetting<string>(COMPUTED_KEY);
  if (last && Date.now() - Date.parse(last) < FRESH_MS) return { computedAt: last, error: null };
  try {
    const run = await refreshProjectFinancials();
    return { computedAt: run.computedAt, error: null };
  } catch (e) {
    return { computedAt: last ?? null, error: (e as Error).message };
  }
}

export type ProjectFinancialsRow = {
  prjc: number; revenue: number; collected: number; openAmount: number; costs: number; overhead: number;
  netProfit: number; marginPct: number | null; paid: number; issues: number;
};

export async function listProjectFinancials(): Promise<Map<number, ProjectFinancialsRow>> {
  const rows = await prisma.projectFinancials.findMany({ omit: { data: true, id: true, computedAt: true } });
  return new Map(rows.map((r) => [r.prjc, r]));
}

export async function loadStoredIssues(): Promise<StoredIssues | null> {
  return (await getSetting<StoredIssues>(ISSUES_KEY)) ?? null;
}

export async function getProjectFinancials(prjc: number): Promise<{ profit: ProjectProfit; issues: DataIssue[]; computedAt: string } | null> {
  const [row, stored] = await Promise.all([prisma.projectFinancials.findUnique({ where: { prjc } }), loadStoredIssues()]);
  if (!row) return null;
  return {
    profit: row.data as unknown as ProjectProfit,
    issues: (stored?.issues ?? []).filter((i) => i.prjcs.includes(prjc)),
    computedAt: row.computedAt.toISOString(),
  };
}
