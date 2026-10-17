import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { customerContactInput, deleteCustomerContact, updateCustomerContact } from '@/lib/portal-access';
import { accessErrorResponse, invalid } from '../../../../access/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ trdr: string; id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const u = await requirePermission('metadata.manage');
  const p = await ctx.params;
  const parsed = customerContactInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    const c = await updateCustomerContact(Number(p.trdr), p.id, parsed.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'customer.contact.update', resource: 'trader', resourceId: p.trdr, metadata: { contactId: p.id } }).catch(() => null);
    return NextResponse.json({ contact: c });
  } catch (e) { return accessErrorResponse(e); }
}

// DELETE — διαγραφή προσώπου (και του χρήστη του, αν έχει πρόσβαση).
export async function DELETE(_req: Request, ctx: Ctx) {
  const u = await requirePermission('metadata.manage');
  const p = await ctx.params;
  try {
    const c = await deleteCustomerContact(Number(p.trdr), p.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'customer.contact.delete', resource: 'trader', resourceId: p.trdr, metadata: { contactId: p.id, name: c.name, hadAccess: !!c.userId } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return accessErrorResponse(e); }
}
