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
  it('maps v2 openings to v1 rooms even when the opening is not centered on the wall', () => {
    const editorWithOpening = planDataV2.parse({
      ...editor,
      openings: [{
        id: 'o1', wallId: 'w0', kind: 'door', t0: 0.1, t1: 0.4,
        modelId: null, sillM: 0, heightM: 2.1, swing: null,
      }],
    });
    const saved = editorSnapshot(base, editorWithOpening, [{ id: 'wall-type', thicknessM: 0.2 }]);
    expect(saved.rooms).toHaveLength(1);
    expect(saved.rooms[0].walls?.openings).toHaveLength(1);
    const o = saved.rooms[0].walls!.openings[0];
    expect(o.kind).toBe('door');
    expect(o.at).toBeDefined();
    expect(o.at!.length).toBe(2);
  });
});
