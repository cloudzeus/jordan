import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { attributesInput, listAttributes, replaceAttributes } from '@/lib/item-attributes';
import { badMtrl, mtrlOf } from '../media/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — τα χαρακτηριστικά του είδους (δικά μας δεδομένα, όχι SoftOne).
export async function GET(_req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  await requirePermission('metadata.read');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  return NextResponse.json({ attributes: await listAttributes(mtrl) });
}

// PUT { attributes: [{ name, value, unit? }] } — αντικατάσταση όλου του συνόλου.
export async function PUT(req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  const u = await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  const parsed = attributesInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  try {
    const attributes = await replaceAttributes(mtrl, parsed.data.attributes);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'item.attributes.update', resource: 'softone_item', resourceId: String(mtrl), metadata: { count: attributes.length } }).catch(() => null);
    return NextResponse.json({ attributes });
  } catch (e) {
    return NextResponse.json({ error: 'invalid_input', message: (e as Error).message }, { status: 400 });
  }
}
