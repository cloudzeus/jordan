import 'server-only';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { escapeHtml, siteEmailHtml } from '@/lib/site-email';
import { ATELIER_PROFILE } from '@/lib/site-company';
import { sendLeadMail, type MailResult } from '@/lib/lead-mail';
import { appointmentCode, formatSlotEl } from '@/lib/appointments-core';
import { buildIcs } from '@/lib/ics';

/**
 * Email ραντεβού με συνημμένο .ics (Europe/Athens) — στον προσκεκλημένο (πελάτη/επαφή/συνεργάτη) ΚΑΙ
 * στον χρήστη της εφαρμογής που το έκλεισε (και στον υπεύθυνο, αν είναι άλλος). Ίδιο UID σε κάθε
 * αλλαγή, με αυξανόμενο SEQUENCE: η μεταφορά ενημερώνει και η ακύρωση σβήνει το ΙΔΙΟ γεγονός στο
 * ημερολόγιό τους. Οι δοκιμές δεν στέλνουν ποτέ (βλ. lib/lead-mail.ts: δεσμευμένα domains, MAIL_DRY_RUN).
 */

export type InviteKind = 'created' | 'rescheduled' | 'cancelled';
export type InviteResult = { invitee: MailResult | 'no-email' | 'off'; users: { email: string; result: MailResult }[] };

const COPY: Record<InviteKind, { subject: string; title: string; intro: string }> = {
  created: { subject: 'Ραντεβού', title: 'Νέο ραντεβού', intro: 'Κλείσαμε το παρακάτω ραντεβού. Το συνημμένο αρχείο το προσθέτει στο ημερολόγιό σας.' },
  rescheduled: { subject: 'Νέα ώρα για το ραντεβού', title: 'Το ραντεβού μεταφέρθηκε', intro: 'Η ώρα του ραντεβού άλλαξε. Το συνημμένο αρχείο ενημερώνει το ημερολόγιό σας.' },
  cancelled: { subject: 'Ακύρωση ραντεβού', title: 'Το ραντεβού ακυρώθηκε', intro: 'Το παρακάτω ραντεβού ακυρώθηκε. Το συνημμένο αρχείο το αφαιρεί από το ημερολόγιό σας.' },
};

const row = (k: string, v: string | null | undefined) => (v ? `<tr><td style="padding:6px 16px 6px 0;color:#8A847C;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 0;color:#1C1B19">${escapeHtml(v)}</td></tr>` : '');

export type InviteData = {
  id: string; number: number; start: Date; end: Date; topic: string | null; name: string; company: string | null;
  place: string; location: string | null; message: string | null; staffNote: string | null; sequence: number;
};

/** Το .ics και το HTML ενός ραντεβού — καθαρή συνάρτηση (για tests). */
export function inviteContent(kind: InviteKind, a: InviteData, brand: string, audience: 'invitee' | 'user', who?: { name: string; email: string } | null) {
  const c = COPY[kind];
  const code = appointmentCode(a.number);
  const where = a.place === 'customer' ? (a.location || 'Στον χώρο του πελάτη') : ATELIER_PROFILE.address;
  const party = a.company && a.company !== a.name ? `${a.company} (${a.name})` : a.name;
  const summary = audience === 'invitee' ? `${a.topic ?? 'Ραντεβού'} · ${brand}` : `${a.topic ?? 'Ραντεβού'} · ${party}`;
  const ics = buildIcs({
    uid: `appointment-${a.id}@atelierdamask.gr`, start: a.start, end: a.end, summary,
    description: [code, a.topic, audience === 'user' ? `Με: ${party}` : null, audience === 'user' ? a.message : null].filter(Boolean).join('\n'),
    location: where, sequence: a.sequence, cancelled: kind === 'cancelled',
    organizer: who ? { name: who.name, email: who.email } : null,
  });
  const body = `<table role="presentation" cellpadding="0" cellspacing="0" style="font:400 14px/1.5 Helvetica,Arial,sans-serif">${
    row('Ραντεβού', code) + row('Πότε', formatSlotEl(a.start.toISOString(), a.end.toISOString())) + row('Θέμα', a.topic)
    + row(audience === 'user' ? 'Με' : 'Πού', audience === 'user' ? party : where) + (audience === 'user' ? row('Πού', where) : '')
    + (who && audience === 'invitee' ? row('Από', who.name) : '')
  }</table>${a.staffNote && audience === 'invitee' ? `<p style="margin:16px 0 0;white-space:pre-wrap">${escapeHtml(a.staffNote)}</p>` : ''}${
    audience === 'user' && a.message ? `<p style="margin:16px 0 0;white-space:pre-wrap;color:#57534E">${escapeHtml(a.message)}</p>` : ''}`;
  const html = siteEmailHtml({ brand, title: c.title, intro: c.intro, body, footer: `${brand} · ${ATELIER_PROFILE.address} · ${ATELIER_PROFILE.phones[0]}` });
  return { subject: `${c.subject} ${code} · ${formatSlotEl(a.start.toISOString())}`, html, ics };
}

/**
 * Στέλνει τα email ενός ραντεβού. `invitee:false` → μόνο στους χρήστες (π.χ. όταν ο χρήστης έκλεισε
 * το διακόπτη «Email στον πελάτη»). Επιστρέφει τι έγινε για κάθε παραλήπτη — δεν πετάει ποτέ.
 */
export async function sendAppointmentInvites(id: string, kind: InviteKind, opts: { invitee?: boolean } = {}): Promise<InviteResult> {
  const a = await prisma.appointment.findUnique({ where: { id } });
  if (!a) return { invitee: 'failed', users: [] };
  const brand = (await getSetting<string>('company.name'))?.trim() || ATELIER_PROFILE.brand;
  const ids = [...new Set([a.createdById, a.assignedToId].filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, name: true, email: true } }) : [];
  const owner = users.find((u) => u.id === (a.assignedToId ?? a.createdById)) ?? users[0] ?? null;
  const who = owner ? { name: owner.name || owner.email, email: owner.email } : null;
  const data: InviteData = { id: a.id, number: a.number, start: a.startsAt, end: a.endsAt, topic: a.topic, name: a.name, company: a.company, place: a.place, location: a.location, message: a.message, staffNote: a.staffNote, sequence: a.icsSequence };
  const attach = (ics: string) => [{ filename: kind === 'cancelled' ? 'akyrosi-rantevou.ics' : 'rantevou.ics', content: ics, contentType: `text/calendar; charset=utf-8; method=${kind === 'cancelled' ? 'CANCEL' : 'PUBLISH'}` }];

  let invitee: InviteResult['invitee'] = 'off';
  if (opts.invitee !== false) {
    if (!a.email) invitee = 'no-email';
    else {
      const m = inviteContent(kind, data, brand, 'invitee', who);
      invitee = await sendLeadMail(a.email, m.subject, m.html, { replyTo: who?.email ?? ATELIER_PROFILE.salesEmail, attachments: attach(m.ics) });
    }
  }
  const sent: InviteResult['users'] = [];
  for (const u of users) {
    const m = inviteContent(kind, data, brand, 'user', who);
    sent.push({ email: u.email, result: await sendLeadMail(u.email, m.subject, m.html, { replyTo: a.email, attachments: attach(m.ics) }) });
  }
  return { invitee, users: sent };
}
