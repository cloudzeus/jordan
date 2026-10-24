// lib/messages.ts — SERVER. «Επικοινωνία» από τη διαχείριση: παραλήπτες ενός έργου/πελάτη, αποστολή (email + πύλη)
// ή καταγραφή, συνημμένα στα αρχεία του έργου/πελάτη (φάκελος «Επικοινωνία»). Όλα μπαίνουν στο ιστορικό.
// Το email περνά από τον φύλακα του lib/mailgun (πριν το live μόνο προσωπικό + MAIL_ALLOW).
import 'server-only';
import type { Prisma } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { sendTransactionalEmail, type MailAttachment } from '@/lib/mailgun';
import { emailBrand } from '@/lib/email/brand';
import { staffMessageEmail } from '@/lib/email/templates';
import { htmlToText } from '@/lib/email/layout';
import { appUrl } from '@/lib/app-url';
import { uploadEntityFile } from '@/lib/entity-files/service';
import { effectiveChannels, newReplyCode, type MessageInput, type MessageRow, type Recipient } from './messages-core';

export class MessageError extends Error {}

const MAX_ATTACH_BYTES = 15 * 1024 * 1024;

/** Μόνο ό,τι βγάζει ο editor (έντονα, πλάγια, λίστες, παράθεση, σύνδεσμοι)· τίποτα άλλο δεν φτάνει σε email/πύλη. */
export function cleanMessageHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'h3', 'a', 'code'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: { b: 'strong', i: 'em', h1: 'h3', h2: 'h3', h4: 'h3' },
  }).replace(/<p><\/p>/g, '').trim();
}

/** Reply-To με τον κωδικό, όταν οριστεί το domain εισερχομένων· αλλιώς το γενικό email της εταιρείας. */
function replyAddress(code: string, fallback: string) {
  const d = process.env.MAIL_REPLY_DOMAIN?.trim();
  return d ? `reply+${code.toLowerCase()}@${d}` : fallback;
}

