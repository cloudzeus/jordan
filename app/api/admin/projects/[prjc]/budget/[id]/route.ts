import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { BudgetError, deleteBudgetLine } from '@/lib/project-budget';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE — αφαίρεση γραμμής προϋπολογισμού (μόνο δικά μας δεδομένα· το SoftOne δεν αγγίζεται).
export async function DELETE(_req: Request, ctx: { params: Promise<{ prjc: string; id: string }> }) {
  const u = await requirePermission('metadata.manage');
  const { prjc: raw, id } = await ctx.params;
  const prjc = Number(raw);
  if (!Number.isInteger(prjc) || prjc <= 0) return NextResponse.json({ error: 'invalid_prjc' }, { status: 400 });
  try {
    const line = await deleteBudgetLine(prjc, id);
    await logAudit({
      userId: u.id, userEmail: u.email,
      action: 'project.budget.delete', resource: 'project', resourceId: String(prjc),
      metadata: { lineId: line.id, mtrl: line.mtrl, name: line.name, qty: line.qty, unitPrice: line.unitPrice },
    }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof BudgetError) return NextResponse.json({ error: 'budget_error', message: e.message }, { status: e.status });
    throw e;
  }
}
