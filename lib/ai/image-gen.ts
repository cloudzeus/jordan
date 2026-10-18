// lib/ai/image-gen.ts — SERVER. Δημιουργία εικόνας με AI, πάνω στους ΙΔΙΟΥΣ παρόχους με το vision
// (lib/ai/vision-config): OpenRouter πρώτο, Google AI Studio εφεδρεία, με τα ίδια κλειδιά.
//
// Μοντέλο: `gemini-2.5-flash-image` («nano banana»), ρυθμίσιμο από `ai.imageModel`.
//  - OpenRouter: chat completions με `modalities: ['image','text']` → `message.images[].image_url.url`
//    (data URL)· επιβεβαιωμένο ζωντανά 2026-10-18 (~1.290 tokens εξόδου ανά εικόνα, ~0,04 $).
//  - Google: native `generateContent` με `responseModalities: ['IMAGE']` → `parts[].inlineData`·
//    το δωρεάν όριο του Google ΔΕΝ δίνει εικόνες (429), οπότε εκεί δουλεύει μόνο με χρέωση.
import 'server-only';
import { getSetting } from '@/lib/settings';
import { logAiUsage } from './usage';
import { acrossProviders, resolveVisionEndpoints } from './vision-config';
import { isGoogleAiStudio, providerHeaders, providerModel } from './vision-provider';

export const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';

export interface GeneratedImage { buffer: Buffer; mimeType: string; model: string; provider: string }
type Usage = { input: number; output: number; total: number };

/** `data:image/png;base64,…` → buffer + τύπος. */
export function parseDataUrl(url: string): { buffer: Buffer; mimeType: string } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(url.trim());
  return m ? { mimeType: m[1].toLowerCase(), buffer: Buffer.from(m[2], 'base64') } : null;
}

/** Η πρώτη εικόνα από απάντηση OpenRouter (OpenAI-compatible) — αλλιώς null. */
export function imageFromOpenRouter(json: unknown): { buffer: Buffer; mimeType: string; usage: Usage } | null {
  const d = json as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[]; usage?: Record<string, number> };
  for (const img of d?.choices?.[0]?.message?.images ?? []) {
    const parsed = img?.image_url?.url ? parseDataUrl(img.image_url.url) : null;
    if (parsed) {
      const u = d.usage ?? {};
      return { ...parsed, usage: { input: u.prompt_tokens ?? 0, output: u.completion_tokens ?? 0, total: u.total_tokens ?? 0 } };
    }
  }
  return null;
}

/** Η πρώτη εικόνα από native απάντηση Gemini (`inlineData` ή `inline_data`) — αλλιώς null. */
export function imageFromGemini(json: unknown): { buffer: Buffer; mimeType: string; usage: Usage } | null {
  type Part = { inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } };
  const d = json as { candidates?: { content?: { parts?: Part[] } }[]; usageMetadata?: Record<string, number> };
  for (const p of d?.candidates?.[0]?.content?.parts ?? []) {
    const data = p.inlineData?.data ?? p.inline_data?.data;
    const mimeType = p.inlineData?.mimeType ?? p.inline_data?.mime_type;
    if (data && mimeType?.startsWith('image/')) {
      const u = d.usageMetadata ?? {};
      return { buffer: Buffer.from(data, 'base64'), mimeType, usage: { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0, total: u.totalTokenCount ?? 0 } };
    }
  }
  return null;
}

const errText = async (res: Response) => (await res.text().catch(() => '')).slice(0, 300);

/** Μία εικόνα από κείμενο. Πετά Error με την απάντηση κάθε παρόχου αν όλοι αποτύχουν. */
export async function generateImage(prompt: string, opts: { operation: string; userId?: string | null; refType?: string; refId?: string }): Promise<GeneratedImage> {
  const [endpoints, modelSetting] = await Promise.all([resolveVisionEndpoints(), getSetting<string>('ai.imageModel')]);
  const baseModel = (modelSetting || DEFAULT_IMAGE_MODEL).trim();
  return acrossProviders(endpoints, async (e) => {
    if (!e.key) throw new Error('Δεν έχει ρυθμιστεί κλειδί AI (Ρυθμίσεις → AI)');
    const model = providerModel(baseModel, e.url);
    const started = Date.now();
    let out: ReturnType<typeof imageFromGemini>;
    let provider: string;
    if (isGoogleAiStudio(e.url)) {
      provider = 'gemini';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${e.key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
      });
      if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}: ${await errText(res)}`), { status: res.status });
      out = imageFromGemini(await res.json());
    } else {
      provider = 'openrouter';
      const res = await fetch(e.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.key}`, ...providerHeaders(e.url) },
        body: JSON.stringify({ model, modalities: ['image', 'text'], messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) throw Object.assign(new Error(`OpenRouter ${res.status}: ${await errText(res)}`), { status: res.status });
      out = imageFromOpenRouter(await res.json());
    }
    if (!out) throw new Error('Ο πάροχος δεν επέστρεψε εικόνα');
    void logAiUsage({
      scope: 'OTHER', provider, model, operation: opts.operation,
      inputTokens: out.usage.input, outputTokens: out.usage.output, totalTokens: out.usage.total,
      durationMs: Date.now() - started, userId: opts.userId ?? null, refType: opts.refType ?? null, refId: opts.refId ?? null,
    });
    return { buffer: out.buffer, mimeType: out.mimeType, model, provider };
  });
}
