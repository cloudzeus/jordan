import { describe, expect, it } from 'vitest';
import { eraseHit, segDist } from '../erase';

const room = { id: 'r1', polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], openings: [{ id: 'o1', at: [{ x: 30, y: 0 }, { x: 60, y: 0 }] as [{ x: number; y: number }, { x: number; y: number }] }] };
const base = {
  pins: [{ id: 'p1', x: 50, y: 50 }],
  dims: [{ id: 'd1', a: { x: 10, y: 80 }, b: { x: 90, y: 80 } }],
  rooms: [room],
  dividers: [[{ x: 100, y: 20 }, { x: 100, y: 80 }]] as Array<[{ x: number; y: number }, { x: number; y: number }]>,
  walls: [{ a: { x: 0, y: 120 }, b: { x: 100, y: 120 }, t: 10 }],
};

describe('γόμα κάτοψης', () => {
  it('απόσταση από τμήμα', () => {
    expect(segDist({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(segDist({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it('προτεραιότητα: σημείωση → διάσταση → άνοιγμα → διαχωριστικό → τοίχος → χώρος', () => {
    expect(eraseHit({ x: 51, y: 51 }, base, 3)).toEqual({ kind: 'pin', id: 'p1' });
    expect(eraseHit({ x: 40, y: 81 }, base, 3)).toEqual({ kind: 'dim', id: 'd1' });
    expect(eraseHit({ x: 45, y: 1 }, base, 3)).toEqual({ kind: 'opening', roomId: 'r1', id: 'o1' });
    expect(eraseHit({ x: 101, y: 50 }, base, 3)).toEqual({ kind: 'divider', index: 0 });
    expect(eraseHit({ x: 50, y: 124 }, base, 3)).toEqual({ kind: 'wall', index: 0 }); // μέσα στο πάχος
    expect(eraseHit({ x: 20, y: 40 }, base, 3)).toEqual({ kind: 'room', id: 'r1' });
    expect(eraseHit({ x: 300, y: 300 }, base, 3)).toBeNull();
  });
});
