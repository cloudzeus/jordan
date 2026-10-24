import { describe, expect, it } from 'vitest';
import { openingArea, snapOpening, wallArea, type Opening } from '../walls';
import { wallPieces } from '../walls3d';

const door: Opening = { id: 'd', kind: 'door', w: 0.9, h: 2.1, count: 1 };
const win: Opening = { id: 'w', kind: 'window', w: 1.2, h: 1.4, sill: 1, count: 1 };

describe('openingArea με ποδιά', () => {
  it('πόρτα: από το δάπεδο, κομμένη στο ύψος πλακιδίων', () => {
    expect(openingArea(door, 2.6)).toBeCloseTo(1.89);
    expect(openingArea(door, 1.5)).toBeCloseTo(1.35);
  });
  it('παράθυρο: μόνο το κομμάτι μέσα στη ζώνη πλακιδίων', () => {
    expect(openingArea(win, 2.6)).toBeCloseTo(1.68); // 1,0 … 2,4 ολόκληρο
    expect(openingArea(win, 1.5)).toBeCloseTo(0.6); // 1,0 … 1,5
    expect(openingArea(win, 0.9)).toBe(0); // κάτω από την ποδιά
  });
  it('καθαρά m² τοίχων', () => {
    expect(wallArea(10, { heightM: 1.5, openings: [door, win] }).net).toBeCloseTo(15 - 1.35 - 0.6);
  });
});

describe('snapOpening', () => {
  const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  it('κουμπώνει στην πλησιέστερη πλευρά του πλησιέστερου χώρου', () => {
    const r = snapOpening([sq], { x: 20, y: 3 }, { x: 40, y: -2 }, 10);
    expect(r).toEqual({ room: 0, a: { x: 20, y: 0 }, b: { x: 40, y: 0 } });
  });
  it('null όταν είναι μακριά από κάθε τοίχο', () => {
    expect(snapOpening([sq], { x: 40, y: 40 }, { x: 60, y: 40 }, 5)).toBeNull();
  });
});

describe('wallPieces', () => {
  const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  it('χωρίς ανοίγματα: 4 τοίχοι, χωρισμένοι στη ζώνη πλακιδίων', () => {
    const p = wallPieces(sq, [], { tileM: 1.5, ceilingM: 2.8, tolPx: 2 });
    expect(p).toHaveLength(8);
    expect(p.filter((x) => x.tiled).every((x) => x.z0 === 0 && x.z1 === 1.5)).toBe(true);
  });
  it('πόρτα κόβει τον τοίχο ως το ύψος της, παράθυρο αφήνει ποδιά και πρέκι', () => {
    const d: Opening = { ...door, at: [{ x: 20, y: 0 }, { x: 40, y: 0 }] };
    const w: Opening = { ...win, at: [{ x: 100, y: 30 }, { x: 100, y: 60 }] };
    const p = wallPieces(sq, [d, w], { tileM: null, ceilingM: 2.8, tolPx: 2 });
    const top = p.filter((x) => x.a.y === 0 && x.b.y === 0);
    // πριν, πρέκι πόρτας (2,1 … 2,8), μετά
    expect(top.map((x) => [x.a.x, x.b.x, x.z0, x.z1])).toEqual([[0, 20, 0, 2.8], [20, 40, 2.1, 2.8], [40, 100, 0, 2.8]]);
    const right = p.filter((x) => x.a.x === 100 && x.b.x === 100);
    expect(right.map((x) => [x.z0, x.z1])).toEqual([[0, 2.8], [0, 1], [2.4, 2.8], [0, 2.8]]);
  });
});
