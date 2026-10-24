// lib/floorplan/erase.ts — καθαρή λογική της «Γόμας» στην κάτοψη: τι βρίσκεται κάτω από ένα κλικ.
// Προτεραιότητα στο πιο «λεπτό»/πάνω στοιχείο: σημείωση → διάσταση → άνοιγμα → διαχωριστικό → τοίχος → χώρος.
import { pointInPolygon, type Pt } from './core';

export type EraseHit =
  | { kind: 'pin'; id: string }
  | { kind: 'dim'; id: string }
  | { kind: 'opening'; roomId: string; id: string }
  | { kind: 'divider'; index: number }
  | { kind: 'wall'; index: number }
  | { kind: 'room'; id: string };

/** Απόσταση σημείου από ευθύγραμμο τμήμα (px). */
export function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

type Input = {
  pins: Array<{ id: string; x: number; y: number }>;
  dims: Array<{ id: string; a: Pt; b: Pt }>;
  rooms: Array<{ id: string; polygon: Pt[]; openings?: Array<{ id: string; at?: [Pt, Pt] | null }> }>;
  dividers: Array<[Pt, Pt]>;
  walls: Array<{ a: Pt; b: Pt; t: number }>;
};

/** `tol` = ανοχή κλικ σε px εικόνας (ανάλογη του zoom/μεγέθους σχεδίου). Από τα πιο πρόσφατα προς τα παλιότερα. */
export function eraseHit(p: Pt, x: Input, tol: number): EraseHit | null {
  const nearest = <T,>(items: T[], d: (t: T) => number, limit: (t: T) => number) => {
    let best = -1, bd = Infinity;
    items.forEach((it, i) => { const v = d(it); if (v <= limit(it) && v <= bd) { bd = v; best = i; } });
    return best;
  };
  const pin = nearest(x.pins, (q) => Math.hypot(p.x - q.x, p.y - q.y), () => tol * 1.5);
  if (pin >= 0) return { kind: 'pin', id: x.pins[pin].id };
  const dim = nearest(x.dims, (d) => segDist(p, d.a, d.b), () => tol);
  if (dim >= 0) return { kind: 'dim', id: x.dims[dim].id };
  const ops = x.rooms.flatMap((r) => (r.openings ?? []).filter((o) => o.at).map((o) => ({ roomId: r.id, id: o.id, a: o.at![0], b: o.at![1] })));
  const op = nearest(ops, (o) => segDist(p, o.a, o.b), () => tol);
  if (op >= 0) return { kind: 'opening', roomId: ops[op].roomId, id: ops[op].id };
  const dv = nearest(x.dividers, ([a, b]) => segDist(p, a, b), () => tol);
  if (dv >= 0) return { kind: 'divider', index: dv };
  const wl = nearest(x.walls, (w) => segDist(p, w.a, w.b), (w) => Math.max(tol, w.t / 2 + tol / 2));
  if (wl >= 0) return { kind: 'wall', index: wl };
  const room = [...x.rooms].reverse().find((r) => pointInPolygon(p, r.polygon));
  return room ? { kind: 'room', id: room.id } : null;
}
