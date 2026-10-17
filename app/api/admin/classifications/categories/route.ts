import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { categoryCreateInput, createCategory } from '@/lib/item-classifications';
import { classificationErrorResponse } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — νέα εμπορική κατηγορία στο SoftOne: { sodtype: 51|52, shortCode, name }.
export async function POST(req: Request) {
  const u = await requirePermission('metadata.manage');
  const parsed = categoryCreateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: 'invalid_input', message: i?.message ?? 'Μη έγκυρα στοιχεία', field: i?.path?.[0] ?? null }, { status: 400 });
  }
  try {
    const c = await createCategory(parsed.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'classification.category.create', resource: 'classification', resourceId: `${c.sodtype}:${c.code}`, metadata: { name: c.name, shortCode: c.shortCode } }).catch(() => null);
    return NextResponse.json({ category: c }, { status: 201 });
  } catch (e) { return classificationErrorResponse(e); }
}
