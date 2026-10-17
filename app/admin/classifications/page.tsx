import { FiTag } from 'react-icons/fi';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { getSetting } from '@/lib/settings';
import { listClassifications } from '@/lib/item-classifications';
import { PageHeader } from '@/components/admin/page-header';
import { ClassificationsTableClient } from './classifications-table-client';

export const dynamic = 'force-dynamic';

// Εμπορικές κατηγορίες & ομάδες ειδών/υπηρεσιών (SoftOne MTRCATEGORY / MTRGROUP), ομάδα «Operations».
export default async function ClassificationsPage() {
  await requirePermission('metadata.read');
  const [{ rows, membersError }, canManage, lastSync] = await Promise.all([
    listClassifications(),
    hasPermission('metadata.manage'),
    getSetting<string>('integrations.softoneClassificationsLastSync'),
  ]);
  const cats = rows.filter((r) => r.kind === 'CATEGORY' && r.isActive).length;
  const groups = rows.filter((r) => r.kind === 'GROUP' && r.isActive).length;

  return (
    <div className="w-full">
      <PageHeader
        icon={<FiTag />}
        title="Κατηγορίες & ομάδες"
        description={`${cats} ενεργές εμπορικές κατηγορίες · ${groups} ομάδες — ειδών και υπηρεσιών, από το SoftOne`}
        helpAnchor="classifications"
      />
      <ClassificationsTableClient rows={rows} membersError={membersError} canManage={canManage} lastSync={lastSync ?? null} />
    </div>
  );
}
