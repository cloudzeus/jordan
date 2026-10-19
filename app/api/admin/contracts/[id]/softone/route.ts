import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { copyDocsToProject } from '@/lib/contracts/documents';
import { createPrjc, prjcPlan } from '@/lib/contracts/softone';
import { getContract, linkProject } from '@/lib/contracts/service';
import { fail, idOf } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const body = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('link'), prjc: z.coerce.number().int().positive() }),
  // Χωρίς confirm → μόνο προεπισκόπηση (dry-run). Με confirm + code → ΕΓΓΡΑΦΗ στο SoftOne.
  z.object({ mode: z.literal('create'), confirm: z.boolean().default(false), code: z.string().max(32).optional() }),
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requirePermission('projects.manage');
  const id = await idOf(ctx);
  const user = { id: u.id, name: u.name, email: u.email };
  try {
    const b = body.parse(await req.json().catch(() => null));
    if (b.mode === 'link') {
      await linkProject(id, b.prjc, u.id);
      const copied = await copyDocsToProject(id, user);
      await logAudit({ userId: u.id, userEmail: u.email, action: 'contract.link_project', resource: 'contract', resourceId: id, metadata: { prjc: b.prjc, copied } }).catch(() => null);
      return NextResponse.json({ contract: await getContract(id) });
    }
    if (!b.confirm || !b.code) {
      const plan = await prjcPlan(id);
      return NextResponse.json({ dryRun: true, code: plan.code, payload: { service: 'setData', ...plan.payload } });
    }
    const created = await createPrjc(id, b.code, u.id);
    const copied = await copyDocsToProject(id, user);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'contract.softone_create_prjc', resource: 'contract', resourceId: id, metadata: { ...created, copied } }).catch(() => null);
    return NextResponse.json({ created, contract: await getContract(id) });
  } catch (e) { return fail(e); }
}
