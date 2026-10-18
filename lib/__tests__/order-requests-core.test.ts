import { describe, expect, it } from 'vitest';
import { customerCanCancel, deliveryDateProblem, mergeLines, orderRequestInput, requestCode, staffCanMove } from '../order-requests-core';

describe('αιτήματα παραγγελίας — καθαρή λογική', () => {
  it('κωδικός αιτήματος με 6 ψηφία', () => {
    expect(requestCode(7)).toBe('ΑΠ-000007');
    expect(requestCode(1234567)).toBe('ΑΠ-1234567');
  });

  it('επικύρωση: τουλάχιστον μία γραμμή, θετική ποσότητα, κενά → null', () => {
    expect(orderRequestInput.safeParse({ lines: [] }).success).toBe(false);
    expect(orderRequestInput.safeParse({ lines: [{ mtrl: 5, qty: 0 }] }).success).toBe(false);
    expect(orderRequestInput.safeParse({ lines: [{ mtrl: -1, qty: 1 }] }).success).toBe(false);
    const ok = orderRequestInput.parse({ lines: [{ mtrl: 5, qty: 2.5, note: '  ' }], customerRef: '', deliveryDate: '', notes: ' x ' });
    expect(ok).toMatchObject({ prjc: null, customerRef: null, deliveryDate: null, notes: 'x', lines: [{ mtrl: 5, qty: 2.5, note: null }] });
    expect(orderRequestInput.safeParse({ lines: [{ mtrl: 5, qty: 1 }], deliveryDate: '18/10/2026' }).success).toBe(false);
  });

  it('το σώμα ΔΕΝ ορίζει πελάτη: άγνωστα πεδία (trdr) αγνοούνται', () => {
    const r = orderRequestInput.parse({ lines: [{ mtrl: 1, qty: 1 }], trdr: 999 } as unknown);
    expect('trdr' in r).toBe(false);
  });

  it('ίδιο υλικό δύο φορές → μία γραμμή με άθροισμα', () => {
    const m = mergeLines([{ mtrl: 1, qty: 1.1, note: 'α' }, { mtrl: 2, qty: 3, note: null }, { mtrl: 1, qty: 2.2, note: 'β' }]);
    expect(m).toEqual([{ mtrl: 1, qty: 3.3, note: 'α · β' }, { mtrl: 2, qty: 3, note: null }]);
  });

  it('ημερομηνία παράδοσης όχι στο παρελθόν', () => {
    const today = new Date('2026-10-18T10:00:00Z');
    expect(deliveryDateProblem(null, today)).toBeNull();
    expect(deliveryDateProblem('2026-10-18', today)).toBeNull();
    expect(deliveryDateProblem('2026-10-17', today)).toMatch(/παρελθόν/);
  });

  it('μεταβάσεις: το προσωπικό δεν ξανανοίγει κλειστά, ο πελάτης ακυρώνει μόνο «Υποβλήθηκε»', () => {
    expect(staffCanMove('SUBMITTED', 'IN_REVIEW')).toBe(true);
    expect(staffCanMove('IN_REVIEW', 'CONFIRMED')).toBe(true);
    expect(staffCanMove('CONFIRMED', 'REJECTED')).toBe(false);
    expect(staffCanMove('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(staffCanMove('SUBMITTED', 'CANCELLED')).toBe(false);
    expect(customerCanCancel('SUBMITTED')).toBe(true);
    expect(customerCanCancel('IN_REVIEW')).toBe(false);
  });
});
