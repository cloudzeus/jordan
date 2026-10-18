import { FiBox } from 'react-icons/fi';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { getSetting } from '@/lib/settings';
import { PageHeader } from '@/components/admin/page-header';
import { ItemsTableClient } from '@/components/admin/items-table-client';
import { warehouses } from '@/lib/item-stock';
import { loadItemRows } from '@/lib/items-registry';

export const dynamic = 'force-dynamic';

// Μόνο τα είδη (MTRL 51). Υπηρεσίες: /admin/services. Έξοδα, χρεοπιστώσεις, κατηγορίες δαπανών,
// myDATA και αναλυτική: /admin/expenses.
export default async function ItemsPage() {
  await requirePermission('metadata.read');
  const [rows, whs, canManage, lastSync] = await Promise.all([
    loadItemRows('products'),
    warehouses(),
    hasPermission('metadata.manage'),
    getSetting<string>('integrations.softoneItemsLastSync'),
  ]);

  return (
    <div className="w-full">
      <PageHeader
        icon={<FiBox />}
        title="Είδη"
        description={`Μητρώο ειδών από SoftOne (${rows.length.toLocaleString('el-GR')}), με υπόλοιπα ανά αποθήκη.`}
        helpAnchor="items"
      />
      <ItemsTableClient rows={rows} variant="products" canManage={canManage} lastSync={lastSync ?? null} warehouses={whs} />
    </div>
  );
}
