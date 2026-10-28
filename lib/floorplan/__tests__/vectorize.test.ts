import { describe, it, expect } from 'vitest';
import { thinZhangSuen, distanceToBackground } from '../vectorize';

type M = Uint8Array;
const blank = (w: number, h: number): M => new Uint8Array(w * h);
const fillRect = (m: M, w: number, x0: number, y0: number, x1: number, y1: number) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * w + x] = 1;
};
const count = (m: M) => m.reduce((s, v) => s + v, 0);
/** Υπάρχει pixel με ενεργό και το από-κάτω του (κάθετο ζεύγος) → όχι 1px πάχος. */
const hasVerticalPair = (m: M, w: number, h: number) => {
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) if (m[y * w + x] && m[(y + 1) * w + x]) return true;
  return false;
};

describe('thinZhangSuen', () => {
  it('thins a solid bar to a 1px skeleton', () => {
    const w = 20, h = 5, m = blank(w, h);
    fillRect(m, w, 0, 0, 19, 4);
    const s = thinZhangSuen(m, w, h);
    expect(count(s)).toBeLessThan(count(m) / 3);
    expect(hasVerticalPair(s, w, h)).toBe(false);
    expect(count(s)).toBeGreaterThan(0);
  });

  it('leaves an already 1px line unchanged (idempotent)', () => {
    const w = 20, h = 5, m = blank(w, h);
    fillRect(m, w, 2, 2, 17, 2); // μία οριζόντια γραμμή πάχους 1
    const once = thinZhangSuen(m, w, h);
    expect([...once]).toEqual([...m]);
    expect([...thinZhangSuen(once, w, h)]).toEqual([...once]);
  });
});

describe('distanceToBackground', () => {
  it('gives the axis of a thick bar its distance to the background (Chebyshev)', () => {
    // Μπάρα πλάτους 5 (στήλες 10..14)· άξονας στήλη 12. Πλησιέστερο φόντο: στήλη 9/15 → απόσταση 3.
    const w = 25, h = 7, m = blank(w, h);
    fillRect(m, w, 10, 0, 14, 6);
    const d = distanceToBackground(m, w, h);
    expect(d[3 * w + 12]).toBe(3);   // άξονας → πάχος = 2·3 − 1 = 5 ✓
    expect(d[3 * w + 10]).toBe(1);   // άκρο της μπάρας: 1 pixel από το φόντο
  });

  it('is 1 everywhere on a 1px line', () => {
    const w = 20, h = 5, m = blank(w, h);
    fillRect(m, w, 2, 2, 17, 2);
    const d = distanceToBackground(m, w, h);
    expect(d[2 * w + 9]).toBe(1);
  });
});
