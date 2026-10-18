import 'server-only';
import { getSetting } from '@/lib/settings';
import { mailgunConfig, sendTransactionalEmail } from '@/lib/mailgun';

/**
 * Αποστολές του website για ραντεβού/newsletter. Δύο δικλίδες ώστε οι δοκιμές να ΜΗ στέλνουν ποτέ
 * πραγματικό email:
 *  • παραλήπτης σε δεσμευμένο domain (RFC 2606/6761: example.com/.org/.net, *.test, *.example,
 *    *.invalid, *.localhost) → καμία αποστολή, μόνο γραμμή στο log·
 *  • `MAIL_DRY_RUN=1` στο περιβάλλον → καμία αποστολή προς κανέναν.
 * Το προσωπικό ειδοποιείται στο `leads.notifyEmail` (κενό = email επικοινωνίας, «off» = κανένα).
 */

const RESERVED = /@(?:[^@]+\.)?(?:example\.(?:com|org|net)|[^@]+\.(?:test|example|invalid|localhost))$/i;
export const isReservedRecipient = (to: string) => RESERVED.test(to.trim());

export type MailResult = 'sent' | 'skipped' | 'failed';

export async function sendLeadMail(to: string, subject: string, html: string, opts: { replyTo?: string | null } = {}): Promise<MailResult> {
  if (process.env.MAIL_DRY_RUN === '1' || isReservedRecipient(to)) {
    console.info(`[lead-mail] δεν στάλθηκε (δοκιμή) → ${to}: ${subject}`);
    return 'skipped';
  }
  try {
    const brand = (await getSetting<string>('company.name'))?.trim() || 'Atelier by Damask';
    await sendTransactionalEmail(to, subject, html, { replyTo: opts.replyTo, fromName: brand });
    return 'sent';
  } catch (e) {
    console.error('[lead-mail] αποτυχία αποστολής', e instanceof Error ? e.message : e);
    return 'failed';
  }
}

/** Ο παραλήπτης των ειδοποιήσεων προσωπικού, ή `null` όταν είναι κλειστές. */
export async function staffRecipient(): Promise<string | null> {
  const [notify, inbox] = await Promise.all([getSetting<string>('leads.notifyEmail'), getSetting<string>('company.email')]);
  const v = typeof notify === 'string' ? notify.trim() : '';
  if (v.toLowerCase() === 'off') return null;
  return v || inbox?.trim() || mailgunConfig().address;
}

export const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
