import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { unitUpdateInput, updateUnit } from '@/lib/units';
import { invalid, unitErrorResponse } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH — αλλαγή στοιχείων / (απ)ενεργοποίηση μονάδας στο SoftOne.
export async function PATCH(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const u = await requirePermission('units.manage');
  const code = Number((await ctx.params).code);
  if (!Number.isInteger(code) || code <= 0) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  const parsed = unitUpdateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    const unit = await updateUnit(code, parsed.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'unit.update', resource: 'unit', resourceId: String(code), metadata: parsed.data }).catch(() => null);
    return NextResponse.json({ unit });
  } catch (e) { return unitErrorResponse(e); }
}
