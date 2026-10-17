import { describe, expect, it } from 'vitest';
import { capacityPallets, checkReservation, checkTiers, nextTier, offerState, tierAt, type Tier } from '../container-pricing';

const T: Tier[] = [
  { level: 1, fromPallets: 0.5, price: 42 },
  { level: 2, fromPallets: 5, price: 39 },
  { level: 3, fromPallets: 10, price: 36 },
  { level: 4, fromPallets: 15, price: 34 },
  { level: 5, fromPallets: 20, price: 32 },
];

describe('capacityPallets', () => {
  it('τ.μ. container ÷ τ.μ. παλέτας, προς τα κάτω σε ½', () => {
    expect(capacityPallets(1040, 52)).toBe(20);
    expect(capacityPallets(1000, 52)).toBe(19); // 19,23 → 19
    expect(capacityPallets(1030, 52)).toBe(19.5); // 19,8 → 19,5
    expect(capacityPallets(0, 52)).toBe(0);
  });
});

describe('checkTiers — PRICEW01 η μεγαλύτερη, κάθε επόμενη φθηνότερη', () => {
  it('σωστή κλίμακα ⇒ χωρίς σφάλματα', () => {
    expect(checkTiers(T, 20).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('τιμή που δεν πέφτει ⇒ σφάλμα', () => {
    const bad = T.map((t) => (t.level === 3 ? { ...t, price: 40 } : t));
    expect(checkTiers(bad, 20).some((i) => i.level === 'error' && /PRICEW03/.test(i.message))).toBe(true);
  });
  it('1ο κλιμάκιο όχι από την ελάχιστη παραγγελία ⇒ σφάλμα', () => {
    expect(checkTiers([{ level: 1, fromPallets: 1, price: 40 }], 20).some((i) => /ελάχιστη παραγγελία/.test(i.message))).toBe(true);
  });
  it('σημείο πέρα από τη χωρητικότητα ή όχι ανά ½ ⇒ σφάλμα', () => {
    expect(checkTiers([...T.slice(0, 4), { level: 5, fromPallets: 25, price: 30 }], 20).some((i) => /χωρά 20/.test(i.message))).toBe(true);
    expect(checkTiers([T[0], { level: 2, fromPallets: 3.3, price: 40 }], 20).some((i) => /ανά ½/.test(i.message))).toBe(true);
  });
  it('η σειρά των PRICEW ακολουθεί τα σημεία', () => {
    const swapped = [T[0], { ...T[1], level: 3 }, { ...T[2], level: 2 }];
    expect(checkTiers(swapped, 20).some((i) => /είναι η PRICEW02/.test(i.message))).toBe(true);
  });
});

describe('τιμή ανάλογα με το γέμισμα', () => {
  it('πριν από την 1η κράτηση ισχύει η PRICEW01', () => expect(tierAt(T, 0)?.level).toBe(1));
  it('ακριβώς στο σημείο πέφτει', () => { expect(tierAt(T, 4.5)?.level).toBe(1); expect(tierAt(T, 5)?.level).toBe(2); });
  it('επόμενη πτώση και πόσο λείπει', () => expect(nextTier(T, 7.5)).toEqual({ tier: T[2], missing: 2.5 }));
  it('χωρίς κρατήσεις: η επόμενη πτώση είναι η PRICEW02 (η 01 ισχύει ήδη)', () => expect(nextTier(T, 0)).toEqual({ tier: T[1], missing: 5 }));
  it('γεμάτο ⇒ καμία επόμενη, όφελος = πρώτη − τελευταία', () => {
    const s = offerState({ tiers: T, sqmPerContainer: 1040, sqmPerPallet: 52 }, 20);
    expect(s.full).toBe(true); expect(s.next).toBeNull(); expect(s.savingPerUnit).toBe(10); expect(s.free).toBe(0);
  });
});

describe('checkReservation', () => {
  it('από ½ παλέτα, ανά ½, έως τις ελεύθερες θέσεις', () => {
    expect(checkReservation(0.5, 10)).toBeNull();
    expect(checkReservation(0.3, 10)).toMatch(/ανά ½/);
    expect(checkReservation(11, 10)).toMatch(/Χωρούν ακόμη 10/);
  });
});
