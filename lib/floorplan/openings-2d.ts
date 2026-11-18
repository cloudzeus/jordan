// Αρχιτεκτονικά στοιχεία για τον 2D viewer: τοίχοι με πραγματικό πάχος και ανοίγματα (πόρτες με
// τόξο ανάπτυξης, παράθυρα με διπλή γραμμή). Καθαρή γεωμετρία (χωρίς DOM/three.js) για vitest.
import type { Pt } from './core';

/** Κατεύθυνση ανάπτυξης πόρτας — «αριστερά» ή «δεξιά» όπως κοιτάζεις τον τοίχο από το άκρο a. */
export type Swing = 'left' | 'right' | null;

const norm = (dx: number, dy: number): Pt => {
  const L = Math.hypot(dx, dy) || 1;
  return { x: dx / L, y: dy / L };
};
const perp = (d: Pt): Pt => ({ x: -d.y, y: d.x });
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const rotate = (p: Pt, center: Pt, ang: number): Pt => {
  const c = Math.cos(ang), s = Math.sin(ang);
  const dx = p.x - center.x, dy = p.y - center.y;
  return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
};

/**
 * Δύο offset γραμμές (αριστερά/δεξιά του κέντρου) για τοίχο με πάχος `thicknessPx`.
 * Επιστρέφει τα δύο segments [a1→b1, a2→b2] — το «χάραμα» του αρχιτεκτονικού σχεδίου.
 */
export function wallEdges(a: Pt, b: Pt, thicknessPx: number): { a1: Pt; b1: Pt; a2: Pt; b2: Pt } {
  const d = norm(b.x - a.x, b.y - a.y);
  const p = perp(d);
  const off = thicknessPx / 2;
  return {
    a1: { x: a.x + p.x * off, y: a.y + p.y * off },
    b1: { x: b.x + p.x * off, y: b.y + p.y * off },
    a2: { x: a.x - p.x * off, y: a.y - p.y * off },
    b2: { x: b.x - p.x * off, y: b.y - p.y * off },
  };
}

/**
 * Τόξο ανάπτυξης πόρτας από το άκρο `hinge` του τμήματος a→b. Ακτίνα = μήκος πόρτας.
 * Το τόξο καμπυλώνεται προς τη μεριά που δείχνει `swing` (κάθετα στον τοίχο).
 * Επιστρέφει τη γραμμή του φύλλου (hinge→leafEnd) και τα σημεία του τόξου (hinge→arc→leafEnd).
 */
export function doorSwing(a: Pt, b: Pt, hinge: 'a' | 'b', swing: Swing): { leaf: [Pt, Pt]; arc: Pt[] } {
  const start = hinge === 'a' ? a : b;
  const end = hinge === 'a' ? b : a;
  const L = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const dir = norm(end.x - start.x, end.y - start.y);
  const side = swing === 'right' ? 1 : -1;
  const angle = (Math.PI / 2) * side;
  const leafEnd = rotate({ x: start.x + dir.x * L, y: start.y + dir.y * L }, start, angle);
  const arc: Pt[] = [start];
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    arc.push(rotate({ x: start.x + dir.x * L, y: start.y + dir.y * L }, start, (angle * i) / steps));
  }
  return { leaf: [start, leafEnd], arc };
}

/**
 * Παράθυρο πάνω σε τοίχο: δύο offset γραμμές (μέσα στο πάχος) με μικρές κάθετες ενώσεις στα άκρα.
 * `thicknessPx` = πάχος τοίχου· `gapPx` = πόσο μέσα είναι οι γραμμές του τζαμιού από τις όψεις.
 */
export function windowLines(a: Pt, b: Pt, thicknessPx: number, gapPx = Math.max(2, thicknessPx * 0.18)): { l1: [Pt, Pt]; l2: [Pt, Pt]; caps: Array<[Pt, Pt]> } {
  const d = norm(b.x - a.x, b.y - a.y);
  const p = perp(d);
  const o = thicknessPx / 2 - gapPx;
  const l1: [Pt, Pt] = [{ x: a.x + p.x * o, y: a.y + p.y * o }, { x: b.x + p.x * o, y: b.y + p.y * o }];
  const l2: [Pt, Pt] = [{ x: a.x - p.x * o, y: a.y - p.y * o }, { x: b.x - p.x * o, y: b.y - p.y * o }];
  const caps: Array<[Pt, Pt]> = [
    [{ x: a.x + p.x * o, y: a.y + p.y * o }, { x: a.x - p.x * o, y: a.y - p.y * o }],
    [{ x: b.x + p.x * o, y: b.y + p.y * o }, { x: b.x - p.x * o, y: b.y - p.y * o }],
  ];
  return { l1, l2, caps };
}

/** Λεπτές «καπέλες» στα άκρα τοίχου (κλείσιμο πάχους). */
export function wallCaps(a: Pt, b: Pt, thicknessPx: number): Array<[Pt, Pt]> {
  const d = norm(b.x - a.x, b.y - a.y);
  const p = perp(d);
  const off = thicknessPx / 2;
  return [
    [{ x: a.x + p.x * off, y: a.y + p.y * off }, { x: a.x - p.x * off, y: a.y - p.y * off }],
    [{ x: b.x + p.x * off, y: b.y + p.y * off }, { x: b.x - p.x * off, y: b.y - p.y * off }],
  ];
}

/** Μέσο τμήματος — χρήσιμο για ετικέτες/επιλογή. */
export function segmentMid(a: Pt, b: Pt): Pt {
  return lerp(a, b, 0.5);
}
