import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/db';
import { sendTransactionalEmail } from '@/lib/mailgun';
import { emailBrand } from '@/lib/email/brand';
import { otpEmail } from '@/lib/email/templates';

export type OtpType = 'register' | 'reset' | 'login';

const TTL_MIN = 15;
/** Το πολύ τόσοι κωδικοί ανά email ανά TTL — αλλιώς σιωπηλά τίποτα (όχι spam στο inbox του χρήστη). */
export const MAX_SENDS = 3;
export const MAX_ATTEMPTS = 5;

function generateCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Νέος κωδικός: ακυρώνει τους προηγούμενους ίδιου τύπου (ισχύει μόνο ο τελευταίος) και τον στέλνει.
 * Επιστρέφει false αν κόπηκε από το όριο αποστολών.
 */
export async function createOtpToken(email: string, type: OtpType, userId?: string) {
  const since = new Date(Date.now() - TTL_MIN * 60_000);
  const recent = await prisma.otpToken.count({ where: { email, type, createdAt: { gt: since } } });
  if (recent >= MAX_SENDS) return false;

  const code = generateCode();
  await prisma.$transaction([
    prisma.otpToken.updateMany({ where: { email, type, used: false }, data: { used: true } }),
    prisma.otpToken.create({
      data: { email, type, userId, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + TTL_MIN * 60_000) },
    }),
  ]);

  const brand = await emailBrand();
  const m = otpEmail(brand, { kind: type, code, minutes: TTL_MIN });
  await sendTransactionalEmail(email, m.subject, m.html, { fromName: brand.name, text: m.text });
  return true;
}

/** Σωστός κωδικός → «καίγεται» και true. Λάθος → +1 προσπάθεια· στις MAX_ATTEMPTS ακυρώνεται. */
export async function verifyOtpToken(email: string, code: string, type: OtpType) {
  const token = await prisma.otpToken.findFirst({
    where: { email, type, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!token) return false;
  if (!/^\d{6}$/.test(code) || !(await bcrypt.compare(code, token.codeHash))) {
    const attempts = token.attempts + 1;
    await prisma.otpToken.update({ where: { id: token.id }, data: { attempts, used: attempts >= MAX_ATTEMPTS } });
    return false;
  }
  await prisma.otpToken.update({ where: { id: token.id }, data: { used: true } });
  return true;
}
