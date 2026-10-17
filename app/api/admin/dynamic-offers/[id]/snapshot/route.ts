import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { notifyPriceDrop, saveSnapshot } from '@/lib/container-offers';
import { offerErrorResponse, type Ctx } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST — η 3D εικόνα (PNG, από τον browser) για τα email. `?notify=1`: μετά στέλνει τυχόν «η τιμή έπεσε».
export async function POST(req: Request, ctx: Ctx) {
  await requirePermission('dynamic_offers.manage');
  const { id } = await ctx.params;
  const notify = new URL(req.url).searchParams.get('notify') === '1';
  try {
    const png = Buffer.from(await req.arrayBuffer());
    const url = await saveSnapshot(id, png);
    const drop = notify ? await notifyPriceDrop(id) : null;
    return NextResponse.json({ url, drop });
  } catch (e) { return offerErrorResponse(e); }
}
