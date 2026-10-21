import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { getFloorPlan } from '@/lib/floorplan/plans';
import { planFail } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — ολόκληρη η χαρτογράφηση (για ξανάνοιγμα στο εργαλείο).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requirePermission('projects.read');
  try {
    const p = await getFloorPlan((await ctx.params).id);
    if (!p) return NextResponse.json({ error: 'not_found', message: 'Η χαρτογράφηση δεν βρέθηκε' }, { status: 404 });
    return NextResponse.json({ plan: p });
  } catch (e) { return planFail(e); }
}
