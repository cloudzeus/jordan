import { FiUserPlus } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { listProspects } from '@/lib/prospects';
import { PageHeader } from '@/components/admin/page-header';
import { ProspectsClient } from './prospects-client';

export const dynamic = 'force-dynamic';

// Δυνητικοί πελάτες: προσφορές σε όσους δεν υπάρχουν ακόμη στο SoftOne. Μόνο βάση της εφαρμογής —
// πελάτης και έργο γράφονται στο SoftOne με την αποδοχή μιας προσφοράς (lib/prospects.ts).
export default async function ProspectsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requirePermission('projects.read');
  const [rows, canManage, canFiles, sp] = await Promise.all([listProspects(), hasPermission('projects.manage'), hasPermission('files.manage'), searchParams]);
  const open = rows.filter((r) => !r.trdr).length;
  return (
    <div className="w-full">
      <PageHeader icon={<FiUserPlus />} title="Δυνητικοί πελάτες" helpAnchor="prospects"
        description={`${open} χωρίς καρτέλα SoftOne · ${rows.length - open} έγιναν πελάτες με αποδοχή προσφοράς`} />
      <ProspectsClient rows={rows} canManage={canManage} canFiles={canFiles} openId={Number(sp.id) || null} />
    </div>
  );
}
