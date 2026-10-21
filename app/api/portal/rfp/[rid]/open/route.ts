import { NextResponse } from 'next/server';
import { markViewed } from '@/lib/rfp/service';
import { portalRecipient } from '@/lib/rfp/portal';
import { ctxOf, rfpFail, sessionOf, withSession } from '@/lib/rfp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — καταγραφή «άνοιξε το αίτημα» από το portal (όχι στην «Προβολή ως»).
export async function POST(req: Request, ctx: { params: Promise<{ rid: string }> }) {
  try {
    const p = await portalRecipient((await ctx.params).rid, false);
    if ('error' in p) return p.error;
    if (p.user.viewAs) return NextResponse.json({ ok: true, viewAs: true });
    const s = sessionOf(req);
    await markViewed(p.r, ctxOf(req, 'portal', s.sid, p.user.id));
    return withSession(NextResponse.json({ ok: true }), s);
  } catch (e) { return rfpFail(e); }
}
