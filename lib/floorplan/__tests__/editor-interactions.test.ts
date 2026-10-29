import { describe, it, expect } from 'vitest';
import {
  hotkeyToWallTypeId, pickWallAt, vectorWallsToNew, clampAcceptCount, wallsForCanvas, wallsInRect, marqueeIds,
  type CanvasWall,
} from '@/lib/floorplan/editor/interactions';
import type { WallEntity } from '@/lib/floorplan/editor/reducers';
import type { EditorShellWallType } from '@/components/admin/floorplan/editor-shell';

const wt = (id: string, hotkey: string | null, thicknessM = 0.2, color = '#abc'): EditorShellWallType =>
  ({ id, code: id.toUpperCase(), name: `τ-${id}`, color, thicknessM, hotkey });

const wall = (id: string, a: [number, number], b: [number, number], typeId: string | null = null): WallEntity =>
  ({ id, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, typeId, source: 'drawn' });

describe('hotkeyToWallTypeId', () => {
  const types = [wt('a', '1'), wt('b', '2')];
  it('maps a digit to the type with that hotkey', () => {
    expect(hotkeyToWallTypeId(types, '2')).toBe('b');
  });
  it('returns null for a digit with no matching type', () => {
    expect(hotkeyToWallTypeId(types, '9')).toBeNull();
  });
  it('returns null for a non-digit key', () => {
    expect(hotkeyToWallTypeId(types, 'x')).toBeNull();
  });
});

describe('pickWallAt', () => {
  const walls = [wall('w1', [0, 0], [3, 0])];
  it('returns the wall id for a point within tolerance', () => {
    expect(pickWallAt(walls, { x: 1.5, y: 0.05 }, 0.1)).toBe('w1');
  });
  it('returns null for a point beyond tolerance', () => {
    expect(pickWallAt(walls, { x: 1.5, y: 0.5 }, 0.1)).toBeNull();
  });
  it('returns the nearest of two parallel walls', () => {
    const two = [wall('w1', [0, 0], [3, 0]), wall('w2', [0, 1], [3, 1])];
    expect(pickWallAt(two, { x: 1.5, y: 0.9 }, 0.3)).toBe('w2');
  });
});

describe('vectorWallsToNew', () => {
  const types = [wt('t', '1', 0.2)];
  it('converts px vector walls to v2 meters with type from thickness', () => {
    const out = vectorWallsToNew([{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thicknessPx: 20 }], 0.01, types);
    expect(out).toHaveLength(1);
    expect(out[0].a).toEqual({ x: 0, y: 0 });
    expect(out[0].b).toEqual({ x: 1, y: 0 });
    expect(out[0].source).toBe('auto');
    expect(out[0].typeId).toBe('t');
  });
  it('returns [] when mPerPx is not positive', () => {
    expect(vectorWallsToNew([{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thicknessPx: 20 }], 0, types)).toEqual([]);
  });
  it('assigns typeId null when there are no wall types', () => {
    const out = vectorWallsToNew([{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thicknessPx: 20 }], 0.01, []);
    expect(out[0].typeId).toBeNull();
  });
});

describe('clampAcceptCount', () => {
  it('limits incoming to what fits under the cap', () => {
    expect(clampAcceptCount(19_995, 10)).toBe(5);
  });
  it('allows all when far under the cap', () => {
    expect(clampAcceptCount(0, 3)).toBe(3);
  });
  it('never returns negative', () => {
    expect(clampAcceptCount(20_050, 10)).toBe(0);
  });
});

describe('wallsForCanvas', () => {
  it('maps a typed wall to px with type color and selection', () => {
    const types = [wt('t', '1', 0.2, '#abc')];
    const out: CanvasWall[] = wallsForCanvas([wall('w1', [0, 0], [1, 0], 't')], 0.01, ['w1'], types);
    expect(out[0].color).toBe('#abc');
    expect(out[0].thicknessPx).toBe(20);
    expect(out[0].selected).toBe(true);
    expect(out[0].a).toEqual({ x: 0, y: 0 });
    expect(out[0].b).toEqual({ x: 100, y: 0 });
  });
  it('uses neutral grey for an untyped wall', () => {
    const out = wallsForCanvas([wall('w1', [0, 0], [1, 0], null)], 0.01, [], []);
    expect(out[0].color).toBe('#94A3B8');
    expect(out[0].selected).toBe(false);
  });
});

describe('wallsInRect', () => {
  const walls = [
    wall('inside', [1, 1], [2, 2]),
    wall('crossing', [-1, 1.5], [1.5, 1.5]),
    wall('outside', [10, 10], [12, 12]),
  ];
  it('includes a wall fully inside the rect', () => {
    expect(wallsInRect(walls, { x: 0, y: 0 }, { x: 3, y: 3 })).toContain('inside');
  });
  it('includes a wall crossing a rect edge', () => {
    expect(wallsInRect(walls, { x: 0, y: 0 }, { x: 3, y: 3 })).toContain('crossing');
  });
  it('excludes a wall fully outside', () => {
    expect(wallsInRect(walls, { x: 0, y: 0 }, { x: 3, y: 3 })).not.toContain('outside');
  });
  it('normalizes corner order', () => {
    expect(wallsInRect(walls, { x: 3, y: 3 }, { x: 0, y: 0 })).toContain('inside');
  });
  it('returns [] for a zero-area rect', () => {
    expect(wallsInRect(walls, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
  });
});

describe('marqueeIds', () => {
  const walls = [wall('inside', [1, 1], [2, 2])];
  it('returns null for a click with no drag (a==b) — gesture ignored', () => {
    expect(marqueeIds(walls, { x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
  });
  it('returns the ids inside a real drag rect', () => {
    expect(marqueeIds(walls, { x: 0, y: 0 }, { x: 3, y: 3 })).toEqual(['inside']);
  });
  it('returns [] (not null) for a real drag over empty space', () => {
    expect(marqueeIds(walls, { x: 10, y: 10 }, { x: 12, y: 12 })).toEqual([]);
  });
});
