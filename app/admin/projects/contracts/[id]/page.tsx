import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiArrowLeft, FiFileText } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { getContract, staffOptions } from '@/lib/contracts/service';
import { KIND_LABEL, type ContractKind, type ContractStatus } from '@/lib/contracts/core';
import { PageHeader } from '@/components/admin/page-header';
import { ContractEditor } from '../contract-editor';
import { StatusBadge } from '../status-badge';
import { ContractActions } from './contract-actions';
import { DocumentsPanel } from './documents-panel';
import { MilestonesProgress } from './milestones-progress';

export const dynamic = 'force-dynamic';

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('projects.read');
  const { id } = await params;
  const [c, staff, canManage] = await Promise.all([getContract(id), staffOptions(), hasPermission('projects.manage')]);
  if (!c) notFound();
  const closed = c.status === 'COMPLETED' || c.status === 'CANCELLED';
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link href="/admin/projects/contracts" className="mb-2 inline-flex items-center gap-1 text-(length:--fs-12) text-muted-foreground hover:text-foreground"><FiArrowLeft className="size-3.5" /> Συμβάσεις & Προσφορές</Link>
      <PageHeader
        icon={<FiFileText />}
        title={c.title}
        description={`${c.ref} · ${KIND_LABEL[c.kind as ContractKind] ?? c.kind} · ${c.customer?.name ?? c.customerName ?? '—'}`}
        helpAnchor="contracts"
        actions={canManage ? <ContractActions contract={c} /> : null}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-(length:--fs-12)">
        <StatusBadge stage={c.stage} status={c.status as ContractStatus} />
        {c.project
          ? <Link href={`/admin/projects/${c.prjc}`} className="rounded bg-muted px-1.5 py-0.5 font-medium hover:underline">Έργο SoftOne {c.project.code}</Link>
          : <span className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-900 ring-1 ring-orange-200">Χωρίς έργο SoftOne — συνδέστε ή δημιουργήστε το από το μενού ⋮</span>}
      </div>
      <div className="space-y-4">
        <DocumentsPanel contract={c} canManage={canManage} />
        {c.status === 'ACTIVE' || c.status === 'COMPLETED' ? <MilestonesProgress contract={c} canManage={canManage && c.status === 'ACTIVE'} /> : null}
        <ContractEditor initial={c} staff={staff} readOnly={!canManage || closed} />
      </div>
    </div>
  );
}
