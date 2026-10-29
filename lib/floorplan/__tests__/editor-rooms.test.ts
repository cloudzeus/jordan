import { describe, it, expect } from 'vitest';
import { roomsFromWalls } from '@/lib/floorplan/editor/rooms';
import type { WallEntity } from '@/lib/floorplan/editor/reducers';

let seq = 0;
const w = (ax: number, ay: number, bx: number, by: number): WallEntity =>
  ({ id: `w${seq++}`, a: { x: ax, y: ay }, b: { x: bx, y: by }, typeId: null, source: 'drawn' });

// Κλειστό ορθογώνιο ως 4 τοίχοι.
const rect = (x0: number, y0: number, x1: number, y1: number): WallEntity[] => [
  w(x0, y0, x1, y0), w(x1, y0, x1, y1), w(x1, y1, x0, y1), w(x0, y1, x0, y0),
];

describe('roomsFromWalls', () => {
  it('a closed 4×4 square → one room of ~16 m²', () => {
    const rooms = roomsFromWalls(rect(0, 0, 4, 4));
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaM2).toBeCloseTo(16, 1);
    expect(rooms[0].polygon.length).toBeGreaterThanOrEqual(4);
  });

  it('two adjacent squares sharing a wall → two rooms', () => {
    const walls = [
      // εξωτερικό 8×4 ορθογώνιο
      w(0, 0, 8, 0), w(8, 0, 8, 4), w(8, 4, 0, 4), w(0, 4, 0, 0),
      // μεσαίος τοίχος x=4
      w(4, 0, 4, 4),
    ];
    const rooms = roomsFromWalls(walls);
    expect(rooms).toHaveLength(2);
    for (const r of rooms) expect(r.areaM2).toBeCloseTo(16, 1);
  });

  it('an L-shape (6 walls) → one room with positive area', () => {
    const walls = [
      w(0, 0, 6, 0), w(6, 0, 6, 2), w(6, 2, 2, 2), w(2, 2, 2, 4), w(2, 4, 0, 4), w(0, 4, 0, 0),
    ];
    const rooms = roomsFromWalls(walls);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaM2).toBeCloseTo(16, 1); // 6*2 + 2*2
  });

  it('an open contour (missing one wall) → no rooms, no crash', () => {
    const rooms = roomsFromWalls([w(0, 0, 4, 0), w(4, 0, 4, 4), w(4, 4, 0, 4)]); // λείπει η αριστερή
    expect(rooms).toHaveLength(0);
  });

  it('does not return the outer (unbounded) face as a room', () => {
    const rooms = roomsFromWalls(rect(0, 0, 10, 10));
    expect(rooms).toHaveLength(1); // μόνο το εσωτερικό, όχι το εξωτερικό
    expect(rooms[0].areaM2).toBeCloseTo(100, 0);
  });

  it('nested disjoint loops (courtyard) → outer area excludes the inner hole, no double-count', () => {
    // Εξωτερικό 10×10 + εσωτερικό 4×4 ΧΩΡΙΣ κοινό τοίχο (δύο ανεξάρτητα κλειστά περιγράμματα).
    const rooms = roomsFromWalls([...rect(0, 0, 10, 10), ...rect(3, 3, 7, 7)]);
    expect(rooms).toHaveLength(2);
    const areas = rooms.map((r) => r.areaM2).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(16, 1); // η εσωτερική αυλή/χώρος
    expect(areas[1]).toBeCloseTo(84, 1); // το δάπεδο = 100 − 16 (όχι 100)
    expect(areas[0] + areas[1]).toBeCloseTo(100, 1); // σύνολο = κτίσμα, χωρίς διπλομέτρηση
  });
});
