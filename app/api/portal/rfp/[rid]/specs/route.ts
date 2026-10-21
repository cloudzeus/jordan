import { specsFor } from '@/lib/rfp/service';
import { portalRecipient } from '@/lib/rfp/portal';
import { ctxOf, pdfResponse, rfpFail, sessionOf, withSession } from '@/lib/rfp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — τα specs (PDF) από το portal· καταγράφεται η λήψη.
export async function GET(req: Request, ctx: { params: Promise<{ rid: string }> }) {
  try {
    const p = await portalRecipient((await ctx.params).rid, false);
    if ('error' in p) return p.error;
    const s = sessionOf(req);
    const { pdf, name } = await specsFor(p.r, ctxOf(req, 'portal', s.sid, p.user.id));
    return withSession(pdfResponse(pdf, name), s);
  } catch (e) { return rfpFail(e); }
}
