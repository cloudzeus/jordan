import { produce, type Draft } from 'immer';
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
/** Μοναδικό id οντότητας editor: επόμ (epoch) + αύξων μετρητής — μοναδικό ανά διεργασία
 *  (ο `seq` είναι μονότονος· το `Date.now()` κρατά τα id μοναδικά και μεταξύ συνεδριών). */
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

type D = Draft<PlanDataV2>;

// ── Recipes: ΜΕΤΑΒΑΛΛΟΥΝ ένα draft επί τόπου (void). Κοινά μεταξύ του καθαρού API (κάτω) και
//    του store, ώστε το immer να παράγει κοκκώδη (granular) patches αντί για στιγμιότυπο ρίζας. ──

export function addWallRecipe(d: D, w: NewWall): void {
  d.walls.push({
    id: newId('w'),
    a: { x: w.a.x, y: w.a.y },
    b: { x: w.b.x, y: w.b.y },
    typeId: w.typeId,
    source: w.source ?? 'drawn',
  });
}

export function updateWallRecipe(
  d: D, id: string,
  patch: Partial<Pick<WallEntity, 'a' | 'b' | 'typeId' | 'locked'>>,
): void {
  const wall = d.walls.find((x) => x.id === id);
  if (!wall) return;
  if (patch.a) wall.a = { x: patch.a.x, y: patch.a.y };
  if (patch.b) wall.b = { x: patch.b.x, y: patch.b.y };
  if ('typeId' in patch) wall.typeId = patch.typeId ?? null;
  if ('locked' in patch) wall.locked = patch.locked;
}

export function setWallTypeRecipe(d: D, id: string, typeId: string | null): void {
  updateWallRecipe(d, id, { typeId });
}

export function moveWallEndRecipe(d: D, id: string, end: 'a' | 'b', pt: Pt): void {
  const wall = d.walls.find((x) => x.id === id);
  if (!wall) return;
  wall[end] = { x: pt.x, y: pt.y };
}

export function deleteWallRecipe(d: D, id: string): void {
  const wi = d.walls.findIndex((w) => w.id === id);
  if (wi >= 0) d.walls.splice(wi, 1);
  for (let i = d.openings.length - 1; i >= 0; i--) {
    if (d.openings[i].wallId === id) d.openings.splice(i, 1);
  }
}

export function addOpeningRecipe(d: D, o: NewOpening): void {
  d.openings.push({
    id: newId('o'),
    wallId: o.wallId,
    t0: Math.min(o.t0, o.t1),
    t1: Math.max(o.t0, o.t1),
    modelId: null,
    kind: o.kind,
    sillM: o.sillM,
    heightM: o.heightM,
    swing: null,
  });
}

export function deleteOpeningRecipe(d: D, id: string): void {
  const i = d.openings.findIndex((o) => o.id === id);
  if (i >= 0) d.openings.splice(i, 1);
}

// ── Καθαρό API: PlanDataV2 → PlanDataV2 μέσω immer· δεν αλλάζει την είσοδο. ──
export const addWall = (d: PlanDataV2, w: NewWall): PlanDataV2 => produce(d, (dr) => { addWallRecipe(dr, w); });
export const updateWall = (
  d: PlanDataV2, id: string, patch: Partial<Pick<WallEntity, 'a' | 'b' | 'typeId' | 'locked'>>,
): PlanDataV2 => produce(d, (dr) => { updateWallRecipe(dr, id, patch); });
export const setWallType = (d: PlanDataV2, id: string, typeId: string | null): PlanDataV2 =>
  produce(d, (dr) => { setWallTypeRecipe(dr, id, typeId); });
export const moveWallEnd = (d: PlanDataV2, id: string, end: 'a' | 'b', pt: Pt): PlanDataV2 =>
  produce(d, (dr) => { moveWallEndRecipe(dr, id, end, pt); });
export const deleteWall = (d: PlanDataV2, id: string): PlanDataV2 => produce(d, (dr) => { deleteWallRecipe(dr, id); });
export const addOpening = (d: PlanDataV2, o: NewOpening): PlanDataV2 => produce(d, (dr) => { addOpeningRecipe(dr, o); });
export const deleteOpening = (d: PlanDataV2, id: string): PlanDataV2 => produce(d, (dr) => { deleteOpeningRecipe(dr, id); });

// ── Selectors ──
export const wallById = (d: PlanDataV2, id: string): WallEntity | undefined =>
  d.walls.find((w) => w.id === id);

export const openingsOfWall = (d: PlanDataV2, wallId: string): OpeningEntity[] =>
  d.openings.filter((o) => o.wallId === wallId);

export const takeoff = (d: PlanDataV2) => roomTakeoffV2(d);
