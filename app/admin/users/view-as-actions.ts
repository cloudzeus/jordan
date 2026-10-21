'use server';

import { redirect } from 'next/navigation';
import { logAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { getCurrentUserWithPermissions, PORTAL_HOME } from '@/lib/rbac';
import { clearViewAs, readViewAs, setViewAs } from '@/lib/view-as';

/** Ξεκινά «Προβολή ως» για χρήστη του portal και ανοίγει την αρχική του. */
export async function startViewAsAction(targetUserId: string, back = '/admin/users'): Promise<{ ok: false; message: string } | never> {
  const me = await getCurrentUserWithPermissions();
  if (!me) return { ok: false, message: 'Η σύνδεση έληξε — συνδεθείτε ξανά.' };
  if (me.role.key !== 'SUPER_ADMIN' && !me.permissionKeys.has('portal.view_as')) return { ok: false, message: 'Δεν έχετε το δικαίωμα (portal.view_as).' };
  const t = await prisma.user.findUnique({ where: { id: targetUserId }, include: { role: { select: { key: true } } } });
  const home = t?.role.key ? PORTAL_HOME[t.role.key] : undefined;
  if (!t || !home) return { ok: false, message: 'Ο χρήστης δεν έχει portal (πελάτης/συνεργάτης/συνεργείο).' };
  if (!t.isActive) return { ok: false, message: 'Ο χρήστης είναι ανενεργός.' };
  const safeBack = back.startsWith('/admin') ? back : '/admin/users';
  await setViewAs(t.id, me.id, safeBack);
  await logAudit({ userId: me.id, userEmail: me.email, action: 'portal.view_as.start', resource: 'user', resourceId: t.id, metadata: { email: t.email, role: t.role.key } }).catch(() => null);
  redirect(home);
}

/** Τέλος «Προβολής ως»: πίσω στη σελίδα του admin από όπου ξεκίνησε. */
export async function endViewAsAction() {
  const me = await getCurrentUserWithPermissions();
  const claims = me ? await readViewAs(me.id) : null;
  await clearViewAs();
  if (me && claims) await logAudit({ userId: me.id, userEmail: me.email, action: 'portal.view_as.end', resource: 'user', resourceId: claims.sub }).catch(() => null);
  redirect(claims?.back ?? '/admin/users');
}
