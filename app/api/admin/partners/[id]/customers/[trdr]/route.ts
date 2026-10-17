import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { unlinkCustomer } from '@/lib/partners';
import { intParam, partnerErrorResponse } from '../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE — αποσύνδεση πελάτη (και των έργων του από τον συνεργάτη).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; trdr: string }> }) {
  const u = await requirePermission('partners.manage');
  const { id, trdr: raw } = await ctx.params;
  const trdr = intParam(raw);
  if (!trdr) return NextResponse.json({ error: 'invalid_trdr' }, { status: 400 });
  try {
    const r = await unlinkCustomer(id, trdr);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'partner.customer.unlink', resource: 'partner', resourceId: id, metadata: { trdr, ...r } }).catch(() => null);
    return NextResponse.json(r);
  } catch (e) { return partnerErrorResponse(e); }
}
