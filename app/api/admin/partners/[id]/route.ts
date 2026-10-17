import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { deletePartner, getPartnerDetail, partnerInput, updatePartner } from '@/lib/partners';
import { parseBody, partnerErrorResponse } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// GET — πλήρη στοιχεία: πρόσωπα, πελάτες, έργα.
export async function GET(_req: Request, ctx: Ctx) {
  await requirePermission('partners.read');
  const d = await getPartnerDetail((await ctx.params).id);
  if (!d) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(d);
}

// PUT — αντικατάσταση των στοιχείων του συνεργάτη.
export async function PUT(req: Request, ctx: Ctx) {
  const u = await requirePermission('partners.manage');
  const { id } = await ctx.params;
  const body = await parseBody(req, partnerInput);
  if (body.res) return body.res;
  try {
    const p = await updatePartner(id, body.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'partner.update', resource: 'partner', resourceId: id, metadata: { name: p.name } }).catch(() => null);
    return NextResponse.json({ partner: p });
  } catch (e) { return partnerErrorResponse(e); }
}

// DELETE — διαγραφή (μαζί πρόσωπα και συσχετίσεις· τα στοιχεία SoftOne δεν αγγίζονται).
export async function DELETE(_req: Request, ctx: Ctx) {
  const u = await requirePermission('partners.manage');
  const { id } = await ctx.params;
  try {
    const p = await deletePartner(id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'partner.delete', resource: 'partner', resourceId: id, metadata: { name: p.name } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return partnerErrorResponse(e); }
}
