import { describe, it, expect } from 'vitest';
import { cadWallsToNew } from '@/lib/floorplan/cad/import';
import type { CadSegment } from '@/lib/floorplan/cad/pdf-vectors';
import type { EditorShellWallType } from '@/components/admin/floorplan/editor-shell';

const seg = (ax: number, ay: number, bx: number, by: number, layer: string | null = null): CadSegment =>
  ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, layer });

const wt = (id: string, thicknessM: number): EditorShellWallType =>
  ({ id, code: id.toUpperCase(), name: id, color: '#abc', thicknessM, hotkey: null });

describe('cadWallsToNew', () => {
  const pair = [seg(0, 0, 100, 0, 'KTISMA'), seg(0, 20, 100, 20, 'KTISMA')];

  it('recognizes a wall pair and converts to v2 NewWall in meters with a type', () => {
    const out = cadWallsToNew(pair, 0.01, [wt('t', 0.2)]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('auto');
    expect(out[0].typeId).toBe('t');
    // 20px × 0.01 m/px ≈ 0.2m thickness → nearest type t
    expect(Math.hypot(out[0].b.x - out[0].a.x, out[0].b.y - out[0].a.y)).toBeCloseTo(1, 1); // 100px → 1m
  });

  it('returns [] when there is no scale', () => {
    expect(cadWallsToNew(pair, 0, [wt('t', 0.2)])).toEqual([]);
  });
});
