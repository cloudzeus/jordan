import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { createPaymentRequest, refundPriceDiffs } from '@/lib/viva-payments';
import { paymentErrorResponse } from './_errors';
import { invalid, type Ctx } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), reservationId: z.string().min(1).max(64) }),
  z.object({ action: z.literal('refund_diffs') }),
]);

// POST — νέο αίτημα πληρωμής για ενεργή κράτηση (π.χ. κράτηση από το προσωπικό) · μαζική επιστροφή διαφορών.
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  const u = await requirePermission(parsed.data.action === 'create' ? 'payments.manage' : 'payments.refund');
  try {
    if (parsed.data.action === 'create') {
      const { prisma } = await import('@/lib/db');
      const r = await prisma.containerReservation.findFirst({ where: { id: parsed.data.reservationId, offerId: id }, select: { id: true } });
      if (!r) return NextResponse.json({ error: 'not_found', message: 'Η κράτηση δεν βρέθηκε' }, { status: 404 });
      const res = await createPaymentRequest(r.id, u.id);
      if (!res.created) return NextResponse.json({ error: res.reason, message: res.message }, { status: res.reason === 'exists' ? 409 : 400 });
      await logAudit({ userId: u.id, userEmail: u.email, action: 'offer.payment.create', resource: 'dynamic_offer', resourceId: id, metadata: { reservationId: r.id, paymentId: res.paymentId } }).catch(() => null);
      return NextResponse.json(res, { status: 201 });
    }
    const res = await refundPriceDiffs(id, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'offer.payment.refund_diffs', resource: 'dynamic_offer', resourceId: id, metadata: res }).catch(() => null);
    return NextResponse.json(res);
  } catch (e) { return paymentErrorResponse(e); }
}
