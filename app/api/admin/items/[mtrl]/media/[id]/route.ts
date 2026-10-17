import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { deleteMedia, rerenderImage, setPrimary } from '@/lib/item-media/service';
import { badMtrl, mediaError, mtrlOf } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Body = z.union([
  z.object({ primary: z.literal(true) }),
  z.object({ transform: z.record(z.string(), z.unknown()) }),
]);

// PATCH { primary: true } — ορισμός κύριας · { transform } — νέα παραγωγή του 1920×1920 από το πρωτότυπο.
export async function PATCH(req: Request, { params }: { params: Promise<{ mtrl: string; id: string }> }) {
  const u = await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: 'Μη έγκυρο αίτημα.' }, { status: 400 });
  try {
    if ('primary' in parsed.data) {
      await setPrimary(mtrl, id);
      await logAudit({ userId: u.id, userEmail: u.email, action: 'item.media.primary', resource: 'softone_item', resourceId: String(mtrl), metadata: { mediaId: id } }).catch(() => null);
      return NextResponse.json({ ok: true });
    }
    const media = await rerenderImage(mtrl, id, parsed.data.transform);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'item.media.edit', resource: 'softone_item', resourceId: String(mtrl), metadata: { mediaId: id, transform: media.transform } }).catch(() => null);
    return NextResponse.json({ media });
  } catch (e) {
    return mediaError(e);
  }
}

// DELETE — αφαίρεση αρχείου (βάση + Bunny). Αν ήταν η κύρια, κύρια γίνεται η επόμενη.
export async function DELETE(_req: Request, { params }: { params: Promise<{ mtrl: string; id: string }> }) {
  const u = await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  const { id } = await params;
  try {
    const m = await deleteMedia(mtrl, id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'item.media.delete', resource: 'softone_item', resourceId: String(mtrl), metadata: { mediaId: id, kind: m.kind, name: m.originalName } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mediaError(e);
  }
}
