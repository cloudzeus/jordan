import { FiBriefcase } from 'react-icons/fi';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { getSetting } from '@/lib/settings';
import { listProjects } from '@/lib/projects';
import { PageHeader } from '@/components/admin/page-header';
import { ProjectsTableClient, type ProjectFinRow } from './projects-table-client';
import { ensureFreshFinancials, listProjectFinancials } from '@/lib/project-profit';
import { FinancialsMenu } from './financials-actions';

export const dynamic = 'force-dynamic';

// Έργα της εταιρίας — καθρέφτης του SoftOne PRJC (SoftoneProject), ομάδα μενού «Operations».
export default async function ProjectsPage() {
  await requirePermission('projects.read');
  const [rows, canManage, canFinancials, lastSync] = await Promise.all([
    listProjects(),
    hasPermission('projects.manage'),
    hasPermission('projects.financials'),
    getSetting<string>('integrations.softoneProjectsLastSync'),
  ]);
  // Κερδοφορία: στιγμιότυπο όλων των έργων (ξαναϋπολογίζεται μόνο όταν παλιώσει) — μόνο με projects.financials.
  const fresh = canFinancials ? await ensureFreshFinancials() : null;
  const fin = canFinancials ? await listProjectFinancials() : null;
  const finRows: ProjectFinRow[] | null = fin ? rows.map((r) => ({ ...r, fin: fin.get(r.prjc) ?? null })) : null;
  const active = rows.filter((r) => r.isActive).length;

  return (
    <div className="w-full">
      <PageHeader
        icon={<FiBriefcase />}
        title="Έργα"
        description={`${active.toLocaleString('el-GR')} ενεργά έργα από το SoftOne${rows.length > active ? ` · ${rows.length - active} ανενεργά` : ''}`}
        helpAnchor="projects"
        actions={canFinancials ? <FinancialsMenu canManage={canManage} /> : undefined}
      />
      <ProjectsTableClient
        rows={finRows ?? rows.map((r) => ({ ...r, fin: null }))}
        showFinancials={canFinancials}
        financialsAt={fresh?.computedAt ?? null}
        financialsError={fresh?.error ?? null}
        canManage={canManage}
        canFiles={await hasPermission('files.read')}
        lastSync={lastSync ?? null}
      />
    </div>
  );
}
