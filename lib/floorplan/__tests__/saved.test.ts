import { describe, expect, it } from 'vitest';
import { planData, roomSheet, scalePlanData } from '../saved';

const base = planData.parse({
  v: 1, w: 1000, h: 800, calib: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, meters: 1 },
  dividers: [[{ x: 10, y: 10 }, { x: 20, y: 10 }]],
  drawnWalls: [{ a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, t: 15 }],
  rooms: [
    { id: 'a', name: 'Μπάνιο', color: '#38BDF8', polygon: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }], areaPx: 60000, perimeterPx: 1000,
      walls: { on: true, heightM: 2.4, openings: [{ id: 'd', kind: 'door', w: 0.9, h: 2.1, count: 1 }] }, material: { type: 'item', mtrl: 5, code: 'X', label: 'Πλακάκι' } },
    { id: 'b', name: ' ', color: '#34D399', polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], areaPx: 5000, perimeterPx: 341.4 },
  ],
});

describe('αποθηκευμένη χαρτογράφηση', () => {
  it('φύλλο χώρων σε μέτρα με τοίχους και ανοίγματα', () => {
    const s = roomSheet(base);
    expect(s.rows[0]).toMatchObject({ name: 'Μπάνιο', floorM2: 6, perimeterM: 10, material: 'Πλακάκι', materialType: 'item' });
    // 10 m × 2,4 − 0,9 × 2,1 = 24 − 1,89
    expect(s.rows[0].walls).toMatchObject({ heightM: 2.4, netM2: 22.11, openingsM2: 1.89, openings: '1× πόρτα 0,90×2,10' });
    expect(s.rows[1]).toMatchObject({ name: 'Χώρος', walls: null, material: null });
    expect(s.floorM2).toBeCloseTo(6.5);
    expect(s.wallsM2).toBeCloseTo(22.11);
  });

  it('κλιμάκωση στη νέα ανάλυση: ίδια m² και μέτρα', () => {
    const d = scalePlanData(base, 500, 400);
    expect(d.rooms[0].polygon[1]).toEqual({ x: 100, y: 0 });
    expect(d.drawnWalls[0]).toEqual({ a: { x: 0, y: 0 }, b: { x: 250, y: 0 }, t: 7.5 });
    expect(roomSheet(d).rows[0].floorM2).toBeCloseTo(6);
    expect(roomSheet(d).rows[0].perimeterM).toBeCloseTo(10);
  });

  it('απορρίπτει άκυρα δεδομένα', () => {
    expect(planData.safeParse({ v: 2, w: 1, h: 1, calib: null, rooms: [] }).success).toBe(false);
  });
});
