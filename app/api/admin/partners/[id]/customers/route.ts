import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { linkCustomers, linkCustomersInput } from '@/lib/partners';
import { parseBody, partnerErrorResponse } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — συσχέτιση με πελάτες: { trdrs: number[] }.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requirePermission('metadata.manage');
  const { id } = await ctx.params;
  const body = await parseBody(req, linkCustomersInput);
  if (body.res) return body.res;
  try {
    const r = await linkCustomers(id, body.data.trdrs);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'partner.customer.link', resource: 'partner', resourceId: id, metadata: { trdrs: body.data.trdrs, added: r.added } }).catch(() => null);
    return NextResponse.json(r, { status: 201 });
  } catch (e) { return partnerErrorResponse(e); }
}
