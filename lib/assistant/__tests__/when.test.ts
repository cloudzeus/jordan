import { describe, expect, it } from 'vitest';
import { parseWhen } from '../when';

// Κυριακή 18 Οκτωβρίου 2026, 12:00 Αθήνας.
const NOW = new Date('2026-10-18T09:00:00Z');
const w = (s: string) => parseWhen(s, NOW);

describe('parseWhen — ημέρα', () => {
  it('σήμερα / αύριο / μεθαύριο', () => {
    expect(w('τι ραντεβού έχω σήμερα').date).toBe('2026-10-18');
    expect(w('αύριο στις 10:30')).toMatchObject({ date: '2026-10-19', time: '10:30' });
    expect(w('μεθαύριο το πρωί')).toMatchObject({ date: '2026-10-20', time: null, partOfDay: 'morning' });
    expect(w('avrio stis 11').date).toBe('2026-10-19');
  });

  it('μέρα της εβδομάδας = η επόμενη τέτοια', () => {
    expect(w('στις 4 το απόγευμα της Δευτέρας')).toMatchObject({ date: '2026-10-19', time: '16:00', partOfDay: 'afternoon' });
    expect(w('την Πέμπτη στις 12 το μεσημέρι')).toMatchObject({ date: '2026-10-22', time: '12:00' });
    expect(w('την Κυριακή').date).toBe('2026-10-25'); // σήμερα Κυριακή ⇒ την επόμενη
    expect(w('την Τρίτη της άλλης εβδομάδας').date).toBe('2026-10-27');
  });

  it('ρητή ημερομηνία', () => {
    expect(w('20/10 στις 11')).toMatchObject({ date: '2026-10-20', time: '11:00' });
    expect(w('25 Οκτωβρίου 17:00')).toMatchObject({ date: '2026-10-25', time: '17:00' });
    expect(w('5/1').date).toBe('2027-01-05'); // πέρασε φέτος ⇒ του χρόνου
  });
});

describe('parseWhen — ώρα', () => {
  it('απόγευμα / βράδυ / πρωί / μ.μ.', () => {
    expect(w('Δευτέρα 4 το απόγευμα').time).toBe('16:00');
    expect(w('αύριο στις 8 το βράδυ').time).toBe('20:00');
    expect(w('αύριο στις 9 το πρωί').time).toBe('09:00');
    expect(w('αύριο 5 μ.μ.').time).toBe('17:00');
    expect(w('αύριο 11 π.μ.').time).toBe('11:00');
  });

  it('24ωρη μορφή και «και μισή»', () => {
    expect(w('Τρίτη 16:30').time).toBe('16:30');
    expect(w('Τρίτη 16.30').time).toBe('16:30');
    expect(w('αύριο στις 4 και μισή το απόγευμα').time).toBe('16:30');
    expect(w('αύριο στις τέσσερις το απόγευμα').time).toBe('16:00');
  });

  it('«στις 4» χωρίς τμήμα ημέρας ⇒ 16:00, με σημείωση υπόθεσης', () => {
    const r = w('αύριο στις 4');
    expect(r.time).toBe('16:00');
    expect(r.assumed.join(' ')).toMatch(/16:00/);
    expect(w('αύριο στις 10').time).toBe('10:00');
  });

  it('χωρίς ημέρα ή ώρα', () => {
    expect(w('κλείσε ραντεβού με τον Κουνά')).toMatchObject({ date: null, time: null, partOfDay: null });
  });
});
