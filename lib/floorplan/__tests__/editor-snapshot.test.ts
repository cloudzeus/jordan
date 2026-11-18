import { describe, expect, it } from 'vitest';
import { editorSnapshot } from '../editor/snapshot';
import { planData, planDataV2, roomSheet, scalePlanData } from '../saved';

describe('saved vector editor measurements', () => {
  const base = planData.parse({ v: 1, w: 1000, h: 1000, calib: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, meters: 1 }, rooms: [] });
  const points = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
  const editor = planDataV2.parse({ v: 2, underlay: null, rooms: [], walls: points.map((a, i) => ({ id: `w${i}`, a, b: points[(i + 1) % 4], typeId: 'wall-type', source: 'drawn' })) });
  it('persists vector walls and a compatible measured room', () => {
    const saved = planData.parse(editorSnapshot(base, editor, [{ id: 'wall-type', thicknessM: 0.2 }]));
    expect(saved.editorV2?.walls).toEqual(editor.walls);
    expect(saved.drawnWalls[0].t).toBe(20);
    expect(saved.rooms).toHaveLength(1);
    expect(roomSheet(saved).floorM2).toBeCloseTo(12);
  });
  it('keeps measurements and vector coordinates when the image resolution changes', () => {
    const saved = editorSnapshot(base, editor, []);
    const scaled = scalePlanData(saved, 2000, 2000);
    expect(roomSheet(scaled).floorM2).toBeCloseTo(12);
    expect(scaled.editorV2?.walls).toEqual(editor.walls);
  });
  it('allows an uncalibrated draft without fabricated measurements', () => {
    const draft = { ...base, calib: null };
    expect(editorSnapshot(draft, editor, [])).toEqual(draft);
    expect(roomSheet(draft).floorM2).toBe(0);
  });
});
