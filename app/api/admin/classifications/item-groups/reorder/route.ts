import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Αναδιάταξη ομάδων ειδών/υπηρεσιών — ΜΟΝΟ στη βάση μας. Οι ομάδες του SoftOne (MTRGROUP) ΔΕΝ αγγίζονται.
const input = z.object({
  updates: z.array(z.object({
    id: z.number().int().positive(),
    sohCode: z.string().trim().min(1).max(32).regex(/^\d+(\.\d+)*$/, 'Κωδικός ιεραρχίας: αριθμοί με τελείες'),
    parentId: z.number().int().positive().nullable(),
    level: z.number().int().min(1).max(10),
    order: z.number().int().min(0),
  })).min(1).max(200),
});

export async function POST(req: Request) {
  const u = await requirePermission('classifications.manage');
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: 'invalid_input', message: i?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  }
  const { updates } = parsed.data;
  // shortcut: εμπιστευόμαστε ότι το δέντρο του client είναι ακυκλικό (το φτιάχνει το ίδιο component)·
  // αν ποτέ χτυπηθεί το API απ' έξω, πρόσθεσε έλεγχο κύκλου εδώ.
  try {
    await prisma.$transaction(
      updates.map((up) => prisma.itemGroup.update({
        where: { id: up.id },
        data: { sohCode: up.sohCode, parentId: up.parentId, level: up.level, order: up.order },
      })),
    );
  } catch {
    return NextResponse.json({ error: 'update_failed', message: 'Η αναδιάταξη απέτυχε — ανανέωσε και δοκίμασε ξανά' }, { status: 409 });
  }
  await logAudit({
    userId: u.id, userEmail: u.email, action: 'classification.itemgroup.reorder',
    resource: 'item_group', resourceId: `batch:${updates.length}`, metadata: { count: updates.length },
  }).catch(() => null);
  return NextResponse.json({ ok: true, count: updates.length });
}
