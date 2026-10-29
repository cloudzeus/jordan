import { describe, it, expect } from 'vitest';
import { layerRole, segmentsByRole, recognizeWalls } from '@/lib/floorplan/cad/recognize-walls';
import type { CadSegment } from '@/lib/floorplan/cad/pdf-vectors';

const seg = (ax: number, ay: number, bx: number, by: number, layer: string | null = null): CadSegment =>
  ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, layer });

describe('layerRole', () => {
  it('maps CAD layer names to roles', () => {
    expect(layerRole('KTISMA')).toBe('wall');
    expect(layerRole('DOK')).toBe('beam');
    expect(layerRole('DOOR')).toBe('door');
    expect(layerRole('5')).toBe('ignore');
    expect(layerRole('exterior walls')).toBe('wall');
  });
});

describe('segmentsByRole', () => {
  it('groups segments by their layer role', () => {
    const segs = [seg(0, 0, 3, 0, 'KTISMA'), seg(0, 0, 1, 0, '5')];
    const by = segmentsByRole(segs, (l) => layerRole(l ?? ''));
    expect(by.wall).toHaveLength(1);
    expect(by.ignore).toHaveLength(1);
  });
});

const opts = { minThicknessPx: 10, maxThicknessPx: 40 };

describe('recognizeWalls', () => {
  it('two parallel segments a wall-thickness apart → one wall centerline', () => {
    const walls = recognizeWalls([seg(0, 0, 100, 0), seg(0, 20, 100, 20)], opts);
    expect(walls).toHaveLength(1);
    expect(walls[0].thicknessPx).toBeCloseTo(20, 0);
    expect((walls[0].a.y + walls[0].b.y) / 2).toBeCloseTo(10, 0); // centerline
  });

  it('parallels too far apart (> max) → no wall', () => {
    expect(recognizeWalls([seg(0, 0, 100, 0), seg(0, 200, 100, 200)], opts)).toHaveLength(0);
  });

  it('non-parallel segments → no wall', () => {
    expect(recognizeWalls([seg(0, 0, 100, 0), seg(0, 20, 100, 60)], opts)).toHaveLength(0);
  });

  it('parallels with no overlap along length → no wall', () => {
    expect(recognizeWalls([seg(0, 0, 40, 0), seg(60, 20, 100, 20)], opts)).toHaveLength(0);
  });

  it('an L of two wall pairs → 2 walls sharing a welded node', () => {
    const walls = recognizeWalls([
      seg(0, 0, 100, 0), seg(0, 20, 100, 20),      // horizontal wall
      seg(90, 0, 90, 120), seg(110, 0, 110, 120),  // vertical wall
    ], opts);
    expect(walls.length).toBe(2);
  });
});
