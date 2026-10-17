import { describe, expect, it } from 'vitest';
import { offerEmailHtml, offerEmailSubject, type OfferEmailData } from '../dynamic-offer-email';

const base: OfferEmailData = {
  kind: 'publish',
  company: { name: 'ATELIER ', phone: '210 6718005', email: 'info@example.gr', address: 'Λεωφ. Βουλιαγμένης 39' },
  recipientName: 'Ο&Σ <Τεχνική>',
  title: 'Travertino — Container Νοεμβρίου',
  productName: 'ΠΕΤΡΙΝΟ ΔΑΠΕΔΟ TRAVERTINO', productCode: 'TE.TRAVE', baseUnit: 'τ.μ.',
  sqmPerPallet: 52, minOrder: 0.5, closesAt: '2026-11-30T21:59:00.000Z', capacity: 20, filled: 7,
  tiers: [{ level: 1, fromPallets: 0.5, price: 42 }, { level: 2, fromPallets: 5, price: 39 }, { level: 3, fromPallets: 10, price: 36 }],
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
    const h = offerEmailHtml({ ...base, kind: 'drop', previousPrice: 42 });
    expect(h).toContain('ΠΤΩΣΗ ΤΙΜΗΣ');
    expect(h).toMatch(/από 42,00\s?€ σε <strong>39,00\s?€<\/strong>/);
  });
});

import { pallets } from '../dynamic-offer-email';
describe('pallets — ελληνική διατύπωση', () => {
  it.each([[0.5, '½ παλέτα'], [1, '1 παλέτα'], [2.5, '2½ παλέτες'], [20, '20 παλέτες']])('%s → %s', (n, s) => expect(pallets(n)).toBe(s));
});
