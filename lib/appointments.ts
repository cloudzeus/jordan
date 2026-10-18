import 'server-only';
import { after } from 'next/server';
import { prisma } from '@/lib/db';
import { getSetting, setSetting } from '@/lib/settings';
import { escapeHtml, siteEmailHtml } from '@/lib/site-email';
import { ATELIER_PROFILE } from '@/lib/site-company';
import { appUrl, sendLeadMail, staffRecipient } from '@/lib/lead-mail';
import { syncLeadToSoftone, upsertLead } from '@/lib/leads';
import { subscribeNewsletter } from '@/lib/newsletter';
import { syncAppointmentToSoftone } from '@/lib/appointment-softone';
import { createCustomerParty, resolveParty, type NewCustomerInput, type PartyRef, type PartySnapshot } from '@/lib/appointment-parties';
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
  start: string; minutes: number; party: PartyRef | { kind: 'new'; customer: NewCustomerInput };
  topic?: string | null; message?: string | null; staffNote?: string | null;
  /** Πάνω σε άλλο ενεργό ραντεβού όταν η χωρητικότητα είναι γεμάτη. */
  allowOverlap?: boolean; notify?: boolean;
  /** Υπεύθυνος (χρήστης της εφαρμογής)· προεπιλογή ο ίδιος. */
  assignedToId?: string | null;
};

/**
 * Το προσωπικό κλείνει ραντεβού με πελάτη/συνεργάτη σε ΟΠΟΙΑΔΗΠΟΤΕ μέρα/ώρα (και εκτός ωραρίου ή σε
 * αποκλεισμό — είναι δική του απόφαση). Μόνο η επικάλυψη με γεμάτη χωρητικότητα θέλει ρητή έγκριση.
 * Επιβεβαιωμένο αμέσως· email στον πελάτη μόνο αν ζητηθεί και υπάρχει email.
 */
export async function scheduleStaffAppointment(input: StaffAppointmentInput, userId: string) {
  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) throw new AppointmentError('Η ώρα δεν είναι έγκυρη');
  if (!Number.isInteger(input.minutes) || input.minutes < 15 || input.minutes > 600) throw new AppointmentError('Η διάρκεια πρέπει να είναι 15–600 λεπτά');
  const end = new Date(start.getTime() + input.minutes * 60_000);
  const a = await loadAvailability();

  // Ο έλεγχος επικάλυψης γίνεται ΠΡΙΝ από τη δημιουργία νέου πελάτη στο SoftOne: αν η ώρα δεν
  // περνά, δεν μένει ορφανή καρτέλα στο ERP.
  const overlapping = await prisma.appointment.count({ where: { status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { lt: end }, endsAt: { gt: start } } });
  if (overlapping >= a.capacity && !input.allowOverlap) throw new AppointmentError(`Υπάρχει ήδη ${overlapping === 1 ? 'ραντεβού' : `${overlapping} ραντεβού`} σε αυτή την ώρα`, 409);

  const party: PartySnapshot = input.party.kind === 'new' ? await createCustomerParty(input.party.customer) : await resolveParty(input.party);
  const created = await prisma.appointment.create({
    data: {
      source: 'staff', startsAt: start, endsAt: end, status: 'CONFIRMED',
      name: party.name, company: party.company, email: party.email?.toLowerCase() ?? null, phone: party.phone,
      trdr: party.trdr, customerContactId: party.customerContactId, partnerId: party.partnerId, partnerContactId: party.partnerContactId,
      topic: input.topic?.trim() || null, message: input.message?.trim() || null, staffNote: input.staffNote?.trim() || null,
      createdById: userId, assignedToId: input.assignedToId || userId, decidedById: userId, decidedAt: new Date(),
    },
  });
  after(async () => {
    await Promise.allSettled([
      input.notify && created.email ? mailVisitor(created.id, 'confirmed') : Promise.resolve(),
      syncAppointmentToSoftone(created.id),
    ]);
  });
  return { appointment: created, party };
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
    trdr: r.trdr, partnerId: r.partnerId, assignedToId: r.assignedToId,
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
      data: { startsAt: start, endsAt: end, rescheduledFrom: r.startsAt, ...(opts.staffNote !== undefined ? { staffNote: opts.staffNote?.trim() || null } : {}), decidedById: staffId, decidedAt: new Date() },
    });
    if (opts.notify !== false) after(() => mailVisitor(id, 'rescheduled').then(() => undefined));
    after(() => syncAppointmentToSoftone(id).then(() => undefined));
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

const row = (k: string, v: string | null | undefined) => (v ? `<tr><td style="padding:6px 16px 6px 0;color:#8A847C;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 0;color:#1C1B19">${escapeHtml(v)}</td></tr>` : '');
const table = (rows: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="font:400 14px/1.5 Helvetica,Arial,sans-serif">${rows}</table>`;

/** Σύνδεσμος «Προσθήκη στο Google Calendar» (χωρίς συνημμένο). */
export function googleCalendarUrl(a: { start: string; end: string; title: string; details?: string; location?: string }) {
  const f = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const q = new URLSearchParams({ action: 'TEMPLATE', text: a.title, dates: `${f(a.start)}/${f(a.end)}`, details: a.details ?? '', location: a.location ?? '', ctz: ATELIER_TZ });
  return `https://calendar.google.com/calendar/render?${q}`;
}

