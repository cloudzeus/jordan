import { produce } from 'immer';
import { z } from 'zod';
import {
  wallEntity, openingEntity, roomTakeoffV2,
  type PlanDataV2,
} from '@/lib/floorplan/saved';

export type Pt = { x: number; y: number };
export type WallEntity = z.infer<typeof wallEntity>;
export type OpeningEntity = z.infer<typeof openingEntity>;

export type NewWall = { a: Pt; b: Pt; typeId: string | null; source?: 'auto' | 'cad' | 'drawn' };
export type NewOpening = {
  wallId: string; t0: number; t1: number;
  kind: OpeningEntity['kind']; sillM: number; heightM: number;
};

let seq = 0;
/** Μοναδικό id οντότητας editor — χρόνος + αύξων μετρητής (ντετερμινιστικό ανά διεργασία). */
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

// ── Reducers: καθαροί (PlanDataV2 → PlanDataV2) μέσω immer. Δεν αλλάζουν την είσοδο. ──

export function addWall(d: PlanDataV2, w: NewWall): PlanDataV2 {
  return produce(d, (draft) => {
    draft.walls.push({
      id: newId('w'),
      a: { x: w.a.x, y: w.a.y },
      b: { x: w.b.x, y: w.b.y },
      typeId: w.typeId,
      source: w.source ?? 'drawn',
    });
  });
}

export function updateWall(
  d: PlanDataV2, id: string,
  patch: Partial<Pick<WallEntity, 'a' | 'b' | 'typeId' | 'locked'>>,
): PlanDataV2 {
  return produce(d, (draft) => {
    const wall = draft.walls.find((x) => x.id === id);
    if (!wall) return;
    if (patch.a) wall.a = { x: patch.a.x, y: patch.a.y };
    if (patch.b) wall.b = { x: patch.b.x, y: patch.b.y };
    if ('typeId' in patch) wall.typeId = patch.typeId ?? null;
    if ('locked' in patch) wall.locked = patch.locked;
  });
}

export function setWallType(d: PlanDataV2, id: string, typeId: string | null): PlanDataV2 {
  return updateWall(d, id, { typeId });
}

export function moveWallEnd(d: PlanDataV2, id: string, end: 'a' | 'b', pt: Pt): PlanDataV2 {
  return produce(d, (draft) => {
    const wall = draft.walls.find((x) => x.id === id);
    if (!wall) return;
    wall[end] = { x: pt.x, y: pt.y };
  });
}

export function deleteWall(d: PlanDataV2, id: string): PlanDataV2 {
  return produce(d, (draft) => {
    draft.walls = draft.walls.filter((w) => w.id !== id);
    draft.openings = draft.openings.filter((o) => o.wallId !== id);
  });
}

export function addOpening(d: PlanDataV2, o: NewOpening): PlanDataV2 {
  const t0 = Math.min(o.t0, o.t1);
  const t1 = Math.max(o.t0, o.t1);
  return produce(d, (draft) => {
    draft.openings.push({
      id: newId('o'),
      wallId: o.wallId,
      t0, t1,
      modelId: null,
      kind: o.kind,
      sillM: o.sillM,
      heightM: o.heightM,
      swing: null,
    });
  });
}

export function deleteOpening(d: PlanDataV2, id: string): PlanDataV2 {
  return produce(d, (draft) => {
    draft.openings = draft.openings.filter((o) => o.id !== id);
  });
}

// ── Selectors ──
export const wallById = (d: PlanDataV2, id: string): WallEntity | undefined =>
  d.walls.find((w) => w.id === id);

export const openingsOfWall = (d: PlanDataV2, wallId: string): OpeningEntity[] =>
  d.openings.filter((o) => o.wallId === wallId);

export const takeoff = (d: PlanDataV2) => roomTakeoffV2(d);
