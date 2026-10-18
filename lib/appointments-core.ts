/**
 * Ραντεβού στο atelier — καθαρή λογική (χωρίς βάση), κοινή για server, client και tests.
 *
 * Ώρες λειτουργίας και μέρες είναι ΠΑΝΤΑ σε ώρα Αθήνας (`Europe/Athens`), ανεξάρτητα από τη ζώνη
 * του server ή του επισκέπτη· στη βάση γράφονται instants (UTC). Η μετατροπή γίνεται με `Intl`, άρα
 * οι αλλαγές θερινής/χειμερινής ώρας είναι σωστές χωρίς βιβλιοθήκη.
 */

export const ATELIER_TZ = 'Europe/Athens';

export type TimeRange = { from: string; to: string }; // «HH:MM»
/** 0 = Κυριακή … 6 = Σάββατο (όπως το `Date.getDay`). */
export type Weekly = Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', TimeRange[]>;

export type Availability = {
  slotMinutes: number;
  /** Πόσα ραντεβού χωρούν στην ίδια ώρα (π.χ. 2 όταν υποδέχονται δύο άτομα). */
  capacity: number;
  /** Ελάχιστη προειδοποίηση: όχι ραντεβού νωρίτερα από τώρα + τόσες ώρες. */
  minNoticeHours: number;
  /** Πόσες μέρες μπροστά φαίνονται διαθέσιμες. */
  horizonDays: number;
  /** Επιβεβαίωση χωρίς έγκριση από το προσωπικό. */
  autoConfirm: boolean;
  weekly: Weekly;
};

export const DEFAULT_AVAILABILITY: Availability = {
  slotMinutes: 60,
  capacity: 1,
  minNoticeHours: 12,
  horizonDays: 30,
  autoConfirm: false,
  weekly: {
    '0': [],
    '1': [{ from: '10:00', to: '17:00' }],
    '2': [{ from: '10:00', to: '17:00' }],
    '3': [{ from: '10:00', to: '17:00' }],
    '4': [{ from: '10:00', to: '17:00' }],
    '5': [{ from: '10:00', to: '16:00' }],
    '6': [],
  },
};

export const WEEKDAYS_EL = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'] as const;
export const WEEKDAYS_SHORT_EL = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'] as const;
export const SLOT_LENGTHS = [30, 45, 60, 90, 120] as const;

export const APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const APPOINTMENT_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'Αναμένει επιβεβαίωση',
  CONFIRMED: 'Επιβεβαιωμένο',
  CANCELLED: 'Ακυρωμένο',
  COMPLETED: 'Ολοκληρώθηκε',
  NO_SHOW: 'Δεν προσήλθε',
};
export const APPOINTMENT_TONE: Record<AppointmentStatus, string> = {
  PENDING: '#B45309', CONFIRMED: '#047857', CANCELLED: '#64748B', COMPLETED: '#0369A1', NO_SHOW: '#BE123C',
};
/** Καταλαμβάνει θέση στο ημερολόγιο (δεν δίνεται σε άλλον). */
export const isActiveStatus = (s: string) => s === 'PENDING' || s === 'CONFIRMED';

const MOVES: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED', 'COMPLETED', 'NO_SHOW'],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: ['COMPLETED'],
};
export const staffCanMove = (from: string, to: AppointmentStatus) => (MOVES[from as AppointmentStatus] ?? []).includes(to);
export const canReschedule = (s: string) => isActiveStatus(s);

export const TOPICS = ['Επίσκεψη στο showroom', 'Επιλογή υλικών για έργο', 'Δείγματα & mock-ups', 'Τεχνική συνάντηση'] as const;

export const appointmentCode = (n: number) => `ΡΝΤ-${String(n).padStart(6, '0')}`;

// ── ώρα Αθήνας ⇄ UTC ───────────────────────────────────────────────────────────────────────────

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isHHMM = (s: string) => HHMM.test(s) || s === '24:00';
export const toMinutes = (s: string) => (s === '24:00' ? 1440 : Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)));
export const fromMinutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const partsFmt = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = partsFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
    partsFmt.set(tz, f);
  }
  return f;
}

