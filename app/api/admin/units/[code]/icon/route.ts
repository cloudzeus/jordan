import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { MAX_ICON_BYTES, removeUnitIcon, setUnitIcon } from '@/lib/unit-icons';
import { unitErrorResponse } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const codeOf = async (ctx: { params: Promise<{ code: string }> }) => {
  const code = Number((await ctx.params).code);
  return Number.isInteger(code) && code > 0 ? code : null;
};

// POST (multipart, πεδίο `file`) — ανέβασμα εικονιδίου μονάδας. Μόνο στην εφαρμογή, όχι στο SoftOne.
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const u = await requirePermission('units.manage');
  const code = await codeOf(ctx);
  if (code == null) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  const file = (await req.formData().catch(() => null))?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'no_file', message: 'Δεν επιλέχθηκε αρχείο' }, { status: 400 });
  if (file.size > MAX_ICON_BYTES) return NextResponse.json({ error: 'too_large', message: 'Το εικονίδιο ξεπερνά τα 5 MB' }, { status: 413 });
  try {
    const res = await setUnitIcon(code, { buffer: Buffer.from(await file.arrayBuffer()), name: file.name, mimeType: file.type }, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'unit.icon.upload', resource: 'unit', resourceId: String(code), metadata: { mediaId: res.mediaId, name: file.name } }).catch(() => null);
    return NextResponse.json(res);
  } catch (e) { return unitErrorResponse(e); }
}

// DELETE — αφαίρεση εικονιδίου (επιστροφή στην αυτόματη μικρογραφία).
export async function DELETE(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const u = await requirePermission('units.manage');
  const code = await codeOf(ctx);
  if (code == null) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  try {
    await removeUnitIcon(code);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'unit.icon.remove', resource: 'unit', resourceId: String(code) }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return unitErrorResponse(e); }
}
