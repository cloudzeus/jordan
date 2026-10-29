import type { Pt, WallEntity } from './reducers';

export type SnapKind = 'endpoint' | 'segment' | 'axis' | 'grid' | 'none';
export type Snap = { point: Pt; kind: SnapKind; refId: string | null };
export type SnapOpts = {
  tolM: number;
  ortho?: boolean;
  anchor?: Pt | null;
  gridM?: number | null;
  excludeId?: string | null;
};

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Κάθετη προβολή του p στο τμήμα a–b (clamp 0..1). */
function foot(p: Pt, a: Pt, b: Pt): { pt: Pt; d: number } {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  const pt = { x: a.x + t * dx, y: a.y + t * dy };
  return { pt, d: dist(p, pt) };
}

/**
 * Κούμπωμα του cursor σε (κατά προτεραιότητα) άκρο τοίχου > σημείο πάνω σε τμήμα > άξονα (ortho ή
 * ευθυγράμμιση από το anchor) > κάναβο > ωμή θέση. Πρώτο κατά προτεραιότητα εντός `tolM`· ισοπαλία →
 * μικρότερη απόσταση.
 */
export function snapPoint(walls: WallEntity[], cursor: Pt, opts: SnapOpts): Snap {
  const { tolM, ortho, anchor, gridM, excludeId } = opts;

  // 1. Άκρα τοίχων
  let bestEnd: { point: Pt; d: number; refId: string } | null = null;
  for (const w of walls) {
    if (excludeId && w.id === excludeId) continue;
    for (const e of [w.a, w.b]) {
      const d = dist(cursor, e);
      if (d <= tolM && (!bestEnd || d < bestEnd.d)) bestEnd = { point: { x: e.x, y: e.y }, d, refId: w.id };
    }
  }
  if (bestEnd) return { point: bestEnd.point, kind: 'endpoint', refId: bestEnd.refId };

  // 2. Σημείο πάνω σε τμήμα
  let bestSeg: { point: Pt; d: number; refId: string } | null = null;
  for (const w of walls) {
    if (excludeId && w.id === excludeId) continue;
    const f = foot(cursor, w.a, w.b);
    if (f.d <= tolM && (!bestSeg || f.d < bestSeg.d)) bestSeg = { point: f.pt, d: f.d, refId: w.id };
  }
  if (bestSeg) return { point: bestSeg.point, kind: 'segment', refId: bestSeg.refId };

  // 3. Άξονας: ortho κλειδώνει στον κοντινότερο άξονα του anchor· αλλιώς ευθυγράμμιση εντός ανοχής.
  if (anchor) {
    const dx = Math.abs(cursor.x - anchor.x), dy = Math.abs(cursor.y - anchor.y);
    if (ortho) {
      return dx >= dy
        ? { point: { x: cursor.x, y: anchor.y }, kind: 'axis', refId: null }
        : { point: { x: anchor.x, y: cursor.y }, kind: 'axis', refId: null };
    }
    if (dy <= tolM) return { point: { x: cursor.x, y: anchor.y }, kind: 'axis', refId: null };
    if (dx <= tolM) return { point: { x: anchor.x, y: cursor.y }, kind: 'axis', refId: null };
  }

  // 4. Κάναβος
  if (gridM && gridM > 0) {
    return { point: { x: Math.round(cursor.x / gridM) * gridM, y: Math.round(cursor.y / gridM) * gridM }, kind: 'grid', refId: null };
  }

  // 5. Ωμή θέση
  return { point: { x: cursor.x, y: cursor.y }, kind: 'none', refId: null };
}

/** Σημείο σε απόσταση `lengthM` από `anchor` προς `anchor→toward`· εκφυλισμένο → `anchor`. */
export function applyLength(anchor: Pt, toward: Pt, lengthM: number): Pt {
  const dx = toward.x - anchor.x, dy = toward.y - anchor.y;
  const L = Math.hypot(dx, dy);
  if (!(lengthM > 0) || !Number.isFinite(lengthM) || L === 0) return { x: anchor.x, y: anchor.y };
  return { x: anchor.x + (dx / L) * lengthM, y: anchor.y + (dy / L) * lengthM };
}
