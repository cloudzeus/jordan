import { describe, it, expect } from 'vitest';
import { flattenPath, type RawOp, type Matrix } from '@/lib/floorplan/cad/pdf-vectors';

const I: Matrix = [1, 0, 0, 1, 0, 0];
const len = (s: { a: { x: number; y: number }; b: { x: number; y: number } }) =>
  Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

describe('flattenPath', () => {
  it('a straight line → one segment, layer null', () => {
    const ops: RawOp[] = [{ op: 'move', args: [0, 0] }, { op: 'line', args: [10, 0] }];
    const segs = flattenPath(ops, I);
    expect(segs).toHaveLength(1);
    expect(segs[0].a).toEqual({ x: 0, y: 0 });
    expect(segs[0].b).toEqual({ x: 10, y: 0 });
    expect(segs[0].layer).toBeNull();
  });

  it('a rect → four closed segments', () => {
    const segs = flattenPath([{ op: 'rect', args: [0, 0, 4, 2] }], I);
    expect(segs).toHaveLength(4);
    // περίμετρος 2*(4+2)=12
    expect(segs.reduce((s, g) => s + len(g), 0)).toBeCloseTo(12, 6);
  });

  it('transform with save/restore scopes the CTM', () => {
    const ops: RawOp[] = [
      { op: 'save', args: [] },
      { op: 'transform', args: [2, 0, 0, 2, 0, 0] },
      { op: 'move', args: [0, 0] }, { op: 'line', args: [5, 0] },
      { op: 'restore', args: [] },
      { op: 'move', args: [0, 0] }, { op: 'line', args: [1, 0] },
    ];
    const segs = flattenPath(ops, I);
    expect(segs).toHaveLength(2);
    expect(len(segs[0])).toBeCloseTo(10, 6); // scaled ×2
    expect(len(segs[1])).toBeCloseTo(1, 6);  // CTM restored
  });

  it('a cubic bezier is flattened into multiple segments following the curve', () => {
    const ops: RawOp[] = [
      { op: 'move', args: [0, 0] },
      { op: 'cubic', args: [0, 10, 10, 10, 10, 0] }, // c1,c2,end
    ];
    const segs = flattenPath(ops, I, 1);
    expect(segs.length).toBeGreaterThan(1);
    expect(segs[0].a).toEqual({ x: 0, y: 0 });
    expect(segs[segs.length - 1].b).toEqual({ x: 10, y: 0 });
  });

  it('beginLayer/endLayer tag segments with the current layer', () => {
    const ops: RawOp[] = [
      { op: 'beginLayer', args: [], layer: 'KTISMA' },
      { op: 'move', args: [0, 0] }, { op: 'line', args: [3, 0] },
      { op: 'endLayer', args: [] },
      { op: 'move', args: [0, 0] }, { op: 'line', args: [1, 0] },
    ];
    const segs = flattenPath(ops, I);
    expect(segs[0].layer).toBe('KTISMA');
    expect(segs[1].layer).toBeNull();
  });
});
