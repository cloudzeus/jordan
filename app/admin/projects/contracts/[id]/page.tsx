import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiArrowLeft, FiFileText } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { getContract, staffOptions } from '@/lib/contracts/service';
import { KIND_LABEL, type ContractKind, type ContractStatus } from '@/lib/contracts/core';
import { PageHeader } from '@/components/admin/page-header';
import { ContractEditor } from '../contract-editor';
import { listTemplates } from '@/lib/project-tasks';
import { zonedParts } from '@/lib/appointments-core';
import { StatusBadge } from '../status-badge';
import { ContractActions, CreateProjectBanner } from './contract-actions';
import { DocumentsPanel } from './documents-panel';
import { MilestonesProgress } from './milestones-progress';
import { FloorPlanPanel } from './floor-plan-panel';
import { RfpPanel } from './rfp-panel';
import { contractRfps } from '@/lib/rfp/service';
import { rfpDefaults } from '@/lib/rfp/core';
import { listRevisions } from '@/lib/contracts/revisions';
import { RevisionsPanel } from './revisions-panel';
import { listNotes } from '@/lib/contracts/notes';
import { budgetSyncState } from '@/lib/contracts/budget-sync';
import { BudgetPanel } from './budget-panel';

export const dynamic = 'force-dynamic';

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('projects.read');
  const { id } = await params;
  const [c, staff, canManage, rfps, revisions, templates, notes, budget] = await Promise.all([getContract(id), staffOptions(), hasPermission('projects.manage'), contractRfps(id), listRevisions(id), listTemplates(), listNotes(id, { kind: 'STAFF' }), budgetSyncState(id)]);
  if (!c) notFound();
  const closed = c.status === 'COMPLETED' || c.status === 'CANCELLED';
  return (
    <div className="mx-auto w-full max-w-7xl">
      <Link href="/admin/projects/contracts" className="mb-2 inline-flex items-center gap-1 text-(length:--fs-12) text-muted-foreground hover:text-foreground"><FiArrowLeft className="size-3.5" /> Συμβάσεις & Προσφορές</Link>
      <PageHeader
        icon={<FiFileText />}
        title={c.title}
        description={`${c.ref} · έκδ. ${c.revision} · ${KIND_LABEL[c.kind as ContractKind] ?? c.kind} · ${c.customer?.name ?? c.customerName ?? '—'}`}
        helpAnchor="contracts"
        actions={canManage ? <ContractActions contract={c} /> : null}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-(length:--fs-12)">
        <StatusBadge stage={c.stage} status={c.status as ContractStatus} />
        {c.project
          ? <Link href={`/admin/projects/${c.prjc}`} className="rounded bg-muted px-1.5 py-0.5 font-medium hover:underline">Έργο SoftOne {c.project.code}</Link>
          : c.stage === 'OFFER'
            ? <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-900 ring-1 ring-sky-200">Σχεδιασμός — τίποτα προς το SoftOne μέχρι την αποδοχή</span>
            : <span className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-900 ring-1 ring-orange-200">Χωρίς έργο SoftOne — συνδέστε ή δημιουργήστε το από το μενού ⋮</span>}
      </div>
      <div className="space-y-4">
        {canManage && <CreateProjectBanner contract={c} />}
        <DocumentsPanel contract={c} canManage={canManage} />
        {c.floorPlanId && <FloorPlanPanel floorPlanId={c.floorPlanId} />}
        {c.kind !== 'PRODUCT' && <RfpPanel contractId={c.id} title={rfpDefaults(c).title} summary={rfpDefaults(c).scope} rfps={rfps} canManage={canManage && c.status !== 'COMPLETED' && c.status !== 'CANCELLED'} />}
        {['ACCEPTED', 'ACTIVE', 'COMPLETED'].includes(c.status) ? <MilestonesProgress contract={c} canManage={canManage && c.status !== 'COMPLETED'} /> : null}
        {c.prjc && c.stage !== 'OFFER' && (c.status === 'ACTIVE' || c.status === 'COMPLETED' || budget.lines > 0) ? <BudgetPanel contractId={c.id} prjc={c.prjc} state={budget} canManage={canManage && !closed} /> : null}
        <RevisionsPanel contractId={c.id} current={c.revision} currentGross={c.totals.gross} revisions={revisions} canManage={canManage && !closed} canRestore={c.stage === 'OFFER' && ['DRAFT', 'SENT'].includes(c.status)} />
        <ContractEditor templates={templates} notes={notes} today={zonedParts(new Date()).date} initial={c} staff={staff} readOnly={!canManage || closed} />
      </div>
    </div>
  );
}
