import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { deleteTask, taskPatch, updateTask } from '@/lib/project-tasks';
import { badPrjc, parseBody, prjcOf, taskError, type TaskCtx } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH — αλλαγή πεδίων (όσα σταλούν). dependsOn / parties αντικαθιστούν τη λίστα.
export async function PATCH(req: Request, ctx: TaskCtx) {
  const u = await requirePermission('projects.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return badPrjc();
  const { id } = await ctx.params;
  const body = await parseBody(req, taskPatch);
  if ('error' in body) return body.error;
  try {
    const task = await updateTask(prjc, id, body.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'project.task.update', resource: 'project', resourceId: String(prjc), metadata: { taskId: id, fields: Object.keys(body.data) } }).catch(() => null);
    return NextResponse.json({ task });
  } catch (e) {
    return taskError(e);
  }
}

export async function DELETE(_req: Request, ctx: TaskCtx) {
  const u = await requirePermission('projects.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return badPrjc();
  const { id } = await ctx.params;
  try {
    await deleteTask(prjc, id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'project.task.delete', resource: 'project', resourceId: String(prjc), metadata: { taskId: id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return taskError(e);
  }
}
