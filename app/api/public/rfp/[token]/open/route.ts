import { NextResponse } from 'next/server';
import { markViewed, recipientByToken } from '@/lib/rfp/service';
import { ctxOf, limited, rfpFail, sessionOf, withSession } from '@/lib/rfp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — καταγραφή «άνοιξε τη σελίδα» (με session cookie) από τον μοναδικό σύνδεσμο.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (limited(req)) return NextResponse.json({ error: 'rate' }, { status: 429 });
  try {
    const r = await recipientByToken((await ctx.params).token);
    if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const s = sessionOf(req);
    await markViewed(r, ctxOf(req, 'link', s.sid));
    return withSession(NextResponse.json({ ok: true }), s);
  } catch (e) { return rfpFail(e); }
}
