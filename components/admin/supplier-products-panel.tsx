// SERVER: «Προϊόντα προμηθευτών» — από τον καθρέφτη `SupplierProduct` (όχι ζωντανά στο SoftOne).
// Τέσσερα ερωτήματα με δείκτες (προϊόντα, ονόματα προμηθευτών, ονόματα ειδών, κατηγορίες), παράλληλα.
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { SUPPLIER_PRODUCTS_SYNC_SETTING } from '@/lib/softone-sync/supplier-products';
import { SupplierProductsView, type SupplierGroup } from '@/components/admin/supplier-products-view';

export async function SupplierProductsPanel({ canManage }: { canManage: boolean }) {
  const products = await prisma.supplierProduct.findMany({
    orderBy: [{ trdr: 'asc' }, { invoiceValue: 'desc' }],
    select: { trdr: true, mtrl: true, docs: true, invoiceQty: true, invoiceValue: true, lastCost: true, lastDate: true },
  });
  const trdrs = [...new Set(products.map((p) => p.trdr))];
  const mtrls = [...new Set(products.map((p) => p.mtrl))];
  const [traders, items, classes, lastSync] = await Promise.all([
    prisma.softoneTrader.findMany({ where: { trdr: { in: trdrs } }, select: { trdr: true, code: true, name: true, afm: true, city: true } }),
    prisma.softoneItem.findMany({ where: { mtrl: { in: mtrls } }, select: { mtrl: true, code: true, name: true, isService: true } }),
    prisma.traderClassAssignment.findMany({
      where: { trdr: { in: trdrs } },
      select: { trdr: true, status: true, leaf: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } } },
    }),
    getSetting<string>(SUPPLIER_PRODUCTS_SYNC_SETTING),
  ]);
  const traderBy = new Map(traders.map((t) => [t.trdr, t]));
  const itemBy = new Map(items.map((i) => [i.mtrl, i]));
  const classBy = new Map(classes.map((c) => [c.trdr, c]));

  const groups = new Map<number, SupplierGroup>();
  for (const p of products) {
    let g = groups.get(p.trdr);
    if (!g) {
      const t = traderBy.get(p.trdr);
      const c = classBy.get(p.trdr);
      g = {
        trdr: p.trdr, code: t?.code ?? String(p.trdr), name: t?.name ?? `Προμηθευτής ${p.trdr}`, afm: t?.afm ?? null, city: t?.city ?? null,
        sector: c?.leaf?.parent ? { id: c.leaf.parent.id, name: c.leaf.parent.name } : null,
        group: c?.leaf ? c.leaf.name : null, classProposed: c?.status === 'PROPOSED',
        total: 0, lastDate: null, products: [],
      };
      groups.set(p.trdr, g);
    }
    const it = itemBy.get(p.mtrl);
    g.products.push({
      mtrl: p.mtrl, code: it?.code ?? null, name: it?.name ?? `Είδος ${p.mtrl}`, isService: it?.isService ?? false,
      docs: p.docs, qty: p.invoiceQty, value: p.invoiceValue, lastCost: p.lastCost, lastDate: p.lastDate?.toISOString() ?? null,
    });
    g.total += p.invoiceValue;
    const ld = p.lastDate?.toISOString() ?? null;
    if (ld && (!g.lastDate || ld > g.lastDate)) g.lastDate = ld;
  }
  const list = [...groups.values()].sort((a, b) => b.total - a.total);
  return <SupplierProductsView groups={list} lastSync={lastSync ?? null} canManage={canManage} />;
}
