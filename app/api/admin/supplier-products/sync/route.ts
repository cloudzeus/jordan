import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { syncSupplierProducts } from '@/lib/softone-sync/supplier-products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST — ξαναχτίζει τα «προϊόντα ανά προμηθευτή» από τα παραστατικά αγορών (μόνο ανάγνωση στο SoftOne).
export async function POST() {
  const u = await requirePermission('metadata.manage');
  try {
    const out = await syncSupplierProducts();
    await logAudit({ userId: u.id, action: 'softone.supplier_products_sync', resource: 'SupplierProduct', metadata: { ...out } }).catch(() => null);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: 'softone_error', message: (e as Error).message }, { status: 502 });
  }
}
