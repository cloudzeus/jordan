'use server';

import { revalidatePath } from 'next/cache';
import { customerTrdrOf, getCurrentUserWithPermissions, getPortalUser } from '@/lib/rbac';
import { createOfferRequest, offerRequestInput } from '@/lib/portal-requests';
import { rfpAgentTurn } from '@/lib/rfp-agent';
import { rfpDraft, rfpText, type AgentTurn } from '@/lib/rfp-agent-core';
import { z } from 'zod';
import { ContractError } from '@/lib/contracts/service';
import { EntityFileError } from '@/lib/entity-files/core';
import { logAudit } from '@/lib/audit';
import type { ActionResult } from '@/lib/action-result';

/** Νέο αίτημα προσφοράς από τον πελάτη. FormData: `data` (JSON: title, description, site, wanted, kind) + `photos`. */
export async function createOfferRequestAction(form: FormData): Promise<ActionResult<{ ref: string }>> {
  const viewer = await getPortalUser();
  const real = await getCurrentUserWithPermissions();
  // «Προβολή ως»: το προσωπικό στέλνει εκ μέρους του πελάτη (με δικαίωμα προσφορών) — το αίτημα είναι του
  // πελάτη, το συμβάν και το audit γράφουν ποιος το καταχώρισε.
  const onBehalf = viewer?.viewAs && real ? { id: real.id, name: viewer.viewAs.adminName, email: real.email } : null;
  if (onBehalf && real?.role.key !== 'SUPER_ADMIN' && !real?.permissionKeys.has('projects.manage')) {
    return { ok: false, message: 'Για αίτημα εκ μέρους του πελάτη χρειάζεται δικαίωμα προσφορών (projects.manage).' };
  }
  const u = onBehalf ? viewer : real;
  const trdr = customerTrdrOf(u ?? null);
  if (!u || trdr == null) return { ok: false, message: 'Η σύνδεση έληξε — συνδεθείτε ξανά.' };
  let raw: unknown;
  try { raw = JSON.parse(String(form.get('data') ?? '{}')); } catch { return { ok: false, message: 'Μη έγκυρα στοιχεία' }; }
  // Από τον βοηθό: τίτλος/περιγραφή/χώρος βγαίνουν από το δομημένο RFP.
  if (raw && typeof raw === 'object' && 'rfp' in raw && (raw as { rfp?: unknown }).rfp) {
    const r = raw as { rfp: unknown; scope?: { verdict: 'YES' | 'PARTIAL' | 'NO' | 'UNKNOWN'; can: string[]; cannot: string[] } };
    const d = rfpDraft.safeParse(r.rfp);
    if (d.success) {
      raw = { ...(raw as object), title: d.data.title || 'Αίτημα προσφοράς', description: rfpText(d.data, r.scope), site: d.data.site || null, kind: d.data.kind === 'PRODUCT' ? 'PRODUCT' : 'PRODUCT_INSTALL' };
    }
  }
  const v = offerRequestInput.safeParse(raw);
  if (!v.success) return { ok: false, message: v.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' };
  const photos = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 8);
  try {
    const r = await createOfferRequest(trdr, v.data, photos, { id: u.id, email: u.email, name: u.name ?? null }, onBehalf);
    await logAudit(onBehalf
      ? { userId: onBehalf.id, userEmail: onBehalf.email, action: 'contract.request.portal.on_behalf', resource: 'contract', resourceId: r.id, metadata: { trdr, ref: r.ref, customerUserId: u.id, customerEmail: u.email } }
      : { userId: u.id, userEmail: u.email, action: 'contract.request.portal', resource: 'contract', resourceId: r.id, metadata: { trdr, ref: r.ref } }).catch(() => null);
    revalidatePath('/admin/offer-requests');
    revalidatePath('/dashboard/customer/requests');
    revalidatePath('/admin/projects/contracts');
    return { ok: true, data: { ref: r.ref } };
  } catch (e) {
    if (e instanceof ContractError || e instanceof EntityFileError) return { ok: false, message: e.message };
    console.error('[offer-request]', e);
    return { ok: false, message: 'Κάτι πήγε στραβά — δοκιμάστε ξανά ή καλέστε μας.' };
  }
}

const agentInput = z.object({
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) })).min(1).max(60),
  draft: rfpDraft, photos: z.number().int().min(0).max(20).default(0),
  /** Αποθηκευμένη τοποθεσία που διάλεξε ο πελάτης — ο βοηθός δεν τη ρωτά ξανά. */
  knownSite: z.string().max(300).nullish().transform((v) => v || null),
});

/** Ένας γύρος του AI βοηθού «Ζητήστε προσφορά» (δεν αποθηκεύει τίποτα). */
export async function rfpAgentAction(raw: unknown): Promise<ActionResult<AgentTurn>> {
  // Και σε «Προβολή ως» (δοκιμή από το admin): ο βοηθός μόνο συνομιλεί, η αποστολή μένει φραγμένη.
  const u = await getPortalUser();
  const trdr = customerTrdrOf(u);
  if (!u || trdr == null) return { ok: false, message: 'Η σύνδεση έληξε — συνδεθείτε ξανά.' };
  const v = agentInput.safeParse(raw);
  if (!v.success) return { ok: false, message: 'Η συνομιλία έγινε πολύ μεγάλη — στείλτε το αίτημα ή ξεκινήστε ξανά.' };
  try {
    return { ok: true, data: await rfpAgentTurn({ ...v.data, customerName: u.name ?? null, userId: u.id }) };
  } catch (e) {
    console.error('[rfp-agent]', e);
    return { ok: false, message: 'Ο βοηθός δεν απάντησε αυτή τη στιγμή — δοκιμάστε ξανά ή συμπληρώστε τη φόρμα.' };
  }
}
