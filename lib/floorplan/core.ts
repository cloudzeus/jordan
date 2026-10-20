// Διαστασιολόγηση κάτοψης — καθαρές συναρτήσεις (χωρίς DOM), ώστε να ελέγχονται με vitest.
//
// Ροή:
//   εικόνα → γκρι → σκοτεινά pixels (κατώφλι Otsu) → «άνοιγμα» με τετράγωνο πυρήνα = μένουν μόνο
//   τα χοντρά στοιχεία (τοίχοι), φεύγουν κείμενα, διαστάσεις, έπιπλα με λεπτή γραμμή.
//   Κλικ σε χώρο → flood fill στα μη-τοίχους (+ διαχωριστικά του χρήστη) → περίγραμμα (crack
//   following στις γωνίες των pixels) → απλοποίηση (Douglas–Peucker) → εμβαδό.
// Όλες οι μάσκες είναι Uint8Array w×h με 1 = ενεργό pixel.

export type Mask = Uint8Array;
export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** RGBA → φωτεινότητα 0..255· η διαφάνεια «πατάει» σε λευκό φόντο (PNG κατόψεις με alpha). */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = rgba[j + 3] / 255;
    const l = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    out[i] = Math.round(l * a + 255 * (1 - a));
  }
  return out;
}

/** Κατώφλι Otsu: χωρίζει «μελάνι» από «χαρτί» μεγιστοποιώντας τη διακύμανση μεταξύ κλάσεων. */
export function otsu(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr + 1;
}

export function threshold(gray: Uint8Array, t: number): Mask {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = gray[i] < t ? 1 : 0;
  return out;
}

/** Ολοκληρωτική εικόνα (w+1)×(h+1) — μετρά ενεργά pixels σε οποιοδήποτε ορθογώνιο σε O(1). */
function integral(m: Mask, w: number, h: number): Int32Array {
  const W = w + 1;
  const I = new Int32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += m[y * w + x];
      I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row;
    }
  }
  return I;
}

/** Ενεργά pixels στο [x0,x1)×[y0,y1) (ήδη περιορισμένο στα όρια). */
function count(I: Int32Array, W: number, x0: number, y0: number, x1: number, y1: number): number {
  return I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
}

/** Διάβρωση με τετράγωνο (2r+1): μένει ενεργό μόνο αν ΟΛΟ το παράθυρο (μέσα στην εικόνα) είναι ενεργό. */
export function erode(m: Mask, w: number, h: number, r: number): Mask {
  if (r <= 0) return m.slice();
  const I = integral(m, w, h), W = w + 1;
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      if (count(I, W, x0, y0, x1, y1) === (x1 - x0) * (y1 - y0)) out[y * w + x] = 1;
    }
  }
  return out;
}

/** Διαστολή με τετράγωνο (2r+1): ενεργό αν ΚΑΠΟΙΟ pixel του παραθύρου είναι ενεργό. */
export function dilate(m: Mask, w: number, h: number, r: number): Mask {
  if (r <= 0) return m.slice();
  const I = integral(m, w, h), W = w + 1;
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      if (count(I, W, x0, y0, x1, y1) > 0) out[y * w + x] = 1;
    }
  }
  return out;
}

