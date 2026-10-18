import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { escapeHtml, siteEmailHtml } from '@/lib/site-email';
import { ATELIER_PROFILE } from '@/lib/site-company';
import { appUrl, sendLeadMail, staffRecipient } from '@/lib/lead-mail';
import { syncLeadToSoftone, upsertLead } from '@/lib/leads';

/**
 * Newsletter με **διπλή συναίνεση** (double opt-in): η εγγραφή μένει PENDING μέχρι ο επισκέπτης να
 * πατήσει τον σύνδεσμο του email. ΜΟΝΟ τότε γίνεται CONFIRMED, δημιουργείται το Lead (και στο SoftOne,
 * αν επιτρέπεται) και ειδοποιείται το προσωπικό — έτσι ένα ξένο email δεν γίνεται ποτέ lead.
 */

export type NewsletterResult = 'pending' | 'already' | 'resent-too-soon';
const RESEND_AFTER_MS = 2 * 60_000;
const newToken = () => randomBytes(24).toString('base64url');

export async function subscribeNewsletter(input: { email: string; name?: string | null; source?: string | null }): Promise<NewsletterResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim().slice(0, 200) || null;
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
  if (existing?.status === 'CONFIRMED') return 'already';
  if (existing?.status === 'PENDING' && existing.confirmSentAt && Date.now() - existing.confirmSentAt.getTime() < RESEND_AFTER_MS) return 'resent-too-soon';

  const sub = existing
    ? await prisma.newsletterSubscriber.update({ where: { id: existing.id }, data: { status: 'PENDING', name: name ?? existing.name, source: input.source ?? existing.source, consentAt: new Date(), unsubscribedAt: null, token: newToken() } })
    : await prisma.newsletterSubscriber.create({ data: { email, name, source: input.source ?? null, token: newToken() } });

  const brand = await brandName();
  const link = `${appUrl()}/newsletter/confirm?token=${encodeURIComponent(sub.token)}`;
  const body = `<p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#1C3241;color:#FFFFFF;text-decoration:none;padding:14px 28px;font:500 15px/1 Helvetica,Arial,sans-serif">Επιβεβαίωση εγγραφής</a></p>
  <p style="margin:0;color:#8A847C;font-size:13px">Ή αντιγράψτε τον σύνδεσμο: <span style="word-break:break-all">${escapeHtml(link)}</span></p>`;
  await sendLeadMail(email, `Επιβεβαιώστε την εγγραφή σας · ${brand}`, siteEmailHtml({
    brand, title: 'Ένα βήμα ακόμη', intro: 'Πατήστε το κουμπί για να επιβεβαιώσετε ότι θέλετε να λαμβάνετε τα νέα του atelier: νέα υλικά, δυναμικές προσφορές container και εκδηλώσεις.',
    body, footer: 'Αν δεν κάνατε εσείς την εγγραφή, αγνοήστε αυτό το μήνυμα — δεν θα σας στείλουμε τίποτα.',
  }));
  await prisma.newsletterSubscriber.update({ where: { id: sub.id }, data: { confirmSentAt: new Date() } });
  return 'pending';
}

/** Για τη σελίδα επιβεβαίωσης: ποιο email/κατάσταση έχει ο σύνδεσμος (χωρίς αλλαγή). */
export async function peekNewsletterToken(token: string) {
  if (!token) return null;
  const s = await prisma.newsletterSubscriber.findUnique({ where: { token }, select: { email: true, status: true } });
  return s && s.status !== 'UNSUBSCRIBED' ? s : null;
}

export async function confirmNewsletter(token: string) {
  const sub = token ? await prisma.newsletterSubscriber.findUnique({ where: { token } }) : null;
  if (!sub) return { ok: false as const };
  if (sub.status === 'CONFIRMED') return { ok: true as const, email: sub.email, already: true };
  const lead = await upsertLead({ email: sub.email, name: sub.name }, 'newsletter');
  await prisma.newsletterSubscriber.update({ where: { id: sub.id }, data: { status: 'CONFIRMED', confirmedAt: new Date(), unsubscribedAt: null, leadId: lead.id } });
  await Promise.allSettled([syncLeadToSoftone(lead.id), notifyStaff(sub.email, sub.name, sub.source)]);
  return { ok: true as const, email: sub.email, already: false };
}

export async function unsubscribeNewsletter(token: string) {
  const sub = token ? await prisma.newsletterSubscriber.findUnique({ where: { token } }) : null;
  if (!sub) return { ok: false as const };
  if (sub.status !== 'UNSUBSCRIBED') await prisma.newsletterSubscriber.update({ where: { id: sub.id }, data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() } });
  return { ok: true as const, email: sub.email };
}

export async function listSubscribers() {
  const rows = await prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: 'desc' }, take: 2000 });
  return rows.map((s) => ({ id: s.id, email: s.email, name: s.name, status: s.status, source: s.source, createdAt: s.createdAt.toISOString(), confirmedAt: s.confirmedAt?.toISOString() ?? null, unsubscribedAt: s.unsubscribedAt?.toISOString() ?? null }));
}
export type SubscriberView = Awaited<ReturnType<typeof listSubscribers>>[number];

/** Το προσωπικό αφαιρεί συνδρομητή (π.χ. αίτημα μέσω τηλεφώνου) — η εγγραφή μένει ως UNSUBSCRIBED. */
export const staffUnsubscribe = (id: string) => prisma.newsletterSubscriber.update({ where: { id }, data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() } });

async function brandName() {
  return (await getSetting<string>('company.name'))?.trim() || ATELIER_PROFILE.brand;
}

async function notifyStaff(email: string, name: string | null, source: string | null) {
  const to = await staffRecipient();
  if (!to) return;
  const brand = await brandName();
  await sendLeadMail(to, `Νέος συνδρομητής newsletter — ${email}`, siteEmailHtml({
    brand, title: 'Νέα εγγραφή στο newsletter', intro: `${name ? `${name} · ` : ''}${email} επιβεβαίωσε την εγγραφή${source ? ` (από: ${source})` : ''}.`,
    body: `<p style="margin:16px 0 0"><a href="${appUrl()}/admin/leads" style="color:#1C3241">Leads & newsletter →</a></p>`, footer: 'Αυτόματη ειδοποίηση από το website.',
  }), { replyTo: email });
}
