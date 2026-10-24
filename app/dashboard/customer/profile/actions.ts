'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { customerTrdrOf, getCurrentUserWithPermissions, getPortalUser } from '@/lib/rbac';
import { assignContractSite, deleteSite, ProfileError, requestCompanyChange, saveContact, saveSite } from '@/lib/customer-profile';
import { companyInput, contactInput, siteInput } from '@/lib/customer-profile-core';
import { logAudit } from '@/lib/audit';
import type { ActionResult } from '@/lib/action-result';

/** Ο πελάτης ενεργεί μόνο για τον εαυτό του· σε «Προβολή ως» ο διαχειριστής μόνο βλέπει. */
async function customer() {
  const viewer = await getPortalUser();
  if (viewer?.viewAs) return { error: 'Σε «Προβολή ως» οι αλλαγές γίνονται μόνο από τον πελάτη.' } as const;
  const u = await getCurrentUserWithPermissions();
  const trdr = customerTrdrOf(u);
  if (!u || trdr == null) return { error: 'Η σύνδεση έληξε — συνδεθείτε ξανά.' } as const;
  return { u, trdr } as const;
}

async function run(fn: () => Promise<void>): Promise<ActionResult<null>> {
  try {
    await fn();
    revalidatePath('/dashboard/customer/profile');
    revalidatePath('/dashboard/customer/requests');
    return { ok: true, data: null };
  } catch (e) {
    if (e instanceof ProfileError) return { ok: false, message: e.message };
    console.error('[profile]', e);
    return { ok: false, message: 'Κάτι πήγε στραβά — δοκιμάστε ξανά.' };
  }
}

export async function saveSiteAction(id: string | null, raw: unknown): Promise<ActionResult<null>> {
  const c = await customer();
  if ('error' in c) return { ok: false, message: c.error! };
  const v = siteInput.safeParse(raw);
  if (!v.success) return { ok: false, message: v.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' };
  return run(async () => {
    const s = await saveSite(c.trdr, id, v.data, c.u.id);
    await logAudit({ userId: c.u.id, userEmail: c.u.email, action: id ? 'customer.site.update' : 'customer.site.create', resource: 'customer-site', resourceId: s.id, metadata: { trdr: c.trdr } }).catch(() => null);
  });
}

export async function deleteSiteAction(id: string): Promise<ActionResult<null>> {
  const c = await customer();
  if ('error' in c) return { ok: false, message: c.error! };
  return run(async () => {
    await deleteSite(c.trdr, z.string().min(1).parse(id));
    await logAudit({ userId: c.u.id, userEmail: c.u.email, action: 'customer.site.delete', resource: 'customer-site', resourceId: id, metadata: { trdr: c.trdr } }).catch(() => null);
  });
}

export async function assignSiteAction(contractId: string, siteId: string | null): Promise<ActionResult<null>> {
  const c = await customer();
  if ('error' in c) return { ok: false, message: c.error! };
  return run(() => assignContractSite(c.trdr, String(contractId), siteId ? String(siteId) : null));
}

export async function saveContactAction(raw: unknown): Promise<ActionResult<null>> {
  const c = await customer();
  if ('error' in c) return { ok: false, message: c.error! };
  const v = contactInput.safeParse(raw);
  if (!v.success) return { ok: false, message: v.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' };
  return run(() => saveContact(c.trdr, { id: c.u.id, email: c.u.email }, v.data));
}

export async function requestCompanyChangeAction(raw: unknown): Promise<ActionResult<null>> {
  const c = await customer();
  if ('error' in c) return { ok: false, message: c.error! };
  const v = companyInput.safeParse(raw);
  if (!v.success) return { ok: false, message: 'Μη έγκυρα στοιχεία' };
  return run(async () => {
    const r = await requestCompanyChange(c.trdr, { id: c.u.id, email: c.u.email, name: c.u.name ?? null }, v.data.values, v.data.note);
    await logAudit({ userId: c.u.id, userEmail: c.u.email, action: 'customer.change.request', resource: 'customer-change', resourceId: r.id, metadata: { trdr: c.trdr } }).catch(() => null);
  });
}
