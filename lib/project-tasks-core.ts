/**
 * Εργασίες έργου — καθαρή λογική (χωρίς DB): φάσεις/ποσοστά, χρονοπρογραμματισμός με εξαρτήσεις
 * σε εργάσιμες ημέρες (Δευ–Παρ), ποσοστό ολοκλήρωσης έργου, templates και παράθυρο ημερολογίου.
 *
 * Ημερομηνίες ως «YYYY-MM-DD» (ημέρα, όχι στιγμή) — ώστε η ζώνη ώρας να μη μετακινεί τα tasks.
 */
import { addDays, zonedToUtc } from '@/lib/appointments-core';

// ── Φάσεις (στήλες Kanban) & ποσοστά ────────────────────────────────────────────────────────────
export const PROGRESS_STEPS = [0, 25, 50, 75, 100] as const;
export type Progress = (typeof PROGRESS_STEPS)[number];

export const PHASES = [
  { key: 'TODO', label: 'Να γίνει', steps: [0], color: '#64748b' },
  { key: 'IN_PROGRESS', label: 'Σε εξέλιξη', steps: [25, 50], color: '#2563eb' },
  { key: 'REVIEW', label: 'Σε έλεγχο', steps: [75], color: '#d97706' },
  { key: 'DONE', label: 'Ολοκληρώθηκε', steps: [100], color: '#16a34a' },
] as const satisfies readonly { key: string; label: string; steps: readonly Progress[]; color: string }[];
export type PhaseKey = (typeof PHASES)[number]['key'];
export const PHASE_KEYS = PHASES.map((p) => p.key) as PhaseKey[];
export const phaseMeta = (k: PhaseKey) => PHASES.find((p) => p.key === k)!;

/** Οποιαδήποτε τιμή → το πλησιέστερο βήμα 25% (0–100). */
export function snapProgress(n: number): Progress {
  if (!Number.isFinite(n)) return 0;
  const c = Math.min(100, Math.max(0, n));
  return (Math.round(c / 25) * 25) as Progress;
}

export function phaseOf(progress: number): PhaseKey {
  const p = snapProgress(progress);
  return PHASES.find((ph) => (ph.steps as readonly number[]).includes(p))!.key;
}

/** Μεταφορά σε στήλη: κρατά το ποσοστό αν ήδη ανήκει εκεί (π.χ. 50% μένει 50% στο «Σε εξέλιξη»). */
export function progressForPhase(phase: PhaseKey, current: number): Progress {
  const steps = phaseMeta(phase).steps as readonly Progress[];
  const cur = snapProgress(current);
  return steps.includes(cur) ? cur : steps[0];
}

// ── Διάρκεια ────────────────────────────────────────────────────────────────────────────────────
export const HOURS_PER_DAY = 8;
export type DurationUnit = 'DAYS' | 'HOURS';
export const DURATION_UNITS: { key: DurationUnit; label: string }[] = [{ key: 'DAYS', label: 'ημέρες' }, { key: 'HOURS', label: 'ώρες' }];

/** Εργάσιμες ημέρες που πιάνει το task στο Gantt (τουλάχιστον 1). */
export function durationDays(value: number, unit: string): number {
  const v = Number.isFinite(value) && value > 0 ? value : 1;
  return Math.max(1, Math.ceil(unit === 'HOURS' ? v / HOURS_PER_DAY : v));
}

export function durationLabel(value: number, unit: string): string {
  const v = Number.isInteger(value) ? String(value) : value.toLocaleString('el-GR');
  if (unit === 'HOURS') return `${v} ${value === 1 ? 'ώρα' : 'ώρες'}`;
  return `${v} ${value === 1 ? 'ημέρα' : 'ημέρες'}`;
}

// ── Εργάσιμες ημέρες ────────────────────────────────────────────────────────────────────────────
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const isWorkday = (d: string) => { const w = weekday(d); return w !== 0 && w !== 6; };

/** Η ίδια μέρα αν είναι εργάσιμη, αλλιώς η επόμενη εργάσιμη. */
export function toWorkday(d: string): string {
  let x = d;
  while (!isWorkday(x)) x = addDays(x, 1);
  return x;
}

/** n εργάσιμες μετά (n ≥ 0) — ξεκινά από εργάσιμη. */
export function addWorkdays(d: string, n: number): string {
  let x = toWorkday(d);
  for (let i = 0; i < n; i++) x = toWorkday(addDays(x, 1));
  return x;
}

