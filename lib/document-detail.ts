import 'server-only';
import { prisma } from '@/lib/db';
import { softoneGetTable, s1DateOrNull, sosourceLabel } from '@/lib/softone';
import { purchaseSeriesMap } from '@/lib/purchase-kinds';
import { lineTotals, parseLines, type DocLine } from '@/lib/document-detail-core';

/**
 * Λεπτομέρειες ενός παραστατικού (κεφαλή + γραμμές), ΖΩΝΤΑΝΑ από το SoftOne (GetTable, μόνο ανάγνωση).
 * Για το expand των παραστατικών σε έργα και συναλλασσόμενους.
 */
const HEAD = ['FINDOC', 'FINCODE', 'TRNDATE', 'SERIES', 'SOSOURCE', 'TRDR', 'PRJC', 'NETAMNT', 'VATAMNT', 'SUMAMNT', 'DISC1PRC', 'DISC1VAL', 'ISCANCEL', 'COMMENTS', 'COMMENTS1', 'REMARKS', 'INSDATE', 'UPDDATE'];
const LINE = ['MTRLINES', 'LINENUM', 'MTRL', 'QTY1', 'QTY', 'MTRUNIT', 'PRICE', 'DISC1PRC', 'DISC2PRC', 'DISC1VAL', 'LINEVAL', 'NETLINEVAL', 'VAT', 'VATAMNT', 'COMMENTS', 'COMMENTS1', 'PRJC', 'SODTYPE', 'FINDOCS'];

export type DocDetail = {
  findoc: number;
  fincode: string;
  date: string | null;
  sosource: number;
  family: string;
  series: string;
  seriesName: string | null;
  trader: { trdr: number; code: string | null; name: string } | null;
  project: { prjc: number; code: string; name: string } | null;
  net: number;
  vat: number;
  total: number;
  /** Έκπτωση (−) / επιβάρυνση (+) παραστατικού. */
  docDiscount: number;
  cancelled: boolean;
  comments: string | null;
  mark: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lines: DocLine[];
  /** Παραστατικά προέλευσης (μετασχηματισμός), π.χ. η παραγγελία ενός τιμολογίου. */
  sources: { findoc: number; fincode: string }[];
  /** Οι γραμμές δεν αθροίζουν στην κεφαλή (π.χ. χρεώσεις χωρίς είδος). */
  linesMismatch: boolean;
};

export async function fetchDocumentDetail(findoc: number): Promise<DocDetail | null> {
  const [heads, lineRows, mydata] = await Promise.all([
    softoneGetTable('FINDOC', HEAD, `FINDOC=${findoc}`),
    softoneGetTable('MTRLINES', LINE, `FINDOC=${findoc}`),
    softoneGetTable('MYDATAHEADER', ['SOID', 'MARK', 'ISCANCEL'], `SOID=${findoc}`).catch(() => [] as Record<string, string>[]),
  ]);
  const h = heads[0];
  if (!h) return null;
  const sosource = Number(h.SOSOURCE);
  const mtrls = [...new Set(lineRows.map((r) => Number(r.MTRL)).filter((n) => Number.isInteger(n) && n > 0))];
  const sourceIds = [...new Set(lineRows.map((r) => Number(r.FINDOCS)).filter((n) => Number.isInteger(n) && n > 0))];
  const trdr = Number(h.TRDR) || null;
  const prjc = Number(h.PRJC) || null;
  const [items, units, vats, trader, project, series, purSeries, sources] = await Promise.all([
    mtrls.length ? prisma.softoneItem.findMany({ where: { mtrl: { in: mtrls } }, select: { mtrl: true, code: true, name: true, isService: true } }) : [],
    prisma.softoneLookup.findMany({ where: { kind: 'MTRUNIT' }, select: { code: true, name: true } }),
    prisma.vatCategory.findMany({ select: { code: true, rate: true } }),
    trdr ? prisma.softoneTrader.findUnique({ where: { trdr }, select: { trdr: true, code: true, name: true } }) : null,
    prjc ? prisma.softoneProject.findUnique({ where: { prjc }, select: { prjc: true, code: true, name: true } }) : null,
    prisma.softoneDocSeries.findFirst({ where: { sosource, code: h.SERIES }, select: { name: true } }),
    sosource === 1251 ? purchaseSeriesMap() : Promise.resolve(null),
    sourceIds.length ? softoneGetTable('FINDOC', ['FINDOC', 'FINCODE'], `FINDOC IN (${sourceIds.join(',')})`).catch(() => []) : [],
  ]);
  const lines = parseLines(lineRows, {
    items: new Map(items.map((i) => [i.mtrl, i])),
    units: new Map(units.map((u) => [u.code, u.name])),
    vatRates: new Map(vats.map((v) => [v.code, v.rate])),
  });
  const net = Number(h.NETAMNT) || 0;
  const totals = lineTotals(lines);
  const md = mydata.find((m) => Number(m.ISCANCEL || 0) === 0 && m.MARK);
  return {
    findoc,
    fincode: h.FINCODE || `#${findoc}`,
    date: s1DateOrNull(h.TRNDATE)?.toISOString() ?? null,
    sosource,
    family: sosourceLabel(sosource),
    series: h.SERIES,
    seriesName: series?.name ?? purSeries?.get(h.SERIES)?.name ?? null,
    trader: trader ? { trdr: trader.trdr, code: trader.code, name: trader.name } : trdr ? { trdr, code: null, name: `#${trdr}` } : null,
    project: project ?? null,
    net,
    vat: Number(h.VATAMNT) || 0,
    total: Number(h.SUMAMNT) || 0,
    docDiscount: Number(h.DISC1VAL) || 0,
    cancelled: Number(h.ISCANCEL) !== 0,
    comments: [h.COMMENTS, h.COMMENTS1, h.REMARKS].map((x) => (x ?? '').trim()).filter(Boolean).join(' · ') || null,
    mark: md?.MARK ?? null,
    createdAt: s1DateOrNull(h.INSDATE)?.toISOString() ?? null,
    updatedAt: s1DateOrNull(h.UPDDATE)?.toISOString() ?? null,
    lines,
    sources: sources.map((s) => ({ findoc: Number(s.FINDOC), fincode: s.FINCODE })),
    // Αξίες γραμμών (LINEVAL) + επιβάρυνση/έκπτωση παραστατικού πρέπει να δίνουν το καθαρό.
    linesMismatch: lines.length > 0 && Math.abs(lines.reduce((s, l) => s + l.value, 0) - (Number(h.DISC1VAL) || 0) - net) > 0.05 && Math.abs(totals.net - net) > 0.05,
  };
}