/** Τα «τοπικά» στοιχεία ενός instant στη ζώνη `tz`. */
export function zonedParts(d: Date, tz = ATELIER_TZ) {
  const p = Object.fromEntries(fmt(tz).formatToParts(d).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, time: `${p.hour}:${p.minute}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
}

/** Απόκλιση της ζώνης από το UTC (λεπτά) στο συγκεκριμένο instant. */
function offsetMinutes(d: Date, tz: string) {
  const p = Object.fromEntries(fmt(tz).formatToParts(d).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** «2026-10-20» + «10:30» (ώρα Αθήνας) → instant. */
export function zonedToUtc(date: string, time: string, tz = ATELIER_TZ): Date {
  const [y, m, d] = date.split('-').map(Number);
  const mins = toMinutes(time);
  const guess = Date.UTC(y, m - 1, d, 0, mins);
  // Δύο περάσματα: σωστό και γύρω από την αλλαγή ώρας.
  let t = guess - offsetMinutes(new Date(guess), tz) * 60000;
  t = guess - offsetMinutes(new Date(t), tz) * 60000;
  return new Date(t);
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const isDateStr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

// ── έλεγχος ρυθμίσεων ──────────────────────────────────────────────────────────────────────────

/** Ενοποιεί/καθαρίζει διαστήματα μιας μέρας· επιστρέφει πρόβλημα αν κάτι δεν στέκει. */
export function normalizeRanges(ranges: TimeRange[]): { ranges: TimeRange[]; problem: string | null } {
  for (const r of ranges) {
    if (!isHHMM(r.from) || !isHHMM(r.to)) return { ranges: [], problem: 'Οι ώρες γράφονται ως ΩΩ:ΛΛ' };
    if (toMinutes(r.to) <= toMinutes(r.from)) return { ranges: [], problem: `Το «${r.from}–${r.to}» τελειώνει πριν αρχίσει` };
  }
  const sorted = [...ranges].sort((a, b) => toMinutes(a.from) - toMinutes(b.from));
  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i].from) < toMinutes(sorted[i - 1].to)) return { ranges: [], problem: `Τα διαστήματα ${sorted[i - 1].from}–${sorted[i - 1].to} και ${sorted[i].from}–${sorted[i].to} επικαλύπτονται` };
  }
  return { ranges: sorted, problem: null };
}

/** Από ό,τι υπάρχει στη ρύθμιση (ή τίποτα) σε πλήρη, έγκυρη διαθεσιμότητα. */
export function parseAvailability(raw: unknown): Availability {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Availability>;
  const int = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def);
  const weekly = { ...DEFAULT_AVAILABILITY.weekly };
  if (r.weekly && typeof r.weekly === 'object') {
    for (const k of Object.keys(weekly) as (keyof Weekly)[]) {
      const v = (r.weekly as Partial<Weekly>)[k];
      if (Array.isArray(v)) {
        const n = normalizeRanges(v.filter((x) => x && typeof x.from === 'string' && typeof x.to === 'string'));
        weekly[k] = n.problem ? [] : n.ranges;
      }
    }
  }
  return {
    slotMinutes: int(r.slotMinutes, 15, 240, DEFAULT_AVAILABILITY.slotMinutes),
    capacity: int(r.capacity, 1, 10, DEFAULT_AVAILABILITY.capacity),
    minNoticeHours: int(r.minNoticeHours, 0, 24 * 14, DEFAULT_AVAILABILITY.minNoticeHours),
    horizonDays: int(r.horizonDays, 1, 180, DEFAULT_AVAILABILITY.horizonDays),
    autoConfirm: typeof r.autoConfirm === 'boolean' ? r.autoConfirm : DEFAULT_AVAILABILITY.autoConfirm,
    weekly,
  };
}

// ── υπολογισμός ελεύθερων θέσεων ───────────────────────────────────────────────────────────────

export type Interval = { start: Date; end: Date };
export type Slot = { start: string; end: string; time: string; free: boolean; taken: number; blocked: boolean };
export type DaySlots = { date: string; weekday: number; open: boolean; slots: Slot[] };

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/**
 * Όλες οι θέσεις των ημερών [from, from+days) με την κατάστασή τους. Μια θέση είναι ελεύθερη όταν:
 * είναι μέσα στις ώρες λειτουργίας, δεν πέφτει σε αποκλεισμό, απέχει ≥ minNotice από το «τώρα»,
 * είναι μέσα στον ορίζοντα και τα ενεργά ραντεβού που την επικαλύπτουν είναι λιγότερα από τη χωρητικότητα.
 */
export function computeSlots(opts: {
  availability: Availability;
  from: string;
  days: number;
  now: Date;
  busy: Interval[]; // ενεργά ραντεβού
  blocks: Interval[];
  tz?: string;
}): DaySlots[] {
  const { availability: a, now, busy, blocks } = opts;
  const tz = opts.tz ?? ATELIER_TZ;
  const earliest = new Date(now.getTime() + a.minNoticeHours * 3600_000);
  const today = zonedParts(now, tz).date;
  const lastDay = addDays(today, a.horizonDays);
  const out: DaySlots[] = [];
  for (let i = 0; i < opts.days; i++) {
    const date = addDays(opts.from, i);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const ranges = a.weekly[String(weekday) as keyof Weekly] ?? [];
    const slots: Slot[] = [];
    for (const r of ranges) {
      for (let m = toMinutes(r.from); m + a.slotMinutes <= toMinutes(r.to); m += a.slotMinutes) {
        const start = zonedToUtc(date, fromMinutes(m), tz);
        const end = zonedToUtc(date, fromMinutes(m + a.slotMinutes), tz);
        const iv = { start, end };
        const taken = busy.filter((b) => overlaps(b, iv)).length;
        const blocked = blocks.some((b) => overlaps(b, iv));
        const free = !blocked && start >= earliest && date <= lastDay && date >= today && taken < a.capacity;
        slots.push({ start: start.toISOString(), end: end.toISOString(), time: fromMinutes(m), free, taken, blocked });
      }
    }
    out.push({ date, weekday, open: ranges.length > 0, slots });
  }
  return out;
}

/** Ελεύθερη ΑΚΡΙΒΩΣ αυτή η θέση; (έλεγχος στην υποβολή — ο επισκέπτης μπορεί να έστειλε οτιδήποτε). */
export function isSlotFree(opts: Omit<Parameters<typeof computeSlots>[0], 'from' | 'days'> & { start: Date }): Slot | null {
  const tz = opts.tz ?? ATELIER_TZ;
  const date = zonedParts(opts.start, tz).date;
  const day = computeSlots({ ...opts, from: date, days: 1 })[0];
  const slot = day.slots.find((s) => s.start === opts.start.toISOString());
  return slot?.free ? slot : null;
}

// ── μορφοποίηση για email/UI ───────────────────────────────────────────────────────────────────

export function formatSlotEl(startIso: string, endIso?: string, tz = ATELIER_TZ) {
  const s = new Date(startIso);
  const day = new Intl.DateTimeFormat('el-GR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(s);
  const time = (d: Date) => new Intl.DateTimeFormat('el-GR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  return `${day}, ${time(s)}${endIso ? `–${time(new Date(endIso))}` : ''}`;
}
