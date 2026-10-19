import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { getContract, transition } from '@/lib/contracts/service';
import { fail, idOf } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ action: z.enum(['send', 'accept', 'activate', 'complete', 'cancel', 'reopen']) });

// POST { action } — αλλαγή κατάστασης (η ενεργοποίηση δημιουργεί εργασίες/ημερολόγιο από τα milestones).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requirePermission('projects.manage');
  const id = await idOf(ctx);
  try {
    const { action } = body.parse(await req.json().catch(() => null));
    await transition(id, action, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: `contract.${action}`, resource: 'contract', resourceId: id }).catch(() => null);
    return NextResponse.json({ contract: await getContract(id) });
  } catch (e) { return fail(e); }
}
