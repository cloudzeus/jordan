import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { createTemplate, listTemplates, templateCreateInput } from '@/lib/project-tasks';
import { parseBody, taskError } from '../projects/[prjc]/tasks/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  await requirePermission('projects.read');
  return NextResponse.json({ templates: await listTemplates() });
}

// POST { name, description?, prjc, taskIds } — αποθήκευση όλων ή μέρους των εργασιών ενός έργου ως template.
export async function POST(req: Request) {
  const u = await requirePermission('projects.manage');
  const body = await parseBody(req, templateCreateInput);
  if ('error' in body) return body.error;
  try {
    const t = await createTemplate(body.data, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'task_template.create', resource: 'task_template', resourceId: t.id, metadata: { name: t.name, prjc: body.data.prjc, tasks: body.data.taskIds.length } }).catch(() => null);
    return NextResponse.json({ template: { id: t.id, name: t.name } }, { status: 201 });
  } catch (e) {
    return taskError(e);
  }
}
