import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { staffWith } from '@/lib/staff-guard';
import { softoneUsers } from '@/lib/softone-action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const input = z.object({ softoneUserId: z.number().int().positive().nullable() });

/**
 * PUT — σύνδεση χρήστη του προσωπικού με χρήστη SoftOne (ή αποσύνδεση με null). Μόνο SUPER_ADMIN/ADMIN
 * (δικαίωμα users.softone_link). Ένας χρήστης SoftOne ανήκει σε ΕΝΑΝ χρήστη της εφαρμογής.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await staffWith('users.softone_link');
  if ('error' in g) return g.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: 'Μη έγκυρος χρήστης SoftOne' }, { status: 400 });
  const { id } = await ctx.params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, role: { select: { key: true } } } });
  if (!user) return NextResponse.json({ error: 'not_found', message: 'Ο χρήστης δεν βρέθηκε' }, { status: 404 });
  if (['CUSTOMER', 'SUPPLIER', 'COLLABORATOR'].includes(user.role.key ?? '')) return NextResponse.json({ error: 'invalid', message: 'Μόνο χρήστες του προσωπικού συνδέονται με χρήστη SoftOne' }, { status: 400 });

  const sid = parsed.data.softoneUserId;
  let name: string | null = null;
  if (sid != null) {
    const s1 = (await softoneUsers().catch(() => [])).find((u) => u.id === sid);
    if (!s1) return NextResponse.json({ error: 'not_found', message: 'Ο χρήστης SoftOne δεν βρέθηκε ή είναι ανενεργός' }, { status: 404 });
    const taken = await prisma.user.findFirst({ where: { softoneUserId: sid, id: { not: id } }, select: { email: true } });
    if (taken) return NextResponse.json({ error: 'taken', message: `Ο χρήστης SoftOne «${s1.name}» είναι ήδη συνδεδεμένος με ${taken.email}` }, { status: 409 });
    name = s1.name;
  }
  await prisma.user.update({ where: { id }, data: { softoneUserId: sid, softoneUserName: name } });
  await logAudit({ userId: g.user.id, userEmail: g.user.email, action: 'user.softone_link', resource: 'user', resourceId: id, metadata: { softoneUserId: sid } }).catch(() => null);
  return NextResponse.json({ ok: true, softoneUserId: sid, softoneUserName: name });
}
