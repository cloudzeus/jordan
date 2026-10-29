import type { Pt } from '@/lib/floorplan/editor/reducers';
import type { CadSegment } from './pdf-vectors';
import { mergeCollinear, snapAxisAligned, snapNodes, type Seg, type VectorWall } from '@/lib/floorplan/vectorize';

export type LayerRole = 'wall' | 'beam' | 'door' | 'opening' | 'ignore';

const ROLE_RULES: [RegExp, LayerRole][] = [
  [/ktisma|τοιχ|\bwall\b|exterior|interior|\bext\b|\bint\b|masonry/i, 'wall'],
  [/\bdok\b|beam|δοκ/i, 'beam'],
  [/door|πορτ/i, 'door'],
  [/wind|παραθ|opening|άνοιγ/i, 'opening'],
];

/** Όνομα OCG layer → ρόλος (configurable name-matching)· άγνωστο → 'ignore'. */
export function layerRole(name: string): LayerRole {
  for (const [re, role] of ROLE_RULES) if (re.test(name)) return role;
  return 'ignore';
}

/** Ομαδοποίηση segments ανά ρόλο layer. */
export function segmentsByRole(
  segs: CadSegment[], roleOf: (layer: string | null) => LayerRole,
): Record<LayerRole, CadSegment[]> {
  const out: Record<LayerRole, CadSegment[]> = { wall: [], beam: [], door: [], opening: [], ignore: [] };
  for (const s of segs) out[roleOf(s.layer)].push(s);
  return out;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const norm = (p: Pt) => Math.hypot(p.x, p.y);
const angleMod180 = (s: CadSegment) => { let a = (Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) * 180) / Math.PI; a = ((a % 180) + 180) % 180; return a; };
const angDiff = (x: number, y: number) => { const d = Math.abs(x - y) % 180; return Math.min(d, 180 - d); };

export type RecognizeWallOpts = { minThicknessPx: number; maxThicknessPx: number; minLenPx?: number; angleTolDeg?: number };

/**
 * Αναγνώριση τοίχων = ζεύγη παράλληλων segments σε κάθετη απόσταση ∈ [min,max] με επικάλυψη κατά
 * μήκος → centerline + πάχος. Στο τέλος: συγχώνευση συνευθειακών, ίσιωμα αξόνων, κούμπωμα κόμβων.
 */
export function recognizeWalls(segs: CadSegment[], opts: RecognizeWallOpts): VectorWall[] {
  const minLen = opts.minLenPx ?? opts.maxThicknessPx;
  const tol = opts.angleTolDeg ?? 3;
  const long = segs.filter((s) => norm(sub(s.b, s.a)) >= minLen);

  // Bucket κατά γωνία (bin 5°) ΚΑΙ κάθετη θέση (bin = maxThicknessPx) — ζεύγη μόνο σε κοντινά bins.
  // Έτσι σε axis-aligned A0 δεν καταρρέουν όλα σε 2 bins (αποφυγή O(n²) → O(n·k)).
  const BIN = 5, BINS = Math.ceil(180 / BIN);
  const index = new Map<string, number[]>();
  const binOf = new Map<number, { abin: number; obin: number }>();
  long.forEach((s, i) => {
    const deg = angleMod180(s), th = (deg * Math.PI) / 180;
    const off = ((s.a.x + s.b.x) / 2) * -Math.sin(th) + ((s.a.y + s.b.y) / 2) * Math.cos(th);
    const abin = Math.floor(deg / BIN) % BINS, obin = Math.round(off / opts.maxThicknessPx);
    binOf.set(i, { abin, obin });
    const k = `${abin}:${obin}`;
    (index.get(k) ?? index.set(k, []).get(k)!).push(i);
  });

  const cands: VectorWall[] = [];
  const paired = new Set<number>();
  for (let i = 0; i < long.length; i++) {
    if (paired.has(i)) continue;
    const A = long[i];
    const { abin, obin } = binOf.get(i)!;
    const cand: number[] = [];
    for (let da = -1; da <= 1; da++) for (let d0 = -1; d0 <= 1; d0++) {
      const arr = index.get(`${(abin + da + BINS) % BINS}:${obin + d0}`);
      if (arr) cand.push(...arr);
    }
    {
      for (const j of cand) {
        if (j === i || paired.has(j)) continue;
        const B = long[j];
        if (angDiff(angleMod180(A), angleMod180(B)) > tol) continue;
        const dir = sub(A.b, A.a); const L = norm(dir); if (L === 0) continue;
        const u = { x: dir.x / L, y: dir.y / L };
        const n = { x: -u.y, y: u.x };
        const off = dot(sub(B.a, A.a), n);
        const th = Math.abs(off);
        if (th < opts.minThicknessPx || th > opts.maxThicknessPx) continue;
        // Επικάλυψη κατά μήκος (προβολή στο u).
        const tA = [0, dot(sub(A.b, A.a), u)];
        const tB = [dot(sub(B.a, A.a), u), dot(sub(B.b, A.a), u)];
        const lo = Math.max(Math.min(...tA), Math.min(...tB));
        const hi = Math.min(Math.max(...tA), Math.max(...tB));
        if (hi - lo <= 0) continue;
        const shift = { x: (off / 2) * n.x, y: (off / 2) * n.y };
        cands.push({
          a: { x: A.a.x + lo * u.x + shift.x, y: A.a.y + lo * u.y + shift.y },
          b: { x: A.a.x + hi * u.x + shift.x, y: A.a.y + hi * u.y + shift.y },
          thicknessPx: th,
        });
        paired.add(i); paired.add(j);
        break;
      }
    }
  }

  const gap = opts.maxThicknessPx * 1.5;
  let merged: Seg[] = mergeCollinear(cands.map((c) => ({ a: c.a, b: c.b })), { maxAngleDeg: tol, maxGapPx: gap });
  merged = merged.map((s) => snapAxisAligned(s, 2));
  merged = snapNodes(merged, opts.maxThicknessPx);
  // Το πάχος κάθε merged τοίχου = αυτό του κοντινότερου (κατά μέσο) αρχικού ζεύγους.
  return merged.map((s) => ({ a: s.a, b: s.b, thicknessPx: nearestThickness(s, cands) }));
}

const mid = (s: Seg): Pt => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 });

/** Πάχος ενός centerline: αυτό του αρχικού ζεύγους με το κοντινότερο μέσο. */
function nearestThickness(s: Seg, cands: VectorWall[]): number {
  if (!cands.length) return 0;
  const m = mid(s);
  let best = cands[0];
  let bd = norm(sub(m, mid(cands[0])));
  for (const c of cands) { const d = norm(sub(m, mid(c))); if (d < bd) { bd = d; best = c; } }
  return Math.round(best.thicknessPx);
}
