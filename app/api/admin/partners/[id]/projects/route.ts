import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { linkProject, linkProjectInput } from '@/lib/partners';
import { parseBody, partnerErrorResponse } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — συσχέτιση (ή αλλαγή ρόλου) με έργο συνδεδεμένου πελάτη: { prjc, role? }.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requirePermission('metadata.manage');
  const { id } = await ctx.params;
  const body = await parseBody(req, linkProjectInput);
  if (body.res) return body.res;
  try {
    const l = await linkProject(id, body.data.prjc, body.data.role);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'partner.project.link', resource: 'partner', resourceId: id, metadata: { prjc: l.prjc, role: l.role } }).catch(() => null);
    return NextResponse.json({ link: l }, { status: 201 });
  } catch (e) { return partnerErrorResponse(e); }
}
