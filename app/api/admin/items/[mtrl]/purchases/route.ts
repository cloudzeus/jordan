import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { SoftoneError } from '@/lib/softone';
import { itemPurchases } from '@/lib/item-purchases';
import { badMtrl, mtrlOf } from '../media/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — όλα τα παραστατικά αγορών του είδους, ζωντανά από το SoftOne. Μόνο ανάγνωση.
export async function GET(_req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  await requirePermission('metadata.read');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  try {
    return NextResponse.json(await itemPurchases(mtrl));
  } catch (e) {
    const status = e instanceof SoftoneError ? 502 : 500;
    return NextResponse.json({ error: 'purchases_error', message: (e as Error).message }, { status });
  }
}
