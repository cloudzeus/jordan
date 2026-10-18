import { describe, expect, it } from 'vitest';
import { agingKey, balanceEl, buildStatement, dayEl, overdue, type StatementEntry } from '../statement/core';
import { paymentReference, statementEmail, statementFileName, statementRef } from '../statement/email';
import { renderStatementPdf } from '../statement/pdf';
import { sampleStatementDoc, SAMPLE_ENTRIES } from '../statement/sample';
import { parseBankAccounts } from '../email/bank';
import { SAMPLE_BRAND } from '../email/catalog';

const E = (findoc: number, date: string, side: 'D' | 'C', amount: number, kindLabel = side === 'D' ? 'Τιμολόγιο' : 'Είσπραξη'): StatementEntry =>
  ({ findoc, fincode: `F-${findoc}`, date, kindLabel, amount, side });

describe('buildStatement — περίοδος & υπόλοιπα', () => {
  const entries = [E(3, '2026-03-01', 'C', 300), E(1, '2026-01-10', 'D', 1000), E(2, '2026-02-15', 'D', 500), E(4, '2026-05-01', 'D', 200)];

  it('χωρίς «από»: όλες οι κινήσεις χρονολογικά με τρέχον υπόλοιπο', () => {
    const s = buildStatement(entries, { to: '2026-12-31' });
    expect(s.opening).toBe(0);
    expect(s.lines.map((l) => l.findoc)).toEqual([1, 2, 3, 4]);
    expect(s.lines.map((l) => l.balance)).toEqual([1000, 1500, 1200, 1400]);
    expect(s.closing).toBe(1400);
    expect([s.periodDebit, s.periodCredit]).toEqual([1700, 300]);
  });

  it('με «από»: ό,τι είναι πριν γίνεται προηγούμενο υπόλοιπο· ό,τι είναι μετά το «έως» αγνοείται', () => {
    const s = buildStatement(entries, { from: '2026-02-01', to: '2026-03-31' });
    expect(s.opening).toBe(1000);
    expect(s.lines.map((l) => l.findoc)).toEqual([2, 3]);
    expect(s.closing).toBe(1200);
    expect(s.closing).toBe(s.opening + s.periodDebit - s.periodCredit);
  });

  it('FIFO: οι πληρωμές εξοφλούν πρώτα τα παλαιότερα — το σύνολο ανοιχτών = υπόλοιπο', () => {
    const s = buildStatement(entries, { to: '2026-06-30' });
    // 300 πληρωμή → το τιμολόγιο 1 (1000) μένει 700· τα 2 και 4 ολόκληρα.
    expect(s.open.map((o) => [o.findoc, o.open])).toEqual([[4, 200], [2, 500], [1, 700]]);
    expect(s.open.reduce((t, o) => t + o.open, 0)).toBeCloseTo(s.closing, 2);
    expect(s.open.find((o) => o.findoc === 1)?.days).toBe(171);
  });

  it('ενηλικίωση και ληξιπρόθεσμο', () => {
    const s = buildStatement(entries, { to: '2026-06-30' });
    expect(Object.fromEntries(s.aging.map((a) => [a.key, a.amount]))).toEqual({ current: 0, d31: 200, d61: 0, d90: 1200 });
    expect(overdue(s)).toBe(1400);
    expect([agingKey(0), agingKey(30), agingKey(31), agingKey(61), agingKey(91), agingKey(null)]).toEqual(['current', 'current', 'd31', 'd61', 'd90', 'current']);
  });

  it('πιστωτικό υπόλοιπο: κανένα ανοιχτό, σημαία inCredit', () => {
    const s = buildStatement([E(1, '2026-01-01', 'D', 100), E(2, '2026-01-05', 'C', 250)], { to: '2026-02-01' });
    expect(s.closing).toBe(-150);
    expect(s.inCredit).toBe(true);
    expect(s.open).toEqual([]);
    expect(balanceEl(-150)).toMatch(/150,00\s?€ πιστωτικό/);
  });

  it('τελευταία πληρωμή = η πιο πρόσφατη είσπραξη (όχι πιστωτικό)', () => {
    const s = buildStatement([...entries, E(5, '2026-04-01', 'C', 50, 'Πιστωτικό')], { to: '2026-12-31' });
    expect(s.lastPayment).toEqual({ day: '2026-03-01', amount: 300, fincode: 'F-3' });
  });

  it('δείγμα: η ανασύνθεση συμφωνεί', () => {
    const s = buildStatement(SAMPLE_ENTRIES, { from: '2026-06-01', to: '2026-10-18' });
    expect(s.opening).toBe(3420);
    expect(s.closing).toBe(7970);
    expect(s.open.reduce((t, o) => t + o.open, 0)).toBeCloseTo(7970, 2);
  });
});

