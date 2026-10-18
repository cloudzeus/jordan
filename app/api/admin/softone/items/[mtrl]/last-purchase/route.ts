import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { lastPurchasePrices } from '@/lib/last-purchase-price';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — τελευταία τιμή αγοράς του είδους (ζωντανά από το SoftOne, ~4″). Χωριστά από το `/full`, ώστε η φόρμα
// και το expand να ανοίγουν χωρίς να την περιμένουν.
export async function GET(_req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  await requirePermission('metadata.read');
  const mtrl = Number((await params).mtrl);
  if (!Number.isInteger(mtrl) || mtrl <= 0) return NextResponse.json({ error: 'invalid_mtrl' }, { status: 400 });
  const lp = await lastPurchasePrices([mtrl]).catch(() => null);
  if (!lp) return NextResponse.json({ error: 'softone_error', lastPurchase: null }, { status: 502 });
  return NextResponse.json({ lastPurchase: lp.get(mtrl) ?? null });
}
