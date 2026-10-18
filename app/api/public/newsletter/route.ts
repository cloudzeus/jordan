import { NextResponse } from 'next/server';
import { subscribeNewsletter } from '@/lib/newsletter';
import { clientIp, newsletterSchema, tooMany } from '@/lib/public-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — εγγραφή στο newsletter (double opt-in: στέλνει email επιβεβαίωσης).
export async function POST(req: Request) {
  const parsed = newsletterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Ελέγξτε τα στοιχεία' }, { status: 400 });
  const b = parsed.data;
  if (b.website) return NextResponse.json({ ok: true, result: 'pending' });
  if (tooMany(`nl:${clientIp(req)}`, 8, 60 * 60_000)) return NextResponse.json({ error: 'rate_limited', message: 'Πολλές προσπάθειες — δοκιμάστε ξανά αργότερα' }, { status: 429 });
  const result = await subscribeNewsletter({ email: b.email, name: b.name, source: b.source });
  return NextResponse.json({ ok: true, result });
}
