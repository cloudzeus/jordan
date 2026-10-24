import { describe, expect, it } from 'vitest';
import { agenda, layoutWeek, monthWeeks, shiftMonth, weekStart, type CalEvent } from '../portal-calendar-core';
import { companyChanges, siteInput, siteLine } from '../customer-profile-core';

const ev = (id: string, start: string, end = start): CalEvent => ({ id, kind: 'task', title: id, sub: null, start, end, tone: 'progress', status: 'x', href: null });

describe('portal calendar', () => {
  it('εβδομάδα με Δευτέρα πρώτη', () => {
    expect(weekStart('2026-10-24')).toBe('2026-10-19'); // Σάββατο → Δευτέρα 19
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Κυριακή
  });

  it('πλέγμα μήνα: Οκτώβριος 2026 = 5 εβδομάδες από 28/9', () => {
    const w = monthWeeks('2026-10');
    expect(w).toHaveLength(5);
    expect(w[0][0]).toBe('2026-09-28');
    expect(w[4][6]).toBe('2026-11-01');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('λωρίδες: επικαλυπτόμενα σε διαφορετικές, το μεγάλο πρώτο, κομμένα στα όρια', () => {
    const days = monthWeeks('2026-10')[3]; // 19–25/10
    const bars = layoutWeek([ev('a', '2026-10-20'), ev('long', '2026-10-15', '2026-10-28'), ev('b', '2026-10-22'), ev('c', '2026-10-20', '2026-10-21')], days);
    const by = Object.fromEntries(bars.map((b) => [b.ev.id, b]));
    expect(by.long).toMatchObject({ col: 0, span: 7, lane: 0, cutStart: true, cutEnd: true });
    expect(by.c.lane).toBe(1);
    expect(by.a.lane).toBe(2);
    expect(by.b).toMatchObject({ col: 3, lane: 1 });
  });

  it('agenda: ανά ημέρα, πολυήμερο στην πρώτη ορατή μέρα', () => {
    const a = agenda([ev('x', '2026-09-30', '2026-10-03'), ev('y', '2026-10-05'), ev('z', '2026-11-02')], '2026-10-01', '2026-10-31');
    expect(a.map((d) => [d.day, d.items.map((i) => i.id)])).toEqual([['2026-10-01', ['x']], ['2026-10-05', ['y']]]);
  });
});

describe('customer profile core', () => {
  it('τοποθεσία: όνομα και διεύθυνση ή πόλη', () => {
    expect(siteInput.safeParse({ label: 'Σπίτι', city: 'Κηφισιά' }).success).toBe(true);
    expect(siteInput.safeParse({ label: 'Σπίτι' }).success).toBe(false);
    expect(siteLine({ address: 'Λεωφ. Κηφισίας 10', floor: '3ος', zip: '14562', district: 'Κεφαλάρι', city: 'Κηφισιά' })).toBe('Λεωφ. Κηφισίας 10, 3ος · 14562 Κεφαλάρι Κηφισιά');
  });

  it('αλλαγές εταιρικών: μόνο ό,τι άλλαξε, έλεγχος ΑΦΜ/email', () => {
    const cur = { name: 'ΑΛΦΑ ΑΕ', afm: '123456789', email: 'a@b.gr' };
    expect(companyChanges(cur, { name: ' ΑΛΦΑ  ΑΕ ', afm: '123456789' })).toMatchObject({ changes: [], error: 'Δεν αλλάξατε κάποιο στοιχείο' });
    expect(companyChanges(cur, { afm: '12345' }).error).toBe('Το ΑΦΜ πρέπει να έχει 9 ψηφία');
    expect(companyChanges(cur, { email: 'όχι' }).error).toBe('Το email δεν είναι έγκυρο');
    const r = companyChanges(cur, { name: 'ΑΛΦΑ ΙΚΕ', email: 'a@b.gr' });
    expect(r.changes).toEqual([{ field: 'name', label: 'Επωνυμία', from: 'ΑΛΦΑ ΑΕ', to: 'ΑΛΦΑ ΙΚΕ' }]);
  });
});
