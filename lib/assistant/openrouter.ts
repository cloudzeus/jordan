// lib/assistant/openrouter.ts — SERVER. Air Jordan ↔ OpenRouter: συνομιλία με εργαλεία, embeddings,
// μεταγραφή φωνής. Ένα κλειδί (Ρυθμίσεις → AI → OpenRouter API Key ή OPENROUTER_API_KEY).
//
// Επιβεβαιωμένο ζωντανά (2026-10-18):
//  - `openrouter/auto` δρομολογεί κάθε ερώτημα σε κατάλληλο μοντέλο και υποστηρίζει tool calling·
//  - `/embeddings` με `openai/text-embedding-3-small` → 1536 διαστάσεις (pgvector)·
//  - `input_audio` (webm/mp4/wav/mp3/ogg) σε `google/gemini-2.5-flash` → ελληνική μεταγραφή ~2s.
// Κάθε κλήση γράφεται στο AiUsage (scope ASSISTANT) με το ΠΡΑΓΜΑΤΙΚΟ κόστος (`usage.cost`).
import 'server-only';
import { getSetting } from '@/lib/settings';
import { logAiUsage } from '@/lib/ai/usage';
import { OPENROUTER_URL } from '@/lib/ai/vision-provider';
import { parseTranscript, type AudioFormat } from './audio';

export { audioFormatOf, type AudioFormat } from './audio';

const EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
export const EMBEDDING_DIMS = 1536;
export const DEFAULT_CHAT_MODEL = 'openrouter/auto';
export const DEFAULT_FALLBACK_MODEL = 'google/gemini-2.5-flash';
export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const DEFAULT_STT_MODEL = 'google/gemini-2.5-flash';

export class AssistantConfigError extends Error {}

async function apiKey(): Promise<string> {
  const k = ((await getSetting<string>('ai.openrouterApiKey')) || process.env.OPENROUTER_API_KEY || '').trim();
  if (!k) throw new AssistantConfigError('Δεν έχει ρυθμιστεί κλειδί OpenRouter (Ρυθμίσεις → AI)');
  return k;
}

const headers = (key: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${key}`,
  'X-Title': 'Air Jordan (ATELIER)',
});

async function setting(key: string, def: string): Promise<string> {
  return ((await getSetting<string>(key)) || def).trim();
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ToolDef { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
  /** Το μοντέλο που απάντησε (με το auto: αυτό που διάλεξε το OpenRouter). */
  model: string;
  costUsd: number;
}

type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };

function logUsage(model: string, operation: string, u: Usage, started: number, userId?: string | null, refId?: string | null) {
  void logAiUsage({
    scope: 'ASSISTANT', provider: 'openrouter', model, operation,
    inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? 0,
    costUsd: typeof u.cost === 'number' ? u.cost : null,
    durationMs: Date.now() - started, userId: userId ?? null, refType: refId ? 'AssistantConversation' : null, refId: refId ?? null,
  });
}

/** Μία κλήση συνομιλίας. Με αποτυχία του κύριου μοντέλου δοκιμάζει το εφεδρικό. */
export async function chat(
  messages: ChatMessage[],
  opts: { tools?: ToolDef[]; userId?: string | null; conversationId?: string | null; signal?: AbortSignal } = {},
): Promise<ChatResult> {
  const key = await apiKey();
  const primary = await setting('ai.assistantModel', DEFAULT_CHAT_MODEL);
  const fallback = await setting('ai.assistantFallbackModel', DEFAULT_FALLBACK_MODEL);
  const models = [...new Set([primary, fallback].filter(Boolean))];
  let lastErr: unknown = null;
  for (const model of models) {
    const started = Date.now();
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages,
          ...(opts.tools?.length ? { tools: opts.tools, tool_choice: 'auto' } : {}),
          usage: { include: true },
        }),
        signal: opts.signal,
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
      const j = await res.json();
      const msg = j?.choices?.[0]?.message ?? {};
      const used = String(j?.model ?? model);
      logUsage(used, 'assistant.chat', j?.usage ?? {}, started, opts.userId, opts.conversationId);
      return {
        content: typeof msg.content === 'string' ? msg.content : null,
        toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
        model: used,
        costUsd: Number(j?.usage?.cost) || 0,
      };
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Αποτυχία κλήσης AI');
}

/** Embeddings για πολλά κείμενα (σε παρτίδες). Η σειρά διατηρείται. */
export async function embed(texts: string[], opts: { operation?: string; userId?: string | null } = {}): Promise<number[][]> {
  if (!texts.length) return [];
  const key = await apiKey();
  const model = await setting('ai.assistantEmbeddingModel', DEFAULT_EMBEDDING_MODEL);
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 96) {
    const batch = texts.slice(i, i + 96).map((t) => t.slice(0, 6000));
    const started = Date.now();
    const res = await fetch(EMBEDDINGS_URL, { method: 'POST', headers: headers(key), body: JSON.stringify({ model, input: batch }) });
    if (!res.ok) throw new Error(`OpenRouter embeddings ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
    const j = await res.json();
    const rows: { index: number; embedding: number[] }[] = j?.data ?? [];
    if (rows.length !== batch.length) throw new Error('Ελλιπής απάντηση embeddings');
    rows.sort((a, b) => a.index - b.index);
    for (const r of rows) {
      if (r.embedding?.length !== EMBEDDING_DIMS) throw new Error(`Το μοντέλο embeddings δίνει ${r.embedding?.length} διαστάσεις (αναμένονται ${EMBEDDING_DIMS})`);
      out.push(r.embedding);
    }
    logUsage(model, opts.operation ?? 'assistant.embed', j?.usage ?? {}, started, opts.userId);
  }
  return out;
}