/** Συνεκτικές συνιστώσες (4-γειτονιά) μικρότερες από minPx σβήνονται (σύμβολα, έντονα γράμματα). */
export function removeSmall(m: Mask, w: number, h: number, minPx: number): Mask {
  const out = m.slice();
  if (minPx <= 1) return out;
  const seen = new Uint8Array(m.length);
  const stack = new Int32Array(m.length);
  const comp: number[] = [];
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || seen[s]) continue;
    let sp = 0;
    stack[sp++] = s; seen[s] = 1; comp.length = 0;
    while (sp) {
      const i = stack[--sp];
      comp.push(i);
      const x = i % w, y = (i - x) / w;
      if (x > 0 && m[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < w - 1 && m[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && m[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[sp++] = i - w; }
      if (y < h - 1 && m[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[sp++] = i + w; }
    }
    if (comp.length < minPx) for (const i of comp) out[i] = 0;
  }
  return out;
}

/**
 * Εκτίμηση πάχους τοίχου (px): οι τοίχοι δίνουν πολλά οριζόντια/κάθετα «τρεξίματα» σκοτεινών pixels
 * ίδιου μήκους. Αγνοούμε τα πολύ λεπτά (<4 px: γραμμές, γράμματα) και παίρνουμε την επικρατούσα τιμή.
 */
export function estimateWallThickness(dark: Mask, w: number, h: number): number {
  const maxLen = Math.max(8, Math.round(Math.max(w, h) / 25));
  const hist = new Float64Array(maxLen + 1);
  const add = (len: number) => { if (len >= 4 && len <= maxLen) hist[len] += len; };
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) { if (dark[y * w + x]) run++; else { add(run); run = 0; } }
    add(run);
  }
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y < h; y++) { if (dark[y * w + x]) run++; else { add(run); run = 0; } }
    add(run);
  }
  let best = 0, bestLen = 0;
  for (let l = 4; l <= maxLen; l++) if (hist[l] > best) { best = hist[l]; bestLen = l; }
  return bestLen || 6;
}

export type WallOptions = {
  /** Κατώφλι φωτεινότητας (0..255)· null ⇒ Otsu. */
  threshold?: number | null;
  /** Ελάχιστο πάχος τοίχου σε px· null ⇒ αυτόματη εκτίμηση. */
  minThickness?: number | null;
};

export type WallResult = { walls: Mask; threshold: number; minThickness: number; coverage: number };

/** Μάσκα τοίχων: σκοτεινά → κλείσιμο 1px (ενώνει διαγραμμίσεις) → άνοιγμα με πάχος → χωρίς ψίχουλα. */
export function detectWalls(gray: Uint8Array, w: number, h: number, opts: WallOptions = {}): WallResult {
  const t = opts.threshold ?? otsu(gray);
  const dark = threshold(gray, t);
  const closed = erode(dilate(dark, w, h, 1), w, h, 1);
  // Η επικρατούσα τιμή βγαίνει συνήθως από τους (χοντρούς) εξωτερικούς τοίχους· οι εσωτερικοί είναι
  // συχνά στο μισό πάχος, οπότε το αυτόματο όριο μένει κάτω από αυτό.
  const k = Math.max(2, Math.round(opts.minThickness ?? Math.max(3, estimateWallThickness(dark, w, h) * 0.45)));
  // Άνοιγμα με πυρήνα (2r+1) ≤ k: ένας τοίχος πάχους ακριβώς k επιβιώνει.
  const r = Math.max(1, Math.floor((k - 1) / 2));
  const opened = dilate(erode(closed, w, h, r), w, h, r);
  const walls = removeSmall(opened, w, h, Math.round(k * k * 6));
  let on = 0;
  for (let i = 0; i < walls.length; i++) on += walls[i];
  return { walls, threshold: t, minThickness: k, coverage: on / walls.length };
}

/** Γραμμή πάχους 2r+1 «καίγεται» στη μάσκα (διαχωριστικά του χρήστη, π.χ. κλείσιμο πόρτας). */
export function burnLine(m: Mask, w: number, h: number, a: Pt, b: Pt, r = 1): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(len * 2));
  for (let s = 0; s <= steps; s++) {
    const cx = Math.round(a.x + ((b.x - a.x) * s) / steps), cy = Math.round(a.y + ((b.y - a.y) * s) / steps);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = 1;
    }
  }
}

export type Fill = { region: Mask; count: number; touchesBorder: boolean; bbox: Rect };

