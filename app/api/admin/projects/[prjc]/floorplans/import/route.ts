import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { copyLibraryPlanToProject } from '@/lib/floorplan/plans';
import { planFail } from '@/app/api/admin/floorplans/_shared';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ prjc: string }> }) {
  const user = await requirePermission('projects.manage');
  const prjc = Number((await params).prjc);
  const input = z.object({ floorPlanId: z.string().min(1).max(64) }).safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(prjc) || prjc <= 0 || !input.success) return NextResponse.json({ message: 'Μη έγκυρο έργο ή κάτοψη.' }, { status: 400 });
  try {
    const out = await copyLibraryPlanToProject(input.data.floorPlanId, prjc, { id: user.id, name: user.name ?? null, email: user.email });
    await logAudit({ userId: user.id, userEmail: user.email, action: 'floorplan.import', resource: 'floor_plan', resourceId: out.id, metadata: { prjc, sourceId: input.data.floorPlanId } }).catch(() => null);
    return NextResponse.json(out, { status: 201 });
  } catch (e) { return planFail(e); }
}
