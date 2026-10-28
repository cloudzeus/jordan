// Regression: κάθε v1 κάτοψη, μετά το upgrade σε v2, δίνει τα ΙΔΙΑ floorM2/wallsM2 (ανοχή 1%).
import { describe, it, expect } from 'vitest';
import { planData, roomSheet, roomTakeoffV2 } from '../saved';
import { upgradePlanData } from '../upgrade';

const within1pct = (got: number, exp: number) => {
  const tol = Math.max(1e-9, Math.abs(exp) * 0.01);
  expect(Math.abs(got - exp)).toBeLessThanOrEqual(tol);
};

// Αντιπροσωπευτικές v1 κατόψεις.
const PLANS: Record<string, unknown> = {
  'calib, τοίχοι + πόρτα': {
    v: 1, w: 1000, h: 800, calib: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, meters: 1 },
    drawnWalls: [{ a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, t: 15 }],
    rooms: [
      { id: 'a', name: 'Μπάνιο', color: '#38BDF8', polygon: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }], areaPx: 60000, perimeterPx: 1000,
        walls: { on: true, heightM: 2.4, openings: [{ id: 'd', kind: 'door', w: 0.9, h: 2.1, count: 1 }] }, material: { type: 'item', mtrl: 5, code: 'X', label: 'Πλακάκι' } },
      { id: 'b', name: 'Κουζίνα', color: '#34D399', polygon: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }], areaPx: 160000, perimeterPx: 1600,
        walls: { on: true, heightM: 2.6, openings: [{ id: 'w', kind: 'window', w: 1.2, h: 1.4, count: 2, sill: 1 }] } },
    ],
  },
  'calib, χωρίς τοίχους': {
    v: 1, w: 600, h: 600, calib: { a: { x: 0, y: 0 }, b: { x: 50, y: 0 }, meters: 1 },
    rooms: [{ id: 'r', name: 'Σαλόνι', color: '#F472B6', polygon: [{ x: 0, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 250 }, { x: 0, y: 250 }], areaPx: 62500, perimeterPx: 1000 }],
  },
  'μόνο pxPerM (κενός κάναβος): 0 m² και στα δύο': {
    v: 1, w: 800, h: 800, calib: null, pxPerM: 100,
    drawnWalls: [{ a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, t: 20 }],
    rooms: [{ id: 'x', name: 'Χώρος', color: '#38BDF8', polygon: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }], areaPx: 40000, perimeterPx: 800, walls: { on: true, heightM: 2.5, openings: [] } }],
  },
};

describe('regression: upgrade διατηρεί τα m² (±1%)', () => {
  for (const [label, raw] of Object.entries(PLANS)) {
    it(label, () => {
      const v1 = planData.parse(raw);
      const a = roomSheet(v1);
      const b = roomTakeoffV2(upgradePlanData(v1));
      within1pct(b.floorM2, a.floorM2);
      within1pct(b.wallsM2, a.wallsM2);
    });
  }
});
