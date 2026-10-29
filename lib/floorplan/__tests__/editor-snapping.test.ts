import { describe, it, expect } from 'vitest';
import { snapPoint, applyLength } from '@/lib/floorplan/editor/snapping';
import type { WallEntity } from '@/lib/floorplan/editor/reducers';

const wall = (id: string, a: [number, number], b: [number, number]): WallEntity =>
  ({ id, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, typeId: null, source: 'drawn' });

describe('snapPoint', () => {
  const walls = [wall('w1', [0, 0], [3, 0])];

  it('snaps to a wall endpoint (highest priority)', () => {
    const s = snapPoint(walls, { x: 3.02, y: 0.01 }, { tolM: 0.1 });
    expect(s.kind).toBe('endpoint');
    expect(s.point).toEqual({ x: 3, y: 0 });
    expect(s.refId).toBe('w1');
  });

  it('snaps to a point on a segment (perpendicular foot)', () => {
    const s = snapPoint(walls, { x: 1.5, y: 0.05 }, { tolM: 0.1 });
    expect(s.kind).toBe('segment');
    expect(s.point.x).toBeCloseTo(1.5, 6);
    expect(s.point.y).toBeCloseTo(0, 6);
    expect(s.refId).toBe('w1');
  });

  it('ortho locks to the anchor axis when nothing else snaps', () => {
    const s = snapPoint([], { x: 2.9, y: 0.2 }, { tolM: 0.1, ortho: true, anchor: { x: 0, y: 0 } });
    expect(s.kind).toBe('axis');
    expect(s.point).toEqual({ x: 2.9, y: 0 });
  });

  it('snaps to the grid when enabled and nothing higher matches', () => {
    const s = snapPoint([], { x: 1.23, y: 0.07 }, { tolM: 0.1, gridM: 0.1 });
    expect(s.kind).toBe('grid');
    expect(s.point.x).toBeCloseTo(1.2, 6);
    expect(s.point.y).toBeCloseTo(0.1, 6);
  });

  it('returns the raw cursor (none) when nothing applies', () => {
    const s = snapPoint([], { x: 5, y: 5 }, { tolM: 0.1 });
    expect(s.kind).toBe('none');
    expect(s.point).toEqual({ x: 5, y: 5 });
  });

  it('excludeId skips the wall being edited', () => {
    const s = snapPoint(walls, { x: 3.0, y: 0.0 }, { tolM: 0.1, excludeId: 'w1' });
    expect(s.kind).toBe('none');
  });
});

describe('applyLength', () => {
  it('returns a point at the given distance along anchor→toward', () => {
    expect(applyLength({ x: 0, y: 0 }, { x: 1, y: 0 }, 3)).toEqual({ x: 3, y: 0 });
  });
  it('returns the anchor for a zero-length direction', () => {
    expect(applyLength({ x: 0, y: 0 }, { x: 0, y: 0 }, 3)).toEqual({ x: 0, y: 0 });
  });
  it('returns the anchor for a non-positive or NaN length', () => {
    expect(applyLength({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toEqual({ x: 0, y: 0 });
    expect(applyLength({ x: 0, y: 0 }, { x: 1, y: 0 }, Number.NaN)).toEqual({ x: 0, y: 0 });
  });
});
