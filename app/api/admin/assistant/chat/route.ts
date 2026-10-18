import { NextResponse } from 'next/server';
import { requireAssistantApi } from '@/lib/assistant/access';
import { runAgent, type AgentEvent } from '@/lib/assistant/agent';
import { AssistantConfigError } from '@/lib/assistant/openrouter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST { question, conversationId? } → ροή NDJSON με τα βήματα και την τελική απάντηση (AgentEvent ανά γραμμή).
export async function POST(req: Request) {
  const u = await requireAssistantApi();
  if (u instanceof NextResponse) return u;
  const body = (await req.json().catch(() => null)) as { question?: unknown; conversationId?: unknown } | null;
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question) return NextResponse.json({ error: 'empty', message: 'Γράψτε ή πείτε μια ερώτηση' }, { status: 400 });
  if (question.length > 4000) return NextResponse.json({ error: 'too_long', message: 'Η ερώτηση είναι πολύ μεγάλη' }, { status: 413 });
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent) => {
        try { controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`)); } catch { /* ο χρήστης έκλεισε */ }
      };
      try {
        await runAgent({ userId: u.id, userName: u.name, canFinancials: u.canFinancials, conversationId, question, signal: req.signal }, send);
      } catch (e) {
        console.error('assistant chat failed', e);
        send({ type: 'error', message: e instanceof AssistantConfigError ? e.message : 'Ο Air Jordan δεν μπόρεσε να απαντήσει αυτή τη στιγμή. Δοκιμάστε ξανά.' });
      } finally {
        try { controller.close(); } catch { /* ήδη κλειστό */ }
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
