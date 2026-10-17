import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { publishOffer } from '@/lib/container-offers';
import { invalid, offerErrorResponse, type Ctx } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST — δημοσίευση τώρα ή προγραμματισμός: { publishAt?: ISO }.
export async function POST(req: Request, ctx: Ctx) {
  const u = await requirePermission('dynamic_offers.manage');
  const { id } = await ctx.params;
  const parsed = z.object({ publishAt: z.string().datetime({ offset: true }).nullable().optional() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    const r = await publishOffer(id, parsed.data.publishAt ? new Date(parsed.data.publishAt) : null);
    await logAudit({ userId: u.id, userEmail: u.email, action: r.scheduled ? 'offer.schedule' : 'offer.publish', resource: 'dynamic_offer', resourceId: id, metadata: r }).catch(() => null);
    return NextResponse.json(r);
  } catch (e) { return offerErrorResponse(e); }
}
