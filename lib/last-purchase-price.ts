import 'server-only';
import { softoneGetTable, s1DateOrNull } from '@/lib/softone';
import { purchaseSeriesMap } from '@/lib/purchase-kinds';

/**
 * Τελευταία τιμή αγοράς ανά είδος, ΑΠΟ ΤΑ ΠΑΡΑΣΤΑΤΙΚΑ ΑΓΟΡΩΝ του SoftOne.
 *
 * Επιβεβαιωμένο ζωντανά (atelier, 2026-10-17):
 *  - τα έτοιμα πεδία κόστους (`ITECPRICES.PURLPRICE`, `MTRSUPPRCS.LASTPRICE`) είναι ΑΔΕΙΑ —
 *    η εγκατάσταση δεν τα συντηρεί, άρα δεν είναι πηγή·
 *  - το `MTRLINES` δεν έχει SOSOURCE ούτε TRNDATE (το GetTable απαντά «Stream read error»),
 *    οπότε η ημερομηνία και η ενότητα έρχονται από την κεφαλή (`FINDOC`).
 *
 * Κόστος μονάδας = LINEVAL / QTY1 (καθαρή αξία γραμμής μετά τις εκπτώσεις, ανά βασική μονάδα).
 * Μετρούν ΜΟΝΟ τα τιμολόγια (lib/purchase-kinds) με ποσότητα και αξία > 0: μια παραγγελία δεν είναι
 * αγορά, και ένα δελτίο παραλαβής με αξία 0 θα έδινε «τελευταίο κόστος 0». Ακυρωμένα δεν μετρούν.
 */

export type LastPurchase = {
  mtrl: number;
  /** Καθαρό κόστος ανά βασική μονάδα. */
  unitCost: number;
  /** ISO ημερομηνία του παραστατικού. */
  date: string;
  findoc: number;
  fincode: string;
};

const PURCHASES = 1251;
const HEADERS_TTL_MS = 5 * 60_000;
const CHUNK = 200;

let headers: { at: number; byId: Map<number, { date: string; fincode: string }> } | null = null;
let headersLoading: Promise<Map<number, { date: string; fincode: string }>> | null = null;

/** Κεφαλές παραστατικών αγορών (λίγες εκατοντάδες) — κρατιούνται 5 λεπτά στη μνήμη. */
async function purchaseHeaders(force = false) {
  if (!force && headers && Date.now() - headers.at < HEADERS_TTL_MS) return headers.byId;
  if (headersLoading) return headersLoading;
  headersLoading = (async () => {
    const [rows, series] = await Promise.all([
      softoneGetTable('FINDOC', ['FINDOC', 'TRNDATE', 'FINCODE', 'SERIES'], `SOSOURCE=${PURCHASES} AND ISCANCEL=0`),
      purchaseSeriesMap(),
    ]);
    const byId = new Map<number, { date: string; fincode: string }>();
    for (const r of rows) {
      if (series.get(r.SERIES)?.kind !== 'invoice') continue;
      const d = s1DateOrNull(r.TRNDATE);
      const id = Number(r.FINDOC);
      if (d && Number.isInteger(id)) byId.set(id, { date: d.toISOString(), fincode: r.FINCODE });
    }
    headers = { at: Date.now(), byId };
    return byId;
  })().finally(() => { headersLoading = null; });
  return headersLoading;
}

export async function lastPurchasePrices(mtrls: number[], opts: { fresh?: boolean } = {}): Promise<Map<number, LastPurchase>> {
  const wanted = [...new Set(mtrls.filter((m) => Number.isInteger(m) && m > 0))];
  const out = new Map<number, LastPurchase>();
  if (wanted.length === 0) return out;

  const heads = await purchaseHeaders(opts.fresh);
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const chunk = wanted.slice(i, i + CHUNK);
    const lines = await softoneGetTable('MTRLINES', ['FINDOC', 'MTRL', 'QTY1', 'PRICE', 'LINEVAL'], `MTRL IN (${chunk.join(',')})`);
    for (const l of lines) {
      const findoc = Number(l.FINDOC);
      const head = heads.get(findoc);
      if (!head) continue; // όχι αγορά, ή ακυρωμένη
      const mtrl = Number(l.MTRL);
      const qty = Number(l.QTY1);
      const val = Number(l.LINEVAL);
      if (!(qty > 0) || !(val > 0)) continue;
      const unitCost = val / qty;
      const cur = out.get(mtrl);
      // Η πιο πρόσφατη ημερομηνία κερδίζει· στην ίδια ημέρα, το μεταγενέστερο παραστατικό.
      if (!cur || head.date > cur.date || (head.date === cur.date && findoc > cur.findoc)) {
        out.set(mtrl, { mtrl, unitCost, date: head.date, findoc, fincode: head.fincode });
      }
    }
  }
  return out;
}
