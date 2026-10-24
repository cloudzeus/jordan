// lib/portal-glance-core.ts — ΚΑΘΑΡΟ. «Με μια ματιά» για τον πελάτη: πού βρίσκεται το έργο του (πρόοδος, αν
// προχωρά κανονικά ή καθυστερεί, τι γίνεται τώρα και τι ακολουθεί) και πού βρίσκονται οι πληρωμές του.
// Ειλικρινές: η καθυστέρηση λέγεται, με ημέρες — η σιγουριά έρχεται από τη σαφήνεια.

export type PulseTask = { id: string; name: string; start: string; end: string; progress: number };
export type Pulse = {
  progress: number;
  state: 'NOT_STARTED' | 'ON_TRACK' | 'DELAYED' | 'DONE';
  delayDays: number;
  /** Εργασίες που τρέχουν σήμερα. */
  now: PulseTask[];
  /** Η επόμενη εργασία που δεν έχει ξεκινήσει. */
  next: PulseTask | null;
  from: string | null; to: string | null;
};

const dayN = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 864e5);

export function projectPulse(tasks: PulseTask[], today: string): Pulse {
  if (!tasks.length) return { progress: 0, state: 'NOT_STARTED', delayDays: 0, now: [], next: null, from: null, to: null };
  const t = dayN(today);
  // Πρόοδος σταθμισμένη με τη διάρκεια κάθε εργασίας (μια μέρα αυτοψίας δεν μετρά όσο δέκα μέρες εφαρμογής).
  const w = (x: PulseTask) => Math.max(1, dayN(x.end) - dayN(x.start) + 1);
  const total = tasks.reduce((s, x) => s + w(x), 0);
  const progress = Math.round(tasks.reduce((s, x) => s + w(x) * Math.min(100, Math.max(0, x.progress)), 0) / total);
  const late = tasks.filter((x) => x.progress < 100 && dayN(x.end) < t);
  const delayDays = late.reduce((m, x) => Math.max(m, t - dayN(x.end)), 0);
  const now = tasks.filter((x) => x.progress < 100 && dayN(x.start) <= t && dayN(x.end) >= t);
  const next = tasks.filter((x) => x.progress < 100 && dayN(x.start) > t).sort((a, b) => dayN(a.start) - dayN(b.start))[0] ?? null;
  const from = tasks.reduce((m, x) => (x.start < m ? x.start : m), tasks[0].start);
  const to = tasks.reduce((m, x) => (x.end > m ? x.end : m), tasks[0].end);
  const state = progress >= 100 ? 'DONE' : delayDays > 0 ? 'DELAYED' : progress === 0 && dayN(from) > t ? 'NOT_STARTED' : 'ON_TRACK';
  return { progress, state, delayDays, now, next, from, to };
}

export type PayItem = { amount: number; status: 'PENDING' | 'DONE' | 'PAID'; dueDate: string | null };
export type PaySplit = { total: number; paid: number; due: number; upcoming: number; paidPct: number; next: PayItem | null; overdue: number };

/** Εξοφλημένα / προς πληρωμή (παραδόθηκε η δουλειά) / επόμενα, και η επόμενη δόση. */
export function paymentSplit(items: PayItem[], today: string): PaySplit {
  const sum = (s: PayItem['status']) => Math.round(items.filter((x) => x.status === s).reduce((t, x) => t + x.amount, 0) * 100) / 100;
  const paid = sum('PAID'), due = sum('DONE'), upcoming = sum('PENDING');
  const total = Math.round((paid + due + upcoming) * 100) / 100;
  const open = items.filter((x) => x.status !== 'PAID').sort((a, b) => (a.status === 'DONE' ? -1 : 0) - (b.status === 'DONE' ? -1 : 0) || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'));
  const overdue = items.filter((x) => x.status !== 'PAID' && x.dueDate && x.dueDate < today).length;
  return { total, paid, due, upcoming, paidPct: total ? Math.round((paid / total) * 100) : 0, next: open[0] ?? null, overdue };
}
