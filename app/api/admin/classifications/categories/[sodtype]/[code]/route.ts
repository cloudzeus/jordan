import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { categoryUpdateInput, updateCategory } from '@/lib/item-classifications';
import { classificationErrorResponse } from '../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH — μετονομασία / σύντμηση / (απ)ενεργοποίηση κατηγορίας στο SoftOne.
export async function PATCH(req: Request, ctx: { params: Promise<{ sodtype: string; code: string }> }) {
  const u = await requirePermission('metadata.manage');
  const p = await ctx.params;
  const sodtype = Number(p.sodtype);
  const code = Number(p.code);
  if (![51, 52].includes(sodtype) || !Number.isInteger(code)) return NextResponse.json({ error: 'invalid_key' }, { status: 400 });
  const parsed = categoryUpdateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: 'invalid_input', message: i?.message ?? 'Μη έγκυρα στοιχεία', field: i?.path?.[0] ?? null }, { status: 400 });
  }
  try {
    const c = await updateCategory(sodtype, code, parsed.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'classification.category.update', resource: 'classification', resourceId: `${sodtype}:${code}`, metadata: parsed.data }).catch(() => null);
    return NextResponse.json({ category: c });
  } catch (e) { return classificationErrorResponse(e); }
}
