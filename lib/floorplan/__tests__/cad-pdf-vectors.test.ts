import { describe, it, expect } from 'vitest';
import { flattenPath, pdfOpsToRaw, type RawOp, type Matrix } from '@/lib/floorplan/cad/pdf-vectors';

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

  // Μορφή pdfjs 6.4: constructPath args = [paintFn, [Float32Array], minMax]· το buffer είναι flat με
  // DrawOPS opcodes (move=0, line=1, curve=2, quad=3, close=4) + coords.
  describe('pdfOpsToRaw (pdfjs 6.4 shape)', () => {
    const OPS = { constructPath: 91, save: 10, restore: 11, transform: 12, beginMarkedContentProps: 83, beginMarkedContent: 82, endMarkedContent: 84 };
    const D = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };

    it('walks the flat DrawOPS buffer: move/line/close', () => {
      const buf = Float32Array.from([D.moveTo, 0, 0, D.lineTo, 10, 0, D.closePath]);
      const raw = pdfOpsToRaw([OPS.constructPath], [[0, [buf], null]], OPS, () => null);
      expect(raw.map((r) => r.op)).toEqual(['move', 'line', 'line']); // close → line back to start
      expect(raw[0].args).toEqual([0, 0]);
      expect(raw[1].args).toEqual([10, 0]);
      expect(raw[2].args).toEqual([0, 0]);
    });

    it('converts a quadratic to a cubic using the running point', () => {
      const buf = Float32Array.from([D.moveTo, 0, 0, D.quadraticCurveTo, 0, 10, 10, 10]);
      const raw = pdfOpsToRaw([OPS.constructPath], [[0, [buf], null]], OPS, () => null);
      expect(raw[0].op).toBe('move');
      expect(raw[1].op).toBe('cubic');
      expect(raw[1].args).toHaveLength(6);
      expect(raw[1].args.slice(4)).toEqual([10, 10]); // ends at the quad endpoint
    });

    it('maps save/restore/transform and OCG marked content', () => {
      const raw = pdfOpsToRaw(
        [OPS.save, OPS.transform, OPS.beginMarkedContentProps, OPS.endMarkedContent, OPS.restore],
        [null, [2, 0, 0, 2, 0, 0], ['OC', { id: 'g1' }], null, null],
        OPS, (a) => ((a as unknown[])[0] === 'OC' ? 'KTISMA' : null),
      );
      expect(raw.map((r) => r.op)).toEqual(['save', 'transform', 'beginLayer', 'endLayer', 'restore']);
      expect(raw[1].args).toEqual([2, 0, 0, 2, 0, 0]);
      expect(raw[2].layer).toBe('KTISMA');
    });

    it('skips an empty path buffer ([null]) without throwing', () => {
      expect(() => pdfOpsToRaw([OPS.constructPath], [[0, [null], null]], OPS, () => null)).not.toThrow();
    });
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
