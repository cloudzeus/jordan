import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { SoftoneError, softoneGetTable } from '@/lib/softone';
import { ItemMaintenanceError } from '@/lib/softone-sync/item-maintenance';
import { editSoftoneItem, itemEditInput, readSoftoneItem } from '@/lib/softone-sync/item-edit';
import { lastPurchasePrices } from '@/lib/last-purchase-price';
import { classificationOptions } from '@/lib/item-classifications';

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

// GET — η ζωντανή καρτέλα του είδους + οι λίστες της φόρμας (+ τελευταία τιμή αγοράς, εκτός αν `?lp=0`).
// ΟΛΑ παράλληλα: κάθε κλήση στο SoftOne κοστίζει ~2″, οπότε ο σειριακός δεύτερος γύρος (κινήσεις, κατηγορίες)
// και η αργή τελευταία τιμή αγοράς (~4″) έκαναν τη φόρμα και το expand να ανοίγουν σε 6–8″. Η φόρμα και το
// expand ζητούν πλέον `?lp=0` και φέρνουν την τιμή αγοράς χωριστά (`/last-purchase`), χωρίς να περιμένουν.
export async function GET(req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  await requirePermission('metadata.read');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return NextResponse.json({ error: 'invalid_mtrl', message: 'Άκυρη εγγραφή.' }, { status: 400 });
  const withLastPurchase = new URL(req.url).searchParams.get('lp') !== '0';
  try {
    // Είδος ή υπηρεσία από τον καθρέφτη (άμεσο) — για να ξεκινήσουν όλα μαζί με την ανάγνωση της καρτέλας.
    const mirror = await prisma.softoneItem.findUnique({ where: { mtrl }, select: { isService: true } });
    const isService = mirror?.isService ?? false;
    const [record, lookups, vats, lp, cls, unitsMeta, movements] = await Promise.all([
      readSoftoneItem(mtrl),
      prisma.softoneLookup.findMany({
        where: { kind: { in: ['MTRUNIT', 'MTRCATEGORY', 'MTRGROUP', 'MTRMANFCTR', 'MTRMARK'] } },
        orderBy: { order: 'asc' }, select: { kind: true, code: true, name: true },
      }),
      prisma.vatCategory.findMany({ where: { isActive: true }, orderBy: [{ order: 'asc' }, { code: 'asc' }], select: { code: true, descr: true, rate: true } }),
      withLastPurchase ? lastPurchasePrices([mtrl]).catch(() => new Map()) : Promise.resolve(new Map()),
      // Κατηγορίες/ομάδες του ΙΔΙΟΥ μητρώου (είδη 51 / υπηρεσίες 52) — το SoftoneLookup τις μπερδεύει.
      classificationOptions(isService ? 52 : 51),
      // Μονάδες με σύντμηση (για το «1 ΠΑΛ = 52 Μετ²» και το πρότυπο Container → Παλέτα → τ.μ.)
      prisma.softoneUnit.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { code: true, shortcut: true, name: true, interCode: true, decimals: true } }),
      // Αν το είδος έχει κινήσεις — τότε η βασική μονάδα κλειδώνει.
      isService ? Promise.resolve([]) : softoneGetTable('MTRLINES', ['MTRL'], `MTRL=${mtrl}`).catch(() => null),
    ]);
    const opt = (kind: string) => lookups.filter((l) => l.kind === kind).map((l) => ({ id: l.code, name: l.name }));
    const hasCls = cls.categories.length + cls.groups.length > 0;
    return NextResponse.json({
      unitsMeta: unitsMeta.map((u) => ({ id: String(u.code), shortcut: u.shortcut, name: u.name, interCode: u.interCode, decimals: u.decimals })),
      // null = άγνωστο (το SoftOne δεν απάντησε): η φόρμα δεν κλειδώνει, αλλά ο server ελέγχει ξανά.
      hasMovements: movements == null ? null : movements.length > 0,
      record,
      options: {
        units: opt('MTRUNIT'),
        categories: hasCls ? cls.categories : opt('MTRCATEGORY'), groups: hasCls ? cls.groups : opt('MTRGROUP'),
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
