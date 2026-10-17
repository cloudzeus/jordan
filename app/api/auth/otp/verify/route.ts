import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyOtpToken } from '@/lib/otp';
import { createSessionToken, sessionCookie } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { homeFor, passwordProblem } from '@/lib/auth-home';
import { PENDING_COOKIE, parsePending, pendingCookie, redirectTo } from '@/lib/auth-flow';

export async function POST(request: NextRequest) {
  const pending = parsePending(request.cookies.get(PENDING_COOKIE)?.value);
  if (!pending) return redirectTo('/auth/signin?error=expired');
  const { email, mode } = pending;

  const form = await request.formData();
  const code = form.get('code')?.toString().replace(/\s/g, '') ?? '';
  const password = form.get('password')?.toString();
  const confirm = form.get('confirm')?.toString() ?? '';

  // Ο νέος κωδικός ελέγχεται ΠΡΙΝ «καεί» το OTP — αλλιώς ένα τυπογραφικό θα ζητούσε νέο email.
  if (mode === 'reset') {
    const problem = passwordProblem(password, confirm);
    if (problem) return redirectTo(`/auth/verify-otp?error=${problem}`);
  }

  if (!(await verifyOtpToken(email, code, mode))) return redirectTo('/auth/verify-otp?error=invalid');

  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
  if (!user || !user.isActive) return redirectTo('/auth/signin?error=invalid', pendingCookie(null));

  if (mode === 'reset') {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password!, 12), emailVerified: user.emailVerified ?? new Date() },
    });
    await logAudit({ userId: user.id, userEmail: user.email, action: 'auth.password_reset', resource: 'user', metadata: { method: 'otp' } });
    return redirectTo('/auth/signin?success=reset', pendingCookie(null));
  }

  await logAudit({ userId: user.id, userEmail: user.email, action: 'auth.login', resource: 'session', metadata: { method: 'otp' } });
  return redirectTo(homeFor(user.role.key), pendingCookie(null), sessionCookie(createSessionToken(user.id)));
}
