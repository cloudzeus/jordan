import 'server-only';
import { prisma } from '@/lib/db';
import { emailBrand } from '@/lib/email/brand';
import type { EmailBrand } from '@/lib/email/layout';
import { appointmentInviteEmail } from '@/lib/email/templates';
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

export type InviteData = {
  id: string; number: number; start: Date; end: Date; topic: string | null; name: string; company: string | null;
  place: string; location: string | null; message: string | null; staffNote: string | null; sequence: number;
};

/** Το .ics και το HTML ενός ραντεβού — καθαρή συνάρτηση (για tests). */
export function inviteContent(kind: InviteKind, a: InviteData, brand: EmailBrand | string, audience: 'invitee' | 'user', who?: { name: string; email: string } | null) {
  const code = appointmentCode(a.number);
  const where = a.place === 'customer' ? (a.location || 'Στον χώρο του πελάτη') : ATELIER_PROFILE.address;
  const party = a.company && a.company !== a.name ? `${a.company} (${a.name})` : a.name;
  const brandName = typeof brand === 'string' ? brand : brand.name;
  const summary = audience === 'invitee' ? `${a.topic ?? 'Ραντεβού'} · ${brandName}` : `${a.topic ?? 'Ραντεβού'} · ${party}`;
  const ics = buildIcs({
    uid: `appointment-${a.id}@atelierdamask.gr`, start: a.start, end: a.end, summary,
    description: [code, a.topic, audience === 'user' ? `Με: ${party}` : null, audience === 'user' ? a.message : null].filter(Boolean).join('\n'),
    location: where, sequence: a.sequence, cancelled: kind === 'cancelled',
    organizer: who ? { name: who.name, email: who.email } : null,
  });
  const m = appointmentInviteEmail(typeof brand === 'string' ? { name: brand, address: ATELIER_PROFILE.address, phones: [...ATELIER_PROFILE.phones] } : brand, kind, audience, {
    code, when: formatSlotEl(a.start.toISOString(), a.end.toISOString()), whenShort: formatSlotEl(a.start.toISOString()), topic: a.topic, party, where,
    staffNote: a.staffNote, message: a.message, organizer: who?.name ?? null,
  });
  return { ...m, ics };
}

/**
 * Στέλνει τα email ενός ραντεβού. `invitee:false` → μόνο στους χρήστες (π.χ. όταν ο χρήστης έκλεισε
 * το διακόπτη «Email στον πελάτη»). Επιστρέφει τι έγινε για κάθε παραλήπτη — δεν πετάει ποτέ.
 */
export async function sendAppointmentInvites(id: string, kind: InviteKind, opts: { invitee?: boolean } = {}): Promise<InviteResult> {
  const a = await prisma.appointment.findUnique({ where: { id } });
  if (!a) return { invitee: 'failed', users: [] };
  const brand = await emailBrand();
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
      invitee = await sendLeadMail(a.email, m.subject, m.html, { replyTo: who?.email ?? ATELIER_PROFILE.salesEmail, attachments: attach(m.ics), text: m.text });
    }
  }
  const sent: InviteResult['users'] = [];
  for (const u of users) {
    const m = inviteContent(kind, data, brand, 'user', who);
    sent.push({ email: u.email, result: await sendLeadMail(u.email, m.subject, m.html, { replyTo: a.email, attachments: attach(m.ics), text: m.text }) });
  }
  return { invitee, users: sent };
}
