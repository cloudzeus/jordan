import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { deleteOffer, getRecipients, getReservations, listOffers, offerInput, updateOffer } from '@/lib/container-offers';
import { invalid, offerErrorResponse, type Ctx } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: Ctx) {
  await requirePermission('metadata.read');
  const { id } = await ctx.params;
  const offer = (await listOffers()).find((o) => o.id === id);
  if (!offer) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const [reservations, recipients] = await Promise.all([getReservations(id), getRecipients(id)]);
  return NextResponse.json({ offer, reservations, recipients });
}

export async function PUT(req: Request, ctx: Ctx) {
  const u = await requirePermission('metadata.manage');
  const { id } = await ctx.params;
  const parsed = offerInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    await updateOffer(id, parsed.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'offer.update', resource: 'dynamic_offer', resourceId: id }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return offerErrorResponse(e); }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const u = await requirePermission('metadata.manage');
  const { id } = await ctx.params;
  try {
    await deleteOffer(id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'offer.delete', resource: 'dynamic_offer', resourceId: id }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return offerErrorResponse(e); }
}
