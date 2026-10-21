import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { setRfpStatus } from '@/lib/rfp/service';
import { rfpFail } from '@/lib/rfp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { status: CLOSED | CANCELLED | OPEN } — κλείσιμο/ακύρωση/ξανά άνοιγμα (όχι μετά την ανάθεση).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requirePermission('projects.manage');
  const id = (await ctx.params).id;
  try {
    const { status } = z.object({ status: z.enum(['CLOSED', 'CANCELLED', 'OPEN']) }).parse(await req.json().catch(() => null));
    await setRfpStatus(id, status);
    await logAudit({ userId: u.id, userEmail: u.email, action: `rfp.${status.toLowerCase()}`, resource: 'rfp', resourceId: id }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return rfpFail(e); }
}