/** Εργάσιμες από `from` έως `to` (χωρίς το `to`)· αρνητικό αν `to` < `from`. */
export function workdaysBetween(from: string, to: string): number {
  if (to < from) return -workdaysBetween(to, from);
  let n = 0;
  for (let x = toWorkday(from); x < to; x = toWorkday(addDays(x, 1))) n++;
  return n;
}

// ── Εξαρτήσεις ──────────────────────────────────────────────────────────────────────────────────
export type DepEdge = { taskId: string; dependsOnId: string };

/** Θα δημιουργούσε κύκλο αν το `taskId` εξαρτηθεί από τα `dependsOn`; (περιλαμβάνει αυτο-εξάρτηση) */
export function wouldCreateCycle(edges: DepEdge[], taskId: string, dependsOn: string[]): boolean {
  const preds = new Map<string, string[]>();
  for (const e of edges) if (e.taskId !== taskId) preds.set(e.taskId, [...(preds.get(e.taskId) ?? []), e.dependsOnId]);
  // κύκλος ⇔ από κάποιο νέο προαπαιτούμενο, ακολουθώντας προαπαιτούμενα, φτάνουμε στο taskId
  const seen = new Set<string>();
  const stack = [...dependsOn];
  while (stack.length) {
    const x = stack.pop()!;
    if (x === taskId) return true;
    if (seen.has(x)) continue;
    seen.add(x);
    stack.push(...(preds.get(x) ?? []));
  }
  return false;
}

// ── Χρονοπρογραμματισμός ────────────────────────────────────────────────────────────────────────
export type SchedInput = { id: string; startDate: string | null; durationValue: number; durationUnit: string; dependsOn: string[] };
export type SchedRow = {
  start: string; end: string; days: number;
  /** Νωρίτερη έναρξη που επιτρέπουν τα προαπαιτούμενα. */
  earliest: string;
  /** Η ορισμένη έναρξη είναι πριν τελειώσουν τα προαπαιτούμενα. */
  conflict: boolean;
  /** Χωρίς ορισμένη ημερομηνία — υπολογίστηκε. */
  auto: boolean;
};
export type Schedule = { rows: Map<string, SchedRow>; order: string[]; cycle: string[] };

/**
 * Finish-to-start: ένα task ξεκινά την επόμενη εργάσιμη μετά το τέλος ΟΛΩΝ των προαπαιτούμενων.
 * Με ορισμένη έναρξη κρατάμε αυτή (σημειώνοντας σύγκρουση αν είναι νωρίτερα)· χωρίς, την νωρίτερη.
 * Tasks σε κύκλο (δεν θα έπρεπε να υπάρχουν) προγραμματίζονται σαν να μην είχαν εξαρτήσεις.
 */
export function schedule(tasks: SchedInput[], projectStart: string): Schedule {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const deps = new Map(tasks.map((t) => [t.id, [...new Set(t.dependsOn)].filter((d) => byId.has(d) && d !== t.id)]));
  // Kahn — σταθερή σειρά εισόδου
  const indeg = new Map(tasks.map((t) => [t.id, deps.get(t.id)!.length]));
  const succ = new Map<string, string[]>();
  for (const t of tasks) for (const d of deps.get(t.id)!) succ.set(d, [...(succ.get(d) ?? []), t.id]);
  const queue = tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of succ.get(id) ?? []) {
      indeg.set(s, indeg.get(s)! - 1);
      if (indeg.get(s) === 0) queue.push(s);
    }
  }
  const cycle = tasks.filter((t) => !order.includes(t.id)).map((t) => t.id);
  const rows = new Map<string, SchedRow>();
  const base = toWorkday(projectStart);
  for (const id of [...order, ...cycle]) {
    const t = byId.get(id)!;
    const inCycle = cycle.includes(id);
    const ends = inCycle ? [] : deps.get(id)!.map((d) => rows.get(d)!.end);
    const earliest = ends.length ? toWorkday(addDays(ends.reduce((a, b) => (a > b ? a : b)), 1)) : base;
    const days = durationDays(t.durationValue, t.durationUnit);
    const start = t.startDate ? toWorkday(t.startDate) : earliest;
    rows.set(id, { start, end: addWorkdays(start, days - 1), days, earliest, conflict: !!t.startDate && start < earliest, auto: !t.startDate });
  }
  return { rows, order: [...order, ...cycle], cycle };
}

/** Προαπαιτούμενα που δεν έχουν ολοκληρωθεί (για την ένδειξη «περιμένει»). */
export function waitingOn(task: { dependsOn: string[] }, all: { id: string; progress: number }[]): string[] {
  const p = new Map(all.map((t) => [t.id, t.progress]));
  return task.dependsOn.filter((d) => p.has(d) && p.get(d)! < 100);
}

