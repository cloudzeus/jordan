import { FiCheckSquare } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { listAllTasks } from '@/lib/project-tasks';
import { zonedParts } from '@/lib/appointments-core';
import { PageHeader } from '@/components/admin/page-header';
import { AllTasksClient, type AllTasksQuery } from './all-tasks-client';

export const dynamic = 'force-dynamic';

// Όλες οι εργασίες όλων των έργων + κεντρικό Gantt. Μόνο από τη βάση της εφαρμογής (όχι ζωντανό SoftOne).
export default async function AllTasksPage({ searchParams }: { searchParams: Promise<AllTasksQuery> }) {
  await requirePermission('projects.read');
  const [tasks, canManage, query] = await Promise.all([listAllTasks(), hasPermission('projects.manage'), searchParams]);
  const projects = new Set(tasks.map((t) => t.prjc)).size;
  const open = tasks.filter((t) => t.progress < 100).length;
  return (
    <div className="w-full">
      <PageHeader icon={<FiCheckSquare />} title="Εργασίες & Gantt"
        description={`${tasks.length} εργασίες σε ${projects} έργα · ${open} ανοιχτές`} helpAnchor="all-tasks" />
      <AllTasksClient tasks={tasks} canManage={canManage} today={zonedParts(new Date()).date} query={query} />
    </div>
  );
}
