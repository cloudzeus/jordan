import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { previewEmail } from '@/lib/container-offers';
import { offerErrorResponse, type Ctx } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?kind=publish|drop — το HTML του email (για iframe προεπισκόπησης).
export async function GET(req: Request, ctx: Ctx) {
  await requirePermission('dynamic_offers.read');
  const { id } = await ctx.params;
  const kind = new URL(req.url).searchParams.get('kind') === 'drop' ? 'drop' : 'publish';
  try {
    const { html, subject } = await previewEmail(id, kind);
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Email-Subject': encodeURIComponent(subject) } });
  } catch (e) { return offerErrorResponse(e); }
}
