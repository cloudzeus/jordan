import 'server-only';
import { after } from 'next/server';
import { prisma } from '@/lib/db';
import { getSetting, setSetting } from '@/lib/settings';
import { emailBrand } from '@/lib/email/brand';
import type { EmailBrand } from '@/lib/email/layout';
import { staffNewAppointmentEmail, visitorAppointmentEmail } from '@/lib/email/templates';
import { ATELIER_PROFILE } from '@/lib/site-company';
import { appUrl, sendLeadMail, staffRecipient } from '@/lib/lead-mail';
import { syncLeadToSoftone, upsertLead } from '@/lib/leads';
import { subscribeNewsletter } from '@/lib/newsletter';
import { syncAppointmentToSoftone, type AppointmentSyncResult } from '@/lib/appointment-softone';
import { sendAppointmentInvites, type InviteKind, type InviteResult } from '@/lib/appointment-mail';
import { buildIcs } from '@/lib/ics';
import { createContactParty, createCustomerParty, resolveParty, type NewContactInput, type NewCustomerInput, type PartyRef, type PartySnapshot } from '@/lib/appointment-parties';
import {
  addDays, APPOINTMENT_LABEL, appointmentCode, ATELIER_TZ, canReschedule, computeSlots, formatSlotEl, isActiveStatus, isSlotFree,
  parseAvailability, staffCanMove, zonedParts, zonedToUtc, type Availability, type AppointmentStatus, type Interval,
} from '@/lib/appointments-core';

/**
 * Ραντεβού στο atelier: διαθεσιμότητα (ρύθμιση `appointments.availability`), αποκλεισμοί, κρατήσεις.
 * Η κράτηση γίνεται με advisory lock μέσα σε transaction, ώστε δύο ταυτόχρονες υποβολές να μη
 * πάρουν την ίδια θέση. Κάθε κράτηση δημιουργεί/ενημερώνει Lead (και, αν επιτρέπεται, στο SoftOne).
 */

export class AppointmentError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const AVAILABILITY_KEY = 'appointments.availability';
const LOCK_KEY = 735_120_001; // σταθερό κλειδί pg_advisory_xact_lock για τις κρατήσεις

export async function loadAvailability(): Promise<Availability> {
  return parseAvailability(await getSetting<unknown>(AVAILABILITY_KEY));
}
export async function saveAvailability(a: Availability, userId: string) {
  await setSetting(AVAILABILITY_KEY, parseAvailability(a), userId);
}

