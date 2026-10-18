import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserWithPermissions } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { ORDER_REQUEST_STATUSES } from '@/lib/order-requests-core';
import { OrderRequestError, updateOrderRequest } from '@/lib/order-requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const input = z.object({
  status: z.enum(ORDER_REQUEST_STATUSES).refine((s) => s !== 'CANCELLED', 'Η ακύρωση γίνεται μόνο από τον πελάτη'),
  staffNote: z.string().trim().max(1000).optional().nullable().transform((v) => (v === undefined ? undefined : v || null)),
  softoneFincode: z.string().trim().max(40).optional().nullable().transform((v) => (v === undefined ? undefined : v || null)),
});

// PATCH — το προσωπικό αλλάζει κατάσταση/σχόλιο. ΔΕΝ γράφει στο SoftOne: το παραστατικό (π.χ.
// ΠΑΡ0000057) το καταχωρίζει ο χρήστης στο SoftOne και εδώ απλώς σημειώνεται.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUserWithPermissions();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (u.role.key !== 'SUPER_ADMIN' && !u.permissionKeys.has('order_requests.manage')) return NextResponse.json({ error: 'forbidden', message: 'Δεν έχετε δικαίωμα' }, { status: 403 });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  const { id } = await ctx.params;
  try {
    const r = await updateOrderRequest(id, u.id, parsed.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'order_request.update', resource: 'order_request', resourceId: id, metadata: { status: r.status } }).catch(() => null);
    return NextResponse.json({ request: { id: r.id, status: r.status } });
  } catch (e) {
    if (e instanceof OrderRequestError) return NextResponse.json({ error: 'order_request', message: e.message }, { status: e.status });
    throw e;
  }
}
