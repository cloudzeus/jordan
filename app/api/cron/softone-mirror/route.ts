import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { runMirrorCycle } from '@/lib/softone-mirror/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Συγχρονισμός καθρέφτη SoftOne από εξωτερικό cron (π.χ. κάθε 3′ αυξητικά, 03:00 `?mode=reconcile`).
 * Bearer: `SOFTONE_MIRROR_CRON_SECRET`, αλλιώς `CRON_SECRET`, αλλιώς η ρύθμιση `backups.cronSecret`.
 * Αν τρέχει ήδη κύκλος (worker ή άλλο instance), απαντά `skipped` — όχι σφάλμα.
 */
async function handle(req: Request) {
  const expected = process.env.SOFTONE_MIRROR_CRON_SECRET || process.env.CRON_SECRET || (await getSetting<string>('backups.cronSecret')) || '';
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  const ok = b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const m = new URL(req.url).searchParams.get('mode');
  const mode = m === 'reconcile' || m === 'incremental' ? m : 'auto';
  const report = await runMirrorCycle({ mode, trigger: 'cron' });
  return NextResponse.json(report, { status: report.ok || report.skipped ? 200 : 502 });
}

export const POST = handle;
export const GET = handle;
