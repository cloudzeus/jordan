import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { setStatus } from '@/lib/container-offers';
import { invalid, offerErrorResponse, type Ctx } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: Ctx) {
  const u = await requirePermission('dynamic_offers.manage');
  const { id } = await ctx.params;
  const parsed = z.object({ status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    await setStatus(id, parsed.data.status);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'offer.status', resource: 'dynamic_offer', resourceId: id, metadata: parsed.data }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return offerErrorResponse(e); }
}
