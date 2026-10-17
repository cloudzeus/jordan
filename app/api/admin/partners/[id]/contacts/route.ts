import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { addContact, contactInput } from '@/lib/partners';
import { parseBody, partnerErrorResponse } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — νέο πρόσωπο επικοινωνίας της εταιρίας.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requirePermission('metadata.manage');
  const { id } = await ctx.params;
  const body = await parseBody(req, contactInput);
  if (body.res) return body.res;
  try {
    const c = await addContact(id, body.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'partner.contact.add', resource: 'partner', resourceId: id, metadata: { contactId: c.id, name: c.name, role: c.role } }).catch(() => null);
    return NextResponse.json({ contact: c }, { status: 201 });
  } catch (e) { return partnerErrorResponse(e); }
}
