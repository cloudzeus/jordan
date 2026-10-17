import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { recipientOptions, searchItems } from '@/lib/container-offers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?items=<αναζήτηση> — προϊόντα για τον οδηγό · χωρίς παράμετρο — υποψήφιοι παραλήπτες.
export async function GET(req: Request) {
  await requirePermission('dynamic_offers.read');
  const q = new URL(req.url).searchParams.get('items');
  if (q != null) return NextResponse.json({ items: await searchItems(q) });
  return NextResponse.json(await recipientOptions());
}
