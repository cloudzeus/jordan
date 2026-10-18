import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { moveTask } from '@/lib/project-tasks';
import { PHASE_KEYS, type PhaseKey } from '@/lib/project-tasks-core';
import { badPrjc, parseBody, prjcOf, taskError, type TaskCtx } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const moveInput = z.object({
  to: z.string().refine((v): v is PhaseKey => (PHASE_KEYS as string[]).includes(v), 'Άγνωστη στήλη'),
  beforeId: z.string().min(1).nullable().default(null),
});

// POST { to, beforeId } — Kanban: στήλη (ορίζει το ποσοστό) και θέση μέσα της.
export async function POST(req: Request, ctx: TaskCtx) {
  await requirePermission('projects.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return badPrjc();
  const { id } = await ctx.params;
  const body = await parseBody(req, moveInput);
  if ('error' in body) return body.error;
  try {
    return NextResponse.json({ changes: await moveTask(prjc, id, body.data.to as PhaseKey, body.data.beforeId) });
  } catch (e) {
    return taskError(e);
  }
}
