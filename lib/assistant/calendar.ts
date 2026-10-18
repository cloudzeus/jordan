// lib/assistant/calendar.ts — SERVER. Ημερολόγιο για τον Air Jordan: ραντεβού περιόδου, έλεγχος ώρας,
// πρόταση ραντεβού με ΥΠΟΓΕΓΡΑΜΜΕΝΗ κάρτα επιβεβαίωσης.
//
// Ο βοηθός ΔΕΝ κλείνει ραντεβού μόνος του: το εργαλείο φτιάχνει πρόταση (υπογεγραμμένο token, HMAC με
// NEXTAUTH_SECRET, λήξη 30′) και το ραντεβού δημιουργείται ΜΟΝΟ όταν ο χρήστης πατήσει «Επιβεβαίωση»
// (app/api/admin/assistant/appointments) — μέσω της ΚΟΙΝΗΣ λειτουργίας του ημερολογίου
// (lib/appointments · bookStaffAppointment: εφαρμογή + SoftOne + email με .ics σε χρήστη και προσκεκλημένο).
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db';
import { loadAvailability } from '@/lib/appointments';
import { searchParties, resolveParty, type PartyRef } from '@/lib/appointment-parties';
import {
  APPOINTMENT_LABEL, appointmentCode, computeSlots, formatSlotEl, toMinutes, zonedParts, zonedToUtc, type AppointmentStatus,
} from '@/lib/appointments-core';
import { searchKnowledge } from './search';
import { fold, keywords, phonetic } from './text';
import { PART_OF_DAY_RANGE, type PartOfDay } from './when';

// ── ραντεβού περιόδου ──

export async function appointmentsBetween(from: Date, to: Date, opts: { userId: string; scope: 'mine' | 'all' }) {
  const rows = await prisma.appointment.findMany({
    where: {
      startsAt: { lt: to }, endsAt: { gt: from },
      // «Δικά μου»: ανατεθειμένα σε μένα + όσα δεν έχουν ανατεθεί σε κανέναν (ραντεβού του website).
      ...(opts.scope === 'mine' ? { OR: [{ assignedToId: opts.userId }, { assignedToId: null }] } : {}),
    },
    orderBy: { startsAt: 'asc' },
    take: 200,
  });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.assignedToId).filter((x): x is string => !!x))] } }, select: { id: true, name: true, email: true } });
  const uName = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  return rows.map((r) => ({
    code: appointmentCode(r.number),
    when: formatSlotEl(r.startsAt.toISOString(), r.endsAt.toISOString()),
    status: APPOINTMENT_LABEL[r.status as AppointmentStatus] ?? r.status,
    with: r.company && r.company !== r.name ? `${r.name} (${r.company})` : r.name,
    phone: r.phone, email: r.email,
    place: r.place === 'customer' ? `Στον πελάτη${r.location ? `: ${r.location}` : ''}` : 'Στο atelier',
    topic: r.topic, message: r.message?.slice(0, 200) ?? null,
    assignedTo: r.assignedToId ? uName.get(r.assignedToId) ?? null : 'χωρίς ανάθεση',
    source: r.source === 'website' ? 'website' : 'προσωπικό',
    softone: r.softoneActionCode ?? null,
  }));
}

// ── έλεγχος ώρας ──

export interface SlotCheck {
  overlapping: { code: string; with: string; when: string }[];
  full: boolean;
  blocked: boolean;
  outsideHours: boolean;
  past: boolean;
  warnings: string[];
}

export async function checkSlot(start: Date, minutes: number): Promise<SlotCheck> {
  const end = new Date(start.getTime() + minutes * 60_000);
  const [a, appts, blocks] = await Promise.all([
    loadAvailability(),
    prisma.appointment.findMany({ where: { status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { lt: end }, endsAt: { gt: start } }, orderBy: { startsAt: 'asc' } }),
    prisma.appointmentBlock.count({ where: { startsAt: { lt: end }, endsAt: { gt: start } } }),
  ]);
  const local = zonedParts(start);
  const endLocal = zonedParts(end);
  const ranges = a.weekly[String(local.weekday) as keyof typeof a.weekly] ?? [];
  const outsideHours = !ranges.some((r) => toMinutes(r.from) <= local.minutes && (endLocal.date === local.date ? endLocal.minutes : 1440) <= toMinutes(r.to));
  const full = appts.length >= a.capacity;
  const past = start.getTime() < Date.now();
  const warnings = [
    past && 'Η ώρα έχει ήδη περάσει',
    full && `Υπάρχει ήδη ${appts.length === 1 ? 'ραντεβού' : `${appts.length} ραντεβού`} σε αυτή την ώρα (χωρητικότητα ${a.capacity})`,
    blocks > 0 && 'Η ώρα είναι σε αποκλεισμό του ημερολογίου (κλειστά)',
    outsideHours && 'Εκτός ωραρίου λειτουργίας του atelier',
  ].filter((x): x is string => !!x);
  return {
    overlapping: appts.map((r) => ({ code: appointmentCode(r.number), with: r.company ?? r.name, when: formatSlotEl(r.startsAt.toISOString(), r.endsAt.toISOString()) })),
    full, blocked: blocks > 0, outsideHours, past, warnings,
  };
}