/** Scanline flood fill (4-γειτονιά) στα ΜΗ μπλοκαρισμένα pixels, από το σημείο (sx, sy). */
export function flood(blocked: Mask, w: number, h: number, sx: number, sy: number): Fill | null {
  sx = Math.floor(sx); sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || blocked[sy * w + sx]) return null;
  const region = new Uint8Array(blocked.length);
  const stack: number[] = [sx, sy];
  let n = 0, border = false, minX = sx, maxX = sx, minY = sy, maxY = sy;
  const free = (x: number, y: number) => !blocked[y * w + x] && !region[y * w + x];
  while (stack.length) {
    const y = stack.pop()!, x0 = stack.pop()!;
    if (!free(x0, y)) continue;
    let l = x0, r = x0;
    while (l > 0 && free(l - 1, y)) l--;
    while (r < w - 1 && free(r + 1, y)) r++;
    for (let x = l; x <= r; x++) region[y * w + x] = 1;
    n += r - l + 1;
    if (l === 0 || r === w - 1 || y === 0 || y === h - 1) border = true;
    if (l < minX) minX = l; if (r > maxX) maxX = r; if (y < minY) minY = y; if (y > maxY) maxY = y;
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= h) continue;
      let x = l;
      while (x <= r) {
        while (x <= r && !free(x, ny)) x++;
        if (x > r) break;
        stack.push(x, ny);
        while (x <= r && free(x, ny)) x++;
      }
    }
  }
  return { region, count: n, touchesBorder: border, bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

// Κατευθύνσεις σε συντεταγμένες εικόνας (y προς τα κάτω): Α, Ν, Δ, Β — δεξιά στροφή = +1.
const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * Εξωτερικό περίγραμμα περιοχής (4-γειτονιά) πάνω στις ΓΩΝΙΕΣ των pixels («crack following»):
 * το εμβαδό του πολυγώνου ισούται ακριβώς με το πλήθος pixels μιας περιοχής χωρίς τρύπες.
 * Η περιοχή μένει πάντα δεξιά της πορείας. Επιστρέφει μόνο τις κορυφές (αλλαγές κατεύθυνσης).
 */
export function traceOuter(region: Mask, w: number, h: number): Pt[] {
  let start = -1;
  for (let i = 0; i < region.length; i++) if (region[i]) { start = i; break; }
  if (start < 0) return [];
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && region[y * w + x] === 1;
  const sx = start % w, sy = (start - sx) / w;
  let x = sx, y = sy, d = 0;
  const pts: Pt[] = [{ x, y }];
  const limit = 4 * (w + 1) * (h + 1);
  for (let guard = 0; guard < limit; guard++) {
    const [dx, dy] = DIRS[d];
    const ar = on(x + (dx - dy - 1) / 2, y + (dy + dx - 1) / 2);
    const al = on(x + (dx + dy - 1) / 2, y + (dy - dx - 1) / 2);
    const nd = !ar ? (d + 1) % 4 : al ? (d + 3) % 4 : d;
    if (nd !== d && (x !== sx || y !== sy || guard > 0)) pts.push({ x, y });
    d = nd;
    x += DIRS[d][0]; y += DIRS[d][1];
    if (x === sx && y === sy && d === 3) break; // επιστροφή στην αφετηρία ερχόμενοι από κάτω
  }
  // Η αφετηρία μπαίνει πρώτη· αφαιρούμε τυχόν διπλότυπα συνεχόμενα.
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  if (L === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  let idx = 0, max = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], a, b);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

/** Douglas–Peucker για ΚΛΕΙΣΤΟ πολύγωνο: κόβουμε στο πιο απομακρυσμένο σημείο από την αρχή. */
export function simplifyClosed(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 4) return pts.slice();
  let far = 0, max = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d > max) { max = d; far = i; }
  }
  const a = rdp(pts.slice(0, far + 1), eps);
  const b = rdp([...pts.slice(far), pts[0]], eps);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : pts.slice();
}

/** Εμβαδό (shoelace), πάντα θετικό. */
export function polygonArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j].x * pts[i].y) - (pts[i].x * pts[j].y);
  return Math.abs(s) / 2;
}

export function polygonPerimeter(pts: Pt[]): number {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
  return s;
}

