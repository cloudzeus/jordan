import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { mirrorStatus } from '@/lib/softone-mirror/status';
import { runMirrorCycle } from '@/lib/softone-mirror/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Κατάσταση του καθρέφτη SoftOne (τελευταίος κύκλος, γραμμές, καθυστέρηση, σφάλματα) — χωρίς κλήση στο SoftOne. */
export async function GET() {
  await requirePermission('metadata.read');
  return NextResponse.json(await mirrorStatus());
}

/**
 * `{ mode: 'incremental' | 'reconcile' }` — ξεκινά κύκλο ΤΩΡΑ, στο παρασκήνιο· το UI ρωτά το GET για πρόοδο.
 * Μόνο ανάγνωση από το SoftOne.
 */
export async function POST(req: Request) {
  const u = await requirePermission('metadata.manage');
  const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
  const mode = body.mode === 'reconcile' ? 'reconcile' : 'incremental';
  await logAudit({ userId: u.id, userEmail: u.email, action: 'softone.mirror.run', resource: 'softone_mirror', metadata: { mode } }).catch(() => null);
  void runMirrorCycle({ mode, trigger: `manual:${u.email}` }).catch(() => null);
  return NextResponse.json({ started: true, mode }, { status: 202 });
}
