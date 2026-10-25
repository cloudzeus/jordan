import { NextResponse } from 'next/server';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { listFloorPlans, saveFloorPlan, type PlanOwner } from '@/lib/floorplan/plans';
import { createFloorPlanOffer, floorPlanOfferDefaults, floorPlanOfferInput } from '@/lib/floorplan/offer';
import { FloorPlanAiError, detectRooms } from '@/lib/floorplan/ai';
import { fail } from '../contracts/_shared';
import { planFail } from './_shared';

// Κοινοί handlers για τη χαρτογράφηση κάτοψης έργου (/projects/[prjc]/…) και πελάτη
// (/traders/[trdr]/… — προσφορά από το μενού του πελάτη, πριν υπάρξει έργο) και δυνητικού πελάτη
// (/prospects/[prospect]/… — προσφορά σε κάποιον που δεν υπάρχει ακόμη στο SoftOne).

export async function ownerFromParams(params: Promise<Record<string, string>>): Promise<PlanOwner | null> {
  const p = await params;
  const n = Number(p.prjc ?? p.trdr ?? p.prospect);
  if (!Number.isInteger(n) || n <= 0) return null;
  return p.prjc ? { kind: 'project', prjc: n } : p.trdr ? { kind: 'customer', trdr: n } : { kind: 'prospect', prospect: n };
}
const invalid = () => NextResponse.json({ error: 'invalid_owner', message: 'Άκυρο έργο ή πελάτης' }, { status: 400 });
const refOf = (o: PlanOwner) => (o.kind === 'project' ? { type: 'Project' as const, id: o.prjc } : o.kind === 'customer' ? { type: 'Trader' as const, id: o.trdr } : { type: 'Prospect' as const, id: o.prospect });

export async function listPlans(params: Promise<Record<string, string>>) {
  await requirePermission('projects.read');
  const owner = await ownerFromParams(params);
  if (!owner) return invalid();
  return NextResponse.json({ plans: await listFloorPlans(owner) });
}

// POST multipart { id?, title, source?, data (JSON), image (PNG), annotated (PNG), original? (φωτογραφία/PDF), render3d? (PNG 3D) }
export async function savePlan(req: Request, params: Promise<Record<string, string>>) {
  const u = await requirePermission('projects.manage');
  const owner = await ownerFromParams(params);
  if (!owner) return invalid();
  try {
    const fd = await req.formData();
    const str = (k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.trim() : ''; };
    const file = (k: string) => { const v = fd.get(k); return v instanceof File && v.size > 0 ? v : null; };
    let data: unknown;
    try { data = JSON.parse(str('data')); } catch { return NextResponse.json({ error: 'invalid_input', message: 'Μη έγκυρα δεδομένα χαρτογράφησης' }, { status: 400 }); }
    const title = str('title').slice(0, 200) || 'Κάτοψη';
    const out = await saveFloorPlan({
      owner, id: str('id') || null, title, source: str('source').slice(0, 300) || null, data,
      image: file('image'), annotated: file('annotated'), original: file('original'), render3d: file('render3d'), user: { id: u.id, name: u.name ?? null, email: u.email },
    });
    await logAudit({ userId: u.id, userEmail: u.email, action: out.created ? 'floorplan.create' : 'floorplan.update', resource: 'floor_plan', resourceId: out.id, metadata: { ...owner, title } }).catch(() => null);
    return NextResponse.json(out, { status: out.created ? 201 : 200 });
  } catch (e) { return planFail(e); }
}

export async function offerDefaults(params: Promise<Record<string, string>>) {
  await requirePermission('projects.manage');
  const owner = await ownerFromParams(params);
  if (!owner) return invalid();
  try { return NextResponse.json(await floorPlanOfferDefaults(owner)); } catch (e) { return fail(e); }
}

// POST { rooms[…], markupPct, mode, title?, trdr?, kind?, validUntil?, vatRate?, terms?, includeWalls?, floorPlanId?, … }
export async function createOffer(req: Request, params: Promise<Record<string, string>>) {
  const u = await requirePermission('projects.manage');
  const owner = await ownerFromParams(params);
  if (!owner) return invalid();
  try {
    const input = floorPlanOfferInput.parse(await req.json().catch(() => null));
    if (input.rooms.some((r) => r.material?.type === 'recipe') && !(await hasPermission('recipes.read'))) {
      return NextResponse.json({ error: 'forbidden', message: 'Δεν έχετε δικαίωμα προβολής συνταγών (recipes.read).' }, { status: 403 });
    }
    const out = await createFloorPlanOffer(owner, input, u.id);
    await logAudit({
      userId: u.id, userEmail: u.email, action: 'contract.create', resource: 'contract', resourceId: out.id,
      metadata: { source: 'floorplan', ...owner, rooms: input.rooms.length, lines: out.lines, kind: out.kind, markupPct: input.markupPct, mode: input.mode },
    }).catch(() => null);
    return NextResponse.json(out, { status: 201 });
  } catch (e) { return fail(e); }
}

// POST multipart { image } — «Αναγνώριση χώρων με AI».
export async function aiDetect(req: Request, params: Promise<Record<string, string>>) {
  const u = await requirePermission('projects.manage');
  const owner = await ownerFromParams(params);
  if (!owner) return invalid();
  try {
    const image = (await req.formData()).get('image');
    if (!(image instanceof File)) return NextResponse.json({ error: 'invalid_input', message: 'Λείπει η εικόνα' }, { status: 400 });
    return NextResponse.json(await detectRooms(image, u, refOf(owner)));
  } catch (e) {
    if (e instanceof FloorPlanAiError) return NextResponse.json({ error: 'floorplan_ai', message: e.message }, { status: e.status });
    console.error('[floorplan-ai]', e);
    return NextResponse.json({ error: 'internal', message: `Η αναγνώριση απέτυχε: ${e instanceof Error ? e.message.slice(0, 200) : 'σφάλμα'}` }, { status: 502 });
  }
}
