/**
 * Συμβατότητα: το παλιό «λιτό» πρότυπο του website. Πλέον αποδίδεται με το ΚΟΙΝΟ layout όλων των
 * email (lib/email/layout.ts), ώστε όποιος κώδικας το καλεί ακόμη να έχει την ίδια ταυτότητα.
 * Νέος κώδικας: lib/email/templates.ts (θέμα + HTML + απλό κείμενο).
 */
import { codeBox, esc, rawHtml, renderEmail } from '@/lib/email/layout';

export function siteEmailHtml(opts: { brand: string; title: string; intro?: string; body?: string; code?: string; footer?: string }) {
  return renderEmail({
    brand: { name: opts.brand.trim() || 'ATELIER' },
    subject: opts.title,
    title: opts.title,
    intro: opts.intro,
    blocks: [opts.code ? codeBox(opts.code) : rawHtml(''), rawHtml(opts.body ?? '')],
    note: opts.footer ?? 'Αν δεν το ζητήσατε εσείς, αγνοήστε αυτό το μήνυμα.',
    internal: false,
  }).html;
}

export { esc as escapeHtml };
