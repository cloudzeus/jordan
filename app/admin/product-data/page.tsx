import { FiPackage } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { getSetting } from '@/lib/settings';
import { listProductData } from '@/lib/product-data';
import { isProductTab, PRODUCT_TABS } from '@/lib/product-data-core';
import { PageHeader } from '@/components/admin/page-header';
import { ProductDataClient } from './product-data-client';

export const dynamic = 'force-dynamic';

/**
 * «Δεδομένα προϊόντων» (ομάδα Δεδομένα): μάρκες, κατασκευαστές, εμπορικές κατηγορίες και ομάδες —
 * τα τέσσερα μητρώα του SoftOne που χαρακτηρίζουν ένα είδος, σε μία σελίδα με καρτέλες.
 */
export default async function ProductDataPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission('metadata.read');
  const [{ rows, membersError }, canManage, classSync, lookupSync, sp] = await Promise.all([
    listProductData(),
    hasPermission('classifications.manage'),
    getSetting<string>('integrations.softoneClassificationsLastSync'),
    getSetting<string>('integrations.softoneLookupsLastSync'),
    searchParams,
  ]);
  // Ο παλαιότερος από τους δύο συγχρονισμούς: αυτός δείχνει πόσο «φρέσκια» είναι όλη η σελίδα.
  const lastSync = [classSync, lookupSync].filter(Boolean).sort()[0] ?? null;
  const total = PRODUCT_TABS.reduce((s, t) => s + rows[t.key].length, 0);

  return (
    <div className="w-full">
      <PageHeader
        icon={<FiPackage />}
        title="Δεδομένα προϊόντων"
        description={`Μάρκες, κατασκευαστές, εμπορικές κατηγορίες και ομάδες του SoftOne — ${total} εγγραφές`}
        helpAnchor="product-data"
      />
      <ProductDataClient
        rows={rows}
        membersError={membersError}
        canManage={canManage}
        lastSync={lastSync}
        initialTab={isProductTab(sp.tab) ? sp.tab : 'brands'}
      />
    </div>
  );
}
