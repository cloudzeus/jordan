import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiArrowLeft, FiTrello } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { getProject } from '@/lib/projects';
import { listTasks, listTemplates, partyOptions } from '@/lib/project-tasks';
import { zonedParts } from '@/lib/appointments-core';
import { PageHeader } from '@/components/admin/page-header';
import { TasksWorkspace } from './tasks-workspace';

export const dynamic = 'force-dynamic';

// Εργασίες έργου: Kanban (4 φάσεις), Gantt, λίστα, templates. Δικά μας δεδομένα — όχι SoftOne.
export default async function ProjectTasksPage({ params, searchParams }: { params: Promise<{ prjc: string }>; searchParams: Promise<{ task?: string }> }) {
  await requirePermission('projects.read');
  const id = Number((await params).prjc);
  if (!Number.isInteger(id)) notFound();
  const p = await getProject(id);
  if (!p) notFound();
  const [data, options, templates, canManage, canFiles] = await Promise.all([
    listTasks(p.prjc), partyOptions(p.prjc), listTemplates(), hasPermission('projects.manage'), hasPermission('files.manage'),
  ]);
  return (
    <div className="w-full">
      <Link href={`/admin/projects/${p.prjc}`} className="mb-3 inline-flex min-h-8 items-center gap-1 text-(length:--fs-12) text-muted-foreground hover:text-foreground">
        <FiArrowLeft className="size-3.5" aria-hidden /> {p.code} · {p.name}
      </Link>
      <PageHeader icon={<FiTrello />} title="Εργασίες έργου" description={`${p.code} · ${p.name} · ${data.tasks.length} εργασίες`} helpAnchor="project-tasks" />
      <TasksWorkspace prjc={p.prjc} tasks={data.tasks} options={options} templates={templates} canManage={canManage} canFiles={canFiles} today={zonedParts(new Date()).date} openTaskId={(await searchParams).task ?? null} />
    </div>
  );
}
