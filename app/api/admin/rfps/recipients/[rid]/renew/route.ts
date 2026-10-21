import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { renewLink } from '@/lib/rfp/service';
import { rfpFail } from '@/lib/rfp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { sendEmail } — νέος μοναδικός σύνδεσμος (ο παλιός παύει να ισχύει), προαιρετικά ξανά email.
export async function POST(req: Request, ctx: { params: Promise<{ rid: string }> }) {
  const u = await requirePermission('projects.manage');
  const rid = (await ctx.params).rid;
  try {
    const body = await req.json().catch(() => ({}));
    const out = await renewLink(rid, { id: u.id, name: u.name ?? null, email: u.email }, { sendEmail: body?.sendEmail === true });
    await logAudit({ userId: u.id, userEmail: u.email, action: 'rfp.link_renew', resource: 'rfp_recipient', resourceId: rid, metadata: { email: out.email_result } }).catch(() => null);
    return NextResponse.json(out);
  } catch (e) { return rfpFail(e); }
}
