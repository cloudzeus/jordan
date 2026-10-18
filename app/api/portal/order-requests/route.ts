import { NextResponse } from 'next/server';
import { customerTrdrOf, getCurrentUserWithPermissions } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { orderRequestInput } from '@/lib/order-requests-core';
import { createOrderRequest, OrderRequestError } from '@/lib/order-requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — νέο αίτημα παραγγελίας από το B2B portal. Ο πελάτης = ο συνδεδεμένος (customerTrdr).
// Αποθηκεύεται ΜΟΝΟ στη βάση της εφαρμογής· καμία εγγραφή στο SoftOne.
export async function POST(req: Request) {
  const u = await getCurrentUserWithPermissions();
  if (!u) return NextResponse.json({ error: 'unauthorized', message: 'Συνδεθείτε ξανά' }, { status: 401 });
  const trdr = customerTrdrOf(u);
  if (trdr == null) return NextResponse.json({ error: 'forbidden', message: 'Ο λογαριασμός δεν είναι συνδεδεμένος με πελάτη' }, { status: 403 });
  const parsed = orderRequestInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: 'invalid_input', message: i?.message ?? 'Μη έγκυρα στοιχεία', field: i?.path?.join('.') ?? null }, { status: 400 });
  }
  try {
    const r = await createOrderRequest(trdr, u.id, parsed.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'order_request.create', resource: 'order_request', resourceId: r.id, metadata: { trdr, lines: r.lines.length } }).catch(() => null);
    return NextResponse.json({ request: { id: r.id, number: r.number } }, { status: 201 });
  } catch (e) {
    if (e instanceof OrderRequestError) return NextResponse.json({ error: 'order_request', message: e.message }, { status: e.status });
    throw e;
  }
}
