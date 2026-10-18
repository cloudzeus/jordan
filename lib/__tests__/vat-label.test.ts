import { describe, it, expect } from 'vitest';
import { vatLabeller, rateFromDescr } from '../vat-label';

const rows = [
  { code: '0', descr: 'Μηδενικός Συντελεστής ΦΠΑ 0%', rate: null },
  { code: '1000', descr: 'ΦΠΑ 0% 39α κώδικα ΦΠΑ', rate: null },
  { code: '1131', descr: 'ΦΠΑ 13%', rate: 13 },
  { code: '1410', descr: 'ΦΠΑ 24%', rate: 24 },
  { code: '9', descr: 'Εκτός ΦΠΑ', rate: null },
];
const label = vatLabeller(rows);

describe('ΦΠΑ ως ποσοστό', () => {
  it('κωδικός SoftOne → ποσοστό, με την περιγραφή ως tooltip', () => {
    expect(label('1410')).toEqual({ label: '24 %', title: 'ΦΠΑ 24%' });
    expect(label('1131')?.label).toBe('13 %');
  });

  it('μηδενικές κατηγορίες: το ποσοστό από την περιγραφή (το SoftOne δεν δίνει rate)', () => {
    expect(label('0')?.label).toBe('0 %');
    expect(label('1000')).toEqual({ label: '0 %', title: 'ΦΠΑ 0% 39α κώδικα ΦΠΑ' });
  });

  it('χωρίς ποσοστό πουθενά → η περιγραφή', () => {
    expect(label('9')?.label).toBe('Εκτός ΦΠΑ');
  });

  it('τιμή «κωδικός|περιγραφή» από λίστα SoftOne', () => {
    expect(label('1410|ΦΠΑ 24%')?.label).toBe('24 %');
  });

  it('κενό → null· άγνωστος κωδικός → ρητά «κωδ.»', () => {
    expect(label(null)).toBeNull();
    expect(label('')).toBeNull();
    expect(label('7777')?.label).toBe('κωδ. 7777');
    expect(label('7777|ΦΠΑ 6%')?.label).toBe('6 %');
  });

  it('δεκαδικό ποσοστό στην περιγραφή', () => {
    expect(rateFromDescr('ΦΠΑ 5,5%')).toBe(5.5);
  });
});
