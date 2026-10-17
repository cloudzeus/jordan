import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { SoftoneError } from '@/lib/softone';
import { traderActivity } from '@/lib/trader-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — καρτέλα (κινήσεις + υπόλοιπο, ελεγμένα με το SoftOne), πληρωμές, έργα, παραγγελίες. Μόνο ανάγνωση.
export async function GET(_req: Request, ctx: { params: Promise<{ trdr: string }> }) {
  await requirePermission('metadata.read');
  const trdr = Number((await ctx.params).trdr);
  if (!Number.isInteger(trdr) || trdr <= 0) return NextResponse.json({ error: 'invalid_trdr' }, { status: 400 });
  try {
    return NextResponse.json(await traderActivity(trdr));
  } catch (e) {
    const status = e instanceof SoftoneError ? 502 : 500;
    return NextResponse.json({ error: 'activity_error', message: (e as Error).message }, { status });
  }
}
