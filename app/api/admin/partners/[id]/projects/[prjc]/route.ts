import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { unlinkProject } from '@/lib/partners';
import { intParam, partnerErrorResponse } from '../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; prjc: string }> }) {
  const u = await requirePermission('metadata.manage');
  const { id, prjc: raw } = await ctx.params;
  const prjc = intParam(raw);
  if (!prjc) return NextResponse.json({ error: 'invalid_prjc' }, { status: 400 });
  try {
    await unlinkProject(id, prjc);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'partner.project.unlink', resource: 'partner', resourceId: id, metadata: { prjc } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return partnerErrorResponse(e); }
}
