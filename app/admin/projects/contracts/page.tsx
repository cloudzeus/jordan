import Link from 'next/link';
import { FiFileText, FiPlus } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { listContracts } from '@/lib/contracts/service';
import { PageHeader } from '@/components/admin/page-header';
import { ContractsList } from './contracts-list';

export const dynamic = 'force-dynamic';

// Συμβάσεις & Προσφορές έργων (Operations → Έργα). Δικά μας δεδομένα — όχι SoftOne.
export default async function ContractsPage() {
  await requirePermission('projects.read');
  const [rows, canManage] = await Promise.all([listContracts(), hasPermission('projects.manage')]);
  const open = rows.filter((r) => !['COMPLETED', 'CANCELLED'].includes(r.status)).length;
  return (
    <div className="w-full">
      <PageHeader
        icon={<FiFileText />}
        title="Συμβάσεις & Προσφορές"
        description={`${open.toLocaleString('el-GR')} ανοιχτές · προσφορές προς πελάτες, συμβάσεις και αναθέσεις σε συνεργεία`}
        helpAnchor="contracts"
        actions={canManage ? (
          <Link href="/admin/projects/contracts/new" className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[length:var(--fs-13)] font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <FiPlus className="size-4" aria-hidden /> Νέο έργο
          </Link>
        ) : null}
      />
      <ContractsList rows={rows} canManage={canManage} />
    </div>
  );
}
