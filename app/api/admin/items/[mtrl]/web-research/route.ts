import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { listAttributes } from '@/lib/item-attributes';
import { researchItem } from '@/lib/item-web/service';
import { attributeSchema, mergeAttributes, sameAttributes } from '@/lib/item-web/core';
import { badMtrl, mtrlOf } from '../media/_shared';

export const runtime = 'nodejs';
export const maxDuration = 120;
const searchInput = z.object({ query: z.string().trim().min(3).max(500) });
const saveInput = z.object({ existing: z.array(attributeSchema).max(100), selected: z.array(attributeSchema).min(1).max(40) });

export async function POST(req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  const user = await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  const body = searchInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ message: 'Γράψτε ονομασία ή μοντέλο (3–500 χαρακτήρες).' }, { status: 400 });
  const item = await prisma.softoneItem.findUnique({ where: { mtrl } });
  if (!item || item.isService) return NextResponse.json({ message: 'Το είδος δεν βρέθηκε.' }, { status: 404 });
  try {
    const [result, existing] = await Promise.all([researchItem(item, body.data.query, user.id), listAttributes(mtrl)]);
    return NextResponse.json({ ...result, existing });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).name === 'TimeoutError' ? 'Η αναζήτηση καθυστέρησε. Δοκιμάστε ξανά.' : (e as Error).message }, { status: 502 });
  }
}

/** Explicitly selected values only; preserve unrelated attributes and reject stale previews. */
export async function PATCH(req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  const user = await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  const body = saveInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ message: 'Ελέγξτε ονόματα, τιμές και μονάδες των επιλεγμένων χαρακτηριστικών.' }, { status: 400 });
  try {
    const attributes = await prisma.$transaction(async (tx) => {
      if (!await tx.softoneItem.findUnique({ where: { mtrl } })) throw new Error('Το είδος δεν βρέθηκε.');
      const current = await tx.itemAttribute.findMany({ where: { mtrl }, orderBy: { order: 'asc' } });
      if (!sameAttributes(current, body.data.existing)) throw new Error('Τα χαρακτηριστικά άλλαξαν από άλλη ενέργεια. Κάντε νέα αναζήτηση πριν αποθηκεύσετε.');
      const merged = mergeAttributes(current, body.data.selected);
      await tx.itemAttribute.deleteMany({ where: { mtrl } });
      await tx.itemAttribute.createMany({ data: merged.map((a, order) => ({ mtrl, order, name: a.name, value: a.value, unit: a.unit || null })) });
      return merged.map(({ name, value, unit }) => ({ name, value, unit: unit || null }));
    }, { isolationLevel: 'Serializable' });
    await logAudit({ userId: user.id, userEmail: user.email, action: 'item.attributes.web-import', resource: 'softone_item', resourceId: String(mtrl), metadata: { count: body.data.selected.length } }).catch(() => null);
    return NextResponse.json({ attributes });
  } catch (e) {
    const message = (e as { code?: string }).code === 'P2034' ? 'Τα χαρακτηριστικά άλλαξαν ταυτόχρονα. Κάντε νέα αναζήτηση.' : (e as Error).message;
    return NextResponse.json({ message }, { status: 409 });
  }
}
