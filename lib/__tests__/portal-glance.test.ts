import { describe, expect, it } from 'vitest';
import { paymentSplit, projectPulse } from '../portal-glance-core';

const t = (id: string, start: string, end: string, progress: number) => ({ id, name: id, start, end, progress });

describe('projectPulse', () => {
  it('σταθμισμένη πρόοδος, τρέχουσα και επόμενη εργασία', () => {
    const p = projectPulse([t('a', '2026-10-01', '2026-10-01', 100), t('b', '2026-10-20', '2026-10-29', 50), t('c', '2026-11-05', '2026-11-06', 0)], '2026-10-24');
    expect(p.progress).toBe(Math.round((1 * 100 + 10 * 50) / 13));
    expect(p).toMatchObject({ state: 'ON_TRACK', delayDays: 0, from: '2026-10-01', to: '2026-11-06' });
    expect(p.now.map((x) => x.id)).toEqual(['b']);
    expect(p.next?.id).toBe('c');
  });
  it('καθυστέρηση: εργασία που έπρεπε να έχει τελειώσει', () => {
    const p = projectPulse([t('a', '2026-10-10', '2026-10-20', 80)], '2026-10-24');
    expect(p).toMatchObject({ state: 'DELAYED', delayDays: 4 });
  });
  it('δεν ξεκίνησε / ολοκληρώθηκε / χωρίς εργασίες', () => {
    expect(projectPulse([t('a', '2026-11-01', '2026-11-02', 0)], '2026-10-24').state).toBe('NOT_STARTED');
    expect(projectPulse([t('a', '2026-10-01', '2026-10-02', 100)], '2026-10-24').state).toBe('DONE');
    expect(projectPulse([], '2026-10-24')).toMatchObject({ state: 'NOT_STARTED', progress: 0, next: null });
  });
});

describe('paymentSplit', () => {
  it('κατανομή και επόμενη δόση — πρώτα όσα είναι προς πληρωμή', () => {
    const s = paymentSplit([
      { amount: 1000, status: 'PAID', dueDate: '2026-10-01' },
      { amount: 1500, status: 'DONE', dueDate: '2026-10-30' },
      { amount: 500, status: 'PENDING', dueDate: '2026-10-20' },
    ], '2026-10-24');
    expect(s).toMatchObject({ total: 3000, paid: 1000, due: 1500, upcoming: 500, paidPct: 33, overdue: 1 });
    expect(s.next).toMatchObject({ status: 'DONE', amount: 1500 });
  });
  it('κενό', () => {
    expect(paymentSplit([], '2026-10-24')).toMatchObject({ total: 0, paidPct: 0, next: null });
  });
});
