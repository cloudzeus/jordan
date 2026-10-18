import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { applyTemplate } from '@/lib/project-tasks';
import { parseBody, taskError } from '../../../projects/[prjc]/tasks/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const applyInput = z.object({
  prjc: z.coerce.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Μη έγκυρη ημερομηνία'),
});

// POST { prjc, startDate } — προσθέτει τις εργασίες του template στο έργο από την ημερομηνία.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requirePermission('projects.manage');
  const { id } = await ctx.params;
  const body = await parseBody(req, applyInput);
  if ('error' in body) return body.error;
  try {
    const count = await applyTemplate(id, body.data.prjc, body.data.startDate, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'task_template.apply', resource: 'project', resourceId: String(body.data.prjc), metadata: { templateId: id, count } }).catch(() => null);
    return NextResponse.json({ count }, { status: 201 });
  } catch (e) {
    return taskError(e);
  }
}
