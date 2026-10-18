import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { listItemMedia, uploadItemMedia } from '@/lib/item-media/service';
import { badMtrl, mediaError, mtrlOf } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GET — φωτογραφίες, βίντεο, πανοράματα και αρχεία (PDF) του είδους.
export async function GET(_req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  await requirePermission('metadata.read');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  return NextResponse.json({ media: await listItemMedia(mtrl) });
}

// POST multipart { file, kind: IMAGE|VIDEO|PANORAMA|DOCUMENT } — ΕΝΑ αρχείο ανά αίτημα (η πρόοδος
// μετριέται ανά αρχείο στον browser).
export async function POST(req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  const u = await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const kind = String(form?.get('kind') ?? 'IMAGE');
  if (!(file instanceof File)) return NextResponse.json({ error: 'no_file', message: 'Δεν στάλθηκε αρχείο.' }, { status: 400 });
  if (kind !== 'IMAGE' && kind !== 'VIDEO' && kind !== 'PANORAMA' && kind !== 'DOCUMENT') return NextResponse.json({ error: 'bad_kind', message: 'Άγνωστος τύπος.' }, { status: 400 });
  try {
    const media = await uploadItemMedia({
      mtrl, kind, buffer: Buffer.from(await file.arrayBuffer()), name: file.name, mimeType: file.type, userId: u.id,
    });
    await logAudit({
      userId: u.id, userEmail: u.email, action: 'item.media.upload', resource: 'softone_item', resourceId: String(mtrl),
      metadata: { mediaId: media.id, kind, name: media.name, size: media.size },
    }).catch(() => null);
    return NextResponse.json({ media }, { status: 201 });
  } catch (e) {
    return mediaError(e);
  }
}
