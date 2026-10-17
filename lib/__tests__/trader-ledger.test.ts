import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/softone', () => ({ softoneGetTable: vi.fn(), s1DateOrNull: vi.fn(), sosourceLabel: (n: number) => String(n) }));

import { ledgerEffect } from '../trader-activity';

// Οι πραγματικές σειρές της εγκατάστασης (SoftoneDocSeries / PurchaseDocType).
describe('ledgerEffect — επιβάρυνση ή εξόφληση', () => {
  it.each([
    [1351, 'Τιμολόγιο', 'invoice', 'charge'],
    [1351, 'Πιστωτικό Τιμολόγιο', 'credit', 'settle'],
    [1351, 'Παραγγελία', 'order', null],
    [1351, 'Προσφορά', 'quote', null],
    [1251, 'Τιμολόγιο Αγοράς', 'invoice', 'charge'],
    [1251, 'Δελτίο Παραλαβής', 'movement', null],
    [1413, 'Έμβασμα από πελάτη', null, 'settle'],
    [1413, 'Έμβασμα σε πελάτη - Επιστροφή', null, 'charge'],
    [1412, 'Έμβασμα σε προμηθευτή', null, 'settle'],
    [1381, 'Απόδειξη Είσπραξης', null, 'settle'],
    [1381, 'Επιστροφή Είσπραξης', null, 'charge'],
    [1281, 'Απόδειξη Πληρωμής', null, 'settle'],
    [1253, 'Χρέωση Έναρξης', null, 'D'],
    [1253, 'Πίστωση Έναρξης', null, 'C'],
    [1253, 'Τιμολόγιο Δαπανών / Ημεδαπής - Υπόχρεων οντοτήτων', null, 'charge'],
    [1253, 'Πιστωτικό Τιμολόγιο Δαπανών / Ημεδαπής - Υπόχρεων οντοτήτων', null, 'settle'],
  ] as const)('%i %s → %s', (src, name, kind, expected) => {
    expect(ledgerEffect(src, name, kind)).toBe(expected);
  });
});
