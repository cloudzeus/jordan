import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { listFloorPlans, saveFloorPlan } from '@/lib/floorplan/plans';
import { planFail } from '../../../floorplans/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ prjc: string }> };
const prjcOf = async (ctx: Ctx) => {
  const n = Number((await ctx.params).prjc);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// GET — οι αποθηκευμένες χαρτογραφήσεις κάτοψης του έργου (πιο πρόσφατες πρώτα).
export async function GET(_req: Request, ctx: Ctx) {
  await requirePermission('projects.read');
  const prjc = await prjcOf(ctx);
  if (!prjc) return NextResponse.json({ error: 'invalid_prjc', message: 'Άκυρο έργο' }, { status: 400 });
  return NextResponse.json({ plans: await listFloorPlans(prjc) });
}

// POST multipart { id?, title, source?, data (JSON), image (PNG), annotated (PNG), original? (φωτογραφία/PDF) } — νέα ή ενημέρωση.
export async function POST(req: Request, ctx: Ctx) {
  const u = await requirePermission('projects.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return NextResponse.json({ error: 'invalid_prjc', message: 'Άκυρο έργο' }, { status: 400 });
  try {
    const fd = await req.formData();
    const str = (k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.trim() : ''; };
    const file = (k: string) => { const v = fd.get(k); return v instanceof File && v.size > 0 ? v : null; };
    let data: unknown;
    try { data = JSON.parse(str('data')); } catch { return NextResponse.json({ error: 'invalid_input', message: 'Μη έγκυρα δεδομένα χαρτογράφησης' }, { status: 400 }); }
    const title = str('title').slice(0, 200) || 'Κάτοψη';
    const out = await saveFloorPlan({
      prjc, id: str('id') || null, title, source: str('source').slice(0, 300) || null, data,
      image: file('image'), annotated: file('annotated'), original: file('original'), user: { id: u.id, name: u.name ?? null, email: u.email },
    });
    await logAudit({ userId: u.id, userEmail: u.email, action: out.created ? 'floorplan.create' : 'floorplan.update', resource: 'floor_plan', resourceId: out.id, metadata: { prjc, title } }).catch(() => null);
    return NextResponse.json(out, { status: out.created ? 201 : 200 });
  } catch (e) { return planFail(e); }
}
