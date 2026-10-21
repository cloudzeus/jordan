import { NextResponse } from 'next/server';
import { publicView, recipientByToken, submitBid } from '@/lib/rfp/service';
import { ctxOf, limited, rfpFail, sessionOf, withSession } from '@/lib/rfp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { amount, startDate?, durationDays?, notes?, termsAccepted: true } — υποβολή/διόρθωση προσφοράς.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (limited(req)) return NextResponse.json({ error: 'rate' }, { status: 429 });
  try {
    const token = (await ctx.params).token;
    const r = await recipientByToken(token);
    if (!r) return NextResponse.json({ error: 'not_found', message: 'Ο σύνδεσμος δεν ισχύει.' }, { status: 404 });
    const s = sessionOf(req);
    await submitBid(r, await req.json().catch(() => null), ctxOf(req, 'link', s.sid));
    return withSession(NextResponse.json({ view: publicView((await recipientByToken(token))!) }), s);
  } catch (e) { return rfpFail(e); }
}
