import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { setSetting } from '@/lib/settings';
import { syncClassifications } from '@/lib/item-classifications';
import { classificationErrorResponse } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — συγχρονισμός κατηγοριών & ομάδων από το SoftOne.
export async function POST() {
  const u = await requirePermission('metadata.manage');
  try {
    const r = await syncClassifications();
    await setSetting('integrations.softoneClassificationsLastSync', new Date().toISOString()).catch(() => null);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'classification.sync', resource: 'classification', metadata: r }).catch(() => null);
    return NextResponse.json(r);
  } catch (e) { return classificationErrorResponse(e); }
}
