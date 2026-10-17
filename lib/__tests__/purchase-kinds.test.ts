import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { classifyPurchase, creditReturnsGoods } from '../purchase-kinds';

describe('classifyPurchase — οι πραγματικές σειρές της εγκατάστασης', () => {
  it.each([
    ['Τιμολόγιο Αγοράς', 'invoice'],
    ['Δελτίο Αποστολής  Τιμολόγιο Αγοράς', 'invoice'],
    ['Τιμολόγιο Λήψης Υπηρεσιών', 'invoice'],
    ['Απόδειξη Λιανικής Πώλησης', 'invoice'],
    ['Πιστωτικό Τιμολόγιο Αγοράς - ΔΑ', 'credit'],
    ['Πιστωτικό Τιμολόγιο Έκπτωσης Αγορών', 'credit'],
    ['Αποδειξη Επιστροφης Λιανικής', 'credit'],
    ['Παραγγελία σε προμηθευτή', 'order'],
    ['Προσφορά', 'quote'],
    ['Δελτίο Παραλαβής', 'movement'],
    ['Συνοδευτικό Παραστατικό Διακίνησης', 'movement'],
  ])('%s → %s', (section, kind) => {
    expect(classifyPurchase(section)).toBe(kind);
  });

  it('πιστωτικό με επιστροφή υλικού αφαιρεί ποσότητα· πιστωτικό έκπτωσης όχι', () => {
    expect(creditReturnsGoods('Πιστωτικό Τιμολόγιο Αγοράς - ΔΑ')).toBe(true);
    expect(creditReturnsGoods('Πιστωτικό Τιμολόγιο Έκπτωσης Αγορών')).toBe(false);
  });
});
