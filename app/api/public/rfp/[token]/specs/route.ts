import { NextResponse } from 'next/server';
import { recipientByToken, specsFor } from '@/lib/rfp/service';
import { ctxOf, limited, pdfResponse, rfpFail, sessionOf, withSession } from '@/lib/rfp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — τα specs (PDF) του αιτήματος· καταγράφεται η λήψη.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (limited(req)) return NextResponse.json({ error: 'rate' }, { status: 429 });
  try {
    const r = await recipientByToken((await ctx.params).token);
    if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const s = sessionOf(req);
    const { pdf, name } = await specsFor(r, ctxOf(req, 'link', s.sid));
    return withSession(pdfResponse(pdf, name), s);
  } catch (e) { return rfpFail(e); }
}
