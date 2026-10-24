// lib/messages-core.ts — καθαρή λογική της «Επικοινωνίας»: είσοδος, παραλήπτες και πώς ένα μήνυμα μπαίνει στο ιστορικό.
import { z } from 'zod';
import type { HistoryEntry } from './contracts/history-core';

export type Audience = 'CUSTOMER' | 'SUPPLIER' | 'PARTNER' | 'INTERNAL';
export type Recipient = { key: string; audience: Audience; name: string; email: string | null; partyRef: string | null; hint: string | null };

export const AUDIENCE_LABEL: Record<Audience, string> = { CUSTOMER: 'Πελάτης', SUPPLIER: 'Συνεργείο', PARTNER: 'Συνεργάτης', INTERNAL: 'Εσωτερικά' };

export const messageInput = z.object({
  prjc: z.number().int().nullish().transform((v) => v ?? null),
  trdr: z.number().int().nullish().transform((v) => v ?? null),
  contractId: z.string().max(64).nullish().transform((v) => v || null),
  recipientKey: z.string().min(1).max(200),
  /** SEND: αποστολή τώρα · LOG: καταγραφή επικοινωνίας που έγινε αλλού (τηλέφωνο, συνάντηση). */
  kind: z.enum(['SEND', 'LOG']).default('SEND'),
  viaEmail: z.boolean().default(false),
  viaPortal: z.boolean().default(false),
  subject: z.string().trim().min(2, 'Γράψτε θέμα').max(200),
  /** Απλό κείμενο (για ιστορικό, αναζήτηση, plain-text email). */
  body: z.string().trim().min(2, 'Γράψτε το μήνυμα').max(10_000),
  /** Μορφοποιημένο κείμενο από τον editor — καθαρίζεται στον server. */
  bodyHtml: z.string().max(100_000).nullish().transform((v) => v?.trim() || null),
  /** Κοινοποίηση (Cc). */
  cc: z.array(z.string().trim().toLowerCase().email('Μη έγκυρο email στην κοινοποίηση')).max(10, 'Έως 10 στην κοινοποίηση').default([]),
}).refine((m) => m.prjc != null || m.trdr != null, { message: 'Λείπει έργο ή πελάτης' });
export type MessageInput = z.infer<typeof messageInput>;

// ── Μυστικός κωδικός απάντησης ────────────────────────────────────────────────────────────────
// Κάθε μήνυμα έχει κωδικό 8 χαρακτήρων (χωρίς 0/O/1/I για να μη μπερδεύονται). Πάει στο θέμα «[#ΚΩΔ]»,
// στο Reply-To (reply+κωδ@MAIL_REPLY_DOMAIN) και στο header X-DG-Ref· όταν συνδεθεί το mailbox, η
// απάντηση βρίσκει το μήνυμά της με `findReplyCode`.
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newReplyCode(): string {
  const b = new Uint8Array(8);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => CODE_ABC[x % CODE_ABC.length]).join('');
}
export const subjectWithCode = (subject: string, code: string) => `${subject} [#${code}]`;
/** Βρίσκει τον κωδικό σε θέμα, διεύθυνση (reply+κωδ@…) ή header. */
export function findReplyCode(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const m = t.match(/\[#([A-Z2-9]{8})\]/) ?? t.match(/reply\+([a-z2-9]{8})@/i) ?? t.match(/^\s*([A-Z2-9]{8})\s*$/);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

/** Τα κανάλια που ισχύουν πραγματικά για τον παραλήπτη (π.χ. χωρίς email → όχι email· πύλη μόνο για πελάτη). */
export function effectiveChannels(m: Pick<MessageInput, 'kind' | 'viaEmail' | 'viaPortal'>, r: Pick<Recipient, 'audience' | 'email'>): { viaEmail: boolean; viaPortal: boolean } {
  if (m.kind === 'LOG' || r.audience === 'INTERNAL') return { viaEmail: false, viaPortal: false };
  return { viaEmail: m.viaEmail && !!r.email, viaPortal: m.viaPortal && r.audience === 'CUSTOMER' };
}

export type MessageRow = {
  id: string; contractId: string | null; audience: string; kind: string; toName: string | null; viaEmail: boolean; viaPortal: boolean;
  emailStatus: string | null; subject: string; body: string; attachments: number; authorName: string | null; createdAt: string;
  cc?: string[]; replyCode?: string | null;
};

/** Τι βλέπει ο πελάτης: μόνο ό,τι του στάλθηκε στην πύλη. */
export const customerSees = (m: Pick<MessageRow, 'audience' | 'kind' | 'viaPortal'>) => m.audience === 'CUSTOMER' && m.kind === 'SEND' && m.viaPortal;

export function messageEntries(rows: MessageRow[], viewer: 'STAFF' | 'CUSTOMER', opts: { companyName?: string; refs?: Record<string, string> } = {}): HistoryEntry[] {
  return rows.filter((m) => viewer === 'STAFF' || customerSees(m)).map((m) => {
    const title = m.kind === 'LOG' ? 'Επικοινωνία (καταγραφή)'
      : m.audience === 'INTERNAL' ? 'Εσωτερική σημείωση'
      : viewer === 'CUSTOMER' ? 'Μήνυμα'
      : m.viaEmail && m.viaPortal ? 'Μήνυμα · email + πύλη' : m.viaEmail ? 'Email' : m.viaPortal ? 'Μήνυμα στην πύλη' : 'Μήνυμα';
    const status = viewer === 'STAFF' && m.viaEmail && m.emailStatus && m.emailStatus !== 'SENT'
      ? m.emailStatus === 'BLOCKED' ? 'το email δεν στάλθηκε (πριν το live)' : 'το email απέτυχε' : null;
    const target = viewer === 'STAFF'
      ? [m.toName ? `προς ${m.toName}${m.audience !== 'CUSTOMER' && m.audience !== 'INTERNAL' ? ` (${AUDIENCE_LABEL[m.audience as Audience] ?? m.audience})` : ''}` : null, status, m.cc?.length ? `κοιν. ${m.cc.join(', ')}` : null, m.attachments ? `${m.attachments} συνημμένα` : null, m.replyCode && m.viaEmail ? `#${m.replyCode}` : null].filter(Boolean).join(' · ') || null
      : m.attachments ? `${m.attachments} συνημμένα` : null;
    return {
      id: m.id, contractId: m.contractId ?? '', contractRef: m.contractId ? opts.refs?.[m.contractId] ?? null : null, at: m.createdAt, source: 'NOTE' as const,
      title, body: `${m.subject}\n${m.body}`,
      who: viewer === 'CUSTOMER' ? (opts.companyName ?? 'Εμείς') : m.authorName ?? 'Εμείς',
      fromCustomer: false, target, revision: null, open: false,
    };
  });
}
