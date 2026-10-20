import Link from 'next/link';
import { FiArrowLeft, FiBookmark } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { listTemplates } from '@/lib/project-tasks';
import { listProjects } from '@/lib/projects';
import { zonedParts } from '@/lib/appointments-core';
import { PageHeader } from '@/components/admin/page-header';
import { TemplatesClient } from './templates-client';

export const dynamic = 'force-dynamic';

// Templates εργασιών: ονομασμένες σειρές εργασιών που προστίθενται σε όποιο έργο.
export default async function TaskTemplatesPage() {
  await requirePermission('projects.read');
  const [templates, projects, canManage] = await Promise.all([listTemplates(), listProjects(), hasPermission('projects.manage')]);
  return (
    <div className="w-full max-w-4xl">
      <Link href="/admin/projects" className="mb-3 inline-flex min-h-8 items-center gap-1 text-(length:--fs-12) text-muted-foreground hover:text-foreground">
        <FiArrowLeft className="size-3.5" aria-hidden /> Όλα τα έργα
      </Link>
      <PageHeader icon={<FiBookmark />} title="Templates εργασιών" description={`${templates.length} templates · αποθηκεύονται από τις εργασίες ενός έργου`} helpAnchor="task-templates" />
      <TemplatesClient templates={templates} projects={projects.filter((p) => p.isActive).map((p) => ({ prjc: p.prjc, label: `${p.code} · ${p.name}` }))} canManage={canManage} today={zonedParts(new Date()).date} />
    </div>
  );
}
