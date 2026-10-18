import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { cancelReservation } from '@/lib/container-offers';
import { onReservationCancelled } from '@/lib/viva-payments';
import { offerErrorResponse } from '../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; rid: string }> }) {
  const u = await requirePermission('dynamic_offers.reservations');
  const { id, rid } = await ctx.params;
  try {
    await cancelReservation(id, rid);
    await onReservationCancelled(id, rid);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'offer.reservation.cancel', resource: 'dynamic_offer', resourceId: id, metadata: { reservationId: rid } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return offerErrorResponse(e); }
}
