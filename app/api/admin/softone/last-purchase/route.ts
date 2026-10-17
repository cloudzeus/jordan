import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { SoftoneError } from '@/lib/softone';
import { lastPurchasePrices } from '@/lib/last-purchase-price';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?mtrl=1,2,3 — τελευταία τιμή αγοράς ανά είδος από τα παραστατικά αγορών του SoftOne.
export async function GET(req: Request) {
  await requirePermission('metadata.read');
  const ids = (new URL(req.url).searchParams.get('mtrl') ?? '')
    .split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
  if (ids.length === 0) return NextResponse.json({ prices: {} });
  try {
    const m = await lastPurchasePrices(ids);
    return NextResponse.json({ prices: Object.fromEntries(m) });
  } catch (e) {
    if (e instanceof SoftoneError) return NextResponse.json({ error: 'softone_error', message: e.message }, { status: 502 });
    throw e;
  }
}
