import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { loadClassRows } from '@/lib/trader-classes-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?sodtype=12|13 — η ιεραρχία κατηγοριών (3 επίπεδα) μιας πλευράς, για τις συσχετιζόμενες επιλογές.
export async function GET(req: Request) {
  await requirePermission('metadata.read');
  const sodtype = Number(new URL(req.url).searchParams.get('sodtype'));
  if (sodtype !== 12 && sodtype !== 13) return NextResponse.json({ error: 'invalid_sodtype' }, { status: 400 });
  return NextResponse.json({ sodtype, rows: await loadClassRows(sodtype) });
}
