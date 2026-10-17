import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { SoftoneError } from '@/lib/softone';
import { itemStock } from '@/lib/item-stock';
import { badMtrl, mtrlOf } from '../media/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?live=1 — υπόλοιπα του είδους ανά αποθήκη και σύνολο· με live ξαναδιαβάζει από το SoftOne.
export async function GET(req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  await requirePermission('metadata.read');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  const live = new URL(req.url).searchParams.get('live') === '1';
  try {
    return NextResponse.json(await itemStock(mtrl, live));
  } catch (e) {
    const status = e instanceof SoftoneError ? 502 : 500;
    return NextResponse.json({ error: 'stock_error', message: (e as Error).message }, { status });
  }
}