async function busyAndBlocks(from: Date, to: Date, db: Pick<typeof prisma, 'appointment' | 'appointmentBlock'> = prisma, excludeId?: string) {
  const [appts, blocks] = await Promise.all([
    db.appointment.findMany({ where: { status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { lt: to }, endsAt: { gt: from }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { startsAt: true, endsAt: true } }),
    db.appointmentBlock.findMany({ where: { startsAt: { lt: to }, endsAt: { gt: from } }, select: { startsAt: true, endsAt: true } }),
  ]);
  const iv = (r: { startsAt: Date; endsAt: Date }): Interval => ({ start: r.startsAt, end: r.endsAt });
  return { busy: appts.map(iv), blocks: blocks.map(iv) };
}

/** Για το δημόσιο website: οι μέρες [from, from+days) με ΜΟΝΟ τις ελεύθερες θέσεις. */
export async function publicSlots(fromDate: string | null, days: number) {
  const a = await loadAvailability();
  const now = new Date();
  const today = zonedParts(now).date;
  const from = fromDate && fromDate > today ? fromDate : today;
  const span = Math.min(Math.max(days, 1), 42);
  const lastDay = addDays(today, a.horizonDays);
  const { busy, blocks } = await busyAndBlocks(zonedToUtc(from, '00:00'), zonedToUtc(addDays(from, span), '00:00'));
  const out = computeSlots({ availability: a, from, days: span, now, busy, blocks }).map((d) => ({
    // «Κλειστά» και όταν όλη η μέρα είναι σε αποκλεισμό (αργία) — όχι «πλήρες».
    date: d.date, weekday: d.weekday, open: d.slots.some((s) => !s.blocked),
    slots: d.slots.filter((s) => s.free).map((s) => ({ start: s.start, end: s.end, time: s.time })),
  }));
  return { today, lastDay, slotMinutes: a.slotMinutes, days: out, hasMore: addDays(from, span) <= lastDay };
}

export type BookingInput = {
  start: string; name: string; email: string; company: string; phone?: string | null; profession?: string | null;
  topic?: string | null; message?: string | null; newsletter?: boolean;
};

export async function bookAppointment(input: BookingInput) {
  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) throw new AppointmentError('Η ώρα δεν είναι έγκυρη');
  const a = await loadAvailability();

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
    const end = new Date(start.getTime() + a.slotMinutes * 60_000);
    const { busy, blocks } = await busyAndBlocks(new Date(start.getTime() - 86_400_000), new Date(end.getTime() + 86_400_000), tx);
    const slot = isSlotFree({ availability: a, now: new Date(), busy, blocks, start });
    if (!slot) throw new AppointmentError('Η ώρα αυτή μόλις κλείστηκε ή δεν είναι διαθέσιμη — διαλέξτε άλλη', 409);
    const lead = await upsertLead({ email: input.email, name: input.name, company: input.company, phone: input.phone, profession: input.profession }, 'appointment', tx);
    return tx.appointment.create({
      data: {
        leadId: lead.id, startsAt: new Date(slot.start), endsAt: new Date(slot.end), status: a.autoConfirm ? 'CONFIRMED' : 'PENDING',
        name: input.name.trim(), email: input.email.trim().toLowerCase(), company: input.company.trim() || null,
        phone: input.phone?.trim() || null, topic: input.topic?.trim() || null, message: input.message?.trim() || null,
        ...(a.autoConfirm ? { decidedAt: new Date() } : {}),
      },
    });
  });

  // Μετά την απάντηση: email, SoftOne, newsletter — τίποτα από αυτά δεν καθυστερεί/ρίχνει την κράτηση.
  after(async () => {
    await Promise.allSettled([
      mailVisitor(created.id, created.status === 'CONFIRMED' ? 'confirmed' : 'received'),
      mailStaffNew(created.id),
      syncLeadToSoftone(created.leadId!),
      input.newsletter ? subscribeNewsletter({ email: created.email!, name: created.name, source: 'appointment' }) : Promise.resolve(),
    ]);
  });
  return created;
}

// ── ραντεβού από το προσωπικό ────────────────────────────────────────────────────────────────

export type StaffAppointmentInput = {
  start: string; minutes: number; party: PartyRef | { kind: 'new'; customer: NewCustomerInput } | { kind: 'newContact'; contact: NewContactInput };
  topic?: string | null; message?: string | null; staffNote?: string | null;
  /** Πού: στο atelier (προεπιλογή) ή στον πελάτη (με διεύθυνση). Ορίζει και τη σειρά στο SoftOne. */
  place?: 'atelier' | 'customer'; location?: string | null;
  /** Πάνω σε άλλο ενεργό ραντεβού όταν η χωρητικότητα είναι γεμάτη. */
  allowOverlap?: boolean;
  /** Email + .ics στον προσκεκλημένο (προεπιλογή: ναι, αν υπάρχει email). Ο χρήστης λαμβάνει πάντα. */
  notify?: boolean;
  /** Υπεύθυνος (χρήστης της εφαρμογής)· προεπιλογή ο ίδιος. */
  assignedToId?: string | null;
};

export type StaffSideEffects = { softone: AppointmentSyncResult; softoneError: string | null; softoneCode: string | null; mail: InviteResult };

