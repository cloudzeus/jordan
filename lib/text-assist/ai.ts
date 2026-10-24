// lib/text-assist/ai.ts — SERVER. AI μορφοποίηση κειμένου πεδίου (OpenRouter πρώτο, Google εφεδρεία —
// ίδιοι πάροχοι με το vision). Μοντέλο: ρύθμιση `ai.textAssistModel` (προεπιλογή gemini-2.5-flash:
// γρήγορο, καλά Ελληνικά — ο χρήστης περιμένει μπροστά στη φόρμα).
import 'server-only';
import { getSetting } from '@/lib/settings';
import { logAiUsage, providerFromUrl } from '@/lib/ai/usage';
import { acrossProviders, resolveVisionEndpoints } from '@/lib/ai/vision-config';
import { isGoogleAiStudio, providerHeaders, providerModel } from '@/lib/ai/vision-provider';
import { buildFormatPrompt, cleanFormatted, type FormatRequest } from './core';

export const DEFAULT_TEXT_ASSIST_MODEL = 'gemini-2.5-flash';

export async function formatFieldText(req: FormatRequest, ctx: { userId: string | null }): Promise<{ text: string; model: string }> {
  const [endpoints, modelSetting] = await Promise.all([resolveVisionEndpoints(), getSetting<string>('ai.textAssistModel')]);
  const base = (modelSetting || DEFAULT_TEXT_ASSIST_MODEL).trim();
  const { system, user } = buildFormatPrompt(req);
  return acrossProviders(endpoints, async (e) => {
    if (!e.key) throw new Error('Δεν έχει ρυθμιστεί κλειδί AI (Ρυθμίσεις → AI)');
    const model = providerModel(base, e.url);
    const started = Date.now();
    const res = await fetch(e.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.key}`, ...providerHeaders(e.url) },
      body: JSON.stringify({
        model, temperature: 0.2,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        ...(isGoogleAiStudio(e.url) ? {} : { usage: { include: true } }),
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw Object.assign(new Error(`${providerFromUrl(e.url)} ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`), { status: res.status });
    const j = await res.json();
    const u = j?.usage ?? {};
    void logAiUsage({
      scope: 'OTHER', provider: providerFromUrl(e.url), model: String(j?.model ?? model), operation: 'text-assist.format',
      inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? 0,
      costUsd: typeof u.cost === 'number' ? u.cost : null,
      durationMs: Date.now() - started, userId: ctx.userId,
    });
    const raw = j?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('Ο πάροχος δεν επέστρεψε κείμενο');
    return { text: cleanFormatted(raw), model: String(j?.model ?? model) };
  });
}
