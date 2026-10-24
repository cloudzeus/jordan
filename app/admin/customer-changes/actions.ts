'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUserWithPermissions } from '@/lib/rbac';
import { decideCustomerChange } from '@/lib/customer-changes';
import { logAudit } from '@/lib/audit';
import type { ActionResult } from '@/lib/action-result';

const input = z.object({ id: z.string().min(1), status: z.enum(['APPLIED', 'REJECTED']), reply: z.string().trim().max(600).nullish().transform((v) => v || null) });

export async function decideCustomerChangeAction(raw: unknown): Promise<ActionResult<null>> {
  const u = await getCurrentUserWithPermissions();
  if (!u || (u.role.key !== 'SUPER_ADMIN' && !u.permissionKeys.has('metadata.manage'))) return { ok: false, message: 'Δεν έχετε δικαίωμα' };
  const v = input.safeParse(raw);
  if (!v.success) return { ok: false, message: 'Μη έγκυρα στοιχεία' };
  try {
    await decideCustomerChange(v.data.id, v.data.status, v.data.reply, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: `customer.change.${v.data.status.toLowerCase()}`, resource: 'customer-change', resourceId: v.data.id }).catch(() => null);
    revalidatePath('/admin/customer-changes');
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Η ενέργεια απέτυχε' };
  }
}
