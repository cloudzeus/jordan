import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { addCustomerContact, customerContactInput, listCustomerContacts } from '@/lib/portal-access';
import { accessErrorResponse, invalid } from '../../../access/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ trdr: string }> };
const trdrOf = async (ctx: Ctx) => { const n = Number((await ctx.params).trdr); return Number.isInteger(n) && n > 0 ? n : null; };

// GET — πρόσωπα επικοινωνίας του πελάτη με την κατάσταση πρόσβασής τους.
export async function GET(_req: Request, ctx: Ctx) {
  await requirePermission('metadata.read');
  const trdr = await trdrOf(ctx);
  if (!trdr) return NextResponse.json({ error: 'invalid_trdr' }, { status: 400 });
  return NextResponse.json({ contacts: await listCustomerContacts(trdr) });
}

export async function POST(req: Request, ctx: Ctx) {
  const u = await requirePermission('metadata.manage');
  const trdr = await trdrOf(ctx);
  if (!trdr) return NextResponse.json({ error: 'invalid_trdr' }, { status: 400 });
  const parsed = customerContactInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    const c = await addCustomerContact(trdr, parsed.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'customer.contact.add', resource: 'trader', resourceId: String(trdr), metadata: { contactId: c.id, name: c.name } }).catch(() => null);
    return NextResponse.json({ contact: c }, { status: 201 });
  } catch (e) { return accessErrorResponse(e); }
}