export function pointInPolygon(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Σημείο ΜΕΣΑ στο πολύγωνο, όσο γίνεται μακριά από τις πλευρές (για ετικέτες και ως «σπόρος» του
 * flood fill): πλέγμα 24×24 στο bbox και μετά τοπική βελτίωση γύρω από το καλύτερο. Το κέντρο βάρους
 * δεν αρκεί — σε σχήματα Γ/Π πέφτει έξω ή πάνω σε πλευρά (= πάνω σε τοίχο).
 */
export function labelPoint(pts: Pt[]): Pt {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const edgeDist = (q: Pt) => {
    let d = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) d = Math.min(d, segDist(q, pts[j], pts[i]));
    return d;
  };
  let best: Pt = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, bestD = -1;
  const search = (x0: number, y0: number, x1: number, y1: number, n: number) => {
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const q = { x: x0 + ((x1 - x0) * (i + 0.5)) / (n + 1), y: y0 + ((y1 - y0) * (j + 0.5)) / (n + 1) };
      if (!pointInPolygon(q, pts)) continue;
      const d = edgeDist(q);
      if (d > bestD) { bestD = d; best = q; }
    }
  };
  search(minX, minY, maxX, maxY, 24);
  if (bestD > 0) {
    const sx = (maxX - minX) / 12, sy = (maxY - minY) / 12;
    search(best.x - sx, best.y - sy, best.x + sx, best.y + sy, 10);
  }
  return best;
}

export type RoomResult =
  | { ok: true; polygon: Pt[]; areaPx: number; perimeterPx: number; gapPx: number }
  | { ok: false; reason: 'on-wall' | 'leak' };

/**
 * Χώρος από κλικ. Δοκιμάζει διαδοχικά «κλεισίματα ανοιγμάτων» (gaps σε px, ακτίνα = μισό άνοιγμα):
 * οι τοίχοι φουσκώνουν ώστε να κλείσουν πόρτες· ο χώρος που βρίσκεται ξαναφουσκώνει ίσο βαθμό μέσα
 * στα ελεύθερα pixels, για να μη χαθεί εμβαδό δίπλα στους τοίχους. Απορρίπτονται όσα «διαρρέουν»
 * (ακουμπούν το περιθώριο ή πιάνουν πάνω από το 60% της εικόνας). Από τα υπόλοιπα κρατάμε το πρώτο
 * (το πιο ακριβές), εκτός αν κάποιο μεγαλύτερο κλείσιμο δίνει αισθητά μικρότερο χώρο (<90%) — τότε
 * το πρώτο είχε περάσει από πόρτα σε γειτονικό χώρο και κρατάμε το μικρότερο.
 */
export function measureRoom(blocked: Mask, w: number, h: number, seed: Pt, gaps: number[]): RoomResult {
  let onWall = true;
  let best: { region: Mask; areaPx: number; gap: number } | null = null;
  for (const gap of gaps.length ? gaps : [0]) {
    const r = Math.max(0, Math.round(gap / 2));
    const b = r > 0 ? dilate(blocked, w, h, r) : blocked;
    const f = flood(b, w, h, seed.x, seed.y);
    if (!f) continue;
    onWall = false;
    if (f.touchesBorder || f.count > w * h * 0.6) continue;
    let region = f.region;
    if (r > 0) {
      region = dilate(region, w, h, r);
      for (let i = 0; i < region.length; i++) if (blocked[i]) region[i] = 0;
      // Η διαστολή μπορεί να αφήσει απομονωμένα κομμάτια πίσω από λεπτά εμπόδια: κρατάμε τη συνιστώσα του σπόρου.
      const again = flood(invert(region), w, h, seed.x, seed.y);
      if (again) region = again.region;
    }
    let areaPx = 0;
    for (let i = 0; i < region.length; i++) areaPx += region[i];
    if (!best || areaPx < best.areaPx * 0.9) best = { region, areaPx, gap: r * 2 };
  }
  if (!best) return { ok: false, reason: onWall ? 'on-wall' : 'leak' };
  const polygon = simplifyClosed(traceOuter(best.region, w, h), 1.2);
  return { ok: true, polygon, areaPx: best.areaPx, perimeterPx: polygonPerimeter(polygon), gapPx: best.gap };
}

export function invert(m: Mask): Mask {
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = m[i] ? 0 : 1;
  return out;
}

/** m² από px² με κλίμακα «μέτρα ανά pixel». */
export const toM2 = (px2: number, mPerPx: number) => px2 * mPerPx * mPerPx;
