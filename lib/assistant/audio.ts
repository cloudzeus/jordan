// lib/assistant/audio.ts — ΚΑΘΑΡΟ. Μορφές ήχου και ανάγνωση της απάντησης μεταγραφής.

const AUDIO_FORMATS = ['webm', 'mp4', 'wav', 'mp3', 'ogg', 'm4a', 'aac', 'flac'] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

/** `audio/webm;codecs=opus` → `webm`, `audio/x-m4a` → `m4a`· άγνωστο → null. */
export function audioFormatOf(mime: string): AudioFormat | null {
  const m = mime.toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('m4a')) return 'm4a';
  if (m.includes('mp4') || m.includes('aac')) return 'mp4';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.includes('flac')) return 'flac';
  return null;
}

/** Η απάντηση του STT ({"speech", "text"}) → κείμενο· κενό όταν δεν ακούστηκε ομιλία. Ανέχεται ```json … ```. */
export function parseTranscript(raw: string): string {
  const body = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const v = JSON.parse(body) as { speech?: unknown; text?: unknown };
    if (v.speech === false) return '';
    return typeof v.text === 'string' ? v.text.trim() : '';
  } catch {
    // Όχι JSON: κράτα το σκέτο κείμενο (χωρίς εισαγωγικά).
    return body.replace(/^["«]|["»]$/g, '').trim();
  }
}
