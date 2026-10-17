import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { SoftoneError } from '@/lib/softone';
import { ItemMaintenanceError } from '@/lib/softone-sync/item-maintenance';
import { editSoftoneItem, itemEditInput, readSoftoneItem } from '@/lib/softone-sync/item-edit';
import { lastPurchasePrices } from '@/lib/last-purchase-price';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const mtrlOf = async (params: Promise<{ mtrl: string }>) => {
  const n = Number((await params).mtrl);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const fail = (e: unknown) => {
  if (e instanceof ItemMaintenanceError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
  if (e instanceof SoftoneError) return NextResponse.json({ error: 'softone_error', message: e.message }, { status: 502 });
  return NextResponse.json({ error: 'internal_error', message: (e as Error).message }, { status: 500 });
};

// GET — η ζωντανή καρτέλα του είδους + οι λίστες της φόρμας + τελευταία τιμή αγοράς.
export async function GET(_req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  await requirePermission('metadata.read');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return NextResponse.json({ error: 'invalid_mtrl', message: 'Άκυρη εγγραφή.' }, { status: 400 });
  try {
    const [record, lookups, vats, lp] = await Promise.all([
      readSoftoneItem(mtrl),
      prisma.softoneLookup.findMany({
        where: { kind: { in: ['MTRUNIT', 'MTRCATEGORY', 'MTRGROUP', 'MTRMANFCTR', 'MTRMARK'] } },
        orderBy: { order: 'asc' }, select: { kind: true, code: true, name: true },
      }),
      prisma.vatCategory.findMany({ where: { isActive: true }, orderBy: [{ order: 'asc' }, { code: 'asc' }], select: { code: true, descr: true, rate: true } }),
      lastPurchasePrices([mtrl]).catch(() => new Map()),
    ]);
    const opt = (kind: string) => lookups.filter((l) => l.kind === kind).map((l) => ({ id: l.code, name: l.name }));
    return NextResponse.json({
      record,
      options: {
        units: opt('MTRUNIT'), categories: opt('MTRCATEGORY'), groups: opt('MTRGROUP'),
        manufacturers: opt('MTRMANFCTR'), brands: opt('MTRMARK'),
        vats: vats.map((v) => ({ id: v.code, name: v.descr || v.code, rate: v.rate })),
      },
      lastPurchase: lp.get(mtrl) ?? null,
    });
  } catch (e) {
    return fail(e);
  }
}

// PUT — αποθήκευση στο SoftOne ΜΟΝΟ των πεδίων που άλλαξαν, με επαλήθευση μετά την εγγραφή.
export async function PUT(req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  const u = await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return NextResponse.json({ error: 'invalid_mtrl', message: 'Άκυρη εγγραφή.' }, { status: 400 });
  const parsed = itemEditInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  }
  try {
    const r = await editSoftoneItem(mtrl, parsed.data);
    if (r.changed.length > 0) {
      await logAudit({
        userId: u.id, userEmail: u.email, action: 'softone.item.edit', resource: 'softone_item', resourceId: String(mtrl),
        metadata: { object: r.object, changed: r.changed },
      }).catch(() => null);
    }
    return NextResponse.json(r);
  } catch (e) {
    return fail(e);
  }
}
