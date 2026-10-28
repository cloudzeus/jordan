import { describe, it, expect } from 'vitest';
import { thinZhangSuen, distanceToBackground, tracePolylines, simplifyOpen, pruneShort, mergeCollinear, snapAxisAligned, snapNodes, vectorizeWalls, type Seg, type VectorWall } from '../vectorize';
import type { Pt } from '../core';

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

const has = (poly: Pt[], x: number, y: number) => poly.some((p) => p.x === x && p.y === y);
const ends = (poly: Pt[]) => [poly[0], poly[poly.length - 1]];

describe('tracePolylines', () => {
  it('traces an L-shape as a single polyline through the corner', () => {
    const w = 12, h = 10, m = blank(w, h);
    fillRect(m, w, 2, 2, 8, 2); // οριζόντια
    fillRect(m, w, 8, 2, 8, 6); // κάθετη, κοινή γωνία (8,2)
    const polys = tracePolylines(m, w, h);
    expect(polys).toHaveLength(1);
    expect(has(polys[0], 8, 2)).toBe(true);
    const e = ends(polys[0]);
    const set = new Set(e.map((p) => `${p.x},${p.y}`));
    expect(set).toEqual(new Set(['2,2', '8,6']));
  });

  it('splits a plus/cross into four polylines meeting at the junction', () => {
    const w = 11, h = 11, m = blank(w, h);
    fillRect(m, w, 2, 5, 8, 5); // οριζόντιος βραχίονας
    fillRect(m, w, 5, 2, 5, 8); // κάθετος βραχίονας
    const polys = tracePolylines(m, w, h);
    expect(polys).toHaveLength(4);
    for (const p of polys) expect(has(p, 5, 5)).toBe(true);
  });

  it('traces two disconnected bars as two polylines', () => {
    const w = 30, h = 6, m = blank(w, h);
    fillRect(m, w, 2, 2, 10, 2);
    fillRect(m, w, 18, 2, 27, 2);
    expect(tracePolylines(m, w, h)).toHaveLength(2);
  });
});

describe('simplifyOpen', () => {
  it('collapses a near-straight polyline to its endpoints', () => {
    const pts: Pt[] = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0 }));
    expect(simplifyOpen(pts, 1)).toEqual([{ x: 0, y: 0 }, { x: 9, y: 0 }]);
  });
  it('keeps a corner that deviates more than eps', () => {
    const pts: Pt[] = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }];
    const s = simplifyOpen(pts, 1);
    expect(s).toHaveLength(3);
    expect(s[1]).toEqual({ x: 5, y: 0 });
  });
});

describe('pruneShort', () => {
  it('drops polylines shorter than minLenPx, keeps longer', () => {
    const short: Pt[] = [{ x: 0, y: 0 }, { x: 2, y: 0 }];
    const long: Pt[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }];
    const out = pruneShort([short, long], 8);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(long);
  });
});

describe('mergeCollinear', () => {
  it('joins two collinear segments across a small gap', () => {
    const segs: Seg[] = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, { a: { x: 13, y: 0 }, b: { x: 20, y: 0 } }];
    const out = mergeCollinear(segs, { maxAngleDeg: 3, maxGapPx: 5 });
    expect(out).toHaveLength(1);
    const xs = [out[0].a.x, out[0].b.x].sort((p, q) => p - q);
    expect(xs).toEqual([0, 20]);
  });
  it('does not join perpendicular segments', () => {
    const segs: Seg[] = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, { a: { x: 10, y: 0 }, b: { x: 10, y: 10 } }];
    expect(mergeCollinear(segs, { maxAngleDeg: 3, maxGapPx: 5 })).toHaveLength(2);
  });
});

describe('snapAxisAligned', () => {
  it('straightens a near-horizontal segment', () => {
    const s = snapAxisAligned({ a: { x: 0, y: 0 }, b: { x: 10, y: 0.2 } }, 2);
    expect(s.a.y).toBe(s.b.y);
  });
  it('leaves a clear diagonal untouched', () => {
    const seg: Seg = { a: { x: 0, y: 0 }, b: { x: 10, y: 5.77 } }; // ~30°
    expect(snapAxisAligned(seg, 2)).toEqual(seg);
  });
});

describe('snapNodes', () => {
  it('welds nearby endpoints to a shared node', () => {
    const segs: Seg[] = [{ a: { x: 0, y: 0 }, b: { x: 100, y: 100 } }, { a: { x: 102, y: 101 }, b: { x: 200, y: 200 } }];
    const out = snapNodes(segs, 4);
    expect(out[0].b).toEqual(out[1].a);
  });
  it('leaves endpoints farther than tol apart', () => {
    const segs: Seg[] = [{ a: { x: 0, y: 0 }, b: { x: 100, y: 100 } }, { a: { x: 102, y: 101 }, b: { x: 200, y: 200 } }];
    const out = snapNodes(segs, 1);
    expect(out[0].b).toEqual({ x: 100, y: 100 });
    expect(out[1].a).toEqual({ x: 102, y: 101 });
  });
});

describe('vectorizeWalls', () => {
  // Δωμάτιο: ορθογώνιος δακτύλιος από 4 μπάρες πάχους 6.
  const roomMask = (extraSpur = false) => {
    const w = 90, h = 70, m = blank(w, h);
    fillRect(m, w, 12, 12, 76, 17); // πάνω
    fillRect(m, w, 12, 52, 76, 57); // κάτω
    fillRect(m, w, 12, 12, 17, 57); // αριστερά
    fillRect(m, w, 71, 12, 76, 57); // δεξιά
    if (extraSpur) fillRect(m, w, 77, 13, 80, 15); // μικρό spur
    return { m, w, h };
  };
  const nodeKey = (p: Pt) => `${Math.round(p.x)},${Math.round(p.y)}`;

  it('returns four walls with measured thickness and closed corners', () => {
    const { m, w, h } = roomMask();
    const walls = vectorizeWalls(m, w, h);
    expect(walls).toHaveLength(4);
    for (const wl of walls) {
      expect(wl.thicknessPx).toBeGreaterThanOrEqual(4);
      expect(wl.thicknessPx).toBeLessThanOrEqual(8);
    }
    // 4 μοναδικοί κόμβοι, ο καθένας μοιρασμένος από 2 τοίχους (κλειστό περίγραμμα).
    const nodes = new Set(walls.flatMap((wl) => [nodeKey(wl.a), nodeKey(wl.b)]));
    expect(nodes.size).toBe(4);
  });

  it('prunes a short spur (still four walls)', () => {
    const { m, w, h } = roomMask(true);
    expect(vectorizeWalls(m, w, h)).toHaveLength(4);
  });
});
