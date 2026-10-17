import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { SoftoneError } from '@/lib/softone';
import { ItemMaintenanceError } from '@/lib/softone-sync/item-maintenance';
import { setUnit2ViaScript, unit2Input, unit2ScriptConfig } from '@/lib/softone-sync/unit2-script';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (e: unknown) => {
  if (e instanceof ItemMaintenanceError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
  if (e instanceof SoftoneError) return NextResponse.json({ error: 'softone_error', message: e.message }, { status: 502 });
  return NextResponse.json({ error: 'internal_error', message: (e as Error).message }, { status: 500 });
};

// GET — αν είναι ενεργή η αλλαγή Μ.Μ.2 μέσω script (για να ξέρει η φόρμα αν θα την προτείνει).
export async function GET() {
  await requirePermission('metadata.read');
  return NextResponse.json({ enabled: unit2ScriptConfig().enabled });
}

// POST — ΕΞΑΙΡΕΣΗ: Μ.Μ.2 σε είδος με παραστατικά μέσω του custom script (softone/scripts/units.js).
// Μόνο διαχειριστές· ?dryRun=1 = μόνο έλεγχοι. Πάντα πριν/μετά στο ιστορικό ενεργειών.
export async function POST(req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  const u = await requirePermission('metadata.manage');
  if (u.role.key !== 'SUPER_ADMIN' && u.role.key !== 'ADMIN') {
    return NextResponse.json({ error: 'forbidden', message: 'Μόνο διαχειριστές.' }, { status: 403 });
  }
  const mtrl = Number((await params).mtrl);
  if (!Number.isInteger(mtrl) || mtrl <= 0) return NextResponse.json({ error: 'invalid_mtrl', message: 'Άκυρη εγγραφή.' }, { status: 400 });
  const parsed = unit2Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
  try {
    const r = await setUnit2ViaScript(mtrl, parsed.data, { dryRun });
    const pick = (x: typeof r.before) => ({ unit2: x.unit2, ratio2: x.ratio2, strict2: x.strict2 });
    if (!dryRun) {
      await logAudit({
        userId: u.id, userEmail: u.email, action: 'item.unit2.script', resource: 'softone_item', resourceId: String(mtrl),
        metadata: { before: pick(r.before), after: pick(r.after) },
      }).catch(() => null);
    }
    return NextResponse.json({ dryRun: r.dryRun, before: pick(r.before), after: pick(r.after) });
  } catch (e) { return fail(e); }
}
