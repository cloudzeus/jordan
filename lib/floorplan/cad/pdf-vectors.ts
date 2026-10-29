import type { Pt } from '@/lib/floorplan/editor/reducers';

/** Διανυσματικό τμήμα σε px (analysis-space)· `layer` = OCG όνομα/id ή null. */
export type CadSegment = { a: Pt; b: Pt; layer: string | null };
/** Affine 2D: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];
/** Κανονικοποιημένη εντολή path (ανεξάρτητη από τα numeric OPS του pdfjs). */
export type RawOp = {
  op: 'move' | 'line' | 'cubic' | 'rect' | 'save' | 'restore' | 'transform' | 'beginLayer' | 'endLayer';
  args: number[];
  layer?: string;
};

const apply = (m: Matrix, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

/** Σύνθεση: apply(compose(A,B), p) === apply(A, apply(B, p)). */
function compose(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Adapter: operator-list του pdfjs (fnArray/argsArray + OPS) → `RawOp[]`. `layerName(args)` επιστρέφει
 * το όνομα OCG layer για ένα `beginMarkedContentProps` (ή null). I/O glue — ελέγχεται με manual QA.
 */
export function pdfOpsToRaw(
  fnArray: number[], argsArray: unknown[], OPS: Record<string, number>, layerName: (args: unknown) => string | null,
): RawOp[] {
  const out: RawOp[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    if (fn === OPS.save) out.push({ op: 'save', args: [] });
    else if (fn === OPS.restore) out.push({ op: 'restore', args: [] });
    else if (fn === OPS.transform) out.push({ op: 'transform', args: (args as number[]).slice(0, 6) });
    else if (fn === OPS.beginMarkedContentProps) { const nm = layerName(args); out.push(nm != null ? { op: 'beginLayer', args: [], layer: nm } : { op: 'beginLayer', args: [] }); }
    else if (fn === OPS.beginMarkedContent) out.push({ op: 'beginLayer', args: [] });
    else if (fn === OPS.endMarkedContent) out.push({ op: 'endLayer', args: [] });
    else if (fn === OPS.constructPath) {
      const [subOps, coords] = args as [number[], number[]];
      let k = 0, sx = 0, sy = 0;
      for (const s of subOps) {
        if (s === OPS.moveTo) { sx = coords[k++]; sy = coords[k++]; out.push({ op: 'move', args: [sx, sy] }); }
        else if (s === OPS.lineTo) out.push({ op: 'line', args: [coords[k++], coords[k++]] });
        else if (s === OPS.curveTo) out.push({ op: 'cubic', args: [coords[k++], coords[k++], coords[k++], coords[k++], coords[k++], coords[k++]] });
        else if (s === OPS.rectangle) out.push({ op: 'rect', args: [coords[k++], coords[k++], coords[k++], coords[k++]] });
        else if (s === OPS.closePath) out.push({ op: 'line', args: [sx, sy] });
      }
    }
  }
  return out;
}

/**
 * Κανονικοποιημένες εντολές path → ευθύγραμμα τμήματα (device/analysis px), εφαρμόζοντας το CTM
 * (με save/restore stack)· οι κυβικές κόβονται σε segments ≤ `curveTolPx`· κάθε segment παίρνει το
 * τρέχον OCG layer (beginLayer/endLayer stack).
 */
export function flattenPath(ops: RawOp[], base: Matrix, curveTolPx = 1.5): CadSegment[] {
  const segs: CadSegment[] = [];
  let ctm: Matrix = base;
  const ctmStack: Matrix[] = [];
  const layerStack: (string | null)[] = [];
  const layer = () => (layerStack.length ? layerStack[layerStack.length - 1] : null);
  let cur: Pt | null = null; // τρέχον σημείο σε USER space

  const emit = (uFrom: Pt, uTo: Pt) => segs.push({ a: apply(ctm, uFrom.x, uFrom.y), b: apply(ctm, uTo.x, uTo.y), layer: layer() });

  for (const o of ops) {
    switch (o.op) {
      case 'save': ctmStack.push(ctm); break;
      case 'restore': ctm = ctmStack.pop() ?? base; break;
      case 'transform': ctm = compose(ctm, o.args as Matrix); break;
      case 'beginLayer': layerStack.push(o.layer ?? null); break;
      case 'endLayer': layerStack.pop(); break;
      case 'move': cur = { x: o.args[0], y: o.args[1] }; break;
      case 'line': {
        const p = { x: o.args[0], y: o.args[1] };
        if (cur) emit(cur, p);
        cur = p;
        break;
      }
      case 'rect': {
        const [x, y, w, h] = o.args;
        const c = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
        for (let i = 0; i < 4; i++) emit(c[i], c[(i + 1) % 4]);
        cur = c[0];
        break;
      }
      case 'cubic': {
        if (!cur) break;
        const p0 = cur, c1 = { x: o.args[0], y: o.args[1] }, c2 = { x: o.args[2], y: o.args[3] }, p3 = { x: o.args[4], y: o.args[5] };
        // Πλήθος βημάτων από το μήκος του control polygon σε device px.
        const d0 = apply(ctm, p0.x, p0.y), d1 = apply(ctm, c1.x, c1.y), d2 = apply(ctm, c2.x, c2.y), d3 = apply(ctm, p3.x, p3.y);
        const polyLen = dist(d0, d1) + dist(d1, d2) + dist(d2, d3);
        const n = Math.max(2, Math.min(64, Math.ceil(polyLen / Math.max(0.1, curveTolPx))));
        let prev = p0;
        for (let i = 1; i <= n; i++) {
          const t = i / n, mt = 1 - t;
          const bx = mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p3.x;
          const by = mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p3.y;
          const p = { x: bx, y: by };
          emit(prev, p);
          prev = p;
        }
        cur = p3;
        break;
      }
    }
  }
  return segs;
}
