import { nearestWallTypeByThickness } from '@/lib/floorplan/wall-types';
import type { VectorWall } from '@/lib/floorplan/vectorize';
import type { EditorShellWallType } from '@/components/admin/floorplan/editor-shell';
import type { Pt, NewWall, WallEntity } from './reducers';

/** Τοίχος έτοιμος για τον καμβά: συντεταγμένες σε pixels, χρώμα/πάχος/επιλογή για ζωγράφισμα. */
export type CanvasWall = { id: string; a: Pt; b: Pt; thicknessPx: number; color: string; selected: boolean };

/** Ουδέτερο χρώμα τοίχου χωρίς τύπο. */
const UNTYPED = '#94A3B8';
/** Ανώτατο όριο τοίχων (ίδιο με το `planDataV2.walls.max`). */
const WALL_CAP = 20_000;

/** '1'–'9' → id του τύπου με αυτό το hotkey· αλλιώς null. */
export function hotkeyToWallTypeId(wallTypes: EditorShellWallType[], key: string): string | null {
  return wallTypes.find((t) => t.hotkey === key)?.id ?? null;
}

/** Τετράγωνο απόστασης σημείου p από το τμήμα a–b. */
function distSqToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * dx, qy = a.y + t * dy;
  const ex = p.x - qx, ey = p.y - qy;
  return ex * ex + ey * ey;
}

/** id του κοντινότερου τοίχου με απόσταση σημείου-προς-τμήμα ≤ tolM· αλλιώς null. */
export function pickWallAt(walls: WallEntity[], p: Pt, tolM: number): string | null {
  const tol2 = tolM * tolM;
  let best: { id: string; d2: number } | null = null;
  for (const w of walls) {
    const d2 = distSqToSeg(p, w.a, w.b);
    if (d2 <= tol2 && (!best || d2 < best.d2)) best = { id: w.id, d2 };
  }
  return best ? best.id : null;
}

/** Διανυσματικοί τοίχοι (px) → v2 NewWall (μέτρα), με τύπο από το πάχος. mPerPx ≤ 0 → []. */
export function vectorWallsToNew(vw: VectorWall[], mPerPx: number, wallTypes: EditorShellWallType[]): NewWall[] {
  if (!(mPerPx > 0) || !Number.isFinite(mPerPx)) return [];
  const types = wallTypes.map((t) => ({ id: t.id, thicknessM: t.thicknessM, active: true }));
  return vw.map((v) => ({
    a: { x: v.a.x * mPerPx, y: v.a.y * mPerPx },
    b: { x: v.b.x * mPerPx, y: v.b.y * mPerPx },
    typeId: nearestWallTypeByThickness(types, v.thicknessPx * mPerPx),
    source: 'auto' as const,
  }));
}

/** Πόσοι από τους incoming τοίχους χωρούν χωρίς να ξεπεράσει το cap (default 20.000)· ≥0. */
export function clampAcceptCount(existing: number, incoming: number, cap = WALL_CAP): number {
  return Math.max(0, Math.min(incoming, cap - existing));
}

/** Store walls (μέτρα) → CanvasWall[] (px) με χρώμα τύπου, πάχος και επιλογή. */
export function wallsForCanvas(
  walls: WallEntity[], mPerPx: number, selectedId: string | null, wallTypes: EditorShellWallType[],
): CanvasWall[] {
  const byId = new Map(wallTypes.map((t) => [t.id, t]));
  return walls.map((w) => {
    const t = w.typeId ? byId.get(w.typeId) : undefined;
    return {
      id: w.id,
      a: { x: w.a.x / mPerPx, y: w.a.y / mPerPx },
      b: { x: w.b.x / mPerPx, y: w.b.y / mPerPx },
      thicknessPx: t ? Math.max(1, t.thicknessM / mPerPx) : 2,
      color: t ? t.color : UNTYPED,
      selected: w.id === selectedId,
    };
  });
}
