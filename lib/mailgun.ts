import Mailgun from 'mailgun.js';

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

export async function sendTransactionalEmail(to: string, subject: string, html: string, opts: { replyTo?: string | null; fromName?: string | null } = {}) {
  const { domain, address } = mailgunConfig();
  return getClient().messages.create(domain, {
    from: opts.fromName ? `${opts.fromName.replace(/[<>"]/g, '').trim()} <${address}>` : address,
    to,
    subject,
    html,
    ...(opts.replyTo ? { 'h:Reply-To': opts.replyTo } : {}),
  });
}
