// Από μάσκα τοίχων (Mask w×h, 1 = τοίχος) σε διανυσματικούς τοίχους — καθαρές συναρτήσεις (χωρίς DOM),
// ελέγχονται με vitest. Αγωγός: λέπτυνση → χάρτης απόστασης (πάχος) → ιχνηλάτηση σκελετού → απλοποίηση
// → συγχώνευση/ίσιωμα → κούμπωμα κόμβων. Έξοδος σε pixels· η px→m και η πρόταση τύπου μένουν στον caller.
import type { Mask, Pt } from './core';

const NB8: ReadonlyArray<readonly [number, number]> = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/**
 * Λέπτυνση Zhang–Suen: ο σκελετός ενός σχήματος σε πάχος 1px, διατηρώντας συνδεσιμότητα και άκρα.
 * Δύο υπο-περάσματα ανά επανάληψη· σταματά όταν κανένα pixel δεν σβήνεται.
 */
export function thinZhangSuen(mask: Mask, w: number, h: number): Mask {
  const m = mask.slice();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
  let changed = true;
  const toClear: number[] = [];
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      toClear.length = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!m[y * w + x]) continue;
          // Γείτονες P2..P9 (ρολόι από πάνω).
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1),
            p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
          const bp = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (bp < 2 || bp > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let ap = 0;
          for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) ap++;
          if (ap !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          toClear.push(y * w + x);
        }
      }
      if (toClear.length) { changed = true; for (const i of toClear) m[i] = 0; }
    }
  }
  return m;
}

/**
 * Απόσταση Chebyshev κάθε ενεργού pixel προς το πλησιέστερο φόντο (two-pass chamfer). Τα pixels εκτός
 * εικόνας μετρούν ως φόντο. Σε ένα pixel του σκελετού, το πάχος του τοίχου ≈ 2·d − 1.
 */
export function distanceToBackground(mask: Mask, w: number, h: number): Int32Array {
  const d = new Int32Array(w * h);
  const BIG = w + h;
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? BIG : 0;
  const idx = (x: number, y: number) => y * w + x;
  const bg = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : null);
  // Forward: πάνω-αριστερά γείτονες (συμπ. διαγώνιων) + 1.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[idx(x, y)]) continue;
      let best = d[idx(x, y)];
      for (const [dx, dy] of [[-1, 0], [0, -1], [-1, -1], [1, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        const v = bg(nx, ny) === 0 ? 0 : d[idx(nx, ny)];
        if (v + 1 < best) best = v + 1;
      }
      d[idx(x, y)] = best;
    }
  }
  // Backward: κάτω-δεξιά γείτονες.
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      if (!mask[idx(x, y)]) continue;
      let best = d[idx(x, y)];
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]] as const) {
        const nx = x + dx, ny = y + dy;
        const v = bg(nx, ny) === 0 ? 0 : d[idx(nx, ny)];
        if (v + 1 < best) best = v + 1;
      }
      d[idx(x, y)] = best;
    }
  }
  return d;
}

/**
 * Ιχνηλάτηση σκελετού (1px) σε πολυγραμμές: σπάει στα άκρα (βαθμός 1) και στους κόμβους (βαθμός ≥3)·
 * τα pixels βαθμού 2 είναι ενδιάμεσα. Κλειστοί βρόχοι (όλα βαθμού 2) βγαίνουν ως μία κλειστή πολυγραμμή.
 */
export function tracePolylines(skel: Mask, w: number, h: number): Pt[][] {
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && skel[y * w + x] === 1;
  // «Αποτελεσματικοί» γείτονες: μια διαγώνια ακμή αγνοείται όταν γεφυρώνεται από ορθογώνιο κελί
  // (σκαλοπάτι σε ορθή γωνία), αλλιώς το pixel πριν τη γωνία θα φαινόταν κόμβος (βαθμός 3).
  const nbrs = (x: number, y: number): Pt[] => {
    const out: Pt[] = [];
    for (const [dx, dy] of NB8) {
      if (!on(x + dx, y + dy)) continue;
      if (dx !== 0 && dy !== 0 && (on(x + dx, y) || on(x, y + dy))) continue; // γεφυρωμένη διαγώνιος
      out.push({ x: x + dx, y: y + dy });
    }
    return out;
  };
  const key = (a: Pt, b: Pt) => (a.y * w + a.x < b.y * w + b.x ? `${a.x},${a.y}|${b.x},${b.y}` : `${b.x},${b.y}|${a.x},${a.y}`);
  const usedEdge = new Set<string>();
  const polys: Pt[][] = [];

  const walk = (start: Pt, first: Pt) => {
    const path: Pt[] = [start];
    let prev = start, cur = first;
    usedEdge.add(key(prev, cur));
    for (;;) {
      path.push(cur);
      if (nbrs(cur.x, cur.y).length !== 2) break; // κόμβος ή άκρο
      const next = nbrs(cur.x, cur.y).find((n) => !(n.x === prev.x && n.y === prev.y));
      if (!next || usedEdge.has(key(cur, next))) break;
      usedEdge.add(key(cur, next));
      prev = cur; cur = next;
    }
    return path;
  };

  // 1) Από κάθε κόμβο/άκρο (βαθμός ≠ 2) προς κάθε αχρησιμοποίητη ακμή.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      const ns = nbrs(x, y);
      if (ns.length === 2) continue;
      const node = { x, y };
      for (const n of ns) {
        if (usedEdge.has(key(node, n))) continue;
        polys.push(walk(node, n));
      }
    }
  }
  // 2) Κλειστοί βρόχοι: αχρησιμοποίητα pixels βαθμού 2.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      const ns = nbrs(x, y);
      if (ns.length !== 2) continue;
      const fresh = ns.find((n) => !usedEdge.has(key({ x, y }, n)));
      if (!fresh) continue;
      const path = walk({ x, y }, fresh);
      path.push({ x, y }); // κλείσιμο
      polys.push(path);
    }
  }
  return polys;
}

