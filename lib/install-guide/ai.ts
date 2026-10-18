// lib/install-guide/ai.ts — SERVER. Απομαγνητοφώνηση + σύνταξη οδηγού πάνω στους ΙΔΙΟΥΣ παρόχους
// με το vision (lib/ai/vision-config): OpenRouter πρώτο, Google AI Studio εφεδρεία.
//
// Επιβεβαιωμένο ζωντανά (OpenRouter, 2026-10-18): `google/gemini-2.5-flash` με `input_audio`
// (wav) δίνει ελληνική απομαγνητοφώνηση κατά λέξη σε ~2s, ~0,0004 $ για 8s ομιλίας.
import 'server-only';
import { getSetting } from '@/lib/settings';
import { logAiUsage, providerFromUrl } from '@/lib/ai/usage';
import { acrossProviders, resolveVisionEndpoints } from '@/lib/ai/vision-config';
import { isGoogleAiStudio, providerHeaders, providerModel } from '@/lib/ai/vision-provider';

export const DEFAULT_GUIDE_MODEL = 'gemini-2.5-flash';
export const DEFAULT_STT_MODEL = 'gemini-2.5-flash';

const AUDIO_FORMATS = ['webm', 'mp4', 'wav', 'mp3', 'ogg', 'm4a', 'aac', 'flac'] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

/** `audio/webm;codecs=opus` → `webm`, `audio/x-m4a` → `m4a`. */
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

type Ctx = { userId?: string | null; mtrl: number };
type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } } | { type: 'input_audio'; input_audio: { data: string; format: string } };

/** Μία κλήση chat completions (OpenAI-compatible) σε όλους τους παρόχους με τη σειρά. */
async function complete(opts: {
  modelSetting: string; defaultModel: string; operation: string; ctx: Ctx;
  messages: { role: 'system' | 'user'; content: string | Part[] }[];
  json?: boolean; temperature?: number;
}): Promise<{ text: string; model: string; provider: string }> {
  const [endpoints, modelSetting] = await Promise.all([resolveVisionEndpoints(), getSetting<string>(opts.modelSetting)]);
  const base = (modelSetting || opts.defaultModel).trim();
  return acrossProviders(endpoints, async (e) => {
    if (!e.key) throw new Error('Δεν έχει ρυθμιστεί κλειδί AI (Ρυθμίσεις → AI)');
    const model = providerModel(base, e.url);
    const started = Date.now();
    const res = await fetch(e.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.key}`, ...providerHeaders(e.url) },
      body: JSON.stringify({
        model, messages: opts.messages, temperature: opts.temperature ?? 0.2,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        ...(isGoogleAiStudio(e.url) ? {} : { usage: { include: true } }),
      }),
    });
    if (!res.ok) throw Object.assign(new Error(`${providerFromUrl(e.url)} ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`), { status: res.status });
    const j = await res.json();
    const u = j?.usage ?? {};
    const provider = providerFromUrl(e.url);
    void logAiUsage({
      scope: 'OTHER', provider, model: String(j?.model ?? model), operation: opts.operation,
      inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? 0,
      durationMs: Date.now() - started, userId: opts.ctx.userId ?? null, refType: 'SoftoneItem', refId: String(opts.ctx.mtrl),
    });
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('Ο πάροχος δεν επέστρεψε κείμενο');
    return { text, model, provider };
  });
}

/** Απομαγνητοφώνηση ελληνικής ομιλίας οδηγιών εγκατάστασης. `vocabulary`: όροι που ίσως ακουστούν. */
export async function transcribeInstallAudio(audio: Buffer, format: AudioFormat, ctx: Ctx & { vocabulary?: string[] }): Promise<string> {
  const vocab = (ctx.vocabulary ?? []).filter(Boolean).slice(0, 60).join(', ');
  const prompt = [
    'Απομαγνητοφώνησε την ομιλία ΚΑΤΑ ΛΕΞΗ. Γλώσσα: Ελληνικά, με τεχνικούς όρους οικοδομής/εγκατάστασης.',
    'Αγγλικές λέξεις, μάρκες και ονόματα προϊόντων με λατινικούς χαρακτήρες όπως συνηθίζονται· αριθμοί και διαστάσεις με ψηφία (π.χ. 60x120, 3 mm).',
    'Βάλε σημεία στίξης και παραγράφους όπου αλλάζει θέμα. Επέστρεψε ΜΟΝΟ το κείμενο — χωρίς σχόλια. Αν δεν ακούγεται ομιλία, επέστρεψε κενό.',
    'ΜΗΝ προσθέτεις τίποτα που δεν ειπώθηκε — ούτε τίτλο, ούτε το όνομα του είδους.',
    vocab ? `Ορθογραφία όρων ΑΝ ακουστούν (μόνο για σωστή γραφή — μην τους γράψεις αν δεν ειπώθηκαν): ${vocab}` : '',
  ].filter(Boolean).join('\n');
  const { text } = await complete({
    modelSetting: 'ai.installSttModel', defaultModel: DEFAULT_STT_MODEL, operation: 'install-guide.stt', ctx, temperature: 0,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'input_audio', input_audio: { data: audio.toString('base64'), format } }] }],
  });
  return text.trim().replace(/^["«]|["»]$/g, '');
}

/** Σύνταξη οδηγού: κείμενο + εικόνες-δείγματα (data URLs JPEG) → JSON κείμενο. */
export async function composeGuide(prompt: { system: string; user: string }, images: string[], ctx: Ctx): Promise<{ text: string; model: string; provider: string }> {
  return complete({
    modelSetting: 'ai.installGuideModel', defaultModel: DEFAULT_GUIDE_MODEL, operation: 'install-guide.compose', ctx, json: true, temperature: 0.3,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: [{ type: 'text', text: prompt.user }, ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))] },
    ],
  });
}