type VisitorMail = 'received' | 'confirmed' | 'cancelled' | 'rescheduled';
const VISITOR_COPY: Record<VisitorMail, { subject: string; title: string; intro: string }> = {
  received: { subject: 'Λάβαμε το αίτημα ραντεβού', title: 'Λάβαμε το αίτημά σας', intro: 'Ευχαριστούμε. Θα επιβεβαιώσουμε το ραντεβού σας σύντομα — συνήθως την ίδια εργάσιμη.' },
  confirmed: { subject: 'Το ραντεβού σας επιβεβαιώθηκε', title: 'Σας περιμένουμε στο atelier', intro: 'Το ραντεβού σας επιβεβαιώθηκε.' },
  cancelled: { subject: 'Το ραντεβού σας ακυρώθηκε', title: 'Το ραντεβού ακυρώθηκε', intro: 'Δυστυχώς το ραντεβού σας ακυρώθηκε. Μπορείτε να κλείσετε νέα ώρα από το website ή να μας τηλεφωνήσετε.' },
  rescheduled: { subject: 'Νέα ώρα για το ραντεβού σας', title: 'Το ραντεβού σας μεταφέρθηκε', intro: 'Η ώρα του ραντεβού σας άλλαξε. Δείτε παρακάτω τη νέα ώρα.' },
};

export function visitorEmailHtml(kind: VisitorMail, a: { code: string; start: string; end: string; staffNote?: string | null; topic?: string | null }, brand: string) {
  const c = VISITOR_COPY[kind];
  const cal = kind === 'cancelled' ? '' : `<p style="margin:20px 0 0"><a href="${googleCalendarUrl({ start: a.start, end: a.end, title: `Ραντεβού στο ${brand}`, location: ATELIER_PROFILE.address, details: a.code })}" style="color:#1C3241">Προσθήκη στο ημερολόγιο →</a></p>`;
  const note = a.staffNote ? `<p style="margin:16px 0 0;white-space:pre-wrap">${escapeHtml(a.staffNote)}</p>` : '';
  const body = table(row('Ραντεβού', a.code) + row('Πότε', formatSlotEl(a.start, a.end)) + row('Θέμα', a.topic) + row('Πού', ATELIER_PROFILE.address)) + note + cal
    + `<p style="margin:20px 0 0">Για αλλαγή ή ακύρωση απαντήστε σε αυτό το email ή καλέστε στο ${escapeHtml(ATELIER_PROFILE.phones[0])}.</p>`;
  return { subject: `${c.subject} · ${a.code}`, html: siteEmailHtml({ brand, title: c.title, intro: c.intro, body, footer: `${brand} · ${ATELIER_PROFILE.address} · ${ATELIER_PROFILE.hours}` }) };
}

async function mailVisitor(id: string, kind: VisitorMail) {
  const r = await prisma.appointment.findUnique({ where: { id } });
  if (!r?.email) return;
  const brand = (await getSetting<string>('company.name'))?.trim() || ATELIER_PROFILE.brand;
  const staff = await staffRecipient();
  const m = visitorEmailHtml(kind, { code: appointmentCode(r.number), start: r.startsAt.toISOString(), end: r.endsAt.toISOString(), staffNote: r.staffNote, topic: r.topic }, brand);
  await sendLeadMail(r.email, m.subject, m.html, { replyTo: staff ?? ATELIER_PROFILE.salesEmail });
}

async function mailStaffNew(id: string) {
  const to = await staffRecipient();
  if (!to) return;
  const r = await prisma.appointment.findUnique({ where: { id } });
  if (!r) return;
  const brand = (await getSetting<string>('company.name'))?.trim() || ATELIER_PROFILE.brand;
  const code = appointmentCode(r.number);
  const body = table(row('Πότε', formatSlotEl(r.startsAt.toISOString(), r.endsAt.toISOString())) + row('Ονοματεπώνυμο', r.name) + row('Εταιρεία', r.company) + row('Email', r.email ?? '') + row('Τηλέφωνο', r.phone) + row('Θέμα', r.topic))
    + (r.message ? `<p style="margin:16px 0 0;white-space:pre-wrap">${escapeHtml(r.message)}</p>` : '')
    + `<p style="margin:20px 0 0"><a href="${appUrl()}/admin/appointments" style="color:#1C3241">Άνοιγμα στο ημερολόγιο →</a></p>`;
  await sendLeadMail(to, `Νέο ραντεβού ${code} — ${r.company ?? r.name}`, siteEmailHtml({
    brand, title: r.status === 'CONFIRMED' ? 'Νέο ραντεβού (επιβεβαιώθηκε αυτόματα)' : 'Νέο αίτημα ραντεβού', intro: 'Από τη φόρμα του website.', body,
    footer: 'Απαντήστε σε αυτό το email για να επικοινωνήσετε απευθείας με τον επισκέπτη.',
  }), { replyTo: r.email });
}

export { isActiveStatus };
