import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/db';
import { sendTransactionalEmail } from '@/lib/mailgun';
import { getSetting } from '@/lib/settings';
import { siteEmailHtml } from '@/lib/site-email';

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

  const brand = (await getSetting<string>('company.name').catch(() => null)) ?? 'ATELIER';
  const title = type === 'reset' ? 'Νέος κωδικός πρόσβασης' : type === 'login' ? 'Κωδικός σύνδεσης' : 'Επιβεβαίωση email';
  const intro = type === 'reset'
    ? 'Χρησιμοποιήστε τον παρακάτω κωδικό για να ορίσετε νέο κωδικό πρόσβασης.'
    : 'Χρησιμοποιήστε τον παρακάτω κωδικό για να συνεχίσετε.';
  await sendTransactionalEmail(
    email,
    `${title} · ${brand.trim()}`,
    siteEmailHtml({ brand, title, intro, code, body: `<p style="margin:0">Ισχύει για ${TTL_MIN} λεπτά.</p>` }),
    { fromName: brand },
  );
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
