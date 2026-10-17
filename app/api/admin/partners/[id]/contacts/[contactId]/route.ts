import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { contactInput, deleteContact, updateContact } from '@/lib/partners';
import { parseBody, partnerErrorResponse } from '../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; contactId: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const u = await requirePermission('partners.manage');
  const { id, contactId } = await ctx.params;
  const body = await parseBody(req, contactInput);
  if (body.res) return body.res;
  try {
    const c = await updateContact(id, contactId, body.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'partner.contact.update', resource: 'partner', resourceId: id, metadata: { contactId, name: c.name } }).catch(() => null);
    return NextResponse.json({ contact: c });
  } catch (e) { return partnerErrorResponse(e); }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const u = await requirePermission('partners.manage');
  const { id, contactId } = await ctx.params;
  try {
    const c = await deleteContact(id, contactId);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'partner.contact.delete', resource: 'partner', resourceId: id, metadata: { contactId, name: c.name } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return partnerErrorResponse(e); }
}
