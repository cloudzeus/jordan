import type { CadSegment } from './pdf-vectors';
import { recognizeWalls } from './recognize-walls';
import { vectorWallsToNew } from '@/lib/floorplan/editor/interactions';
import type { EditorShellWallType } from '@/components/admin/floorplan/editor-shell';
import type { NewWall } from '@/lib/floorplan/editor/reducers';

/**
 * Αγωγός εισαγωγής: CAD segments (px) → αναγνώριση τοίχων (parallel-pair) → v2 NewWall (μέτρα) με
 * τύπο από το πάχος. Το εύρος πάχους προκύπτει από τα πάχη του καταλόγου τύπων σε px. `mPerPx<=0` → [].
 */
export function cadWallsToNew(
  segs: CadSegment[], mPerPx: number, wallTypes: EditorShellWallType[],
  opts?: { minThicknessPx?: number; maxThicknessPx?: number },
): NewWall[] {
  if (!(mPerPx > 0) || !Number.isFinite(mPerPx)) return [];
  const thicks = wallTypes.map((t) => t.thicknessM).filter((t) => t > 0);
  const minTh = thicks.length ? Math.min(...thicks) : 0.05;
  const maxTh = thicks.length ? Math.max(...thicks) : 0.5;
  const minThicknessPx = opts?.minThicknessPx ?? Math.max(4, (minTh * 0.5) / mPerPx);
  const maxThicknessPx = opts?.maxThicknessPx ?? (maxTh * 1.8) / mPerPx;
  const walls = recognizeWalls(segs, { minThicknessPx, maxThicknessPx });
  return vectorWallsToNew(walls, mPerPx, wallTypes);
}
