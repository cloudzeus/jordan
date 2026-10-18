import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { cancelPayment, refundPayment, sendPaymentEmail, syncPayment } from '@/lib/viva-payments';
import { invalid } from '../../../_shared';
import { paymentErrorResponse } from '../_errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ action: z.enum(['resend', 'sync', 'cancel', 'refund']) });

// POST — ενέργειες του ⋮ σε ένα αίτημα πληρωμής. Η επιστροφή χρημάτων θέλει ξεχωριστό δικαίωμα.
export async function POST(req: Request, ctx: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  const { action } = parsed.data;
  const u = await requirePermission(action === 'refund' ? 'payments.refund' : 'payments.manage');
  try {
    const { prisma } = await import('@/lib/db');
    const own = await prisma.vivaPayment.findFirst({ where: { id: pid, reservation: { offerId: id } }, select: { id: true } });
    if (!own) return NextResponse.json({ error: 'not_found', message: 'Το αίτημα πληρωμής δεν βρέθηκε' }, { status: 404 });
    let result: unknown = null;
    if (action === 'resend') {
      result = await sendPaymentEmail(pid);
      if (!(result as { sent: boolean }).sent) return NextResponse.json({ error: 'email_failed', message: (result as { error: string | null }).error ?? 'Αποτυχία αποστολής' }, { status: 502 });
    } else if (action === 'sync') result = await syncPayment(id, pid);
    else if (action === 'cancel') await cancelPayment(id, pid);
    else result = await refundPayment(id, pid, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: `offer.payment.${action}`, resource: 'dynamic_offer', resourceId: id, metadata: { paymentId: pid } }).catch(() => null);
    return NextResponse.json({ ok: true, result });
  } catch (e) { return paymentErrorResponse(e); }
}
