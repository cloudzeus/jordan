import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { saveSampleFrames } from '@/lib/item-media/service';
import { badMtrl, mediaError, mtrlOf } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_FRAME = 6 * 1024 * 1024;

// POST multipart { frame (×N, JPEG), t (×N, δευτερόλεπτα) } — καρέ που τράβηξε ο browser από ένα
// βίντεο-δείγμα εγκατάστασης· χρησιμοποιούνται στο AI και στο PDF του οδηγού.
export async function POST(req: Request, { params }: { params: Promise<{ mtrl: string; id: string }> }) {
  await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll('frame') ?? []).filter((f): f is File => f instanceof File && f.size > 0 && f.size <= MAX_FRAME);
  const ts = (form?.getAll('t') ?? []).map((v) => Number(v));
  if (!files.length) return NextResponse.json({ error: 'no_frames', message: 'Δεν στάλθηκαν καρέ.' }, { status: 400 });
  try {
    const frames = await Promise.all(files.map(async (f, i) => ({ data: Buffer.from(await f.arrayBuffer()), t: ts[i] ?? 0 })));
    return NextResponse.json({ media: await saveSampleFrames(mtrl, id, frames) });
  } catch (e) {
    return mediaError(e);
  }
}
