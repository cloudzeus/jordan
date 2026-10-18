import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentUserWithPermissions } from '@/lib/rbac';

/** Για route handlers του admin: ο χρήστης με το δικαίωμα, ή η απάντηση 401/403 που πρέπει να επιστραφεί. */
export async function staffWith(permission: string) {
  const u = await getCurrentUserWithPermissions();
  if (!u) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) } as const;
  if (u.role.key !== 'SUPER_ADMIN' && !u.permissionKeys.has(permission)) return { error: NextResponse.json({ error: 'forbidden', message: 'Δεν έχετε δικαίωμα' }, { status: 403 }) } as const;
  return { user: u } as const;
}