describe('βοηθητικά', () => {
  it('ημερομηνίες, αναφορές, αρχεία', () => {
    expect(dayEl('2026-10-18')).toBe('18/10/2026');
    expect(dayEl(null)).toBe('—');
    const d = { customer: { trdr: 9, code: 'Π 01/Α', name: 'Χ' }, issuedOn: '2026-10-18' };
    expect(statementRef(d)).toBe('ΚΛ-Π 01/Α-20261018');
    // Μόνο ASCII στο όνομα αρχείου (Content-Disposition).
    expect(statementFileName(d)).toBe('katastasi-logariasmou-_01_-2026-10-18.pdf');
    expect(paymentReference({ trdr: 1, code: '0079', name: 'ΑΤΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ ΑΕ' })).toBe('0079 ΑΤΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ ΑΕ');
  });

  it('τραπεζικοί λογαριασμοί από τη ρύθμιση', () => {
    expect(parseBankAccounts('Alpha Bank: GR1201401234567890123456789; Eurobank — gr34 0260 0000 0000 0000 0000 000\nάκυρη γραμμή')).toEqual([
      { bank: 'Alpha Bank', iban: 'GR12 0140 1234 5678 9012 3456 789' },
      { bank: 'Eurobank', iban: 'GR34 0260 0000 0000 0000 0000 000' },
    ]);
    expect(parseBankAccounts(null)).toEqual([]);
  });
});

describe('email & PDF κατάστασης', () => {
  const doc = sampleStatementDoc(SAMPLE_BRAND);

  it('email: υπόλοιπο, ανοιχτά, IBAN, αιτιολογία, plain-text', () => {
    const m = statementEmail({ ...doc, message: 'Ευχαριστούμε <πολύ>' });
    expect(m.subject).toBe('Κατάσταση λογαριασμού 01/06/2026 – 18/10/2026 · Atelier by Damask');
    expect(m.html).toMatch(/7\.970,00\s?€/);
    expect(m.html).toContain('ΤΔΑ-0533');
    expect(m.html).toContain('GR00 0000');
    expect(m.html).toContain('Αιτιολογία: Π-00142 ΔΕΙΓΜΑ ΑΡΧΙΤΕΚΤΟΝΙΚΗ ΙΚΕ');
    expect(m.html).toContain('Ευχαριστούμε &lt;πολύ&gt;');
    expect(m.html).toContain('ΑΦΜ 801771250');
    expect(m.text).toMatch(/Υπόλοιπο: 7\.970,00\s?€/);
    expect(m.text).not.toMatch(/<[a-z]/i);
  });

  it('εξοφλημένος λογαριασμός: χωρίς IBAN και χωρίς υπενθύμιση', () => {
    const paid = { ...doc, statement: buildStatement([E(1, '2026-01-01', 'D', 100), E(2, '2026-01-05', 'C', 100)], { to: '2026-02-01' }) };
    const m = statementEmail(paid);
    expect(m.html).toContain('Εξοφλημένος λογαριασμός');
    expect(m.html).not.toContain('Τρόποι πληρωμής');
  });

  it('PDF: έγκυρο αρχείο με ελληνικά', async () => {
    const pdf = await renderStatementPdf(doc);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
  });
});
