import Mailgun from 'mailgun.js';
import { htmlToText } from '@/lib/email/layout';
import type { RoleKey } from '@prisma/client';
import { prisma } from '@/lib/db';

type MailgunClient = ReturnType<InstanceType<typeof Mailgun>['client']>;

let cached: MailgunClient | null = null;

/**
 * Ο client φτιάχνεται ΜΟΝΟ στην πρώτη αποστολή. Το mailgun.js πετάει «Parameter "key" is
 * required» όταν το κλειδί λείπει, οπότε μια κατασκευή σε module scope έσπαγε το `next build`
 * (collect page data) σε περιβάλλον χωρίς MAILGUN_API_KEY — π.χ. στο Docker build.
 */
/**
 * Ρυθμίσεις από το περιβάλλον, ανεκτικές σε συνηθισμένα λάθη του .env:
 *  • `MAILGUN_ENDPOINT` γραμμένο ως πλήρες URL (`https://api.eu.mailgun.net/v3/dgsmart.gr`) — το
 *    mailgun.js θέλει ΜΟΝΟ τη βάση· με το path κάθε αποστολή έπεφτε σε «404 page not found» και
 *    το mailgun.js έσκαγε με «Unexpected non-whitespace character after JSON». Κρατάμε τη βάση και
 *    παίρνουμε το domain από το path αν λείπει το `MAILGUN_DOMAIN`.
 *  • ΚΕΝΕΣ μεταβλητές (`MAILGUN_DOMAIN=`) μετράνε ως «λείπει» (`||`, όχι `??`).
 */
export function mailgunConfig() {
  const raw = (process.env.MAILGUN_ENDPOINT || 'https://api.eu.mailgun.net').trim();
  const m = /^(https?:\/\/[^/]+)(?:\/v3\/([^/?#]+))?/i.exec(raw);
  const url = m?.[1] ?? 'https://api.eu.mailgun.net';
  const domain = (process.env.MAILGUN_DOMAIN || m?.[2] || 'dgsmart.gr').trim();
  const address = (process.env.SHARED_MAILBOX_ADDRESS || `connect@${domain}`).trim();
  return { url, domain, address };
}

function getClient(): MailgunClient {
  if (cached) return cached;
  const key = process.env.MAILGUN_API_KEY ?? '';
  if (!key) throw new Error('MAILGUN_API_KEY is not configured');
  // ΕΓΓΕΝΕΣ FormData (Node 18+). Με το πακέτο `form-data` το mailgun.js (fetch) έστελνε ΚΕΝΟ σώμα
  // και το Mailgun απαντούσε 400 «from parameter is missing» — καμία αποστολή δεν έφευγε.
  const mailgun = new Mailgun(FormData as unknown as ConstructorParameters<typeof Mailgun>[0]);
  cached = mailgun.client({ username: 'api', key, url: mailgunConfig().url });
  return cached;
}

export type MailAttachment = { filename: string; content: string | Uint8Array; contentType: string };

/**
 * Κάθε email φεύγει ΚΑΙ με απλό κείμενο (multipart/alternative): το `text` των προτύπων, αλλιώς
 * παράγεται από το HTML — καλύτερη παράδοση (spam filters) και ανάγνωση σε clients χωρίς HTML.
 * Συνημμένα: με το ΕΓΓΕΝΕΣ FormData το mailgun.js καλεί `append(name, data, filename)` — που δέχεται
 * μόνο Blob όταν δίνεται filename. Γι' αυτό κάθε συνημμένο γίνεται Blob με τον σωστό τύπο.
 */
// ── Φραγμός πριν το live ─────────────────────────────────────────────────────────────────────────
// Μέχρι να βγει live η εφαρμογή ΔΕΝ φεύγει email σε πελάτες/προμηθευτές/τρίτους (παράπονα 10/2026):
// επιτρέπονται ΜΟΝΟ email ενεργών χρηστών του προσωπικού (SUPER_ADMIN/ADMIN/EMPLOYEE). Οι υπόλοιποι
// παραλήπτες κόβονται σιωπηλά (γραμμή στο log). Άνοιγμα για όλους: `MAIL_LIVE=1` στο περιβάλλον.
// Ρητές εξαιρέσεις (π.χ. demo πελάτης): `MAIL_ALLOW=a@x.gr,b@y.gr`.
const STAFF_ROLES: RoleKey[] = ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'];
export const mailLive = () => process.env.MAIL_LIVE === '1';
export const mailAllowList = () => new Set((process.env.MAIL_ALLOW ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));

/** Οι παραλήπτες (λίστα με κόμμα) που επιτρέπεται να λάβουν email τώρα. */
export async function allowedRecipients(to: string): Promise<string[]> {
  const list = to.split(',').map((x) => x.trim()).filter(Boolean);
  if (mailLive() || !list.length) return list;
  const staff = await prisma.user.findMany({
    where: { isActive: true, email: { in: list, mode: 'insensitive' }, role: { key: { in: STAFF_ROLES } } },
    select: { email: true },
  });
  const ok = new Set([...staff.map((u) => u.email.toLowerCase()), ...mailAllowList()]);
  return list.filter((e) => ok.has(e.toLowerCase()));
}

export async function sendTransactionalEmail(to: string, subject: string, html: string, opts: { replyTo?: string | null; fromName?: string | null; attachments?: MailAttachment[]; text?: string | null; cc?: string[]; headers?: Record<string, string> } = {}) {
  const allowed = await allowedRecipients(to);
  if (!allowed.length) {
    console.info(`[mail] ΔΕΝ στάλθηκε (πριν το live μόνο σε χρήστες προσωπικού) → ${to}: ${subject}`);
    return { id: null, message: 'blocked-before-live', blocked: true as const };
  }
  if (allowed.length < to.split(',').filter((x) => x.trim()).length) console.info(`[mail] παραλήπτες εκτός προσωπικού αφαιρέθηκαν: ${to} → ${allowed.join(', ')}`);
  // Η κοινοποίηση περνά από τον ίδιο φραγμό (πριν το live μόνο προσωπικό + MAIL_ALLOW).
  const cc = opts.cc?.length ? await allowedRecipients(opts.cc.join(',')) : [];
  if (opts.cc && cc.length < opts.cc.length) console.info(`[mail] κοινοποίηση εκτός προσωπικού αφαιρέθηκε: ${opts.cc.join(', ')} → ${cc.join(', ') || '—'}`);
  const { domain, address } = mailgunConfig();
  return getClient().messages.create(domain, {
    from: opts.fromName ? `${opts.fromName.replace(/[<>"]/g, '').trim()} <${address}>` : address,
    to: allowed.join(', '),
    subject,
    html,
    text: opts.text || htmlToText(html),
    ...(cc.length ? { cc: cc.join(', ') } : {}),
    ...(opts.replyTo ? { 'h:Reply-To': opts.replyTo } : {}),
    ...Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [`h:${k}`, v])),
    ...(opts.attachments?.length ? { attachment: opts.attachments.map((a) => ({ filename: a.filename, data: new Blob([a.content as BlobPart], { type: a.contentType }) })) } : {}),
  });
}
