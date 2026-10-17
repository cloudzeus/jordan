import { FiBriefcase } from 'react-icons/fi';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { getSetting } from '@/lib/settings';
import { listProjects } from '@/lib/projects';
import { PageHeader } from '@/components/admin/page-header';
import { ProjectsTableClient } from './projects-table-client';

export const dynamic = 'force-dynamic';

// Έργα της εταιρίας — καθρέφτης του SoftOne PRJC (SoftoneProject), ομάδα μενού «Operations».
export default async function ProjectsPage() {
  await requirePermission('metadata.read');
  const [rows, canManage, lastSync] = await Promise.all([
    listProjects(),
    hasPermission('metadata.manage'),
    getSetting<string>('integrations.softoneProjectsLastSync'),
  ]);
  const active = rows.filter((r) => r.isActive).length;

  return (
    <div className="w-full">
      <PageHeader
        icon={<FiBriefcase />}
        title="Έργα"
        description={`${active.toLocaleString('el-GR')} ενεργά έργα από το SoftOne${rows.length > active ? ` · ${rows.length - active} ανενεργά` : ''}`}
        helpAnchor="projects"
      />
      <ProjectsTableClient rows={rows} canManage={canManage} lastSync={lastSync ?? null} />
    </div>
  );
}
