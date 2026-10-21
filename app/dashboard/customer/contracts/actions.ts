'use server';

import { revalidatePath } from 'next/cache';
import { customerTrdrOf, getCurrentUserWithPermissions, getPortalUser } from '@/lib/rbac';
import { AcceptError, customerAcceptContract } from '@/lib/portal-customer';
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
