import { describe, expect, it } from 'vitest';
import { openingArea, parseMeters, wallArea, type Opening } from '../walls';

const door: Opening = { id: 'd', kind: 'door', w: 0.9, h: 2.1, count: 1 };
const win: Opening = { id: 'w', kind: 'window', w: 1.2, h: 1.4, count: 2 };

describe('πλακάκι στους τοίχους', () => {
  it('περίμετρος × ύψος − ανοίγματα', () => {
    const c = wallArea(14, { heightM: 2.6, openings: [door, win] });
    expect(c.gross).toBeCloseTo(36.4);
    expect(c.openings).toBeCloseTo(0.9 * 2.1 + 1.2 * 1.4 * 2);
    expect(c.net).toBeCloseTo(36.4 - 1.89 - 3.36);
  });

  it('το άνοιγμα μετρά μόνο μέσα στη ζώνη πλακιδίων', () => {
    // Μπάνιο με πλακάκι έως 1,20 m: η πόρτα αφαιρεί 0,90 × 1,20, όχι × 2,10.
    expect(openingArea(door, 1.2)).toBeCloseTo(1.08);
  });

  it('ποτέ αρνητικό· άκυρες τιμές μετρούν 0', () => {
    expect(wallArea(2, { heightM: 1, openings: [{ ...door, count: 5 }] }).net).toBe(0);
    expect(wallArea(NaN, { heightM: 2.6, openings: [] }).net).toBe(0);
    expect(wallArea(10, { heightM: 2.5, openings: [{ ...door, w: NaN }] }).net).toBe(25);
  });

  it('ελληνικοί δεκαδικοί', () => {
    expect(parseMeters('2,60')).toBe(2.6);
    expect(parseMeters(' 3 ')).toBe(3);
    expect(Number.isNaN(parseMeters(''))).toBe(true);
  });
});
