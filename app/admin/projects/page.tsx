import Link from 'next/link';
import { FiBookmark, FiBriefcase } from 'react-icons/fi';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { getSetting } from '@/lib/settings';
import { listProjects } from '@/lib/projects';
import { PageHeader } from '@/components/admin/page-header';
import { ProjectsTableClient, type ProjectFinRow } from './projects-table-client';
import { ensureFreshFinancials, listProjectFinancials } from '@/lib/project-profit';
import { FinancialsMenu } from './financials-actions';
import { listAllTasks } from '@/lib/project-tasks';
import { ProjectsViews } from './projects-views';

export const dynamic = 'force-dynamic';

// Έργα της εταιρίας — καθρέφτης του SoftOne PRJC (SoftoneProject), ομάδα μενού «Operations».
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ view?: string; prjc?: string }> }) {
  await requirePermission('projects.read');
  const [rows, canManage, canFinancials, lastSync, tasks, query] = await Promise.all([
    listProjects(),
    hasPermission('projects.manage'),
    hasPermission('projects.financials'),
    getSetting<string>('integrations.softoneProjectsLastSync'),
    listAllTasks(), // μόνο βάση εφαρμογής — όχι SoftOne
    searchParams,
  ]);
  const qPrjc = Number(query.prjc);
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
        actions={(
          <div className="flex items-center gap-1.5">
            <Link href="/admin/projects/task-templates" aria-label="Templates εργασιών" className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[length:var(--fs-12)] font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <FiBookmark className="size-3.5" aria-hidden /><span className="hidden sm:inline">Templates εργασιών</span>
            </Link>
            {canFinancials && <FinancialsMenu canManage={canManage} />}
          </div>
        )}
      />
      <ProjectsViews tasks={tasks} canManage={canManage} initialView={query.view ?? 'list'} initialPrjc={query.prjc && Number.isInteger(qPrjc) ? qPrjc : null}>
      <ProjectsTableClient
        rows={finRows ?? rows.map((r) => ({ ...r, fin: null }))}
        showFinancials={canFinancials}
        financialsAt={fresh?.computedAt ?? null}
        financialsError={fresh?.error ?? null}
        canManage={canManage}
        canFiles={await hasPermission('files.read')}
        lastSync={lastSync ?? null}
      />
      </ProjectsViews>
    </div>
  );
}
