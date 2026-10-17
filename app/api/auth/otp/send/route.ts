import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { createOtpToken } from '@/lib/otp';
import { isEmail, normEmail, pendingCookie, redirectTo, type PendingMode } from '@/lib/auth-flow';

/**
 * «Ξέχασα τον κωδικό» / «Σύνδεση με κωδικό email». Απαντάει ΠΑΝΤΑ το ίδιο (→ σελίδα εισαγωγής
 * κωδικού), είτε υπάρχει ο λογαριασμός είτε όχι — δεν προδίδει ποια email είναι πελάτες μας.
 * Email στέλνεται μόνο σε ενεργό χρήστη (και για σύνδεση, σε επιβεβαιωμένο email).
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = normEmail(form.get('email'));
  const mode = form.get('mode')?.toString() as PendingMode;
  const back = mode === 'login' ? '/auth/signin?mode=otp' : '/auth/lost-password';

  if (mode !== 'reset' && mode !== 'login') return redirectTo('/auth/signin?error=missing');
  if (!isEmail(email)) return redirectTo(`${back}${back.includes('?') ? '&' : '?'}error=email`);

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, isActive: true, emailVerified: true } });
  if (user?.isActive && (mode === 'reset' || user.emailVerified)) {
    try {
      await createOtpToken(email, mode, user.id);
    } catch (e) {
      console.error('[otp/send] αποτυχία αποστολής', e instanceof Error ? e.message : e);
      return redirectTo(`${back}${back.includes('?') ? '&' : '?'}error=send`);
    }
  }
  return redirectTo('/auth/verify-otp', pendingCookie({ email, mode }));
}
