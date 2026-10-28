import { describe, it, expect } from 'vitest';
import { planDataV2, planDataAny } from '../saved';

describe('planDataV2', () => {
  it('parses a minimal v2 with defaults', () => {
    const d = planDataV2.parse({ v: 2, underlay: null, rooms: [] });
    expect(d.floor.ceilingM).toBe(2.8);
    expect(d.floor.slabM).toBe(0);
    expect(d.walls).toEqual([]);
    expect(d.openings).toEqual([]);
    expect(d.dividers).toEqual([]);
  });

  it('accepts wall and opening entities', () => {
    const d = planDataV2.parse({
      v: 2, underlay: null, rooms: [],
      walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, typeId: null, source: 'drawn' }],
      openings: [{ id: 'o1', wallId: 'w1', t0: 0.2, t1: 0.4, kind: 'door', sillM: 0, heightM: 2.1 }],
    });
    expect(d.walls[0]).toMatchObject({ id: 'w1', typeId: null, source: 'drawn' });
    expect(d.openings[0]).toMatchObject({ wallId: 'w1', t0: 0.2, t1: 0.4, modelId: null });
  });
});

describe('planDataAny', () => {
  it('discriminates v1 vs v2 on the v tag', () => {
    const v1 = planDataAny.parse({ v: 1, w: 100, h: 100, calib: null, rooms: [] });
    expect(v1.v).toBe(1);
    const v2 = planDataAny.parse({ v: 2, underlay: null, rooms: [] });
    expect(v2.v).toBe(2);
  });
});