/** Απόσταση σημείου p από το ευθύγραμμο τμήμα a–b. */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Douglas–Peucker για ΑΝΟΙΧΤΗ πολυγραμμή: κρατά τα άκρα και τα σημεία που αποκλίνουν > eps. */
export function simplifyOpen(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const a = pts[0], b = pts[pts.length - 1];
  let idx = -1, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], a, b);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...simplifyOpen(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplifyOpen(pts.slice(idx), eps)];
}

/** Μήκος μιας πολυγραμμής (άθροισμα τμημάτων). */
export function polylineLength(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

/** Πετά πολυγραμμές κοντύτερες από minLenPx (spurs/θόρυβος). */
export function pruneShort(polylines: Pt[][], minLenPx: number): Pt[][] {
  return polylines.filter((p) => polylineLength(p) >= minLenPx);
}

export type Seg = { a: Pt; b: Pt };

const angleOf = (s: Seg) => Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
/** Γωνία (μοίρες) ανάμεσα σε δύο κατευθύνσεις τμημάτων, αγνοώντας φορά (0..90). */
function dirDiffDeg(a: number, b: number): number {
  const d = (Math.abs(a - b) * 180) / Math.PI % 180;
  return Math.min(d, 180 - d);
}

/** Ίσιωμα τμήματος σε 0°/90° όταν η απόκλιση < maxDeg· αλλιώς αμετάβλητο (διατηρεί διαγώνιους). */
export function snapAxisAligned(seg: Seg, maxDeg: number): Seg {
  const ang = (Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180) / Math.PI;
  const devH = Math.min(Math.abs(ang), Math.abs(Math.abs(ang) - 180));
  const devV = Math.abs(Math.abs(ang) - 90);
  if (devH <= maxDeg) { const y = (seg.a.y + seg.b.y) / 2; return { a: { x: seg.a.x, y }, b: { x: seg.b.x, y } }; }
  if (devV <= maxDeg) { const x = (seg.a.x + seg.b.x) / 2; return { a: { x, y: seg.a.y }, b: { x, y: seg.b.y } }; }
  return seg;
}

/** Συγχώνευση σχεδόν-συνευθειακών τμημάτων (γωνία < maxAngleDeg) με κενό άκρων < maxGapPx. */
export function mergeCollinear(segs: Seg[], o: { maxAngleDeg: number; maxGapPx: number }): Seg[] {
  const out: Seg[] = segs.map((s) => ({ a: { ...s.a }, b: { ...s.b } }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const A = out[i], B = out[j];
        if (dirDiffDeg(angleOf(A), angleOf(B)) > o.maxAngleDeg) continue;
        const pairs: [Pt, Pt][] = [[A.a, B.a], [A.a, B.b], [A.b, B.a], [A.b, B.b]];
        let best: { d: number; p: Pt; q: Pt } | null = null;
        for (const [p, q] of pairs) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (!best || d < best.d) best = { d, p, q }; }
        if (!best || best.d > o.maxGapPx) continue;
        // Το ενωμένο τμήμα = το ΠΙΟ ΑΠΟΜΑΚΡΥΣΜΕΝΟ ζεύγος από τα 4 άκρα (όχι το συμπλήρωμα του κοντινού
        // ζεύγους) — αλλιώς σε επικάλυψη/εγκλεισμό θα «κόβαμε» μέρος του τοίχου.
        const all = [A.a, A.b, B.a, B.b];
        let fa = all[0], fb = all[1], fd = -1;
        for (let x = 0; x < 4; x++) for (let y = x + 1; y < 4; y++) {
          const d = Math.hypot(all[x].x - all[y].x, all[x].y - all[y].y);
          if (d > fd) { fd = d; fa = all[x]; fb = all[y]; }
        }
        const m: Seg = { a: fa, b: fb };
        if (dirDiffDeg(angleOf(m), angleOf(A)) > o.maxAngleDeg) continue;
        out.splice(j, 1); out.splice(i, 1); out.push(m);
        merged = true; break;
      }
    }
  }
  return out;
}

