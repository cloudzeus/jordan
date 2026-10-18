import 'server-only';
import { prisma } from '@/lib/db';
import { softoneGetTable, s1DateOrNull, sosourceLabel } from '@/lib/softone';
import { lastPurchasePrices } from '@/lib/last-purchase-price';
import { docKindMap, purchaseSeriesMap, PURCHASE_KIND_LABEL, type PurchaseKind } from '@/lib/purchase-kinds';
import { mFindocs, mMtrLines, viaMirror } from '@/lib/softone-mirror/read';

/**
 * Κινήσεις ενός έργου: τα παραστατικά (FINDOC) και οι γραμμές ειδών/υπηρεσιών (MTRLINES) που
 * φέρουν το PRJC του έργου. Από τον καθρέφτη (lib/softone-mirror) όταν είναι φρέσκος, αλλιώς ζωντανά.
 *
 * Επιβεβαιωμένο ζωντανά (atelier, 2026-10-17): `GetTable FINDOC FILTER PRJC=n` και
 * `GetTable MTRLINES FILTER PRJC=n` απαντούν σε ~100ms — γι' αυτό φορτώνονται όταν ανοίγει
 * το έργο, όχι με προ-συγχρονισμό εκατοντάδων παραστατικών.
 *
 * Το PRJC υπάρχει ΚΑΙ στην κεφαλή ΚΑΙ στη γραμμή: μια γραμμή μπορεί να χρεώνεται σε έργο ενώ η
 * κεφαλή του παραστατικού όχι. Τις κεφαλές που λείπουν τις φέρνουμε χωριστά, ώστε κάθε γραμμή
 * να δείχνει από ποιο παραστατικό προέρχεται.
 */

const DOC_FIELDS = ['FINDOC', 'FINCODE', 'TRNDATE', 'SERIES', 'SOSOURCE', 'TRDR', 'PRJC', 'SUMAMNT', 'NETAMNT', 'VATAMNT', 'ISCANCEL'];
const LINE_FIELDS = ['MTRLINES', 'FINDOC', 'MTRL', 'QTY1', 'PRICE', 'LINEVAL', 'SODTYPE'];

export type ProjectDoc = {
  findoc: number;
  fincode: string;
  date: string | null;
  sosource: number;
  family: string;
  series: string;
  seriesName: string | null;
  trader: string | null;
  net: number;
  vat: number;
  total: number;
  /** ISCANCEL ≠ 0: ακυρωμένο ή ακυρωτικό — δεν μετρά στα σύνολα. */
  cancelled: boolean;
  /** Το PRJC είναι στην κεφαλή (αλλιώς μόνο σε γραμμές του). */
  onHeader: boolean;
  /** Τιμολόγιο / πιστωτικό / παραγγελία / προσφορά / δελτίο. Στις Αγορές/Πωλήσεις μετρούν μόνο τα
   *  τιμολόγια (+) και τα πιστωτικά (−) — αλλιώς μια αγορά μετριέται σε παραγγελία, δελτίο ΚΑΙ τιμολόγιο. */
  kind: PurchaseKind;
  kindLabel: string;
  counts: boolean;
};

export type ProjectMaterial = {
  mtrl: number;
  code: string | null;
  name: string;
  isService: boolean;
  unit: string | null;
  sosource: number;
  family: string;
  qty: number;
  value: number;
  docs: number;
  /** Τελευταία τιμή αγοράς (καθαρό κόστος μονάδας) από τα παραστατικά αγορών — όχι μόνο του έργου. */
  lastPurchase: { unitCost: number; date: string; fincode: string } | null;
};

export type FamilyTotal = { sosource: number; family: string; docs: number; net: number; vat: number; total: number };

export type ProjectActivity = {
  docs: ProjectDoc[];
  materials: ProjectMaterial[];
  totals: FamilyTotal[];
  fetchedAt: string;
};

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const int = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n !== 0 ? n : null;
};