/** SoftOne + email ενός ραντεβού προσωπικού. Καμία αποτυχία δεν χάνει το ραντεβού της εφαρμογής. */
async function staffSideEffects(id: string, kind: InviteKind, invitee: boolean): Promise<StaffSideEffects> {
  const [softone, mail] = await Promise.all([
    syncAppointmentToSoftone(id).catch(() => 'FAILED' as const),
    sendAppointmentInvites(id, kind, { invitee }).catch(() => ({ invitee: 'failed' as const, users: [] })),
  ]);
  const a = await prisma.appointment.findUnique({ where: { id }, select: { softoneError: true, softoneActionCode: true } });
  return { softone, softoneError: a?.softoneError ?? null, softoneCode: a?.softoneActionCode ?? null, mail };
}

/**
 * Το προσωπικό κλείνει ραντεβού με πελάτη/συνεργάτη σε ΟΠΟΙΑΔΗΠΟΤΕ μέρα/ώρα (και εκτός ωραρίου ή σε
 * αποκλεισμό — είναι δική του απόφαση). Μόνο η επικάλυψη με γεμάτη χωρητικότητα θέλει ρητή έγκριση.
 * Επιβεβαιωμένο αμέσως· μετά: SoftOne (ραντεβού CRM, αν επιτρέπεται) και email με .ics στον
 * προσκεκλημένο και στον χρήστη. `wait` = περίμενε τα παραπάνω και επέστρεψε το αποτέλεσμά τους
 * (π.χ. για τον βοηθό φωνής)· αλλιώς τρέχουν μετά την απάντηση.
 */
export async function scheduleStaffAppointment(input: StaffAppointmentInput, userId: string, opts: { wait?: boolean } = {}) {
  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) throw new AppointmentError('Η ώρα δεν είναι έγκυρη');
  if (!Number.isInteger(input.minutes) || input.minutes < 15 || input.minutes > 600) throw new AppointmentError('Η διάρκεια πρέπει να είναι 15–600 λεπτά');
  const end = new Date(start.getTime() + input.minutes * 60_000);
  const a = await loadAvailability();

  // Ο έλεγχος επικάλυψης γίνεται ΠΡΙΝ από τη δημιουργία νέου πελάτη στο SoftOne: αν η ώρα δεν
  // περνά, δεν μένει ορφανή καρτέλα στο ERP.
  const overlapping = await prisma.appointment.count({ where: { status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { lt: end }, endsAt: { gt: start } } });
  if (overlapping >= a.capacity && !input.allowOverlap) throw new AppointmentError(`Υπάρχει ήδη ${overlapping === 1 ? 'ραντεβού' : `${overlapping} ραντεβού`} σε αυτή την ώρα`, 409);

  const party: PartySnapshot = input.party.kind === 'new' ? await createCustomerParty(input.party.customer)
    : input.party.kind === 'newContact' ? await createContactParty(input.party.contact)
    : await resolveParty(input.party);
  const place = input.place === 'customer' ? 'customer' : 'atelier';
  const created = await prisma.appointment.create({
    data: {
      source: 'staff', startsAt: start, endsAt: end, status: 'CONFIRMED', place, location: place === 'customer' ? input.location?.trim() || null : null,
      name: party.name, company: party.company, email: party.email?.toLowerCase() ?? null, phone: party.phone,
      trdr: party.trdr, customerContactId: party.customerContactId, partnerId: party.partnerId, partnerContactId: party.partnerContactId,
      topic: input.topic?.trim() || null, message: input.message?.trim() || null, staffNote: input.staffNote?.trim() || null,
      createdById: userId, assignedToId: input.assignedToId || userId, decidedById: userId, decidedAt: new Date(),
    },
  });
  const invitee = input.notify !== false;
  if (opts.wait) return { appointment: created, party, effects: await staffSideEffects(created.id, 'created', invitee) };
  after(() => staffSideEffects(created.id, 'created', invitee).then(() => undefined));
  return { appointment: created, party, effects: null };
}

