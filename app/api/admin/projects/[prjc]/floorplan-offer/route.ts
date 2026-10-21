import { NextResponse } from 'next/server';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { createFloorPlanOffer, floorPlanOfferDefaults, floorPlanOfferInput } from '@/lib/floorplan/offer';
import { fail } from '../../../contracts/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prjcOf = async (ctx: { params: Promise<{ prjc: string }> }) => {
  const n = Number((await ctx.params).prjc);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// GET — προεπιλογές για το modal «Δημιουργία προσφοράς» (τίτλος, πελάτης, τοποθεσία του έργου).
export async function GET(_req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  await requirePermission('projects.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return NextResponse.json({ error: 'invalid_prjc', message: 'Άκυρο έργο' }, { status: 400 });
  try { return NextResponse.json(await floorPlanOfferDefaults(prjc)); } catch (e) { return fail(e); }
}

// POST { rooms[{ name, areaM2, perimeterM, material }], markupPct, mode, title?, trdr?, kind?, validUntil?, vatRate?, terms?, source?, wallLenM? }
// — νέα προσφορά (πρόχειρη) από τη διαστασιολόγηση κάτοψης, συνδεδεμένη με το έργο.
export async function POST(req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  const u = await requirePermission('projects.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return NextResponse.json({ error: 'invalid_prjc', message: 'Άκυρο έργο' }, { status: 400 });
  try {
    const input = floorPlanOfferInput.parse(await req.json().catch(() => null));
    if (input.rooms.some((r) => r.material?.type === 'recipe') && !(await hasPermission('recipes.read'))) {
      return NextResponse.json({ error: 'forbidden', message: 'Δεν έχετε δικαίωμα προβολής συνταγών (recipes.read).' }, { status: 403 });
    }
    const out = await createFloorPlanOffer(prjc, input, u.id);
    await logAudit({
      userId: u.id, userEmail: u.email, action: 'contract.create', resource: 'contract', resourceId: out.id,
      metadata: { source: 'floorplan', prjc, rooms: input.rooms.length, lines: out.lines, kind: out.kind, markupPct: input.markupPct, mode: input.mode },
    }).catch(() => null);
    return NextResponse.json(out, { status: 201 });
  } catch (e) { return fail(e); }
}
