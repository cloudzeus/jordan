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
