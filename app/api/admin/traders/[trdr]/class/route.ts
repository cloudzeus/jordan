import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { loadTraderClass, saveTraderClass } from '@/lib/trader-classes-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idOf = async (params: Promise<{ trdr: string }>) => {
  const n = Number((await params).trdr);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// GET — η κατηγορία του συναλλασσομένου στη βάση μας (εγκεκριμένη ή αυτόματη πρόταση από ΚΑΔ).
export async function GET(_req: Request, { params }: { params: Promise<{ trdr: string }> }) {
  await requirePermission('metadata.read');
  const trdr = await idOf(params);
  if (!trdr) return NextResponse.json({ error: 'invalid_trdr' }, { status: 400 });
  return NextResponse.json(await loadTraderClass(trdr));
}

const Body = z.object({
  sodtype: z.union([z.literal(12), z.literal(13)]),
  code: z.string().max(50),
  name: z.string().max(200),
  afm: z.string().max(20).nullable().optional(),
  leafId: z.number().int().positive().nullable(),
  /** Γράφτηκαν ήδη και τα τρία επίπεδα στο SoftOne. */
  applied: z.boolean(),
});

// PUT — αποθήκευση της επιλογής του χρήστη (μόνο στη βάση μας· το SoftOne γράφεται από το PATCH της καρτέλας).
export async function PUT(req: Request, { params }: { params: Promise<{ trdr: string }> }) {
  const u = await requirePermission('metadata.manage');
  const trdr = await idOf(params);
  if (!trdr) return NextResponse.json({ error: 'invalid_trdr' }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
  try {
    await saveTraderClass({ trdr, ...parsed.data });
    await logAudit({ userId: u.id, action: 'trader.class_set', resource: 'SoftoneTrader', resourceId: String(trdr), metadata: { leafId: parsed.data.leafId, applied: parsed.data.applied } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'invalid_class', message: (e as Error).message }, { status: 422 });
  }
}