/** Ποιοι μπορούν να λάβουν μήνυμα: ο πελάτης (στοιχεία, επαφές, χρήστες πύλης), τα συνεργεία/συνεργάτες των συμβάσεων, εσωτερικά. */
export async function messageRecipients(scope: { prjc?: number | null; trdr?: number | null }): Promise<{ trdr: number | null; recipients: Recipient[] }> {
  const project = scope.prjc != null ? await prisma.softoneProject.findUnique({ where: { prjc: scope.prjc }, select: { trdr: true } }) : null;
  const trdr = scope.trdr ?? project?.trdr ?? null;
  const out: Recipient[] = [];
  const seen = new Set<string>();
  const add = (r: Recipient) => {
    const k = `${r.audience}:${(r.email ?? r.name).toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k); out.push(r);
  };
  if (trdr != null) {
    const [t, contacts, users] = await Promise.all([
      prisma.softoneTrader.findUnique({ where: { trdr }, select: { name: true, email: true } }),
      prisma.customerContact.findMany({ where: { trdr }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], select: { id: true, name: true, email: true, role: true } }),
      prisma.user.findMany({ where: { customerTrdr: trdr, isActive: true }, select: { id: true, name: true, email: true } }),
    ]);
    for (const u of users) add({ key: `cust:user:${u.id}`, audience: 'CUSTOMER', name: u.name || u.email, email: u.email, partyRef: null, hint: 'χρήστης πύλης' });
    for (const c of contacts) add({ key: `cust:contact:${c.id}`, audience: 'CUSTOMER', name: c.name, email: c.email, partyRef: null, hint: c.role });
    if (t) add({ key: 'cust:trader', audience: 'CUSTOMER', name: t.name, email: t.email, partyRef: null, hint: 'στοιχεία πελάτη' });
  }
  const contractWhere: Prisma.ContractWhereInput | null = scope.prjc != null ? { prjc: scope.prjc } : trdr != null ? { trdr } : null;
  if (contractWhere) {
    const parties = await prisma.contractParty.findMany({ where: { contract: contractWhere }, select: { id: true, kind: true, name: true, email: true, trdr: true, partnerId: true } });
    for (const p of parties) {
      add({ key: `party:${p.id}`, audience: p.kind === 'PARTNER' ? 'PARTNER' : 'SUPPLIER', name: p.name, email: p.email, partyRef: p.kind === 'PARTNER' ? p.partnerId : p.trdr != null ? String(p.trdr) : null, hint: p.kind === 'PARTNER' ? 'συνεργάτης' : 'συνεργείο' });
    }
  }
  out.push({ key: 'internal', audience: 'INTERNAL', name: 'Εσωτερική σημείωση', email: null, partyRef: null, hint: 'μόνο για το προσωπικό' });
  return { trdr, recipients: out };
}

export async function sendMessage(input: MessageInput, files: File[], user: { id: string; name: string | null; email: string }) {
  const { trdr, recipients } = await messageRecipients({ prjc: input.prjc, trdr: input.trdr });
  const r = recipients.find((x) => x.key === input.recipientKey);
  if (!r) throw new MessageError('Ο παραλήπτης δεν βρέθηκε — ανοίξτε ξανά το παράθυρο.');
  const ch = effectiveChannels(input, r);
  if (input.kind === 'SEND' && r.audience !== 'INTERNAL' && !ch.viaEmail && !ch.viaPortal) {
    throw new MessageError(r.email ? 'Διαλέξτε email ή/και πύλη.' : 'Ο παραλήπτης δεν έχει email — στείλτε στην πύλη ή καταγράψτε την επικοινωνία.');
  }
  if (input.contractId) {
    const c = await prisma.contract.findFirst({ where: { id: input.contractId, ...(input.prjc != null ? { prjc: input.prjc } : { trdr: trdr ?? -1 }) }, select: { id: true } });
    if (!c) throw new MessageError('Η προσφορά δεν ανήκει σε αυτό το έργο/πελάτη.');
  }
  const html = input.bodyHtml ? cleanMessageHtml(input.bodyHtml) : null;
  const body = html ? htmlToText(html) || input.body : input.body;
  const cc = r.audience === 'INTERNAL' || input.kind === 'LOG' || !ch.viaEmail ? [] : [...new Set(input.cc)].filter((e) => e !== r.email?.toLowerCase());
  const replyCode = newReplyCode();
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_ATTACH_BYTES) throw new MessageError('Τα συνημμένα ξεπερνούν τα 15 MB.');

  // Συνημμένα: στα αρχεία του έργου (ή του πελάτη), φάκελος «Επικοινωνία».
  const owner = input.prjc != null ? { type: 'PROJECT' as const, id: input.prjc } : trdr != null ? { type: 'TRADER' as const, id: trdr } : null;
  const mail: MailAttachment[] = [];
  const fileIds: string[] = [];
  for (const f of files) {
    const buffer = Buffer.from(await f.arrayBuffer());
    if (owner) {
      const saved = await uploadEntityFile({ type: owner.type, id: owner.id, buffer, name: f.name, subfolder: 'Επικοινωνία', notes: `Συνημμένο: ${input.subject}`, user });
      fileIds.push(saved.id);
    }
    mail.push({ filename: f.name, content: new Uint8Array(buffer), contentType: f.type || 'application/octet-stream' });
  }

  let emailStatus: string | null = null;
  if (ch.viaEmail && r.email) {
    try {
      const [brand, inbox, project] = await Promise.all([
        emailBrand(), getSetting<string>('company.email'),
        input.prjc != null ? prisma.softoneProject.findUnique({ where: { prjc: input.prjc }, select: { code: true, name: true } }) : null,
      ]);
      const base = appUrl();
      const link = ch.viaPortal && base ? `${base}/dashboard/customer${input.prjc != null ? `/projects/${input.prjc}` : ''}` : null;
      const context = project ? [project.code, project.name].filter(Boolean).join(' · ') : null;
      const m = staffMessageEmail(brand, {
        subject: input.subject, body, html, context, link, attachments: mail.length, replyCode,
        sender: { name: user.name ?? user.email, email: user.email },
      });
      const res = await sendTransactionalEmail(r.email, m.subject, m.html, {
        fromName: brand.name, replyTo: replyAddress(replyCode, inbox?.trim() || user.email), text: m.text, attachments: mail, cc,
        headers: { 'X-DG-Ref': replyCode },
      });
      emailStatus = res && 'blocked' in res && res.blocked ? 'BLOCKED' : 'SENT';
    } catch (e) {
      console.error('[message-mail]', e instanceof Error ? e.message : e);
      emailStatus = 'FAILED';
    }
  }
  return prisma.message.create({
    data: {
      prjc: input.prjc, trdr, contractId: input.contractId, audience: r.audience, kind: input.kind,
      toName: r.audience === 'INTERNAL' ? null : r.name, toEmail: r.email, partyRef: r.partyRef,
      viaEmail: ch.viaEmail, viaPortal: ch.viaPortal, emailStatus, subject: input.subject, body, bodyHtml: html, cc, replyCode,
      attachmentFileIds: fileIds, authorId: user.id, authorName: user.name ?? user.email,
    },
    select: { id: true, emailStatus: true, replyCode: true },
  });
}

/** Μηνύματα για το ιστορικό (ανά προσφορά, έργο — προαιρετικά μόνο ενός πελάτη — ή πελάτη). */
export async function messageRows(where: Prisma.MessageWhereInput, take = 500): Promise<MessageRow[]> {
  const rows = await prisma.message.findMany({ where, orderBy: { createdAt: 'desc' }, take });
  return rows.map((m) => ({
    id: m.id, contractId: m.contractId, audience: m.audience, kind: m.kind, toName: m.toName, viaEmail: m.viaEmail, viaPortal: m.viaPortal,
    emailStatus: m.emailStatus, subject: m.subject, body: m.body, attachments: m.attachmentFileIds.length, authorName: m.authorName, createdAt: m.createdAt.toISOString(),
    cc: m.cc, replyCode: m.replyCode, bodyHtml: m.bodyHtml,
  }));
}
