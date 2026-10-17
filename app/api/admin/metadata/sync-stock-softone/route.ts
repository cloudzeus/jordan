import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { syncStock, syncFailureResponse, withResyncLock } from '@/lib/softone-sync/resync';

// Υπόλοιπα αποθηκών (MTRBALSHEET) → `SoftoneStock`. ΜΟΝΟ ΑΝΑΓΝΩΣΗ από το SoftOne· ίδια λογική και
// κλειδαριά με το «Συγχρονισμός όλων».
export async function POST() {
  const u = await requirePermission('metadata.manage');
  try {
    const r = await withResyncLock(u, ['stock'], () => syncStock(u));
    return NextResponse.json({ ok: true, total: r.total, created: r.created, updated: r.updated, skipped: r.skipped, ...r.detail, syncedAt: r.syncedAt });
  } catch (e) {
    const { status, body } = syncFailureResponse(e);
    return NextResponse.json(body, { status });
  }
}
