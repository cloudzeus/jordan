// Τοίχοι για την προβολή 3D της κάτοψης — καθαρή λογική (χωρίς three.js), ώστε να ελέγχεται με vitest.
// Κάθε πλευρά του περιγράμματος ενός χώρου γίνεται τοίχος ως το ταβάνι. Τα ανοίγματα που σχεδιάστηκαν
// πάνω στην πλευρά τον «κόβουν» (πόρτα: από το δάπεδο, παράθυρο: από την ποδιά) και η ζώνη πλακιδίων
// (0 … ύψος πλακιδίων) ξεχωρίζει από τον υπόλοιπο τοίχο.
import type { Opening } from './walls';

type P = { x: number; y: number };
/** Κομμάτι τοίχου: τμήμα a–b στο επίπεδο (pixels ανάλυσης), από z0 ως z1 (μέτρα από το δάπεδο). */
export type WallPiece = { a: P; b: P; z0: number; z1: number; tiled: boolean };

const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Θέση (0…1) ενός σημείου πάνω στο τμήμα a–b και απόσταση από αυτό. */
function along(p: P, a: P, b: P) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  const q = lerp(a, b, Math.max(0, Math.min(1, t)));
  return { t, d: Math.hypot(p.x - q.x, p.y - q.y) };
}

/**
 * Κομμάτια τοίχων ενός χώρου. `tileM` = ύψος πλακιδίων (null = χωρίς πλακάκι στους τοίχους), `ceilingM`
 * = ύψος ταβανιού. `tolPx` = πόσο μακριά από την πλευρά μπορεί να είναι ένα άνοιγμα για να ανήκει σε αυτή.
 */
export function wallPieces(poly: P[], openings: Opening[], o: { tileM: number | null; ceilingM: number; tolPx: number }): WallPiece[] {
  const out: WallPiece[] = [];
  const ceiling = Math.max(o.ceilingM, o.tileM ?? 0);
  const push = (a: P, b: P, z0: number, z1: number) => {
    if (z1 - z0 < 1e-3) return;
    const t = o.tileM;
    if (t == null || t <= z0) { out.push({ a, b, z0, z1, tiled: false }); return; }
    if (t >= z1) { out.push({ a, b, z0, z1, tiled: true }); return; }
    out.push({ a, b, z0, z1: t, tiled: true }, { a, b, z0: t, z1, tiled: false });
  };
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    // Ανοίγματα πάνω σε αυτή την πλευρά, ως διαστήματα [t0, t1].
    const cuts = openings.flatMap((op) => {
      if (!op.at) return [];
      const p0 = along(op.at[0], a, b), p1 = along(op.at[1], a, b);
      if (p0.d > o.tolPx || p1.d > o.tolPx) return [];
      const t0 = Math.max(0, Math.min(p0.t, p1.t)), t1 = Math.min(1, Math.max(p0.t, p1.t));
      return t1 > t0 ? [{ t0, t1, sill: Math.max(0, op.sill ?? 0), top: Math.max(0, op.sill ?? 0) + Math.max(0, op.h) }] : [];
    }).sort((x, y) => x.t0 - y.t0);
    let t = 0;
    for (const c of cuts) {
      if (c.t0 > t) push(lerp(a, b, t), lerp(a, b, c.t0), 0, ceiling);
      const s0 = Math.max(t, c.t0);
      if (c.t1 > s0) {
        const pa = lerp(a, b, s0), pb = lerp(a, b, c.t1);
        push(pa, pb, 0, Math.min(c.sill, ceiling));
        push(pa, pb, Math.min(c.top, ceiling), ceiling);
      }
      t = Math.max(t, c.t1);
    }
    if (t < 1) push(lerp(a, b, t), b, 0, ceiling);
  });
  return out;
}
