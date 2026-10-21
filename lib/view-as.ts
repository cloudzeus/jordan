import 'server-only';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

/**
 * «Προβολή ως» — ο διαχειριστής βλέπει το portal ενός πελάτη/συνεργάτη/συνεργείου όπως το βλέπει εκείνος.
 *
 * Ασφάλεια:
 *  • το cookie είναι υπογεγραμμένο και δεμένο με τον διαχειριστή (`by`): άλλος χρήστης δεν το αξιοποιεί·
 *  • ισχύει μόνο για ΑΝΑΓΝΩΣΗ — οι σελίδες του portal και οι λήψεις αρχείων το λαμβάνουν υπόψη, οι
 *    ενέργειες (παραγγελίες, κρατήσεις, πληρωμές) κρίνονται πάντα με τον πραγματικό χρήστη, άρα
 *    απορρίπτονται·
 *  • λήγει σε 2 ώρες και καταγράφεται στο audit log.
 */

const COOKIE = 'erp_view_as';
const SECRET = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'dev-session-secret';
const MAX_AGE = 2 * 60 * 60;

type Claims = { sub: string; by: string; back: string };

export async function setViewAs(targetUserId: string, adminId: string, back: string) {
  const token = jwt.sign({ sub: targetUserId, by: adminId, back, kind: 'view_as' }, SECRET, { expiresIn: MAX_AGE });
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: MAX_AGE, secure: process.env.NODE_ENV === 'production' });
}

/** Ο χρήστης-στόχος, μόνο αν το cookie εκδόθηκε για ΑΥΤΟΝ τον διαχειριστή. */
export async function readViewAs(adminId: string): Promise<Claims | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const c = jwt.verify(token, SECRET) as Claims & { kind?: string };
    return c.kind === 'view_as' && c.by === adminId && c.sub ? { sub: c.sub, by: c.by, back: c.back || '/admin/users' } : null;
  } catch {
    return null;
  }
}

export async function clearViewAs() {
  (await cookies()).delete(COOKIE);
}
