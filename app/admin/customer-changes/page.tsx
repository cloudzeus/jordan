import { FiUserCheck } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { listCustomerChanges } from '@/lib/customer-changes';
import { PageHeader } from '@/components/admin/page-header';
import { ChangesList } from './changes-list';

export const dynamic = 'force-dynamic';

// Αλλαγές εταιρικών στοιχείων που ζήτησαν πελάτες από την πύλη. Περνούν στο SoftOne με το χέρι.
export default async function CustomerChangesPage() {
  await requirePermission('metadata.read');
  const [rows, canManage] = await Promise.all([listCustomerChanges(), hasPermission('metadata.manage')]);
  const pending = rows.filter((r) => r.status === 'PENDING').length;
  return (
    <div className="w-full">
      <PageHeader
        icon={<FiUserCheck />}
        title="Αλλαγές στοιχείων πελατών"
        description={`Από την πύλη · ${pending} σε αναμονή · περνούν στο SoftOne με το χέρι, μετά σημειώνονται εδώ`}
        helpAnchor="customer-changes"
      />
      <ChangesList rows={rows} canManage={canManage} />
    </div>
  );
}
