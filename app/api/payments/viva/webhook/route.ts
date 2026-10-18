import { NextResponse } from 'next/server';
import { vivaConfig, webhookKey } from '@/lib/viva';
import { processWebhook } from '@/lib/viva-payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Webhook του Viva — ΕΝΑ URL για Transaction Payment Created (1796), Transaction Failed (1798) και
 * Transaction Reversal Created (1797).
 *
 * GET  → η επαλήθευση του Viva («Verify» στο dashboard): `{ "Key": "<verification key>" }`.
 * POST → inbox: ιδεμποτέντ ανά (τύπος, συναλλαγή), επαλήθευση από το API του Viva, ενημέρωση πληρωμής.
 *        200 σε ό,τι ολοκληρώθηκε ή αγνοήθηκε· 503 μόνο σε προσωρινό σφάλμα, ώστε το Viva να ξαναστείλει.
 */
export async function GET() {
  try {
    return NextResponse.json({ Key: await webhookKey(await vivaConfig()) });
  } catch (e) {
    console.error('[viva-webhook] verification key', (e as Error).message);
    return NextResponse.json({ error: 'webhook_key_unavailable' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  try {
    const r = await processWebhook(raw);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('[viva-webhook]', (e as Error).message);
    return NextResponse.json({ error: 'temporary_failure' }, { status: 503 });
  }
}
