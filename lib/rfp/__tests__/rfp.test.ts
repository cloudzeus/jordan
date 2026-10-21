import { describe, expect, it } from 'vitest';
import { bidInput, canRespond, distributeAmount, rfpRef, areaOnly, rfpDefaults } from '../core';
import { eventHash, hashToken, newToken, validToken, verifyChain } from '../chain';

describe('αιτήματα προσφοράς', () => {
  it('αναφορά και περιοχή χωρίς διεύθυνση', () => {
    expect(rfpRef(42)).toBe('ΑΠΡ-000042');
    expect(areaOnly({ siteDistrict: 'Κηφισιά', siteCity: 'Αθήνα', siteZip: '14562' })).toBe('Κηφισιά, Αθήνα');
    expect(areaOnly({ siteZip: '14562' })).toBe('Τ.Κ. 14562');
  });

  it('έλεγχος απάντησης: ποσό, όροι, ημερομηνίες', () => {
    expect(bidInput.parse({ amount: '1500,5'.replace(',', '.'), termsAccepted: true, startDate: '', durationDays: '' })).toMatchObject({ amount: 1500.5, startDate: null, durationDays: null });
    expect(bidInput.safeParse({ amount: 100, termsAccepted: false }).success).toBe(false);
    expect(bidInput.safeParse({ amount: 0, termsAccepted: true }).success).toBe(false);
  });

  it('προθεσμία ως το τέλος της ημέρας, κλειστά αιτήματα', () => {
    const rfp = { status: 'OPEN', dueDate: '2026-11-10' };
    expect(canRespond(rfp, 'VIEWED', new Date('2026-11-10T20:00:00Z')).ok).toBe(true);
    expect(canRespond(rfp, 'VIEWED', new Date('2026-11-11T08:00:00Z')).ok).toBe(false);
    expect(canRespond({ status: 'AWARDED', dueDate: null }, 'SUBMITTED').ok).toBe(false);
    expect(canRespond({ status: 'OPEN', dueDate: null }, 'NOT_AWARDED').ok).toBe(false);
    expect(canRespond({ status: 'OPEN', dueDate: null }, 'SUBMITTED').ok).toBe(true);
  });

  it('κατανομή ποσού: αναλογικά, ακριβές άθροισμα σε λεπτά', () => {
    const m = distributeAmount([{ id: 'a', weight: 100 }, { id: 'b', weight: 200 }, { id: 'c', weight: 0 }], 1000);
    expect([...m.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(1000, 6);
    expect(m.get('b')).toBeCloseTo(666.67, 2);
    expect(m.get('c')).toBe(0);
    const eq = distributeAmount([{ id: 'a', weight: 0 }, { id: 'b', weight: 0 }, { id: 'c', weight: 0 }], 100);
    expect([...eq.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(100, 6);
  });

  it('tokens: τυχαία, μόνο hash στη βάση', () => {
    const a = newToken(), b = newToken();
    expect(a.token).not.toBe(b.token);
    expect(validToken(a.token)).toBe(true);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });

  it('αλυσίδα hash: επαλήθευση και εντοπισμός αλλοίωσης', () => {
    const base = { recipientId: 'r1', actor: 'link', ip: '1.2.3.4', userAgent: 'UA', sessionId: 's1' };
    const e1 = { ...base, type: 'OPEN', at: '2026-10-23T10:00:00.000Z', data: {} };
    const h1 = eventHash(null, e1);
    const e2 = { ...base, type: 'SUBMIT', at: '2026-10-23T10:05:00.000Z', data: { amount: 1500, specsSha256: 'abc' } };
    const h2 = eventHash(h1, e2);
    const chain = [{ ...e1, prevHash: null, hash: h1 }, { ...e2, prevHash: h1, hash: h2 }];
    expect(verifyChain(chain)).toEqual({ ok: true, brokenAt: null });
    // όπως έρχονται από τη βάση: με id και Date — η επαλήθευση αγνοεί τα επιπλέον πεδία
    expect(verifyChain(chain.map((e, i) => ({ ...e, id: `ev${i}`, at: new Date(e.at) })))).toEqual({ ok: true, brokenAt: null });
    // σειρά κλειδιών στα data δεν αλλάζει το hash
    expect(eventHash(h1, { ...e2, data: { specsSha256: 'abc', amount: 1500 } })).toBe(h2);
    const tampered = [chain[0], { ...chain[1], data: { amount: 900, specsSha256: 'abc' } }];
    expect(verifyChain(tampered)).toEqual({ ok: false, brokenAt: 1 });
  });

  it('προεπιλογές χωρίς το όνομα του πελάτη', () => {
    const d = rfpDefaults({ kind: 'PRODUCT_INSTALL', summary: 'Προσφορά από διαστασιολόγηση κάτοψης (x.webp).\n\nΧώροι (2):\n• Μπάνιο: 6 m²', site: { district: 'Κηφισιά', city: 'Αθήνα' } });
    expect(d.title).toBe('Εργασίες τοποθέτησης — Κηφισιά, Αθήνα');
    expect(d.scope.startsWith('Χώροι (2):')).toBe(true);
    expect(rfpDefaults({ kind: 'PRODUCT_INSTALL', summary: '', site: null }).title).toBe('Εργασίες τοποθέτησης');
  });
});
