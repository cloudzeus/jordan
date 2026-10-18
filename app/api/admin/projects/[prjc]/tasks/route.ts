import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { createTask, listTasks, taskInput } from '@/lib/project-tasks';
import { badPrjc, parseBody, prjcOf, taskError, type PrjcCtx } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — οι εργασίες του έργου με το υπολογισμένο πρόγραμμα και το συνολικό ποσοστό.
export async function GET(_req: Request, ctx: PrjcCtx) {
  await requirePermission('projects.read');
  const prjc = await prjcOf(ctx);
  if (!prjc) return badPrjc();
  return NextResponse.json(await listTasks(prjc));
}

// POST — νέα εργασία (δικά μας δεδομένα, όχι SoftOne).
export async function POST(req: Request, ctx: PrjcCtx) {
  const u = await requirePermission('projects.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return badPrjc();
  const body = await parseBody(req, taskInput);
  if ('error' in body) return body.error;
  try {
    const task = await createTask(prjc, body.data, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'project.task.create', resource: 'project', resourceId: String(prjc), metadata: { taskId: task.id, name: task.name } }).catch(() => null);
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    return taskError(e);
  }
}
