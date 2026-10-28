import { describe, it, expect } from 'vitest';
import { planData, roomTakeoffV2 } from '../saved';
import { upgradePlanData } from '../upgrade';

// Ίδιο δείγμα με το saved.test.ts: 100 px = 1 m (mpp 0.01).
const base = planData.parse({
  v: 1, w: 1000, h: 800, calib: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, meters: 1 },
  drawnWalls: [{ a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, t: 15 }],
  rooms: [
    { id: 'a', name: 'Μπάνιο', color: '#38BDF8', polygon: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }], areaPx: 60000, perimeterPx: 1000,
      walls: { on: true, heightM: 2.4, openings: [{ id: 'd', kind: 'door', w: 0.9, h: 2.1, count: 1 }] }, material: { type: 'item', mtrl: 5, code: 'X', label: 'Πλακάκι' } },
    { id: 'b', name: ' ', color: '#34D399', polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], areaPx: 5000, perimeterPx: 341.4 },
  ],
});
const TYPES = [{ id: 'gb', thicknessM: 0.15, active: true }, { id: 'rc', thicknessM: 0.25, active: true }];

describe('upgradePlanData', () => {
  it('converts v1 to meters preserving floor and wall m² within tolerance', () => {
    const v2 = upgradePlanData(base, { wallTypes: TYPES });
    expect(v2.v).toBe(2);
    const t = roomTakeoffV2(v2);
    expect(t.floorM2).toBeCloseTo(6.5, 2);
    expect(t.wallsM2).toBeCloseTo(22.11, 2);
  });

  it('turns drawnWalls into metric wall entities with the nearest type', () => {
    const v2 = upgradePlanData(base, { wallTypes: TYPES });
    expect(v2.walls).toHaveLength(1);
    expect(v2.walls[0]).toMatchObject({ typeId: 'gb', source: 'drawn' });
    expect(v2.walls[0].a).toEqual({ x: 0, y: 0 });
    expect(v2.walls[0].b).toEqual({ x: 5, y: 0 });
  });

  it('is idempotent on an already-v2 value', () => {
    const v2 = upgradePlanData(base, { wallTypes: TYPES });
    expect(upgradePlanData(v2)).toEqual(v2);
  });

  it('a plan with no scale yields mPerPx null and zero m², no NaN', () => {
    const v2 = upgradePlanData({ ...base, calib: null, pxPerM: null });
    expect(v2.underlay?.mPerPx).toBeNull();
    const t = roomTakeoffV2(v2);
    expect(t.floorM2).toBe(0);
    expect(Number.isNaN(t.wallsM2)).toBe(false);
  });

  it('a drawnWall with no matching types gets typeId null', () => {
    const v2 = upgradePlanData(base, { wallTypes: [] });
    expect(v2.walls[0].typeId).toBeNull();
  });

  it('projects an opening on a wall to wallId+t0/t1, and drops one far from any wall', () => {
    const withOpenings = planData.parse({
      ...base,
      rooms: [{
        ...base.rooms[0],
        walls: { on: true, heightM: 2.4, openings: [
          { id: 'near', kind: 'door', w: 0.9, h: 2.1, count: 1, at: [{ x: 100, y: 0 }, { x: 200, y: 0 }] },
          { id: 'far', kind: 'window', w: 1, h: 1, count: 1, at: [{ x: 100, y: 500 }, { x: 200, y: 500 }] },
        ] },
      }, base.rooms[1]],
    });
    const v2 = upgradePlanData(withOpenings, { wallTypes: TYPES });
    expect(v2.openings).toHaveLength(1);
    expect(v2.openings[0]).toMatchObject({ wallId: v2.walls[0].id, kind: 'door' });
    expect(v2.openings[0].t0).toBeCloseTo(0.2, 3);
    expect(v2.openings[0].t1).toBeCloseTo(0.4, 3);
  });
});
