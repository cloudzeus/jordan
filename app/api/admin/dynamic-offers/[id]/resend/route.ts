import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { resendPublish } from '@/lib/container-offers';
import { offerErrorResponse, type Ctx } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST — αποστολή της προσφοράς σε όσους δεν την έλαβαν (νέοι παραλήπτες, αποτυχίες).
export async function POST(_req: Request, ctx: Ctx) {
  const u = await requirePermission('dynamic_offers.manage');
  const { id } = await ctx.params;
  try {
    const r = await resendPublish(id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'offer.resend', resource: 'dynamic_offer', resourceId: id, metadata: r }).catch(() => null);
    return NextResponse.json(r);
  } catch (e) { return offerErrorResponse(e); }
}
