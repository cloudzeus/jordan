import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { awardRecipient } from '@/lib/rfp/service';
import { rfpFail } from '@/lib/rfp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { recipientId } — ανάθεση: το συνεργείο μπαίνει στη σύμβαση με αμοιβή = το ποσό του.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requirePermission('projects.manage');
  const id = (await ctx.params).id;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.recipientId !== 'string') return NextResponse.json({ error: 'invalid_input', message: 'Λείπει ο παραλήπτης' }, { status: 400 });
    const out = await awardRecipient(id, body.recipientId, { id: u.id, name: u.name ?? null, email: u.email });
    await logAudit({ userId: u.id, userEmail: u.email, action: 'rfp.award', resource: 'rfp', resourceId: id, metadata: { recipientId: body.recipientId, ...out } }).catch(() => null);
    return NextResponse.json(out);
  } catch (e) { return rfpFail(e); }
}
