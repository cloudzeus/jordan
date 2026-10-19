import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { sendDocument } from '@/lib/contracts/documents';
import { getContract } from '@/lib/contracts/service';
import { fail } from '../../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const body = z.object({
  to: z.string().trim().email('Μη έγκυρο email παραλήπτη').max(200),
  message: z.string().trim().max(4000).nullish().transform((v) => v || null),
});

// POST { to, message? } — αποστολή του PDF με email (σε πελάτη ή οποιοδήποτε συνεργείο).
export async function POST(req: Request, ctx: { params: Promise<{ id: string; docId: string }> }) {
  const u = await requirePermission('projects.manage');
  const { id, docId } = await ctx.params;
  try {
    const input = body.parse(await req.json().catch(() => null));
    const result = await sendDocument(id, docId, input, { id: u.id, name: u.name, email: u.email });
    await logAudit({ userId: u.id, userEmail: u.email, action: 'contract.send', resource: 'contract', resourceId: id, metadata: { doc: docId, to: input.to, result } }).catch(() => null);
    if (result === 'failed') return NextResponse.json({ error: 'mail_failed', message: 'Η αποστολή απέτυχε — δοκιμάστε ξανά' }, { status: 502 });
    return NextResponse.json({ result, contract: await getContract(id) });
  } catch (e) { return fail(e); }
}
