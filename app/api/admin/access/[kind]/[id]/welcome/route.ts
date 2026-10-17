import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { resendWelcome } from '@/lib/portal-access';
import { accessErrorResponse, kindOf } from '../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — ξαναστέλνει το email καλωσορίσματος (χωρίς κωδικό).
export async function POST(_req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const u = await requirePermission('users.update');
  const p = await ctx.params;
  const kind = kindOf(p.kind);
  if (!kind) return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  try {
    const r = await resendWelcome(kind, p.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'portal.access.welcome', resource: 'user', metadata: { email: r.email } }).catch(() => null);
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof Error && !('status' in e)) return NextResponse.json({ error: 'mail_error', message: `Η αποστολή απέτυχε: ${e.message}` }, { status: 502 });
    return accessErrorResponse(e);
  }
}
