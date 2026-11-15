import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Σύνδεση ομάδας με εμπορική κατηγορία — ΤΟΠΙΚΟ (προεπιλογή σε νέα είδη). ΔΕΝ γράφεται στο SoftOne.
const input = z.object({
  id: z.number().int().positive(),
  categoryCode: z.number().int().positive().nullable(),
});

export async function POST(req: Request) {
  const u = await requirePermission('classifications.manage');
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', message: 'Μη έγκυρα στοιχεία' }, { status: 400 });
  }
  const { id, categoryCode } = parsed.data;
  const group = await prisma.itemGroup.findUnique({ where: { id }, select: { sodtype: true } });
  if (!group) return NextResponse.json({ error: 'not_found', message: 'Η ομάδα δεν βρέθηκε' }, { status: 404 });

  // Η κατηγορία πρέπει να υπάρχει ως εμπορική κατηγορία του ίδιου sodtype.
  if (categoryCode != null) {
    const cat = await prisma.softoneClassification.findFirst({
      where: { kind: 'CATEGORY', sodtype: group.sodtype, code: categoryCode, isActive: true }, select: { id: true },
    });
    if (!cat) return NextResponse.json({ error: 'invalid_category', message: 'Άγνωστη εμπορική κατηγορία' }, { status: 400 });
  }

  await prisma.itemGroup.update({ where: { id }, data: { categoryCode } });
  await logAudit({
    userId: u.id, userEmail: u.email, action: 'classification.itemgroup.category',
    resource: 'item_group', resourceId: String(id), metadata: { categoryCode },
  }).catch(() => null);
  return NextResponse.json({ ok: true });
}
