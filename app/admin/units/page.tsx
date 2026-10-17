import { FiMaximize2 } from 'react-icons/fi';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { getSetting } from '@/lib/settings';
import { listUnits } from '@/lib/units';
import { PageHeader } from '@/components/admin/page-header';
import { UnitsTableClient } from './units-table-client';

export const dynamic = 'force-dynamic';

// Μονάδες μέτρησης (SoftOne MTRUNIT), ομάδα μενού «Operations».
export default async function UnitsPage() {
  await requirePermission('metadata.read');
  const [{ rows, usageError }, canManage, lastSync] = await Promise.all([
    listUnits(), hasPermission('metadata.manage'), getSetting<string>('integrations.softoneUnitsLastSync'),
  ]);
  const active = rows.filter((r) => r.isActive).length;
  return (
    <div className="w-full">
      <PageHeader
        icon={<FiMaximize2 />}
        title="Μονάδες μέτρησης"
        description={`${active} ενεργές μονάδες από το SoftOne${rows.length > active ? ` · ${rows.length - active} ανενεργές` : ''}`}
        helpAnchor="units"
      />
      <UnitsTableClient rows={rows} usageError={usageError} canManage={canManage} lastSync={lastSync ?? null} />
    </div>
  );
}
