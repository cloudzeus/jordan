import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { setSetting } from '@/lib/settings';
import { syncUnits } from '@/lib/units';
import { unitErrorResponse } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — συγχρονισμός μονάδων μέτρησης από το SoftOne.
export async function POST() {
  const u = await requirePermission('metadata.manage');
  try {
    const r = await syncUnits();
    await setSetting('integrations.softoneUnitsLastSync', new Date().toISOString()).catch(() => null);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'unit.sync', resource: 'unit', metadata: r }).catch(() => null);
    return NextResponse.json(r);
  } catch (e) { return unitErrorResponse(e); }
}
