import 'server-only';
import { getSetting } from '@/lib/settings';
import { logAiUsage, providerFromUrl } from '@/lib/ai/usage';
import { acrossProviders, resolveVisionEndpoints } from '@/lib/ai/vision-config';
import { isGoogleAiStudio, providerHeaders, providerModel } from '@/lib/ai/vision-provider';
import { FLOORPLAN_AI_PROMPT, FLOORPLAN_WALLS_PROMPT, parseAiResponse, parseAiWallsResponse, type AiResponse, type AiWallsResponse } from './ai-core';

// «Αναγνώριση χώρων με AI»: η εικόνα της κάτοψης πάει στο vision μοντέλο (ίδιοι πάροχοι με το OCR:
// OpenRouter πρώτο, Google εφεδρεία) και επιστρέφονται ονόματα/σημεία/πλαίσια/κλίμακα — τα
// περιγράμματα τα χαράζει ο browser. Το κόστος καταγράφεται στη χρήση AI.

const MAX_BYTES = 8 * 1024 * 1024;
// Σε δοκιμή σε πραγματική κάτοψη (12 χώροι, διαστάσεις σε cm): Claude Sonnet 5.5 — 8″, σωστά ονόματα,
// 7/8 διαστάσεις, σωστή κλίμακα· Gemini 3.8 Flash ίδια ακρίβεια σε ~40″. Στο Google AI Studio (εφεδρεία)
// δεν υπάρχει Claude, οπότε εκεί πάμε σε Gemini.
export const DEFAULT_FLOORPLAN_MODEL = 'anthropic/claude-sonnet-5.5';
const GOOGLE_FALLBACK_MODEL = 'gemini-3.8-flash';

export class FloorPlanAiError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function detectRooms(image: File, user: { id: string }, ref: { type: 'Project' | 'Trader' | 'Prospect'; id: number }): Promise<AiResponse & { model: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(image.type)) throw new FloorPlanAiError('Η εικόνα πρέπει να είναι JPG, PNG ή WebP');
  if (image.size > MAX_BYTES) throw new FloorPlanAiError('Η εικόνα είναι πολύ μεγάλη');
  const dataUrl = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}`;
  const wanted = ((await getSetting<string>('ai.floorPlanModel')) || DEFAULT_FLOORPLAN_MODEL).trim();
  const endpoints = await resolveVisionEndpoints();

  return acrossProviders(endpoints, async (e) => {
    if (!e.key) throw new FloorPlanAiError('Δεν έχει ρυθμιστεί κλειδί vision (Ρυθμίσεις → AI)', 503);
    const model = providerModel(isGoogleAiStudio(e.url) && !/gemini/i.test(wanted) ? GOOGLE_FALLBACK_MODEL : wanted, e.url);
    const started = Date.now();
    const res = await fetch(e.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${e.key}`, 'Content-Type': 'application/json', ...providerHeaders(e.url) },
      body: JSON.stringify({
        model, temperature: 0, response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [{ type: 'text', text: FLOORPLAN_AI_PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const body = await res.json().catch(() => null) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number }; error?: { message?: string } } | null;
    if (!res.ok) throw new Error(`${res.status} ${body?.error?.message ?? 'σφάλμα παρόχου'}`);
    const u = body?.usage ?? {};
    void logAiUsage({
      scope: 'OTHER', provider: providerFromUrl(e.url), model, operation: 'floorplan.detect',
      inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? 0,
      costUsd: typeof u.cost === 'number' ? u.cost : null, durationMs: Date.now() - started,
      userId: user.id, refType: ref.type, refId: String(ref.id),
    });
    const parsed = parseAiResponse(body?.choices?.[0]?.message?.content ?? '');
    if (!parsed.rooms.length) throw new FloorPlanAiError('Το μοντέλο δεν βρήκε χώρους στην εικόνα', 422);
    return { ...parsed, model };
  });
}

/** Κοινή κλήση vision: εικόνα + prompt → κείμενο απάντησης (OpenRouter πρώτο, Google εφεδρεία). */
async function callVision(image: File, prompt: string, operation: string, user: { id: string }, ref: { type: 'Project' | 'Trader' | 'Prospect'; id: number }): Promise<{ content: string; model: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(image.type)) throw new FloorPlanAiError('Η εικόνα πρέπει να είναι JPG, PNG ή WebP');
  if (image.size > MAX_BYTES) throw new FloorPlanAiError('Η εικόνα είναι πολύ μεγάλη');
  const dataUrl = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}`;
  const wanted = ((await getSetting<string>('ai.floorPlanModel')) || DEFAULT_FLOORPLAN_MODEL).trim();
  const endpoints = await resolveVisionEndpoints();
  return acrossProviders(endpoints, async (e) => {
    if (!e.key) throw new FloorPlanAiError('Δεν έχει ρυθμιστεί κλειδί vision (Ρυθμίσεις → AI)', 503);
    const model = providerModel(isGoogleAiStudio(e.url) && !/gemini/i.test(wanted) ? GOOGLE_FALLBACK_MODEL : wanted, e.url);
    const started = Date.now();
    const res = await fetch(e.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${e.key}`, 'Content-Type': 'application/json', ...providerHeaders(e.url) },
      body: JSON.stringify({
        model, temperature: 0, response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const body = await res.json().catch(() => null) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number }; error?: { message?: string } } | null;
    if (!res.ok) throw new Error(`${res.status} ${body?.error?.message ?? 'σφάλμα παρόχου'}`);
    const u = body?.usage ?? {};
    void logAiUsage({
      scope: 'OTHER', provider: providerFromUrl(e.url), model, operation,
      inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? 0,
      costUsd: typeof u.cost === 'number' ? u.cost : null, durationMs: Date.now() - started,
      userId: user.id, refType: ref.type, refId: String(ref.id),
    });
    return { content: body?.choices?.[0]?.message?.content ?? '', model };
  });
}

/** Ανίχνευση ΤΟΙΧΩΝ με vision (οι τοίχοι ορίζουν τους χώρους) — για vector/scan/εικόνα. */
export async function detectStructure(image: File, user: { id: string }, ref: { type: 'Project' | 'Trader' | 'Prospect'; id: number }): Promise<AiWallsResponse & { model: string }> {
  const { content, model } = await callVision(image, FLOORPLAN_WALLS_PROMPT, 'floorplan.walls', user, ref);
  const parsed = parseAiWallsResponse(content);
  if (!parsed.walls.length) throw new FloorPlanAiError('Το μοντέλο δεν βρήκε τοίχους στην εικόνα', 422);
  return { ...parsed, model };
}