/**
 * Κούμπωμα κόμβων: άκρα τμημάτων σε απόσταση ≤ tolPx συγχωνεύονται σε κοινό σημείο (μέσος όρος).
 * Single-linkage (union-find) ώστε και διάσπαρτος κόμβος (π.χ. T σε χοντρό τοίχο) να κλείνει σωστά,
 * με κάθε μοναδικό άκρο να μετρά μία φορά (κοινές αναφορές Pt δεν διπλομετρώνται).
 */
export function snapNodes(segs: Seg[], tolPx: number): Seg[] {
  const uniq: Pt[] = [];
  const seen = new Set<Pt>();
  for (const s of segs) for (const p of [s.a, s.b]) if (!seen.has(p)) { seen.add(p); uniq.push(p); }
  const parent = uniq.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) {
    if (Math.hypot(uniq[i].x - uniq[j].x, uniq[i].y - uniq[j].y) <= tolPx) { const a = find(i), b = find(j); if (a !== b) parent[a] = b; }
  }
  const groups = new Map<number, { sx: number; sy: number; n: number }>();
  uniq.forEach((p, i) => { const r = find(i); const g = groups.get(r) ?? { sx: 0, sy: 0, n: 0 }; g.sx += p.x; g.sy += p.y; g.n++; groups.set(r, g); });
  const nodeOf = new Map<Pt, Pt>();
  uniq.forEach((p, i) => { const g = groups.get(find(i))!; nodeOf.set(p, g.n > 1 ? { x: g.sx / g.n, y: g.sy / g.n } : { x: p.x, y: p.y }); });
  return segs.map((s) => ({ a: nodeOf.get(s.a)!, b: nodeOf.get(s.b)! }));
}

export type VectorWall = { a: Pt; b: Pt; thicknessPx: number };

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Πάχος ενός τμήματος: διάμεσος της απόστασης-προς-φόντο στα pixels κατά μήκος του, ×2 − 1. */
function segThickness(s: Seg, dt: Int32Array, w: number, h: number): number {
  const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  const steps = Math.max(1, Math.round(len));
  const vals: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, px = Math.round(s.a.x + (s.b.x - s.a.x) * t), py = Math.round(s.a.y + (s.b.y - s.a.y) * t);
    let best = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = px + dx, y = py + dy;
      if (x >= 0 && y >= 0 && x < w && y < h) best = Math.max(best, dt[y * w + x]);
    }
    if (best > 0) vals.push(best);
  }
  return Math.max(1, 2 * median(vals) - 1);
}

/**
 * Μάσκα τοίχων → διανυσματικοί τοίχοι (pixels). Αγωγός: λέπτυνση → απόσταση → ιχνηλάτηση → κλάδεμα →
 * απλοποίηση → τμήματα → συγχώνευση → ίσιωμα αξόνων → κούμπωμα κόμβων → πάχος ανά τμήμα.
 */
export function vectorizeWalls(mask: Mask, w: number, h: number, opts: {
  minBranchPx?: number; simplifyEps?: number; mergeAngleDeg?: number; snapTolPx?: number; axisDeg?: number;
} = {}): VectorWall[] {
  const skel = thinZhangSuen(mask, w, h);
  const dt = distanceToBackground(mask, w, h);
  const skelDt: number[] = [];
  for (let i = 0; i < skel.length; i++) if (skel[i]) skelDt.push(dt[i]);
  const avgTh = Math.max(2, 2 * median(skelDt) - 1); // μέσο πάχος τοίχου (px)

  const minBranch = opts.minBranchPx ?? Math.max(4, avgTh);
  const eps = opts.simplifyEps ?? 1.5;
  const snapTol = opts.snapTolPx ?? Math.max(4, avgTh);

  const polys = pruneShort(tracePolylines(skel, w, h), minBranch);
  const segs: Seg[] = [];
  for (const p of polys) {
    const sp = simplifyOpen(p, eps);
    for (let i = 1; i < sp.length; i++) segs.push({ a: sp[i - 1], b: sp[i] });
  }
  let merged = mergeCollinear(segs, { maxAngleDeg: opts.mergeAngleDeg ?? 3, maxGapPx: snapTol * 1.5 });
  merged = merged.map((s) => snapAxisAligned(s, opts.axisDeg ?? 2));
  merged = snapNodes(merged, snapTol);
  return merged.map((s) => ({ a: s.a, b: s.b, thicknessPx: segThickness(s, dt, w, h) }));
}
