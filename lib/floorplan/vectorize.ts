// Από μάσκα τοίχων (Mask w×h, 1 = τοίχος) σε διανυσματικούς τοίχους — καθαρές συναρτήσεις (χωρίς DOM),
// ελέγχονται με vitest. Αγωγός: λέπτυνση → χάρτης απόστασης (πάχος) → ιχνηλάτηση σκελετού → απλοποίηση
// → συγχώνευση/ίσιωμα → κούμπωμα κόμβων. Έξοδος σε pixels· η px→m και η πρόταση τύπου μένουν στον caller.
import type { Mask, Pt } from './core';

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
