import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { refreshProjectFinancials } from '@/lib/project-profit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — ξαναϋπολογίζει την κερδοφορία ΟΛΩΝ των έργων από το SoftOne (μόνο ανάγνωση).
export async function POST() {
  await requirePermission('projects.financials');
  try {
    return NextResponse.json(await refreshProjectFinancials());
  } catch (e) {
    return NextResponse.json({ error: 'softone_error', message: (e as Error).message }, { status: 502 });
  }
}
