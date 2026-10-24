import { NextResponse } from 'next/server';
import { requireTextAssistApi } from '@/lib/text-assist/access';
import { audioFormatOf, transcribe } from '@/lib/assistant/openrouter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // ~4 λεπτά ομιλίας σε opus

// POST multipart (πεδίο `audio`) → { text }. Υπαγόρευση σε πεδία φορμών· ο ήχος δεν αποθηκεύεται.
export async function POST(req: Request) {
  const u = await requireTextAssistApi();
  if (u instanceof NextResponse) return u;
  const file = (await req.formData().catch(() => null))?.get('audio');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'no_audio', message: 'Δεν ελήφθη ήχος' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'too_large', message: 'Η ηχογράφηση είναι πολύ μεγάλη' }, { status: 413 });
  const format = audioFormatOf(file.type || 'audio/webm');
  if (!format) return NextResponse.json({ error: 'format', message: `Μη υποστηριζόμενη μορφή ήχου (${file.type})` }, { status: 415 });
  try {
    const { text } = await transcribe(Buffer.from(await file.arrayBuffer()), format, { userId: u.id });
    return NextResponse.json({ text });
  } catch (e) {
    console.error('text-assist transcribe failed', e);
    return NextResponse.json({ error: 'stt_failed', message: 'Η μεταγραφή απέτυχε' }, { status: 502 });
  }
}
