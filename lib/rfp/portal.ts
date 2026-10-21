import 'server-only';
import { NextResponse } from 'next/server';
import { getPortalUser, partyOf } from '@/lib/rbac';
import { partyRecipient } from './service';

/**
 * Παραλήπτης αιτήματος για τον συνδεδεμένο χρήστη του portal (συνεργάτης ή συνεργείο). Στην «Προβολή ως»
 * του admin επιτρέπεται μόνο ανάγνωση. Επιστρέφει είτε τον παραλήπτη είτε έτοιμη απάντηση σφάλματος.
 */
export async function portalRecipient(rid: string, write: boolean) {
  const u = await getPortalUser();
  const party = u ? partyOf(u) : null;
  if (!u || !party) return { error: NextResponse.json({ error: 'forbidden', message: 'Δεν έχετε πρόσβαση.' }, { status: 403 }) };
  if (write && u.viewAs) return { error: NextResponse.json({ error: 'view_as', message: 'Στην «Προβολή ως» δεν γίνονται αλλαγές.' }, { status: 403 }) };
  const r = await partyRecipient(party, rid);
  if (!r) return { error: NextResponse.json({ error: 'not_found', message: 'Το αίτημα δεν βρέθηκε.' }, { status: 404 }) };
  return { user: u, r };
}