/**
 * Απλή είσοδος για τον βοηθό (Air Jordan / φωνή): ποιος, πότε, πόσο, πού, σημειώσεις, ποιος το
 * κλείνει. Περιμένει SoftOne + email και επιστρέφει σύντομη περίληψη στα Ελληνικά.
 */
export async function bookStaffAppointment(input: {
  who: StaffAppointmentInput['party'];
  when: string; // ISO instant
  minutes?: number;
  place?: 'atelier' | 'customer'; location?: string | null;
  notes?: string | null; topic?: string | null;
  createdBy: string; // User.id
  notifyInvitee?: boolean; allowOverlap?: boolean;
}) {
  const r = await scheduleStaffAppointment({
    start: input.when, minutes: input.minutes ?? 60, party: input.who, place: input.place, location: input.location,
    topic: input.topic ?? 'Ραντεβού', message: input.notes ?? null, notify: input.notifyInvitee !== false, allowOverlap: input.allowOverlap,
  }, input.createdBy, { wait: true });
  const e = r.effects!;
  const code = appointmentCode(r.appointment.number);
  const when = formatSlotEl(r.appointment.startsAt.toISOString(), r.appointment.endsAt.toISOString());
  const mailText = e.mail.invitee === 'no-email' ? 'ο προσκεκλημένος δεν έχει email' : e.mail.invitee === 'sent' ? `email στο ${r.appointment.email}` : `email στον προσκεκλημένο: ${e.mail.invitee}`;
  const softoneText = e.softone === 'SYNCED' ? `SoftOne: ${e.softoneCode}` : e.softone === 'FAILED' ? `SoftOne: αποτυχία (${e.softoneError})` : e.softone === 'DISABLED' ? 'SoftOne: κλειστό στις ρυθμίσεις' : 'SoftOne: δεν αφορά (χωρίς συνδεδεμένο χρήστη)';
  return {
    id: r.appointment.id, code, when, with: r.party.company && r.party.company !== r.party.name ? `${r.party.company} (${r.party.name})` : r.party.name,
    inviteeEmail: r.appointment.email, softone: e.softone, softoneCode: e.softoneCode, softoneError: e.softoneError, mail: e.mail,
    summary: `Κλείστηκε ${code}, ${when}, με ${r.party.name}. ${softoneText}· ${mailText}.`,
  };
}

// ── προσωπικό ────────────────────────────────────────────────────────────────────────────────

export async function listAppointments(from: Date, to: Date) {
  const rows = await prisma.appointment.findMany({ where: { startsAt: { lt: to }, endsAt: { gt: from } }, orderBy: { startsAt: 'asc' }, include: { lead: { select: { softoneStatus: true, softoneCode: true } } } });
  return rows.map(view);
}
export async function upcomingAppointments() {
  const rows = await prisma.appointment.findMany({ where: { endsAt: { gt: new Date(Date.now() - 30 * 86_400_000) } }, orderBy: { startsAt: 'asc' }, take: 500, include: { lead: { select: { softoneStatus: true, softoneCode: true } } } });
  return rows.map(view);
}
export const countPendingAppointments = () => prisma.appointment.count({ where: { status: 'PENDING', startsAt: { gt: new Date() } } });

type Row = Awaited<ReturnType<typeof prisma.appointment.findMany>>[number] & { lead?: { softoneStatus: string; softoneCode: string | null } | null };
function view(r: Row) {
  return {
    id: r.id, number: r.number, code: appointmentCode(r.number), leadId: r.leadId, source: r.source as 'website' | 'staff',
    trdr: r.trdr, partnerId: r.partnerId, assignedToId: r.assignedToId, place: r.place, location: r.location,
    softoneSync: r.softoneSync, softoneActionCode: r.softoneActionCode, softoneActionError: r.softoneError,
    start: r.startsAt.toISOString(), end: r.endsAt.toISOString(), when: formatSlotEl(r.startsAt.toISOString(), r.endsAt.toISOString()),
    status: r.status as AppointmentStatus, statusLabel: APPOINTMENT_LABEL[r.status as AppointmentStatus] ?? r.status,
    name: r.name, email: r.email, phone: r.phone, company: r.company, topic: r.topic, message: r.message, staffNote: r.staffNote,
    rescheduledFrom: r.rescheduledFrom?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
    softoneStatus: r.lead?.softoneStatus ?? null, softoneCode: r.lead?.softoneCode ?? null,
  };
}
export type AppointmentView = ReturnType<typeof view>;

