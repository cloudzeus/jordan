import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { recipientsInput, setRecipients } from '@/lib/container-offers';
import { invalid, offerErrorResponse, type Ctx } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: Request, ctx: Ctx) {
  await requirePermission('dynamic_offers.manage');
  const { id } = await ctx.params;
  const parsed = recipientsInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try { return NextResponse.json(await setRecipients(id, parsed.data.recipients)); } catch (e) { return offerErrorResponse(e); }
}
