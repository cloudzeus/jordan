import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { deleteTemplate, updateTemplate } from '@/lib/project-tasks';
import { parseBody, taskError } from '../../projects/[prjc]/tasks/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const patchInput = z.object({
  name: z.string().trim().min(1, 'Δώστε όνομα').max(120).optional(),
  description: z.string().trim().max(1000).nullish().transform((v) => (v === undefined ? undefined : v || null)),
});

export async function PATCH(req: Request, ctx: Ctx) {
  await requirePermission('projects.manage');
  const body = await parseBody(req, patchInput);
  if ('error' in body) return body.error;
  try {
    const t = await updateTemplate((await ctx.params).id, body.data);
    return NextResponse.json({ template: { id: t.id, name: t.name } });
  } catch (e) {
    return taskError(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const u = await requirePermission('projects.manage');
  const { id } = await ctx.params;
  try {
    await deleteTemplate(id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'task_template.delete', resource: 'task_template', resourceId: id }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return taskError(e);
  }
}
