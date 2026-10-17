import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { deleteOverheadRate, overheadRateInput, updateOverheadRate } from '@/lib/overheads';
import { refreshProjectFinancials } from '@/lib/project-profit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  await requirePermission('projects.financials');
  const u = await requirePermission('projects.manage');
  const { id } = await ctx.params;
  const parsed = overheadRateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  const rate = await updateOverheadRate(id, parsed.data).catch(() => null);
  if (!rate) return NextResponse.json({ error: 'not_found', message: 'Το ποσοστό δεν βρέθηκε' }, { status: 404 });
  await logAudit({ userId: u.id, userEmail: u.email, action: 'overhead.rate.update', resource: 'overhead_rate', resourceId: id, metadata: rate }).catch(() => null);
  await refreshProjectFinancials().catch(() => null);
  return NextResponse.json({ rate });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  await requirePermission('projects.financials');
  const u = await requirePermission('projects.manage');
  const { id } = await ctx.params;
  const rate = await deleteOverheadRate(id).catch(() => null);
  if (!rate) return NextResponse.json({ error: 'not_found', message: 'Το ποσοστό δεν βρέθηκε' }, { status: 404 });
  await logAudit({ userId: u.id, userEmail: u.email, action: 'overhead.rate.delete', resource: 'overhead_rate', resourceId: id, metadata: rate }).catch(() => null);
  await refreshProjectFinancials().catch(() => null);
  return NextResponse.json({ ok: true });
}
