import 'server-only';
import { prisma } from '@/lib/db';
import { softoneGetTable, s1DateOrNull } from '@/lib/softone';
import { creditReturnsGoods, purchaseSeriesMap, PURCHASE_KIND_LABEL, type PurchaseKind } from '@/lib/purchase-kinds';
import { mFindocs, mMtrLines, viaMirror } from '@/lib/softone-mirror/read';

/**
 * Τα παραστατικά ΑΓΟΡΩΝ ενός είδους — από τον καθρέφτη (lib/softone-mirror) όταν είναι φρέσκος, αλλιώς ζωντανά.
 *
 * Το MTRLINES δεν έχει ημερομηνία ούτε ενότητα (επιβεβαιωμένο ζωντανά): οι γραμμές του είδους
 * διαβάζονται με `MTRL=n`, και οι κεφαλές τους (FINDOC) φέρνουν ημερομηνία, ενότητα, προμηθευτή.
 * Μένουν ΜΟΝΟ όσες κεφαλές είναι αγορές (SOSOURCE 1251). Κόστος μονάδας = LINEVAL / QTY1.
 */
const PURCHASES = 1251;

export type PurchaseLine = {
  findoc: number;
  fincode: string;
  date: string | null;
  series: string;
  seriesName: string | null;
  supplier: string | null;
  qty: number;
  unitCost: number;
  value: number;
  cancelled: boolean;
  /** Τιμολόγιο / πιστωτικό / παραγγελία / προσφορά / δελτίο — μόνο τα τιμολόγια (− πιστωτικά) μετρούν. */
  kind: PurchaseKind;
  kindLabel: string;
  /** Το έργο της γραμμής, αν υπάρχει (PRJC → κωδικός · όνομα). */
  project: string | null;
};

export type ItemPurchases = {
  lines: PurchaseLine[];
  unit: string | null;
  /** Σύνολα ΜΟΝΟ από τιμολόγια μείον πιστωτικά — οι παραγγελίες/δελτία δεν ξαναμετρούν την ίδια αγορά. */
  totals: { docs: number; qty: number; value: number; avgCost: number | null; lastCost: number | null; lastDate: string | null; suppliers: number };
  /** Ανά τύπο παραστατικού (για ενημέρωση — π.χ. ανοιχτές παραγγελίες). */
  byKind: { kind: PurchaseKind; label: string; docs: number; qty: number; value: number }[];
};

