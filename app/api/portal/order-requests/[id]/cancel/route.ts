import { NextResponse } from 'next/server';
import { customerTrdrOf, getCurrentUserWithPermissions } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { cancelOrderRequest, OrderRequestError } from '@/lib/order-requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — ο πελάτης ακυρώνει δικό του αίτημα, μόνο όσο είναι «Υποβλήθηκε».
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUserWithPermissions();
  const trdr = customerTrdrOf(u);
  if (!u || trdr == null) return NextResponse.json({ error: 'forbidden', message: 'Δεν επιτρέπεται' }, { status: 403 });
  const { id } = await ctx.params;
  try {
    await cancelOrderRequest(trdr, id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'order_request.cancel', resource: 'order_request', resourceId: id }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OrderRequestError) return NextResponse.json({ error: 'order_request', message: e.message }, { status: e.status });
    throw e;
  }
}