export async function changeAppointmentStatus(id: string, staffId: string, to: AppointmentStatus, staffNote?: string | null, notify = true) {
  const r = await prisma.appointment.findUnique({ where: { id } });
  if (!r) throw new AppointmentError('Το ραντεβού δεν βρέθηκε', 404);
  if (r.status !== to && !staffCanMove(r.status, to)) throw new AppointmentError(`Δεν γίνεται αλλαγή από «${APPOINTMENT_LABEL[r.status as AppointmentStatus] ?? r.status}» σε «${APPOINTMENT_LABEL[to]}»`, 409);
  const updated = await prisma.appointment.update({
    where: { id },
    data: { status: to, ...(staffNote !== undefined ? { staffNote: staffNote?.trim() || null } : {}), decidedById: staffId, decidedAt: new Date() },
  });
  if (r.source === 'staff') {
    if (r.status !== to && to === 'CANCELLED') {
      await prisma.appointment.update({ where: { id }, data: { icsSequence: { increment: 1 } } });
      after(() => staffSideEffects(id, 'cancelled', notify).then(() => undefined));
    } else if (r.status !== to) after(() => syncAppointmentToSoftone(id).then(() => undefined));
    return updated;
  }
  if (r.status !== to && to === 'CANCELLED') await prisma.appointment.update({ where: { id }, data: { icsSequence: { increment: 1 } } });
  if (notify && r.status !== to && (to === 'CONFIRMED' || to === 'CANCELLED')) after(() => mailVisitor(id, to === 'CONFIRMED' ? 'confirmed' : 'cancelled').then(() => undefined));
  if (r.status !== to) after(() => syncAppointmentToSoftone(id).then(() => undefined));
  return updated;
}

/**
 * Μεταφορά σε άλλη ώρα. Το προσωπικό ΜΠΟΡΕΙ να βάλει ραντεβού εκτός ωραρίου ή με λιγότερη
 * προειδοποίηση (`force`) — όχι όμως πάνω σε άλλο ενεργό ραντεβού όταν η χωρητικότητα έχει γεμίσει.
 */
export async function rescheduleAppointment(id: string, staffId: string, startIso: string, opts: { force?: boolean; staffNote?: string | null; notify?: boolean } = {}) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) throw new AppointmentError('Η νέα ώρα δεν είναι έγκυρη');
  const a = await loadAvailability();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
    const r = await tx.appointment.findUnique({ where: { id } });
    if (!r) throw new AppointmentError('Το ραντεβού δεν βρέθηκε', 404);
    if (!canReschedule(r.status)) throw new AppointmentError('Μόνο ενεργά ραντεβού μεταφέρονται', 409);
    const length = r.endsAt.getTime() - r.startsAt.getTime();
    const end = new Date(start.getTime() + length);
    const { busy, blocks } = await busyAndBlocks(new Date(start.getTime() - 86_400_000), new Date(end.getTime() + 86_400_000), tx, id);
    const overlapping = busy.filter((b) => b.start < end && start < b.end).length;
    if (overlapping >= a.capacity) throw new AppointmentError('Υπάρχει ήδη ραντεβού σε αυτή την ώρα', 409);
    if (!opts.force && !isSlotFree({ availability: a, now: new Date(), busy, blocks, start })) {
      throw new AppointmentError('Η ώρα είναι εκτός διαθεσιμότητας — επιλέξτε «Παράκαμψη ωραρίου» για να την κρατήσετε', 409);
    }
    const updated = await tx.appointment.update({
      where: { id },
      data: { startsAt: start, endsAt: end, rescheduledFrom: r.startsAt, icsSequence: { increment: 1 }, ...(opts.staffNote !== undefined ? { staffNote: opts.staffNote?.trim() || null } : {}), decidedById: staffId, decidedAt: new Date() },
    });
    if (r.source === 'staff') after(() => staffSideEffects(id, 'rescheduled', opts.notify !== false).then(() => undefined));
    else {
      if (opts.notify !== false) after(() => mailVisitor(id, 'rescheduled').then(() => undefined));
      after(() => syncAppointmentToSoftone(id).then(() => undefined));
    }
    return updated;
  });
}

