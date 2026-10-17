import { NextResponse } from 'next/server';
import { getCurrentUserWithPermissions } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { bookerOf, requestInput, requestReservation } from '@/lib/container-offers';
import { notifyReservation } from '@/lib/reservation-mail';
import { invalid, offerErrorResponse, type Ctx } from '@/app/api/admin/dynamic-offers/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — αίτημα κράτησης από το portal (click στον άδειο χώρο). Μένει PENDING ως την έγκριση.
export async function POST(req: Request, ctx: Ctx) {
  const u = await getCurrentUserWithPermissions();
  if (!u) return NextResponse.json({ error: 'unauthorized', message: 'Συνδεθείτε ξανά' }, { status: 401 });
  const b = bookerOf(u);
  if (!b) return NextResponse.json({ error: 'forbidden', message: 'Ο λογαριασμός δεν είναι συνδεδεμένος με πελάτη ή συνεργάτη' }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = requestInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    const r = await requestReservation(id, b, parsed.data, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'offer.reservation.request', resource: 'dynamic_offer', resourceId: id, metadata: { offerItemId: r.offerItemId, pallets: r.pallets } }).catch(() => null);
    await notifyReservation(id, r.id, 'requested');
    return NextResponse.json({ reservation: { id: r.id, pallets: r.pallets, status: r.status } }, { status: 201 });
  } catch (e) { return offerErrorResponse(e); }
}
