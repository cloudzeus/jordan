// lib/portal-calendar-core.ts — καθαρή λογική του ημερολογίου πελάτη (τύπου Outlook): πλέγμα μήνα/εβδομάδας
// με Δευτέρα πρώτη, και τοποθέτηση πολυήμερων γεγονότων σε «λωρίδες» ώστε να μην επικαλύπτονται.

/** Ολοήμερο γεγονός· `end` συμπεριλαμβάνεται (YYYY-MM-DD). */
export type CalEvent = {
  id: string; kind: 'milestone' | 'payment' | 'task';
  title: string; sub: string | null; start: string; end: string;
  /** todo · progress · review · done · danger — τα χρώματα φάσεων της πύλης */
  tone: 'todo' | 'progress' | 'review' | 'done' | 'danger';
  status: string; href: string | null; amount?: number | null;
};

const parse = (d: string) => new Date(`${d}T00:00:00Z`);
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => { const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return ymd(x); };
export const dayDiff = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);

/** Η Δευτέρα της εβδομάδας μιας ημέρας. */
export function weekStart(d: string): string {
  const dow = (parse(d).getUTCDay() + 6) % 7; // Δευ=0 … Κυρ=6
  return addDays(d, -dow);
}

/** Οι εβδομάδες (Δευτέρα πρώτη) που καλύπτουν τον μήνα `ym` (YYYY-MM) — 4 έως 6 γραμμές. */
export function monthWeeks(ym: string): string[][] {
  const first = `${ym}-01`;
  const next = parse(first); next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(ymd(next), -1);
  const weeks: string[][] = [];
  for (let w = weekStart(first); w <= last; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  return weeks;
}

export function shiftMonth(ym: string, n: number): string {
  const x = parse(`${ym}-01`); x.setUTCMonth(x.getUTCMonth() + n);
  return ymd(x).slice(0, 7);
}

export type Bar = { ev: CalEvent; col: number; span: number; lane: number; cutStart: boolean; cutEnd: boolean };

/**
 * Τα γεγονότα μιας εβδομάδας ως μπάρες: στήλη/πλάτος μέσα στην εβδομάδα και λωρίδα (0,1,2…) — μεγαλύτερα
 * πρώτα, ώστε οι πολυήμερες εργασίες να μένουν στην κορυφή όπως στο Outlook. `cutStart/cutEnd` όταν συνεχίζει.
 */
export function layoutWeek(events: CalEvent[], days: string[]): Bar[] {
  const from = days[0], to = days[days.length - 1];
  const inWeek = events
    .filter((e) => e.start <= to && e.end >= from)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : dayDiff(b.start, b.end) - dayDiff(a.start, a.end) || a.title.localeCompare(b.title, 'el')));
  const lanes: number[] = []; // τελευταία κατειλημμένη στήλη ανά λωρίδα
  return inWeek.map((ev) => {
    const s = ev.start < from ? from : ev.start;
    const e = ev.end > to ? to : ev.end;
    const col = dayDiff(from, s), span = dayDiff(s, e) + 1;
    let lane = lanes.findIndex((end) => end < col);
    if (lane === -1) { lane = lanes.length; lanes.push(-1); }
    lanes[lane] = col + span - 1;
    return { ev, col, span, lane, cutStart: ev.start < from, cutEnd: ev.end > to };
  });
}

/** Γεγονότα ανά ημέρα για τη λίστα (agenda) — ένα πολυήμερο εμφανίζεται στην πρώτη ορατή μέρα του. */
export function agenda(events: CalEvent[], from: string, to: string): { day: string; items: CalEvent[] }[] {
  const map = new Map<string, CalEvent[]>();
  for (const e of events) {
    if (e.end < from || e.start > to) continue;
    const d = e.start < from ? from : e.start;
    map.set(d, [...(map.get(d) ?? []), e]);
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, items]) => ({ day, items }));
}