/** Υπεύθυνος του ραντεβού (χρήστης προσωπικού). Αν είναι συνδεδεμένος με SoftOne, η ενέργεια γράφεται/ενημερώνεται. */
export async function assignAppointment(id: string, staffId: string, assignedToId: string | null) {
  const r = await prisma.appointment.findUnique({ where: { id }, select: { id: true } });
  if (!r) throw new AppointmentError('Το ραντεβού δεν βρέθηκε', 404);
  if (assignedToId) {
    const u = await prisma.user.findUnique({ where: { id: assignedToId }, select: { isActive: true, role: { select: { key: true } } } });
    if (!u?.isActive || ['CUSTOMER', 'SUPPLIER', 'COLLABORATOR'].includes(u.role.key ?? '')) throw new AppointmentError('Ο υπεύθυνος πρέπει να είναι ενεργός χρήστης του προσωπικού');
  }
  const updated = await prisma.appointment.update({ where: { id }, data: { assignedToId, decidedById: staffId } });
  after(() => syncAppointmentToSoftone(id, { force: true }).then(() => undefined));
  return updated;
}

/** Λίστα προσωπικού για «Υπεύθυνος» (όχι πελάτες/προμηθευτές/συνεργάτες του portal). */
export async function staffUsers() {
  const rows = await prisma.user.findMany({
    where: { isActive: true, role: { OR: [{ key: null }, { key: { in: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'] } }] } },
    select: { id: true, name: true, email: true, softoneUserId: true, softoneUserName: true }, orderBy: { name: 'asc' },
  });
  return rows.map((u) => ({ id: u.id, name: u.name || u.email, softone: u.softoneUserId ? u.softoneUserName ?? `#${u.softoneUserId}` : null }));
}
export type StaffUser = Awaited<ReturnType<typeof staffUsers>>[number];

// ── αποκλεισμοί ──────────────────────────────────────────────────────────────────────────────

export async function listBlocks(from?: Date) {
  const rows = await prisma.appointmentBlock.findMany({ where: from ? { endsAt: { gt: from } } : {}, orderBy: { startsAt: 'asc' }, take: 500 });
  return rows.map((b) => ({ id: b.id, start: b.startsAt.toISOString(), end: b.endsAt.toISOString(), allDay: b.allDay, reason: b.reason }));
}
export type BlockView = Awaited<ReturnType<typeof listBlocks>>[number];

export async function createBlock(input: { date: string; toDate?: string | null; allDay: boolean; from?: string | null; to?: string | null; reason?: string | null }, userId: string) {
  const lastDate = input.toDate && input.toDate >= input.date ? input.toDate : input.date;
  const startsAt = input.allDay ? zonedToUtc(input.date, '00:00') : zonedToUtc(input.date, input.from ?? '');
  const endsAt = input.allDay ? zonedToUtc(addDays(lastDate, 1), '00:00') : zonedToUtc(input.date, input.to ?? '');
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new AppointmentError('Το διάστημα δεν είναι έγκυρο');
  const clash = await prisma.appointment.count({ where: { status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
  const block = await prisma.appointmentBlock.create({ data: { startsAt, endsAt, allDay: input.allDay, reason: input.reason?.trim() || null, createdById: userId } });
  return { block, clash };
}
export const deleteBlock = (id: string) => prisma.appointmentBlock.delete({ where: { id } });

// ── email ────────────────────────────────────────────────────────────────────────────────────

/** Σύνδεσμος «Προσθήκη στο Google Calendar» (χωρίς συνημμένο). */
export function googleCalendarUrl(a: { start: string; end: string; title: string; details?: string; location?: string }) {
  const f = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const q = new URLSearchParams({ action: 'TEMPLATE', text: a.title, dates: `${f(a.start)}/${f(a.end)}`, details: a.details ?? '', location: a.location ?? '', ctz: ATELIER_TZ });
  return `https://calendar.google.com/calendar/render?${q}`;
}

type VisitorMail = 'received' | 'confirmed' | 'cancelled' | 'rescheduled';

/** Email προς τον επισκέπτη (κοινό πρότυπο). `brand` = πλήρης ταυτότητα ή σκέτη επωνυμία. */
export function visitorEmailHtml(kind: VisitorMail, a: { code: string; start: string; end: string; staffNote?: string | null; topic?: string | null }, brand: EmailBrand | string) {
  const b: EmailBrand = typeof brand === 'string' ? { name: brand, address: ATELIER_PROFILE.address, phones: [...ATELIER_PROFILE.phones] } : brand;
  const where = ATELIER_PROFILE.address;
  return visitorAppointmentEmail(b, kind, {
    code: a.code, when: formatSlotEl(a.start, a.end), topic: a.topic, where, hours: ATELIER_PROFILE.hours, staffNote: a.staffNote,
    calendarUrl: googleCalendarUrl({ start: a.start, end: a.end, title: `Ραντεβού στο ${b.name}`, location: where, details: a.code }),
  });
}

async function mailVisitor(id: string, kind: VisitorMail) {
  const r = await prisma.appointment.findUnique({ where: { id } });
  if (!r?.email) return;
  const [brand, staff] = await Promise.all([emailBrand(), staffRecipient()]);
  const m = visitorEmailHtml(kind, { code: appointmentCode(r.number), start: r.startsAt.toISOString(), end: r.endsAt.toISOString(), staffNote: r.staffNote, topic: r.topic }, brand);
  // .ics μόνο για επιβεβαιωμένη ώρα (όχι για το «λάβαμε το αίτημα»): ίδιο UID, SEQUENCE από τη βάση.
  const ics = kind === 'received' ? null : buildIcs({
    uid: `appointment-${r.id}@atelierdamask.gr`, start: r.startsAt, end: r.endsAt, summary: `${r.topic ?? 'Ραντεβού'} · ${brand.name}`,
    description: appointmentCode(r.number), location: ATELIER_PROFILE.address, sequence: r.icsSequence, cancelled: kind === 'cancelled',
  });
  await sendLeadMail(r.email, m.subject, m.html, {
    replyTo: staff ?? ATELIER_PROFILE.salesEmail, text: m.text,
    attachments: ics ? [{ filename: kind === 'cancelled' ? 'akyrosi-rantevou.ics' : 'rantevou.ics', content: ics, contentType: `text/calendar; charset=utf-8; method=${kind === 'cancelled' ? 'CANCEL' : 'PUBLISH'}` }] : undefined,
  });
}

async function mailStaffNew(id: string) {
  const to = await staffRecipient();
  if (!to) return;
  const r = await prisma.appointment.findUnique({ where: { id } });
  if (!r) return;
  const brand = await emailBrand();
  const m = staffNewAppointmentEmail(brand, {
    code: appointmentCode(r.number), autoConfirmed: r.status === 'CONFIRMED', when: formatSlotEl(r.startsAt.toISOString(), r.endsAt.toISOString()),
    name: r.name, company: r.company, email: r.email, phone: r.phone, topic: r.topic, message: r.message, link: `${appUrl()}/admin/appointments`,
  });
  await sendLeadMail(to, m.subject, m.html, { replyTo: r.email, text: m.text });
}

export { isActiveStatus };
