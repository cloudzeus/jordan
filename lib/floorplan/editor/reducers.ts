import { produce, type Draft } from 'immer';
import { z } from 'zod';
import {
  wallEntity, openingEntity, columnEntity, roomTakeoffV2,
  type PlanDataV2,
} from '@/lib/floorplan/saved';

export type Pt = { x: number; y: number };
export type WallEntity = z.infer<typeof wallEntity>;
export type OpeningEntity = z.infer<typeof openingEntity>;
export type ColumnEntity = z.infer<typeof columnEntity>;

export type NewWall = { a: Pt; b: Pt; typeId: string | null; source?: 'auto' | 'cad' | 'drawn' };
export type NewOpening = {
  wallId: string; t0: number; t1: number;
  kind: OpeningEntity['kind']; sillM: number; heightM: number;
};
export type NewColumn = {
  center: Pt; widthM: number; depthM: number; rotationDeg?: number; heightM?: number; typeId?: string | null;
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

export function moveWallRecipe(d: D, id: string, delta: Pt): void {
  const wall = d.walls.find((w) => w.id === id);
  if (!wall) return;
  wall.a.x += delta.x; wall.a.y += delta.y;
  wall.b.x += delta.x; wall.b.y += delta.y;
}

export function splitWallRecipe(d: D, id: string, at: Pt): void {
  const i = d.walls.findIndex((w) => w.id === id);
  if (i < 0) return;
  const w = d.walls[i];
  const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return;
  let t = ((at.x - w.a.x) * dx + (at.y - w.a.y) * dy) / L2;
  t = Math.max(0.02, Math.min(0.98, t));
  const mid: Pt = { x: w.a.x + t * dx, y: w.a.y + t * dy };
  const w2: WallEntity = {
    id: newId('w'), a: { x: mid.x, y: mid.y }, b: { x: w.b.x, y: w.b.y },
    typeId: w.typeId, source: w.source, locked: w.locked,
  };
  w.b = { x: mid.x, y: mid.y };
  d.walls.splice(i + 1, 0, w2);
  // μετακινούμε τα openings στον κατάλληλο από τους δύο τοίχους
  for (const o of d.openings) {
    if (o.wallId !== id) continue;
    if (o.t0 >= t) { o.wallId = w2.id; o.t0 = (o.t0 - t) / (1 - t); o.t1 = (o.t1 - t) / (1 - t); }
    else { o.t1 = Math.min(o.t1, t) / t; }
  }
}

export function mergeWallsRecipe(d: D, idA: string, idB: string): void {
  const a = d.walls.find((w) => w.id === idA);
  const b = d.walls.find((w) => w.id === idB);
  if (!a || !b || a.id === b.id) return;
  // πρέπει να είναι συνεχόμενοι και συνευθυγράμμιοι
  const tol = 0.02; // m
  const collinear = Math.abs((a.b.x - a.a.x) * (b.b.y - b.a.y) - (a.b.y - a.a.y) * (b.b.x - b.a.x)) < tol;
  if (!collinear) return;
  const shareA = Math.hypot(a.b.x - b.a.x, a.b.y - b.a.y) < tol;
  const shareB = Math.hypot(a.b.x - b.b.x, a.b.y - b.b.y) < tol;
  const shareC = Math.hypot(a.a.x - b.a.x, a.a.y - b.a.y) < tol;
  const shareD = Math.hypot(a.a.x - b.b.x, a.a.y - b.b.y) < tol;
  if (!shareA && !shareB && !shareC && !shareD) return;
  const pts = [a.a, a.b, b.a, b.b];
  const t = (p: Pt) => {
    const dx = a.b.x - a.a.x, dy = a.b.y - a.a.y, L2 = dx * dx + dy * dy || 1;
    return ((p.x - a.a.x) * dx + (p.y - a.a.y) * dy) / L2;
  };
  pts.sort((p, q) => t(p) - t(q));
  a.a = { x: pts[0].x, y: pts[0].y };
  a.b = { x: pts[3].x, y: pts[3].y };
  const bi = d.walls.findIndex((w) => w.id === idB);
  if (bi >= 0) d.walls.splice(bi, 1);
  for (const o of d.openings) {
    if (o.wallId === idB) o.wallId = idA;
  }
}

export function addColumnRecipe(d: D, c: NewColumn): void {
  d.columns.push({
    id: newId('c'),
    center: { x: c.center.x, y: c.center.y },
    widthM: c.widthM,
    depthM: c.depthM,
    rotationDeg: c.rotationDeg ?? 0,
    heightM: c.heightM ?? 2.8,
    typeId: c.typeId ?? null,
  });
}

export function updateColumnRecipe(d: D, id: string, patch: Partial<Pick<ColumnEntity, 'center' | 'widthM' | 'depthM' | 'rotationDeg' | 'heightM' | 'typeId'>>): void {
  const c = d.columns.find((x) => x.id === id);
  if (!c) return;
  if (patch.center) c.center = { x: patch.center.x, y: patch.center.y };
  if (patch.widthM != null) c.widthM = patch.widthM;
  if (patch.depthM != null) c.depthM = patch.depthM;
  if (patch.rotationDeg != null) c.rotationDeg = patch.rotationDeg;
  if (patch.heightM != null) c.heightM = patch.heightM;
  if ('typeId' in patch) c.typeId = patch.typeId ?? null;
}

export function deleteColumnRecipe(d: D, id: string): void {
  const i = d.columns.findIndex((c) => c.id === id);
  if (i >= 0) d.columns.splice(i, 1);
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

export function updateOpeningRecipe(d: D, id: string, patch: Partial<Pick<OpeningEntity, 't0' | 't1' | 'kind' | 'sillM' | 'heightM' | 'swing'>>): void {
  const o = d.openings.find((x) => x.id === id);
  if (!o) return;
  if (patch.t0 != null) o.t0 = patch.t0;
  if (patch.t1 != null) o.t1 = patch.t1;
  if (patch.kind != null) o.kind = patch.kind;
  if (patch.sillM != null) o.sillM = patch.sillM;
  if (patch.heightM != null) o.heightM = patch.heightM;
  if (patch.swing != null) o.swing = patch.swing;
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
export const moveWall = (d: PlanDataV2, id: string, delta: Pt): PlanDataV2 =>
  produce(d, (dr) => { moveWallRecipe(dr, id, delta); });
export const splitWall = (d: PlanDataV2, id: string, at: Pt): PlanDataV2 =>
  produce(d, (dr) => { splitWallRecipe(dr, id, at); });
export const mergeWalls = (d: PlanDataV2, idA: string, idB: string): PlanDataV2 =>
  produce(d, (dr) => { mergeWallsRecipe(dr, idA, idB); });
export const deleteWall = (d: PlanDataV2, id: string): PlanDataV2 => produce(d, (dr) => { deleteWallRecipe(dr, id); });
export const addOpening = (d: PlanDataV2, o: NewOpening): PlanDataV2 => produce(d, (dr) => { addOpeningRecipe(dr, o); });
export const updateOpening = (d: PlanDataV2, id: string, patch: Partial<Pick<OpeningEntity, 't0' | 't1' | 'kind' | 'sillM' | 'heightM' | 'swing'>>): PlanDataV2 =>
  produce(d, (dr) => { updateOpeningRecipe(dr, id, patch); });
export const deleteOpening = (d: PlanDataV2, id: string): PlanDataV2 => produce(d, (dr) => { deleteOpeningRecipe(dr, id); });
export const addColumn = (d: PlanDataV2, c: NewColumn): PlanDataV2 => produce(d, (dr) => { addColumnRecipe(dr, c); });
export const updateColumn = (d: PlanDataV2, id: string, patch: Partial<Pick<ColumnEntity, 'center' | 'widthM' | 'depthM' | 'rotationDeg' | 'heightM' | 'typeId'>>): PlanDataV2 =>
  produce(d, (dr) => { updateColumnRecipe(dr, id, patch); });
export const deleteColumn = (d: PlanDataV2, id: string): PlanDataV2 => produce(d, (dr) => { deleteColumnRecipe(dr, id); });

// ── Selectors ──
export const wallById = (d: PlanDataV2, id: string): WallEntity | undefined =>
  d.walls.find((w) => w.id === id);

export const openingsOfWall = (d: PlanDataV2, wallId: string): OpeningEntity[] =>
  d.openings.filter((o) => o.wallId === wallId);

export const columnById = (d: PlanDataV2, id: string): ColumnEntity | undefined =>
  d.columns.find((c) => c.id === id);

export const takeoff = (d: PlanDataV2) => roomTakeoffV2(d);