/** Συνολικό ποσοστό έργου: σταθμισμένο με τη διάρκεια (μεγαλύτερα tasks μετράνε περισσότερο). */
export function projectProgress(tasks: { progress: number; durationValue: number; durationUnit: string }[]): number {
  let w = 0;
  let sum = 0;
  for (const t of tasks) {
    const d = durationDays(t.durationValue, t.durationUnit);
    w += d;
    sum += d * snapProgress(t.progress);
  }
  return w ? Math.round(sum / w) : 0;
}

export function phaseCounts(tasks: { progress: number }[]): Record<PhaseKey, number> {
  const out = Object.fromEntries(PHASE_KEYS.map((k) => [k, 0])) as Record<PhaseKey, number>;
  for (const t of tasks) out[phaseOf(t.progress)]++;
  return out;
}

// ── Kanban: σειρά μέσα στις στήλες ──────────────────────────────────────────────────────────────
export type BoardTask = { id: string; progress: number; sortOrder: number };
export type BoardMove = { id: string; progress: Progress; sortOrder: number };

/**
 * Μετακίνηση του `id` στη στήλη `to`, πριν από το `beforeId` (null = στο τέλος). Επιστρέφει ΜΟΝΟ
 * τις αλλαγές (νέο progress/sortOrder) — οι υπόλοιπες γραμμές μένουν ως έχουν.
 */
export function moveOnBoard(tasks: BoardTask[], id: string, to: PhaseKey, beforeId: string | null): BoardMove[] {
  const moving = tasks.find((t) => t.id === id);
  if (!moving) return [];
  const col = tasks
    .filter((t) => t.id !== id && phaseOf(t.progress) === to)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const at = beforeId ? col.findIndex((t) => t.id === beforeId) : -1;
  const next = [...col];
  next.splice(at < 0 ? next.length : at, 0, moving);
  const changes: BoardMove[] = [];
  next.forEach((t, i) => {
    const progress = t.id === id ? progressForPhase(to, t.progress) : snapProgress(t.progress);
    if (t.id === id || t.sortOrder !== i) changes.push({ id: t.id, progress, sortOrder: i });
  });
  return changes;
}

// ── Templates ───────────────────────────────────────────────────────────────────────────────────
export type TemplateSource = SchedInput & { name: string; description: string | null; customerVisible: boolean; inCalendar: boolean };
export type TemplateItemDraft = {
  key: string; name: string; description: string | null; durationValue: number; durationUnit: string;
  offsetDays: number; customerVisible: boolean; inCalendar: boolean; sortOrder: number; dependsOn: string[];
};

/**
 * Από (όλα ή μέρος των) tasks ενός έργου → items template. Η έναρξη γίνεται σχετική (εργάσιμες από
 * το νωρίτερο επιλεγμένο task)· εξαρτήσεις προς tasks ΕΚΤΟΣ επιλογής πέφτουν.
 */
export function buildTemplateItems(all: TemplateSource[], selectedIds: string[], projectStart: string): TemplateItemDraft[] {
  const sched = schedule(all, projectStart);
  const pick = new Set(selectedIds);
  const chosen = sched.order.filter((id) => pick.has(id)).map((id) => all.find((t) => t.id === id)!);
  if (!chosen.length) return [];
  const origin = chosen.map((t) => sched.rows.get(t.id)!.start).reduce((a, b) => (a < b ? a : b));
  const keyOf = new Map(chosen.map((t, i) => [t.id, `t${i + 1}`]));
  return chosen.map((t, i) => ({
    key: keyOf.get(t.id)!, name: t.name, description: t.description, durationValue: t.durationValue, durationUnit: t.durationUnit,
    offsetDays: workdaysBetween(origin, sched.rows.get(t.id)!.start), customerVisible: t.customerVisible, inCalendar: t.inCalendar,
    sortOrder: i, dependsOn: t.dependsOn.filter((d) => keyOf.has(d)).map((d) => keyOf.get(d)!),
  }));
}

export type AppliedTask = {
  key: string; name: string; description: string | null; durationValue: number; durationUnit: string;
  startDate: string; customerVisible: boolean; inCalendar: boolean; dependsOnKeys: string[];
  /** Ξεκινά ακριβώς μετά τα προαπαιτούμενα → αποθηκεύεται χωρίς ημερομηνία, ώστε να ακολουθεί αν εκείνα καθυστερήσουν. */
  followsDeps: boolean;
};

/**
 * Εφαρμογή template σε έργο από την ημερομηνία `start`: κάθε item παίρνει έναρξη start + offset
 * εργάσιμες, μετατοπισμένη αν χρειάζεται ώστε να σέβεται τις εξαρτήσεις του.
 */
