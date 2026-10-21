import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { FloorPlanAiError, detectRooms } from '@/lib/floorplan/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// POST multipart { image } — «Αναγνώριση χώρων με AI»: ονόματα, σημεία, πλαίσια ([y,x] 0–1000), κλίμακα.
export async function POST(req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  const u = await requirePermission('projects.manage');
  const prjc = Number((await ctx.params).prjc);
  if (!Number.isInteger(prjc) || prjc <= 0) return NextResponse.json({ error: 'invalid_prjc', message: 'Άκυρο έργο' }, { status: 400 });
  try {
    const image = (await req.formData()).get('image');
    if (!(image instanceof File)) return NextResponse.json({ error: 'invalid_input', message: 'Λείπει η εικόνα' }, { status: 400 });
    return NextResponse.json(await detectRooms(image, u, prjc));
  } catch (e) {
    if (e instanceof FloorPlanAiError) return NextResponse.json({ error: 'floorplan_ai', message: e.message }, { status: e.status });
    console.error('[floorplan-ai]', e);
    return NextResponse.json({ error: 'internal', message: `Η αναγνώριση απέτυχε: ${e instanceof Error ? e.message.slice(0, 200) : 'σφάλμα'}` }, { status: 502 });
  }
}
