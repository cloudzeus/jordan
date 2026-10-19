// lib/contracts/ai.ts — SERVER. Σύνταξη σύμβασης/προσφοράς μέσω OpenRouter (ίδιοι πάροχοι με το
// vision: OpenRouter πρώτο, Google AI Studio εφεδρεία). Το μοντέλο ορίζεται στη ρύθμιση
// `ai.contractModel` (προεπιλογή gemini-2.5-pro — καλά Ελληνικά και μακρύ, δομημένο κείμενο).
import 'server-only';
import { getSetting } from '@/lib/settings';
import { logAiUsage, providerFromUrl } from '@/lib/ai/usage';
import { acrossProviders, resolveVisionEndpoints } from '@/lib/ai/vision-config';
import { isGoogleAiStudio, providerHeaders, providerModel } from '@/lib/ai/vision-provider';
import { buildPrompt, needsInstallation, parseContractDoc, DocParseError, type ContractDoc, type PromptInput } from './core';

export const DEFAULT_CONTRACT_MODEL = 'gemini-2.5-pro';

async function complete(system: string, user: string, ctx: { userId: string | null; contractId: string }): Promise<{ text: string; model: string }> {
  const [endpoints, modelSetting] = await Promise.all([resolveVisionEndpoints(), getSetting<string>('ai.contractModel')]);
  const base = (modelSetting || DEFAULT_CONTRACT_MODEL).trim();
  return acrossProviders(endpoints, async (e) => {
    if (!e.key) throw new Error('Δεν έχει ρυθμιστεί κλειδί AI (Ρυθμίσεις → AI)');
    const model = providerModel(base, e.url);
    const started = Date.now();
    const res = await fetch(e.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.key}`, ...providerHeaders(e.url) },
      body: JSON.stringify({
        model, temperature: 0.35, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        ...(isGoogleAiStudio(e.url) ? {} : { usage: { include: true } }),
      }),
      signal: AbortSignal.timeout(170_000),
    });
    if (!res.ok) throw Object.assign(new Error(`${providerFromUrl(e.url)} ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`), { status: res.status });
    const j = await res.json();
    const u = j?.usage ?? {};
    void logAiUsage({
      scope: 'OTHER', provider: providerFromUrl(e.url), model: String(j?.model ?? model), operation: 'contracts.compose',
      inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? 0,
      costUsd: typeof u.cost === 'number' ? u.cost : null,
      durationMs: Date.now() - started, userId: ctx.userId, refType: 'Contract', refId: ctx.contractId,
    });
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('Ο πάροχος δεν επέστρεψε κείμενο');
    return { text, model: String(j?.model ?? model) };
  });
}

/** Σύνταξη εγγράφου. Μία επανάληψη αν το JSON βγει άκυρο ή ελλιπές. */
export async function composeContractDoc(p: PromptInput, ctx: { userId: string | null; contractId: string }): Promise<{ doc: ContractDoc; model: string }> {
  const { system, user } = buildPrompt(p);
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, model } = await complete(system, attempt ? `${user}\n\nΠΡΟΣΟΧΗ: η προηγούμενη απάντηση δεν ήταν πλήρης. Δώσε ΟΛΟ το JSON.` : user, ctx);
    try {
      return { doc: parseContractDoc(text, { needsInstallation: needsInstallation(p) }), model };
    } catch (e) {
      if (!(e instanceof DocParseError)) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error('Αποτυχία σύνταξης');
}