export async function itemPurchases(mtrl: number): Promise<ItemPurchases> {
  const idsOf = (ls: Record<string, string>[]) => [...new Set(ls.map((l) => Number(l.FINDOC)).filter((n) => Number.isInteger(n) && n > 0))];
  const { value: { lines, headRows } } = await viaMirror(
    async () => {
      const lines = await mMtrLines({ mtrl: Math.trunc(mtrl) });
      return { lines, headRows: await mFindocs({ sosource: PURCHASES, findoc: { in: idsOf(lines) } }) };
    },
    async () => {
      const lines = await softoneGetTable('MTRLINES', ['FINDOC', 'MTRL', 'QTY1', 'PRICE', 'LINEVAL', 'PRJC'], `MTRL=${Math.trunc(mtrl)}`);
      const ids = idsOf(lines);
      const headRows: Record<string, string>[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        headRows.push(...await softoneGetTable(
          'FINDOC', ['FINDOC', 'FINCODE', 'TRNDATE', 'SERIES', 'SOSOURCE', 'TRDR', 'ISCANCEL'],
          `SOSOURCE=${PURCHASES} AND FINDOC IN (${ids.slice(i, i + 200).join(',')})`,
        ));
      }
      return { lines, headRows };
    },
  );
  const heads = new Map(headRows.map((r) => [Number(r.FINDOC), r]));

  const purchaseLines = lines.filter((l) => heads.has(Number(l.FINDOC)));
  const traderIds = [...new Set([...heads.values()].map((h) => Number(h.TRDR)).filter((n) => n > 0))];
  const prjcIds = [...new Set(purchaseLines.map((l) => Number(l.PRJC)).filter((n) => n > 0))];
  const [traders, seriesMap, projects, item] = await Promise.all([
    prisma.softoneTrader.findMany({ where: { trdr: { in: traderIds } }, select: { trdr: true, name: true } }),
    purchaseSeriesMap(),
    prisma.softoneProject.findMany({ where: { prjc: { in: prjcIds } }, select: { prjc: true, code: true, name: true } }),
    prisma.softoneItem.findUnique({ where: { mtrl }, select: { unit1: true } }),
  ]);
  const traderName = new Map(traders.map((t) => [t.trdr, t.name]));
  const projectName = new Map(projects.map((p) => [p.prjc, `${p.code} · ${p.name}`]));
  const unit = item?.unit1
    ? (await prisma.softoneLookup.findUnique({ where: { kind_code: { kind: 'MTRUNIT', code: item.unit1 } }, select: { name: true } }))?.name ?? null
    : null;

  const out: PurchaseLine[] = purchaseLines.map((l) => {
    const h = heads.get(Number(l.FINDOC))!;
    const qty = Number(l.QTY1) || 0;
    const value = Number(l.LINEVAL) || 0;
    const date = s1DateOrNull(h.TRNDATE);
    return {
      findoc: Number(l.FINDOC),
      fincode: h.FINCODE || `#${l.FINDOC}`,
      date: date ? date.toISOString() : null,
      series: h.SERIES,
      seriesName: seriesMap.get(h.SERIES)?.name ?? null,
      kind: seriesMap.get(h.SERIES)?.kind ?? 'movement',
      kindLabel: PURCHASE_KIND_LABEL[seriesMap.get(h.SERIES)?.kind ?? 'movement'],
      supplier: traderName.get(Number(h.TRDR)) ?? null,
      qty, value,
      unitCost: qty > 0 ? value / qty : Number(l.PRICE) || 0,
      cancelled: Number(h.ISCANCEL) !== 0,
      project: Number(l.PRJC) > 0 ? projectName.get(Number(l.PRJC)) ?? `Έργο #${l.PRJC}` : null,
    };
  }).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.findoc - a.findoc);

  const live = out.filter((l) => !l.cancelled);
  const invoices = live.filter((l) => l.kind === 'invoice');
  const credits = live.filter((l) => l.kind === 'credit');
  const sectionOf = (l: PurchaseLine) => seriesMap.get(l.series)?.section ?? null;
  const qty = invoices.reduce((s, l) => s + l.qty, 0)
    - credits.filter((l) => creditReturnsGoods(sectionOf(l))).reduce((s, l) => s + l.qty, 0);
  const value = invoices.reduce((s, l) => s + l.value, 0) - credits.reduce((s, l) => s + l.value, 0);
  const lastInvoice = invoices.find((l) => l.qty > 0 && l.value > 0);
  const kinds: PurchaseKind[] = ['invoice', 'credit', 'order', 'quote', 'movement'];
  return {
    lines: out,
    unit,
    totals: {
      docs: new Set([...invoices, ...credits].map((l) => l.findoc)).size,
      qty: Math.round(qty * 1e6) / 1e6,
      value: Math.round(value * 100) / 100,
      avgCost: qty > 0 ? value / qty : null,
      lastCost: lastInvoice?.unitCost ?? null,
      lastDate: lastInvoice?.date ?? null,
      suppliers: new Set(invoices.map((l) => l.supplier).filter(Boolean)).size,
    },
    byKind: kinds
      .map((k) => {
        const ls = live.filter((l) => l.kind === k);
        return { kind: k, label: PURCHASE_KIND_LABEL[k], docs: new Set(ls.map((l) => l.findoc)).size, qty: ls.reduce((s, l) => s + l.qty, 0), value: ls.reduce((s, l) => s + l.value, 0) };
      })
      .filter((k) => k.docs > 0),
  };
}
