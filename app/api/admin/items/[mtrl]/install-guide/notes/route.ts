import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { addAudioNote, addTextNote } from '@/lib/install-guide/service';
import { badMtrl, mediaError, mtrlOf } from '../../media/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const TextBody = z.object({ transcript: z.string().trim().min(1, 'Γράψε κάποιο κείμενο').max(20000) });

// POST multipart { audio, durationSec } → ηχογράφηση + απομαγνητοφώνηση ·
// POST JSON { transcript } → σημείωση γραμμένη με το χέρι.
export async function POST(req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  const u = await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  try {
    if ((req.headers.get('content-type') ?? '').includes('application/json')) {
      const parsed = TextBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρο κείμενο' }, { status: 400 });
      return NextResponse.json({ note: await addTextNote(mtrl, parsed.data.transcript, u.id), error: null }, { status: 201 });
    }
    const form = await req.formData().catch(() => null);
    const file = form?.get('audio');
    if (!(file instanceof File)) return NextResponse.json({ error: 'no_audio', message: 'Δεν στάλθηκε ήχος.' }, { status: 400 });
    const dur = Number(form?.get('durationSec'));
    const r = await addAudioNote({
      mtrl, audio: Buffer.from(await file.arrayBuffer()), mimeType: file.type || 'audio/webm',
      durationSec: Number.isFinite(dur) && dur > 0 ? dur : null, userId: u.id,
    });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return mediaError(e);
  }
}
