import { describe, expect, it } from 'vitest';
import { offerEmailHtml, offerEmailSubject, type OfferEmailData } from '../dynamic-offer-email';

const base: OfferEmailData = {
  kind: 'publish',
  company: { name: 'ATELIER ', phone: '210 6718005', email: 'info@example.gr', address: 'Λεωφ. Βουλιαγμένης 39' },
  recipientName: 'Ο&Σ <Τεχνική>',
  title: 'Travertino — Container Νοεμβρίου',
  products: [{ name: 'ΠΕΤΡΙΝΟ ΔΑΠΕΔΟ TRAVERTINO', code: 'TE.TRAVE', baseUnit: 'τ.μ.', sqmPerPallet: 52, prices: [42, 39, 36] }],
  minOrder: 0.5, closesAt: '2026-11-30T21:59:00.000Z', capacity: 20, filled: 7,
  levels: [{ level: 1, fromPallets: 0.5 }, { level: 2, fromPallets: 5 }, { level: 3, fromPallets: 10 }],
  currentLevel: 2, snapshotUrl: 'https://cdn.example/offers/x.png', ctaUrl: 'mailto:info@example.gr?subject=x',
};

describe('email δυναμικής προσφοράς', () => {
  it('θέμα: προσφορά με την καλύτερη τιμή· πτώση με την τρέχουσα', () => {
    expect(offerEmailSubject(base)).toMatch(/από 36,00/);
    expect(offerEmailSubject({ ...base, kind: 'drop' })).toMatch(/τώρα 39,00/);
  });
  it('περιέχει 3D εικόνα, γέμισμα, τρέχον κλιμάκιο και πόσο λείπει', () => {
    const h = offerEmailHtml(base);
    expect(h).toContain('src="https://cdn.example/offers/x.png"');
    expect(h).toContain('35%'); // 7/20
    expect(h).toContain('ΙΣΧΥΕΙ ΤΩΡΑ');
    expect(h).toMatch(/Λείπουν <strong>3 παλέτες<\/strong>/);
  });
  it('escaping: ονόματα με & < > δεν σπάνε το HTML', () => {
    const h = offerEmailHtml(base);
    expect(h).toContain('Ο&amp;Σ &lt;Τεχνική&gt;');
    expect(h).not.toContain('<Τεχνική>');
  });
  it('πτώση τιμής: λωρίδα και πριν/μετά', () => {
    const h = offerEmailHtml({ ...base, kind: 'drop', previousLevel: 1 });
    expect(h).toContain('ΠΤΩΣΗ ΤΙΜΗΣ');
    expect(h).toMatch(/από 42,00\s?€ σε <strong>39,00\s?€<\/strong>/);
  });
});

describe('email με πολλά προϊόντα', () => {
  const multi: OfferEmailData = {
    ...base, title: 'Πέτρα & πλακάκια — Container',
    products: [base.products[0], { name: 'ΠΛΑΚΑΚΙ GRES 60x60', code: 'GR.6060', baseUnit: 'τ.μ.', sqmPerPallet: 46, prices: [22, 20, 18] }],
  };
  it('θέμα με πλήθος προϊόντων και μέγιστη πτώση', () => {
    expect(offerEmailSubject(multi)).toMatch(/2 προϊόντα, έως −18%/);
    expect(offerEmailSubject({ ...multi, kind: 'drop' })).toMatch(/Έπεσαν οι τιμές/);
  });
  it('πίνακας προϊόντων: τιμή τώρα και επόμενη για ΚΑΘΕ προϊόν, πριν/μετά στην πτώση', () => {
    const h = offerEmailHtml({ ...multi, kind: 'drop', previousLevel: 1 });
    expect(h).toContain('ΠΛΑΚΑΚΙ GRES 60x60');
    expect(h).toMatch(/20,00\s?€/); // W02 του πλακιδίου
    expect(h).toMatch(/line-through;">22,00\s?€/); // από W01
    expect(h).toContain('W03');
  });
});

import { pallets } from '../dynamic-offer-email';
describe('pallets — ελληνική διατύπωση', () => {
  it.each([[0.5, '½ παλέτα'], [1, '1 παλέτα'], [2.5, '2½ παλέτες'], [20, '20 παλέτες']])('%s → %s', (n, s) => expect(pallets(n)).toBe(s));
});
