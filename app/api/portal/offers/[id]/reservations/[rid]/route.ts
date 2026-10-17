import { NextResponse } from 'next/server';
import { getCurrentUserWithPermissions } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { bookerOf, withdrawRequest } from '@/lib/container-offers';
import { offerErrorResponse } from '@/app/api/admin/dynamic-offers/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE — ο πελάτης αποσύρει δικό του αίτημα που δεν έχει εγκριθεί.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; rid: string }> }) {
  const u = await getCurrentUserWithPermissions();
  const b = u ? bookerOf(u) : null;
  if (!u || !b) return NextResponse.json({ error: 'unauthorized', message: 'Συνδεθείτε ξανά' }, { status: 401 });
  const { id, rid } = await ctx.params;
  try {
    await withdrawRequest(id, rid, b);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'offer.reservation.withdraw', resource: 'dynamic_offer', resourceId: id, metadata: { reservationId: rid } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return offerErrorResponse(e); }
}
