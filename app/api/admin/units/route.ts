import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { createUnit, listUnits, unitCreateInput } from '@/lib/units';
import { invalid, unitErrorResponse } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — μονάδες μέτρησης (καθρέφτης) με πλήθος ειδών που τις χρησιμοποιούν.
export async function GET() {
  await requirePermission('metadata.read');
  return NextResponse.json(await listUnits());
}

// POST — νέα μονάδα στο SoftOne: { shortcut, name, interCode?, decimals, myDataCode }.
export async function POST(req: Request) {
  const u = await requirePermission('metadata.manage');
  const parsed = unitCreateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    const unit = await createUnit(parsed.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'unit.create', resource: 'unit', resourceId: String(unit.code), metadata: { shortcut: unit.shortcut, name: unit.name } }).catch(() => null);
    return NextResponse.json({ unit }, { status: 201 });
  } catch (e) { return unitErrorResponse(e); }
}