/**
 * Μεταγραφή ελληνικής ομιλίας (με αγγλικούς όρους). ΧΩΡΙΣ λίστα ονομάτων: δοκιμάστηκε (2026-10-18) και
 * το μοντέλο «έβλεπε» ονόματα της λίστας σε σιωπή/θόρυβο και άλλαζε σωστές λέξεις σε ονόματα — τα
 * ονόματα τα διορθώνει η ασαφής αναζήτηση (greeklish/τρίγραμμα/embeddings) και ο χρήστης πριν στείλει.
 */
export async function transcribe(audio: Buffer, format: AudioFormat, opts: { userId?: string | null } = {}): Promise<{ text: string; model: string }> {
  const key = await apiKey();
  const model = await setting('ai.assistantSttModel', DEFAULT_STT_MODEL);
  const prompt = [
    'Μετέγραψε την ομιλία του ηχητικού ΚΑΤΑ ΛΕΞΗ. Γλώσσα: Ελληνικά, με αγγλικούς επαγγελματικούς όρους.',
    'Αγγλικές λέξεις, εμπορικά ονόματα και μάρκες γράφονται με λατινικούς χαρακτήρες όπως συνηθίζονται.',
    'Κωδικοί (π.χ. «ΠΛΑ-0012», «έργο 15») γράφονται με κεφαλαία και ψηφία, όπως ακούγονται.',
    'Αν ΔΕΝ ακούγεται καθαρή ανθρώπινη ομιλία (σιωπή, θόρυβος, τόνος, μουσική), ΜΗΝ γράψεις τίποτα.',
    'Απάντησε ΜΟΝΟ με JSON: {"speech": true|false, "text": "<η μεταγραφή ή κενό>"}',
  ].filter(Boolean).join('\n');
  const started = Date.now();
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({
      model, temperature: 0, usage: { include: true }, response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: audio.toString('base64'), format } }, { type: 'text', text: prompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter STT ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  const j = await res.json();
  logUsage(String(j?.model ?? model), 'assistant.stt', j?.usage ?? {}, started, opts.userId);
  const text = parseTranscript(String(j?.choices?.[0]?.message?.content ?? ''));
  return { text, model: String(j?.model ?? model) };
}

