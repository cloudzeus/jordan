import type { Pt } from '@/lib/floorplan/editor/reducers';
import type { CadSegment } from './pdf-vectors';

export type RecColumn = { center: Pt; wPx: number; hPx: number };
export type RecStair = { bbox: [Pt, Pt]; treads: number };

const key = (p: Pt, q = 2) => `${Math.round(p.x / q)},${Math.round(p.y / q)}`;

// ── Κολόνες: μικρά κλειστά ορθογώνια (4 segments σε κλειστό βρόχο, πλευρές ∈ [min,max]). ──
export function recognizeColumns(segs: CadSegment[], opts: { minPx: number; maxPx: number }): RecColumn[] {
  // Union-find στα άκρα (quantized) → connected components.
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
  for (const s of segs) { for (const k of [key(s.a), key(s.b)]) if (!parent.has(k)) parent.set(k, k); union(key(s.a), key(s.b)); }

  const groups = new Map<string, CadSegment[]>();
  for (const s of segs) { const r = find(key(s.a)); (groups.get(r) ?? groups.set(r, []).get(r)!).push(s); }

  const out: RecColumn[] = [];
  for (const g of groups.values()) {
    if (g.length < 4 || g.length > 8) continue; // ορθογώνιο ~4 πλευρές (ανοχή για διπλά)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of g) for (const p of [s.a, s.b]) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const w = maxX - minX, h = maxY - minY;
    if (w < opts.minPx || h < opts.minPx || w > opts.maxPx || h > opts.maxPx) continue;
    out.push({ center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, wPx: w, hPx: h });
  }
  return out;
}

// ── Σκάλες: ομάδες ισαπεχουσών παράλληλων (σκαλοπάτια). ──
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

export function recognizeStairs(segs: CadSegment[], opts: { minTreads?: number; tolPx?: number }): RecStair[] {
  const minTreads = opts.minTreads ?? 4;
  const tol = opts.tolPx ?? 2;
  const out: RecStair[] = [];

  for (const axis of ['h', 'v'] as const) {
    // Σχεδόν οριζόντια / κατακόρυφα segments.
    const lines = segs.filter((s) => {
      const dx = Math.abs(s.b.x - s.a.x), dy = Math.abs(s.b.y - s.a.y);
      return axis === 'h' ? dx > dy && dy <= tol : dy > dx && dx <= tol;
    });
    if (lines.length < minTreads) continue;
    // Ταξινόμηση κατά κάθετη συντεταγμένη (y για οριζόντια).
    const perp = (s: CadSegment) => (axis === 'h' ? (s.a.y + s.b.y) / 2 : (s.a.x + s.b.x) / 2);
    const sorted = [...lines].sort((p, q) => perp(p) - perp(q));
    // Μεγαλύτερη ακολουθία σταθερού βήματος.
    let i = 0;
    while (i < sorted.length - 1) {
      const step = perp(sorted[i + 1]) - perp(sorted[i]);
      let j = i + 1;
      while (j < sorted.length - 1 && near(perp(sorted[j + 1]) - perp(sorted[j]), step, tol)) j++;
      const run = sorted.slice(i, j + 1);
      if (step > tol && run.length >= minTreads) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of run) for (const p of [s.a, s.b]) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
        out.push({ bbox: [{ x: minX, y: minY }, { x: maxX, y: maxY }], treads: run.length });
        i = j + 1;
      } else {
        i++;
      }
    }
  }
  return out;
}
