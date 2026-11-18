import { threshold, type Mask } from '@/lib/floorplan/core';
import type { Pt } from '@/lib/floorplan/editor/reducers';

export type DetectedColumn = { center: Pt; wPx: number; hPx: number };

/**
 * Βρίσκει κολώνες σε raster κάτοψη: μικρά, σχεδόν ορθογώνια, γεμισμένα σκοτεινά σημεία.
 * Τρέχει πάνω σε thresholded γκρι εικόνα — οι κολώνες είναι συνήθως σκούρες γραμμές/γέμισμα.
 */
export function detectColumnsFromRaster(
  gray: Uint8Array,
  w: number,
  h: number,
  opts: { minM: number; maxM: number; mPerPx: number | null; threshold?: number },
): DetectedColumn[] {
  if (!opts.mPerPx || opts.mPerPx <= 0) return [];
  const minPx = opts.minM / opts.mPerPx;
  const maxPx = opts.maxM / opts.mPerPx;
  const dark = threshold(gray, opts.threshold ?? otsuEstimate(gray));
  const comps = connectedComponents(dark, w, h);
  const cols: DetectedColumn[] = [];
  for (const c of comps) {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    if (bw < minPx || bh < minPx || bw > maxPx || bh > maxPx) continue;
    const aspect = Math.min(bw, bh) / Math.max(bw, bh);
    if (aspect < 0.35) continue;
    const bboxArea = bw * bh;
    const solidity = c.count / bboxArea;
    if (solidity < 0.5) continue;
    cols.push({
      center: { x: (c.minX + c.maxX + 1) / 2, y: (c.minY + c.maxY + 1) / 2 },
      wPx: bw,
      hPx: bh,
    });
  }
  return mergeOverlapping(cols, 0.4);
}

function otsuEstimate(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (const v of gray) hist[v]++;
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

type Comp = { minX: number; minY: number; maxX: number; maxY: number; count: number };

function connectedComponents(m: Mask, w: number, h: number): Comp[] {
  const seen = new Uint8Array(m.length);
  const stack = new Int32Array(m.length);
  const out: Comp[] = [];
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || seen[s]) continue;
    let sp = 0;
    stack[sp++] = s; seen[s] = 1;
    let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
    while (sp) {
      const i = stack[--sp];
      count++;
      const x = i % w, y = (i - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && m[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < w - 1 && m[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && m[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[sp++] = i - w; }
      if (y < h - 1 && m[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[sp++] = i + w; }
    }
    out.push({ minX, minY, maxX, maxY, count });
  }
  return out;
}

function mergeOverlapping(cols: DetectedColumn[], iouThreshold: number): DetectedColumn[] {
  if (cols.length < 2) return cols;
  const sorted = [...cols].sort((a, b) => b.wPx * b.hPx - a.wPx * a.hPx);
  const out: DetectedColumn[] = [];
  for (const c of sorted) {
    const hw = c.wPx / 2, hh = c.hPx / 2;
    const ca = { minX: c.center.x - hw, maxX: c.center.x + hw, minY: c.center.y - hh, maxY: c.center.y + hh };
    let merged = false;
    for (const o of out) {
      const ohw = o.wPx / 2, ohh = o.hPx / 2;
      const oa = { minX: o.center.x - ohw, maxX: o.center.x + ohw, minY: o.center.y - ohh, maxY: o.center.y + ohh };
      const ix = Math.max(0, Math.min(ca.maxX, oa.maxX) - Math.max(ca.minX, oa.minX));
      const iy = Math.max(0, Math.min(ca.maxY, oa.maxY) - Math.max(ca.minY, oa.minY));
      const inter = ix * iy;
      const uni = c.wPx * c.hPx + o.wPx * o.hPx - inter;
      if (inter / uni > iouThreshold) { merged = true; break; }
    }
    if (!merged) out.push(c);
  }
  return out;
}
