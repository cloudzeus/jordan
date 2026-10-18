import { Suspense } from 'react';
import { FiUserCheck } from 'react-icons/fi';
import { prisma } from '@/lib/db';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { getSetting } from '@/lib/settings';
import { PageHeader } from '@/components/admin/page-header';
import { TradersView } from '@/components/admin/traders-view';
import { TradersTabs } from '@/components/admin/traders-tabs';
import { SupplierProductsPanel } from '@/components/admin/supplier-products-panel';
import { traderDocCounts } from '@/lib/ocr/trader-docs';

export const dynamic = 'force-dynamic';

// Συναλλασσόμενοι — ένα μητρώο για πελάτες, προμηθευτές, χρεώστες, πιστωτές και
// χρηματικούς λογαριασμούς (TRDR SODTYPE 12–16), όπως στο SoftOne.
export default async function TradersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  await requirePermission('metadata.read');
  const [traders, canManage, lastSync] = await Promise.all([
    prisma.softoneTrader.findMany({ orderBy: { name: 'asc' } }),
    hasPermission('metadata.manage'),
    getSetting<string>('integrations.softoneTradersLastSync'),
  ]);

  // Πόσα σκαναρισμένα παραστατικά έχει ο καθένας — η λίστα τους ανοίγει στη γραμμή του.
  const counts = await traderDocCounts(traders.map((t) => ({ trdr: t.trdr, afm: t.afm })));
  const rows = traders.map((t) => ({ ...t, docCount: counts.get(t.trdr) ?? 0 }));

  return (
    <div className="w-full">
      <PageHeader
        icon={<FiUserCheck />}
        title="Συναλλασσόμενοι"
        description={`Μητρώο συναλλασσομένων από SoftOne (${rows.length.toLocaleString('el-GR')} εγγραφές).`}
        helpAnchor="traders"
      />
      <TradersTabs
        initialTab={tab === 'map' || tab === 'products' ? tab : 'list'}
        list={<TradersView rows={rows} canManage={canManage} canFiles={await hasPermission('files.read')} lastSync={lastSync ?? null} />}
        products={
          <Suspense fallback={<p className="py-10 text-center text-[length:var(--fs-12)] text-muted-foreground">Φόρτωση προϊόντων…</p>}>
            <SupplierProductsPanel canManage={canManage} />
          </Suspense>
        }
      />
    </div>
  );
}
