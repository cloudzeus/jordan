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

/** DrawOPS του pdfjs (≥ v6): τα opcodes μέσα στο flat buffer του `constructPath`. */
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

/**
 * Adapter: operator-list του pdfjs (fnArray/argsArray + OPS) → `RawOp[]`. Για pdfjs ≥ 6: το
 * `constructPath` έχει args `[paintFn, [Float32Array], minMax]` και το buffer είναι flat με DrawOPS
 * opcodes + coords. `layerName(args)` επιστρέφει το OCG όνομα για `beginMarkedContentProps` (ή null).
 * I/O glue — ο πυρήνας (flat-buffer walk) ελέγχεται με synthetic tests· η pdfjs ροή με manual QA.
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
      // args = [paintFn, [buffer], minMax]· buffer flat: [op, coords…, op, coords…], DrawOPS opcodes.
      const buf = (args as unknown[])?.[1] as ArrayLike<number> | null | undefined;
      const b = Array.isArray(buf) ? buf[0] : buf;
      if (!b || typeof (b as ArrayLike<number>).length !== 'number') continue;
      const a = b as ArrayLike<number>;
      let k = 0, cx = 0, cy = 0, sx = 0, sy = 0;
      while (k < a.length) {
        const s = a[k++];
        if (s === DRAW.moveTo) { cx = a[k++]; cy = a[k++]; sx = cx; sy = cy; out.push({ op: 'move', args: [cx, cy] }); }
        else if (s === DRAW.lineTo) { cx = a[k++]; cy = a[k++]; out.push({ op: 'line', args: [cx, cy] }); }
        else if (s === DRAW.curveTo) {
          const c1x = a[k++], c1y = a[k++], c2x = a[k++], c2y = a[k++], x = a[k++], y = a[k++];
          out.push({ op: 'cubic', args: [c1x, c1y, c2x, c2y, x, y] }); cx = x; cy = y;
        } else if (s === DRAW.quadraticCurveTo) {
          // Μετατροπή τετραγωνικής (cur, q, p) σε κυβική.
          const qx = a[k++], qy = a[k++], x = a[k++], y = a[k++];
          const c1x = cx + (2 / 3) * (qx - cx), c1y = cy + (2 / 3) * (qy - cy);
          const c2x = x + (2 / 3) * (qx - x), c2y = y + (2 / 3) * (qy - y);
          out.push({ op: 'cubic', args: [c1x, c1y, c2x, c2y, x, y] }); cx = x; cy = y;
        } else if (s === DRAW.closePath) { out.push({ op: 'line', args: [sx, sy] }); cx = sx; cy = sy; }
        else break; // άγνωστο opcode — σταμάτα την ανάγνωση αυτού του buffer
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