/** Πρώτες ελεύθερες ώρες μιας μέρας (προαιρετικά μέσα σε τμήμα ημέρας) — με την κοινή λογική θέσεων. */
export async function freeSlots(date: string, partOfDay: PartOfDay | null, max = 4): Promise<string[]> {
  const a = await loadAvailability();
  const from = zonedToUtc(date, '00:00');
  const to = new Date(from.getTime() + 36 * 3600_000);
  const [appts, blocks] = await Promise.all([
    prisma.appointment.findMany({ where: { status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { lt: to }, endsAt: { gt: from } }, select: { startsAt: true, endsAt: true } }),
    prisma.appointmentBlock.findMany({ where: { startsAt: { lt: to }, endsAt: { gt: from } }, select: { startsAt: true, endsAt: true } }),
  ]);
  // Το προσωπικό δεν δεσμεύεται από την «ελάχιστη προειδοποίηση»/ορίζοντα του website.
  const day = computeSlots({
    availability: { ...a, minNoticeHours: 0, horizonDays: 3650 }, from: date, days: 1, now: new Date(),
    busy: appts.map((r) => ({ start: r.startsAt, end: r.endsAt })), blocks: blocks.map((r) => ({ start: r.startsAt, end: r.endsAt })),
  })[0];
  const [lo, hi] = partOfDay ? PART_OF_DAY_RANGE[partOfDay] : ['00:00', '24:00'];
  return day.slots.filter((s) => s.free && s.time >= lo && s.time < hi).slice(0, max).map((s) => s.time);
}

// ── με ποιον ──

export type PartyCandidate = PartyRef & { label: string; sub: string; email: string | null };

/**
 * Υποψήφιοι για «με τον πελάτη τάδε»: πρώτα η αναζήτηση του ημερολογίου (όνομα/κωδικός/ΑΦΜ/email,
 * συναλλασσόμενοι, επαφές, συνεργάτες), μετά η ασαφής αναζήτηση της μνήμης (τόνοι, greeklish, λάθη).
 */
export async function findParties(query: string): Promise<PartyCandidate[]> {
  const direct = await searchParties(query, 6);
  if (direct.length) return direct.map((h) => ({ kind: h.kind, id: h.id, label: h.label, sub: h.sub, email: h.email }));
  const hits = await searchKnowledge(query, { sources: ['trader', 'partner'], limit: 5 });
  const out: PartyCandidate[] = [];
  for (const h of hits) {
    const [kind, id] = h.refKey.split(':');
    if (kind !== 'trader' && kind !== 'partner') continue;
    try {
      const p = await resolveParty({ kind, id });
      out.push({ kind, id, label: p.company ?? p.name, sub: h.title, email: p.email });
    } catch { /* σβησμένη εγγραφή */ }
  }
  return out;
}

const GENERIC = /^(πελατ|προμηθευτ|συνεργατ|κυρι|εταιρ|pelat|promithef|kirio|kiria)/u;

/**
 * Ένας σαφής υποψήφιος; Ναι αν είναι μόνος, ή αν ΜΟΝΟ ένας έχει στο όνομα κάθε λέξη του ερωτήματος
 * (φωνητικά, χωρίς την κατάληξη: «Κουνά» ⇒ ΚΟΥΝΑΣ, «Τυροβολά» ⇒ Δ ΤΥΡΟΒΟΛΑΣ). Αλλιώς null ⇒ ερώτηση.
 */
export function pickParty(query: string, cands: PartyCandidate[]): PartyCandidate | null {
  if (cands.length === 1) return cands[0];
  const q = fold(query);
  const exact = cands.filter((c) => fold(c.label) === q);
  if (exact.length === 1) return exact[0];
  const stems = keywords(query).filter((w) => !GENERIC.test(w) && w.length >= 3).map((w) => {
    const p = phonetic(w);
    return p.length > 4 ? p.slice(0, -1) : p; // πτώση: Κουνά/Κουνάς/Κουνά
  });
  if (!stems.length) return null;
  const hit = cands.filter((c) => {
    const words = phonetic(`${c.label} ${c.sub}`).split(' ');
    return stems.every((st) => words.some((w) => w.startsWith(st)));
  });
  const uniq = [...new Map(hit.map((c) => [`${c.kind}:${c.id}`, c])).values()];
  return uniq.length === 1 ? uniq[0] : null;
}

// ── υπογεγραμμένη πρόταση ──

export interface Proposal {
  v: 1;
  uid: string;
  party: PartyRef;
  start: string; // ISO
  minutes: number;
  place: 'atelier' | 'customer';
  location: string | null;
  topic: string | null;
  notes: string | null;
  exp: number; // ms epoch
}

const secret = () => {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error('Λείπει το NEXTAUTH_SECRET');
  return s;
};
const b64 = (b: Buffer) => b.toString('base64url');

export function signProposal(p: Omit<Proposal, 'v' | 'exp'>, ttlMs = 30 * 60_000): string {
  const body = b64(Buffer.from(JSON.stringify({ ...p, v: 1, exp: Date.now() + ttlMs })));
  return `${body}.${b64(createHmac('sha256', secret()).update(body).digest())}`;
}

export function verifyProposal(token: string, uid: string): Proposal | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', secret()).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Proposal;
    if (p.v !== 1 || p.uid !== uid || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}
