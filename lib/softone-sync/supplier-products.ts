// SERVER: προϊόντα ανά προμηθευτή από τα παραστατικά αγορών του SoftOne — ΜΟΝΟ ΑΝΑΓΝΩΣΗ στο SoftOne.
// FINDOC (SOSOURCE 1251, όχι ακυρωμένα, προμηθευτές) → MTRLINES → συνάθροιση (lib/supplier-products.ts)
// → πλήρης αντικατάσταση του `SupplierProduct` σε μία συναλλαγή (η σελίδα δεν βλέπει ποτέ μισό πίνακα).
import 'server-only';
import { prisma } from '@/lib/db';
import { setSetting } from '@/lib/settings';
import { loadSoftoneConfig, s1DateOrNull, softoneGetTable } from '@/lib/softone';
import { creditReturnsGoods, purchaseSeriesMap } from '@/lib/purchase-kinds';
import { aggregateSupplierProducts, type PurchaseHead, type PurchaseLineRow } from '@/lib/supplier-products';

export const SUPPLIER_PRODUCTS_SYNC_SETTING = 'integrations.supplierProductsLastSync';
const CHUNK = 200;

async function inChunks<T>(ids: (string | number)[], fn: (csv: string) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await fn(ids.slice(i, i + CHUNK).join(','))));
  return out;
}
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

export interface SupplierProductsSyncResult { docs: number; lines: number; rows: number; suppliers: number; at: string }

export async function syncSupplierProducts(): Promise<SupplierProductsSyncResult> {
  const cfg = await loadSoftoneConfig();
  const company = Number(cfg.company);
  const [series, suppliers] = await Promise.all([
    purchaseSeriesMap(),
    softoneGetTable('TRDR', ['TRDR'], `SODTYPE=12${company ? ` AND COMPANY=${company}` : ''}`),
  ]);
  const trdrs = suppliers.map((s) => s.TRDR).filter(Boolean);

  const headRows = await inChunks(trdrs, (csv) => softoneGetTable(
    'FINDOC', ['FINDOC', 'TRDR', 'TRNDATE', 'SERIES', 'ISCANCEL'],
    `SOSOURCE=1251${company ? ` AND COMPANY=${company}` : ''} AND TRDR IN (${csv})`,
  ));
  const heads: PurchaseHead[] = headRows
    .filter((h) => h.ISCANCEL !== '1')
    .map((h) => {
      const s = series.get(String(h.SERIES));
      return {
        findoc: Number(h.FINDOC), trdr: Number(h.TRDR), date: s1DateOrNull(h.TRNDATE),
        kind: s?.kind ?? 'movement', returnsGoods: creditReturnsGoods(s?.section),
      };
    })
    .filter((h) => Number.isInteger(h.findoc) && Number.isInteger(h.trdr));

  const lineRows = await inChunks(heads.map((h) => h.findoc), (csv) =>
    softoneGetTable('MTRLINES', ['FINDOC', 'MTRL', 'QTY1', 'LINEVAL'], `FINDOC IN (${csv})`));
  const lines: PurchaseLineRow[] = lineRows.map((l) => ({ findoc: Number(l.FINDOC), mtrl: Number(l.MTRL), qty: num(l.QTY1), value: num(l.LINEVAL) }));

  const agg = aggregateSupplierProducts(heads, lines);
  const syncedAt = new Date();
  await prisma.$transaction([
    prisma.supplierProduct.deleteMany({}),
    prisma.supplierProduct.createMany({ data: agg.map((a) => ({ ...a, syncedAt })) }),
  ]);
  await setSetting(SUPPLIER_PRODUCTS_SYNC_SETTING, syncedAt.toISOString()).catch(() => null);
  return { docs: heads.length, lines: lines.length, rows: agg.length, suppliers: new Set(agg.map((a) => a.trdr)).size, at: syncedAt.toISOString() };
}
