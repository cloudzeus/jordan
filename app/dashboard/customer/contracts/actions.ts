'use server';

import { revalidatePath } from 'next/cache';
import { customerTrdrOf, getCurrentUserWithPermissions, getPortalUser } from '@/lib/rbac';
import { AcceptError, customerAcceptContract, customerContract } from '@/lib/portal-customer';
import { addNote, noteInput } from '@/lib/contracts/notes';
import { ContractError } from '@/lib/contracts/service';
import { EntityFileError } from '@/lib/entity-files/core';
import type { ActionResult } from '@/lib/action-result';

/**
 * Αποδοχή προσφοράς από τον πελάτη. Ο χρήστης είναι ΠΑΝΤΑ ο πραγματικός της συνεδρίας — σε
 * «Προβολή ως» ο διαχειριστής δεν αποδέχεται εκ μέρους του πελάτη.
 */
export async function acceptOfferAction(id: string, agreed: boolean): Promise<ActionResult> {
  const viewer = await getPortalUser();
  if (viewer?.viewAs) return { ok: false, message: 'Σε «Προβολή ως» δεν γίνεται αποδοχή εκ μέρους του πελάτη.' };
  const u = await getCurrentUserWithPermissions();
  const trdr = customerTrdrOf(u);
  if (!u || trdr == null) return { ok: false, message: 'Η σύνδεση έληξε — συνδεθείτε ξανά.' };
  if (!agreed) return { ok: false, message: 'Επιβεβαιώστε ότι αποδέχεστε τους όρους της προσφοράς.' };
  try {
    await customerAcceptContract(trdr, id, { id: u.id, email: u.email, name: u.name });
  } catch (e) {
    if (e instanceof AcceptError) return { ok: false, message: e.message };
    console.error('[accept-offer]', e);
    return { ok: false, message: 'Κάτι πήγε στραβά — δοκιμάστε ξανά ή καλέστε μας.' };
  }
  revalidatePath('/dashboard/customer/contracts', 'layout');
  revalidatePath('/dashboard/customer');
  return { ok: true, data: undefined };
}

/**
 * Σημείωση / ειδική οδηγία του πελάτη σε σημείο της προσφοράς του (γενικά, χώρος, πληρωμή, εργασία),
 * με φωτογραφίες. FormData: `data` (JSON: targetType, targetId, targetLabel, body) + `photos`.
 */
export async function addCustomerNoteAction(id: string, form: FormData): Promise<ActionResult> {
  const viewer = await getPortalUser();
  if (viewer?.viewAs) return { ok: false, message: 'Σε «Προβολή ως» δεν γράφονται σημειώσεις εκ μέρους του πελάτη.' };
  const u = await getCurrentUserWithPermissions();
  const trdr = customerTrdrOf(u);
  if (!u || trdr == null) return { ok: false, message: 'Η σύνδεση έληξε — συνδεθείτε ξανά.' };
  if (!(await customerContract(trdr, id))) return { ok: false, message: 'Η προσφορά δεν βρέθηκε.' };
  const v = noteInput.safeParse(JSON.parse(String(form.get('data') ?? '{}')));
  if (!v.success) return { ok: false, message: v.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' };
  const photos = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  try {
    await addNote(id, v.data, photos, { kind: 'CUSTOMER', id: u.id, name: u.name ?? null, email: u.email });
  } catch (e) {
    if (e instanceof ContractError || e instanceof EntityFileError) return { ok: false, message: e.message };
    console.error('[customer-note]', e);
    return { ok: false, message: 'Κάτι πήγε στραβά — δοκιμάστε ξανά.' };
  }
  revalidatePath(`/dashboard/customer/contracts/${id}`);
  revalidatePath(`/admin/projects/contracts/${id}`);
  return { ok: true, data: undefined };
}
