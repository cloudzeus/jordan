import { describe, it, expect } from 'vitest';
import { recognizeColumns, recognizeStairs } from '@/lib/floorplan/cad/recognize-elements';
import type { CadSegment } from '@/lib/floorplan/cad/pdf-vectors';

const seg = (ax: number, ay: number, bx: number, by: number): CadSegment =>
  ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, layer: null });

// Κλειστό ορθογώνιο ως 4 segments.
const rect = (x: number, y: number, w: number, h: number): CadSegment[] => [
  seg(x, y, x + w, y), seg(x + w, y, x + w, y + h), seg(x + w, y + h, x, y + h), seg(x, y + h, x, y),
];

describe('recognizeColumns', () => {
  it('a small closed rectangle → one column with the right center', () => {
    const cols = recognizeColumns(rect(100, 100, 30, 30), { minPx: 10, maxPx: 60 });
    expect(cols).toHaveLength(1);
    expect(cols[0].center).toEqual({ x: 115, y: 115 });
  });
  it('a large rectangle (> max) → no column', () => {
    expect(recognizeColumns(rect(0, 0, 300, 300), { minPx: 10, maxPx: 60 })).toHaveLength(0);
  });
});

describe('recognizeStairs', () => {
  it('equal-spaced parallel lines → one stair with the tread count', () => {
    const treads: CadSegment[] = [];
    for (let i = 0; i < 6; i++) treads.push(seg(0, i * 15, 100, i * 15));
    const stairs = recognizeStairs(treads, { minTreads: 4, tolPx: 2 });
    expect(stairs).toHaveLength(1);
    expect(stairs[0].treads).toBe(6);
  });
  it('unequal gaps → no stair', () => {
    const s = [seg(0, 0, 100, 0), seg(0, 15, 100, 15), seg(0, 50, 100, 50)];
    expect(recognizeStairs(s, { minTreads: 4, tolPx: 2 })).toHaveLength(0);
  });
});
