import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { createOffer, listOffers, offerInput } from '@/lib/container-offers';
import { invalid, offerErrorResponse } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  await requirePermission('metadata.read');
  return NextResponse.json({ offers: await listOffers() });
}

// POST — νέα δυναμική προσφορά (πρόχειρη) από τον οδηγό.
export async function POST(req: Request) {
  const u = await requirePermission('metadata.manage');
  const parsed = offerInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    const o = await createOffer(parsed.data, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'offer.create', resource: 'dynamic_offer', resourceId: o.id, metadata: { products: parsed.data.items.map((i) => i.mtrl), tiers: parsed.data.tiers.length } }).catch(() => null);
    return NextResponse.json({ offer: o }, { status: 201 });
  } catch (e) { return offerErrorResponse(e); }
}
