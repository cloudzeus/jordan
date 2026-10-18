import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { approveReservation, rejectReservation } from '@/lib/container-offers';
import { notifyReservation } from '@/lib/reservation-mail';
import { createPaymentRequest } from '@/lib/viva-payments';
import { invalid, offerErrorResponse } from '../../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(300).optional().nullable() });

// POST — έγκριση/απόρριψη αιτήματος από το portal. Μετά την έγκριση η σελίδα ανανεώνει την 3D εικόνα
// και στέλνει το «η τιμή έπεσε» (ίδια ροή με τη νέα κράτηση).
export async function POST(req: Request, ctx: { params: Promise<{ id: string; rid: string }> }) {
  const u = await requirePermission('dynamic_offers.reservations');
  const { id, rid } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    const r = parsed.data.decision === 'approve'
      ? await approveReservation(id, rid, u.id)
      : await rejectReservation(id, rid, u.id, parsed.data.note ?? null);
    await logAudit({ userId: u.id, userEmail: u.email, action: `offer.reservation.${parsed.data.decision}`, resource: 'dynamic_offer', resourceId: id, metadata: { reservationId: rid, pallets: r.pallets } }).catch(() => null);
    await notifyReservation(id, rid, parsed.data.decision === 'approve' ? 'approved' : 'rejected');
    // Με την έγκριση: αίτημα πληρωμής Viva (αν είναι ενεργό στις Ρυθμίσεις). Best-effort — η έγκριση ισχύει ούτως ή άλλως.
    const payment = parsed.data.decision === 'approve'
      ? await createPaymentRequest(rid, u.id).catch((e) => ({ created: false as const, reason: 'error', message: (e as Error).message }))
      : null;
    return NextResponse.json({ reservation: { id: r.id, status: r.status, pallets: r.pallets }, payment });
  } catch (e) { return offerErrorResponse(e); }
}
