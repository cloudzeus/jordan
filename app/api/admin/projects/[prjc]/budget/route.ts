import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { addBudgetLine, budgetLineInput, BudgetError, listBudget } from '@/lib/project-budget';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prjcOf = async (ctx: { params: Promise<{ prjc: string }> }) => {
  const n = Number((await ctx.params).prjc);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// GET — οι γραμμές προϋπολογισμού του έργου (δικά μας δεδομένα, όχι SoftOne).
export async function GET(_req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  await requirePermission('metadata.read');
  const prjc = await prjcOf(ctx);
  if (!prjc) return NextResponse.json({ error: 'invalid_prjc' }, { status: 400 });
  return NextResponse.json({ lines: await listBudget(prjc) });
}

// POST — νέα γραμμή προϋπολογισμού: { mtrl, qty, unitPrice?, notes? }.
export async function POST(req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  const u = await requirePermission('metadata.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return NextResponse.json({ error: 'invalid_prjc' }, { status: 400 });

  const parsed = budgetLineInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  }
  try {
    const line = await addBudgetLine(prjc, parsed.data, u.id);
    await logAudit({
      userId: u.id, userEmail: u.email,
      action: 'project.budget.add', resource: 'project', resourceId: String(prjc),
      metadata: { lineId: line.id, mtrl: line.mtrl, qty: line.qty, unitPrice: line.unitPrice },
    }).catch(() => null);
    return NextResponse.json({ line }, { status: 201 });
  } catch (e) {
    if (e instanceof BudgetError) return NextResponse.json({ error: 'budget_error', message: e.message }, { status: e.status });
    throw e;
  }
}