export function applyTemplateItems(items: Omit<TemplateItemDraft, 'sortOrder'>[], start: string): AppliedTask[] {
  const keys = new Set(items.map((i) => i.key));
  const asSched = items.map((i) => ({ id: i.key, startDate: addWorkdays(start, Math.max(0, i.offsetDays)), durationValue: i.durationValue, durationUnit: i.durationUnit, dependsOn: i.dependsOn.filter((d) => keys.has(d)) }));
  // Πρώτα χωρίς σταθερές ημερομηνίες για να βρούμε τις νωρίτερες, μετά max(offset, earliest).
  const byKey = new Map(asSched.map((s) => [s.id, s]));
  const sched = schedule(asSched.map((s) => ({ ...s, startDate: null })), start);
  const fixed = new Map<string, string>();
  const follows = new Set<string>();
  for (const id of sched.order) {
    const s = byKey.get(id)!;
    const ends = s.dependsOn.map((d) => addWorkdays(fixed.get(d)!, durationDays(byKey.get(d)!.durationValue, byKey.get(d)!.durationUnit) - 1));
    const earliest = ends.length ? toWorkday(addDays(ends.reduce((a, b) => (a > b ? a : b)), 1)) : toWorkday(start);
    fixed.set(id, s.startDate! > earliest ? s.startDate! : earliest);
    if (ends.length && fixed.get(id) === earliest) follows.add(id);
  }
  return items.map((i) => ({
    key: i.key, name: i.name, description: i.description, durationValue: i.durationValue, durationUnit: i.durationUnit,
    startDate: fixed.get(i.key)!, customerVisible: i.customerVisible, inCalendar: i.inCalendar, dependsOnKeys: byKey.get(i.key)!.dependsOn,
    followsDeps: follows.has(i.key),
  }));
}

// ── Ημερολόγιο ──────────────────────────────────────────────────────────────────────────────────
export const WORKDAY_START = '09:00';
export const WORKDAY_END = '17:00';

/**
 * Γεγονός ημερολογίου για ένα task: από 09:00 της έναρξης. Ώρες ≤ 8 → έως 09:00 + ώρες την ίδια μέρα·
 * αλλιώς έως 17:00 της τελευταίας εργάσιμης.
 */
export function calendarWindow(start: string, durationValue: number, durationUnit: string): { start: Date; end: Date } {
  const s = toWorkday(start);
  const from = zonedToUtc(s, WORKDAY_START);
  if (durationUnit === 'HOURS' && durationValue > 0 && durationValue <= HOURS_PER_DAY) {
    return { start: from, end: new Date(from.getTime() + Math.round(durationValue * 60) * 60_000) };
  }
  return { start: from, end: zonedToUtc(addWorkdays(s, durationDays(durationValue, durationUnit) - 1), WORKDAY_END) };
}

/**
 * Τμήματα για το ημερολόγιο οθόνης: ένα ανά εργάσιμη (09:00–17:00), ώστε μια πολυήμερη εργασία να μη
 * γεμίζει ολόκληρες στήλες. Ώρες: 8 ανά ημέρα, το υπόλοιπο την τελευταία.
 */
export function calendarSegments(start: string, durationValue: number, durationUnit: string): { date: string; start: Date; end: Date }[] {
  const days = durationDays(durationValue, durationUnit);
  const out: { date: string; start: Date; end: Date }[] = [];
  let left = durationUnit === 'HOURS' && durationValue > 0 ? durationValue : days * HOURS_PER_DAY;
  for (let i = 0; i < days; i++) {
    const d = addWorkdays(start, i);
    const from = zonedToUtc(d, WORKDAY_START);
    const hours = Math.min(HOURS_PER_DAY, left);
    left -= hours;
    out.push({ date: d, start: from, end: new Date(from.getTime() + Math.round(hours * 60) * 60_000) });
  }
  return out;
}

export const PARTY_KINDS = [
  { key: 'EMPLOYEE', label: 'Υπάλληλος' },
  { key: 'PARTNER', label: 'Συνεργάτης' },
  { key: 'SUPPLIER', label: 'Προμηθευτής' },
  { key: 'CUSTOMER', label: 'Πελάτης' },
] as const;
export type PartyKindKey = (typeof PARTY_KINDS)[number]['key'];
export const partyKindLabel = (k: string) => PARTY_KINDS.find((p) => p.key === k)?.label ?? k;

/** «YYYY-MM-DD» από Date @db.Date (UTC μεσάνυχτα). */
export const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
