import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { contractRfps, createRfp } from '@/lib/rfp/service';
import { rfpFail } from '@/lib/rfp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// GET — τα αιτήματα προσφοράς της σύμβασης με τους παραλήπτες και τις απαντήσεις τους.
export async function GET(_req: Request, ctx: Ctx) {
  await requirePermission('projects.read');
  return NextResponse.json({ rfps: await contractRfps((await ctx.params).id) });
}

// POST { title, scope, dueDate?, message?, sendEmail, recipients[{kind, ref}] } — νέο αίτημα: PDF specs,
// σύνδεσμοι, email. Οι σύνδεσμοι επιστρέφονται μόνο τώρα (στη βάση μένει μόνο hash).
export async function POST(req: Request, ctx: Ctx) {
  const u = await requirePermission('projects.manage');
  const id = (await ctx.params).id;
  try {
    const out = await createRfp(id, await req.json().catch(() => null), { id: u.id, name: u.name ?? null, email: u.email });
    await logAudit({ userId: u.id, userEmail: u.email, action: 'rfp.create', resource: 'rfp', resourceId: out.id, metadata: { contractId: id, ref: out.ref, recipients: out.recipients.map((r) => ({ name: r.name, email: r.email_result })) } }).catch(() => null);
    return NextResponse.json(out, { status: 201 });
  } catch (e) { return rfpFail(e); }
}
