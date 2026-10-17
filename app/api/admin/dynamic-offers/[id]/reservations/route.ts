import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { addReservation, reservationInput } from '@/lib/container-offers';
import { invalid, offerErrorResponse, type Ctx } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — κράτηση πελάτη (παλέτες ανά ½). Η ειδοποίηση πτώσης τιμής στέλνεται ΜΕΤΑ την ανανέωση της
// 3D εικόνας (POST …/snapshot?notify=1 από τη σελίδα) ή από το cron.
export async function POST(req: Request, ctx: Ctx) {
  const u = await requirePermission('dynamic_offers.reservations');
  const { id } = await ctx.params;
  const parsed = reservationInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    const r = await addReservation(id, parsed.data, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'offer.reservation.add', resource: 'dynamic_offer', resourceId: id, metadata: { trdr: r.trdr, offerItemId: r.offerItemId, pallets: r.pallets } }).catch(() => null);
    return NextResponse.json({ reservation: r }, { status: 201 });
  } catch (e) { return offerErrorResponse(e); }
}
