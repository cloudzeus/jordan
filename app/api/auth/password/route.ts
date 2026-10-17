import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { createSessionToken, createAuthenticatedResponse } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { homeFor } from '@/lib/auth-home';
import { normEmail } from '@/lib/auth-flow';

// Σταθερό hash για όταν δεν υπάρχει χρήστης: ίδιος χρόνος απόκρισης ⇒ δεν προδίδεται ποια email υπάρχουν.
let dummyHash: string | null = null;
const dummy = () => (dummyHash ??= bcrypt.hashSync('no-such-user', 12));
const fail = (error: string) => new Response(null, { status: 302, headers: { Location: `/auth/signin?error=${error}` } });

/** Είσοδος με email + κωδικό → προσωπικό στη διαχείριση, πελάτες/συνεργάτες στο portal τους. */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = normEmail(formData.get('email'));
  const password = formData.get('password')?.toString();
  if (!email || !password) return fail('missing');

  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? dummy());
  if (!user || !user.passwordHash || !ok || !user.emailVerified) return fail('invalid');
  if (!user.isActive) return fail('inactive');

  await logAudit({
    userId: user.id, userEmail: user.email,
    action: 'auth.login', resource: 'session',
    metadata: { method: 'password' },
  });
  return createAuthenticatedResponse(homeFor(user.role.key), createSessionToken(user.id));
}
