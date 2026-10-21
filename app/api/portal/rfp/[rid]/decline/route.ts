import { NextResponse } from 'next/server';
import { declineBid, partyRecipient, publicView } from '@/lib/rfp/service';
import { portalRecipient } from '@/lib/rfp/portal';
import { partyOf } from '@/lib/rbac';
import { ctxOf, rfpFail, sessionOf, withSession } from '@/lib/rfp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { reason? } — άρνηση από το portal.
export async function POST(req: Request, ctx: { params: Promise<{ rid: string }> }) {
  try {
    const rid = (await ctx.params).rid;
    const p = await portalRecipient(rid, true);
    if ('error' in p) return p.error;
    const s = sessionOf(req);
    const body = await req.json().catch(() => ({}));
    await declineBid(p.r, typeof body?.reason === 'string' ? body.reason.trim() || null : null, ctxOf(req, 'portal', s.sid, p.user.id));
    return withSession(NextResponse.json({ view: publicView((await partyRecipient(partyOf(p.user)!, rid))!) }), s);
  } catch (e) { return rfpFail(e); }
}