export async function fetchProjectActivity(prjc: number): Promise<ProjectActivity> {
  if (!Number.isInteger(prjc) || prjc <= 0) throw new Error('Μη έγκυρο έργο');

  const { value: { headRows, lineRows, extraRows }, asOf } = await viaMirror(
    async () => {
      const [headRows, lineRows] = await Promise.all([mFindocs({ prjc }), mMtrLines({ prjc })]);
      const missing = missingHeads(headRows, lineRows);
      return { headRows, lineRows, extraRows: missing.length ? await mFindocs({ findoc: { in: missing } }) : [] };
    },
    async () => {
      const [headRows, lineRows] = await Promise.all([
        softoneGetTable('FINDOC', DOC_FIELDS, `PRJC=${prjc}`),
        softoneGetTable('MTRLINES', LINE_FIELDS, `PRJC=${prjc}`),
      ]);
      const missing = missingHeads(headRows, lineRows);
      return { headRows, lineRows, extraRows: missing.length ? await softoneGetTable('FINDOC', DOC_FIELDS, `FINDOC IN (${missing.join(',')})`) : [] };
    },
  );

  const allHeads = [...headRows, ...extraRows];
  const [series, purchaseSeries, kinds, traders, items, units] = await Promise.all([
    prisma.softoneDocSeries.findMany({ select: { sosource: true, code: true, name: true } }),
    purchaseSeriesMap(),
    docKindMap(),
    prisma.softoneTrader.findMany({
      where: { trdr: { in: [...new Set(allHeads.map((r) => int(r.TRDR)).filter((v): v is number => v != null))] } },
      select: { trdr: true, name: true },
    }),
    prisma.softoneItem.findMany({
      where: { mtrl: { in: [...new Set(lineRows.map((r) => int(r.MTRL)).filter((v): v is number => v != null))] } },
      select: { mtrl: true, code: true, name: true, isService: true, unit1: true },
    }),
    // Το `unit1` είναι ο ΚΩΔΙΚΟΣ μονάδας (MTRUNIT, π.χ. «101») — το όνομα ζει στα μητρώα.
    prisma.softoneLookup.findMany({ where: { kind: 'MTRUNIT' }, select: { code: true, name: true } }),
  ]);
  const unitName = new Map(units.map((u) => [u.code, u.name]));
  const seriesName = new Map(series.map((s) => [`${s.sosource}:${s.code}`, s.name]));
  // Οι σειρές αγορών ζουν στο PurchaseDocType, όχι στο SoftoneDocSeries.
  for (const [code, v] of purchaseSeries) seriesName.set(`1251:${code}`, v.name);
  /** Ενότητες όπου ένα παραστατικό ΔΕΝ είναι πάντα συναλλαγή (υπάρχουν παραγγελίες/δελτία/προσφορές). */
  const TRADE = new Set([1251, 1351]);
  const traderName = new Map(traders.map((t) => [t.trdr, t.name]));
  const itemById = new Map(items.map((i) => [i.mtrl, i]));

  const docs: ProjectDoc[] = allHeads.map((r) => {
    const sosource = num(r.SOSOURCE);
    const trdr = int(r.TRDR);
    const date = s1DateOrNull(r.TRNDATE);
    return {
      findoc: num(r.FINDOC),
      fincode: r.FINCODE || `#${r.FINDOC}`,
      date: date ? date.toISOString() : null,
      sosource,
      family: sosourceLabel(sosource),
      series: r.SERIES,
      seriesName: seriesName.get(`${sosource}:${r.SERIES}`) ?? null,
      trader: trdr != null ? traderName.get(trdr) ?? null : null,
      net: num(r.NETAMNT),
      vat: num(r.VATAMNT),
      total: num(r.SUMAMNT),
      cancelled: num(r.ISCANCEL) !== 0,
      onHeader: num(r.PRJC) === prjc,
      ...(() => {
        const kind: PurchaseKind = TRADE.has(sosource) ? kinds.get(`${sosource}:${r.SERIES}`) ?? 'movement' : 'invoice';
        return { kind, kindLabel: TRADE.has(sosource) ? PURCHASE_KIND_LABEL[kind] : sosourceLabel(sosource), counts: kind === 'invoice' || kind === 'credit' };
      })(),
    };
  }).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.findoc - a.findoc);

  const docById = new Map(docs.map((d) => [d.findoc, d]));

  // Υλικά & υπηρεσίες: ΣΥΓΚΕΝΤΡΩΤΙΚΑ ανά είδος και ενότητα (αγορές ≠ πωλήσεις — δεν αθροίζονται).
  const agg = new Map<string, Omit<ProjectMaterial, 'lastPurchase'> & { docSet: Set<number> }>();
  for (const r of lineRows) {
    const mtrl = int(r.MTRL);
    const doc = docById.get(num(r.FINDOC));
    if (mtrl == null || !doc || doc.cancelled || !doc.counts) continue;
    const sign = doc.kind === 'credit' ? -1 : 1;
    const key = `${mtrl}:${doc.sosource}`;
    let e = agg.get(key);
    if (!e) {
      const it = itemById.get(mtrl);
      e = {
        mtrl,
        code: it?.code ?? null,
        name: it?.name ?? `Είδος #${mtrl}`,
        isService: it ? it.isService : num(r.SODTYPE) === 52,
        unit: it?.unit1 ? unitName.get(it.unit1) ?? null : null,
        sosource: doc.sosource,
        family: doc.family,
        qty: 0, value: 0, docs: 0,
        docSet: new Set<number>(),
      };
      agg.set(key, e);
    }
    e.qty += sign * num(r.QTY1);
    e.value += sign * num(r.LINEVAL);
    e.docSet.add(doc.findoc);
  }
  // Κόστος από την ΤΕΛΕΥΤΑΙΑ αγορά του είδους σε όλη την εταιρία. Αν το SoftOne δεν απαντήσει,
  // οι κινήσεις φαίνονται κανονικά — απλώς χωρίς κόστος.
  const lp = await lastPurchasePrices([...new Set([...agg.values()].map((m) => m.mtrl))]).catch(() => new Map());
  const materials: ProjectMaterial[] = [...agg.values()]
    .map(({ docSet, ...m }) => {
      const l = lp.get(m.mtrl);
      return { ...m, docs: docSet.size, lastPurchase: l ? { unitCost: l.unitCost, date: l.date, fincode: l.fincode } : null };
    })
    .sort((a, b) => a.sosource - b.sosource || b.value - a.value);

  const fam = new Map<number, FamilyTotal>();
  for (const d of docs) {
    if (d.cancelled || !d.counts) continue;
    const sign = d.kind === 'credit' ? -1 : 1;
    const t = fam.get(d.sosource) ?? { sosource: d.sosource, family: d.family, docs: 0, net: 0, vat: 0, total: 0 };
    t.docs++; t.net += sign * d.net; t.vat += sign * d.vat; t.total += sign * d.total;
    fam.set(d.sosource, t);
  }

  return {
    docs,
    materials,
    totals: [...fam.values()].sort((a, b) => a.sosource - b.sosource),
    fetchedAt: asOf.toISOString(),
  };
}

/** Παραστατικά που έχουν γραμμή του έργου αλλά όχι το έργο στην κεφαλή — οι κεφαλές τους φέρνονται χωριστά. */
function missingHeads(headRows: Record<string, string>[], lineRows: Record<string, string>[]): number[] {
  const headerIds = new Set(headRows.map((r) => num(r.FINDOC)));
  return [...new Set(lineRows.map((r) => num(r.FINDOC)).filter((id) => id && !headerIds.has(id)))];
}
