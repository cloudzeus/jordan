import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { mirrorStatus } from '@/lib/softone-mirror/status';
import { MIRROR_TABLES, runMirrorCycle, setMirrorEvery, type MirrorTable } from '@/lib/softone-mirror/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isTable = (v: unknown): v is MirrorTable => typeof v === 'string' && (MIRROR_TABLES as string[]).includes(v);

/** Κατάσταση του καθρέφτη SoftOne (κύκλοι, γραμμές, καθυστέρηση, ρυθμοί, σφάλματα) — χωρίς κλήση στο SoftOne. */
export async function GET() {
  await requirePermission('metadata.read');
  return NextResponse.json(await mirrorStatus());
}

/**
 * `{ mode: 'incremental' | 'reconcile', table? }` — ξεκινά κύκλο ΤΩΡΑ (όλων ή ενός πίνακα), στο παρασκήνιο·
 * το UI ρωτά το GET για πρόοδο. Μόνο ανάγνωση από το SoftOne.
 */
export async function POST(req: Request) {
  const u = await requirePermission('metadata.manage');
  const body = (await req.json().catch(() => ({}))) as { mode?: unknown; table?: unknown };
  const mode = body.mode === 'reconcile' ? 'reconcile' : 'incremental';
  const only = isTable(body.table) ? [body.table] : undefined;
  await logAudit({ userId: u.id, userEmail: u.email, action: 'softone.mirror.run', resource: 'softone_mirror', resourceId: only?.[0] ?? 'all', metadata: { mode } }).catch(() => null);
  void runMirrorCycle({ mode, only, trigger: `manual:${u.email}` }).catch(() => null);
  return NextResponse.json({ started: true, mode, table: only?.[0] ?? null }, { status: 202 });
}

/** `{ table, everyMin }` — αλλάζει τον ρυθμό ενός πίνακα (λεπτά· null = προεπιλογή). */
export async function PATCH(req: Request) {
  const u = await requirePermission('metadata.manage');
  const body = (await req.json().catch(() => ({}))) as { table?: unknown; everyMin?: unknown };
  if (!isTable(body.table)) return NextResponse.json({ error: 'Άγνωστος πίνακας' }, { status: 400 });
  const every = body.everyMin == null ? null : Number(body.everyMin);
  if (every != null && !(Number.isFinite(every) && every >= 1)) return NextResponse.json({ error: 'Μη έγκυρος ρυθμός' }, { status: 400 });
  await setMirrorEvery(body.table, every);
  await logAudit({ userId: u.id, userEmail: u.email, action: 'softone.mirror.schedule', resource: 'softone_mirror', resourceId: body.table, metadata: { everyMin: every } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
