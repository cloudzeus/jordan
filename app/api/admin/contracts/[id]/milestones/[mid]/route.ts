import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { getContract, setMilestoneStatus } from '@/lib/contracts/service';
import { fail } from '../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ status: z.enum(['PENDING', 'DONE', 'PAID']) });

// PATCH { status } — παραδόθηκε / εξοφλήθηκε (ενημερώνει και το task του έργου).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const u = await requirePermission('projects.manage');
  const { id, mid } = await ctx.params;
  try {
    const { status } = body.parse(await req.json().catch(() => null));
    await setMilestoneStatus(id, mid, status);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'contract.milestone', resource: 'contract', resourceId: id, metadata: { milestone: mid, status } }).catch(() => null);
    return NextResponse.json({ contract: await getContract(id) });
  } catch (e) { return fail(e); }
}
