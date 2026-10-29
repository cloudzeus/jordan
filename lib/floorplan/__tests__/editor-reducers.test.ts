import { describe, it, expect } from 'vitest';
import { planDataV2, type PlanDataV2 } from '@/lib/floorplan/saved';
import {
  addWall, updateWall, setWallType, moveWallEnd, deleteWall,
  addOpening, deleteOpening, wallById, openingsOfWall, takeoff,
} from '@/lib/floorplan/editor/reducers';

function base(): PlanDataV2 {
  return planDataV2.parse({ v: 2, underlay: null, rooms: [] });
}

describe('editor reducers', () => {
  it('addWall appends a wall with a new id and source drawn', () => {
    const d = base();
    const out = addWall(d, { a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, typeId: null });
    expect(out.walls).toHaveLength(1);
    expect(out.walls[0].source).toBe('drawn');
    expect(out.walls[0].id).toBeTruthy();
    expect(planDataV2.safeParse(out).success).toBe(true);
  });

  it('addWall does not mutate the input', () => {
    const d = base();
    const snapshot = JSON.stringify(d);
    addWall(d, { a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, typeId: 'w1' });
    expect(JSON.stringify(d)).toBe(snapshot);
    expect(d.walls).toHaveLength(0);
  });

  it('setWallType changes only the targeted wall', () => {
    let d = addWall(base(), { a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, typeId: null });
    d = addWall(d, { a: { x: 3, y: 0 }, b: { x: 3, y: 3 }, typeId: null });
    const targetId = d.walls[0].id;
    const out = setWallType(d, targetId, 'brick-25');
    expect(out.walls[0].typeId).toBe('brick-25');
    expect(out.walls[1].typeId).toBeNull();
  });

  it('updateWall patches a/b/typeId/locked', () => {
    const d = addWall(base(), { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, typeId: null });
    const id = d.walls[0].id;
    const out = updateWall(d, id, { b: { x: 5, y: 0 }, locked: true });
    expect(out.walls[0].b).toEqual({ x: 5, y: 0 });
    expect(out.walls[0].locked).toBe(true);
    expect(out.walls[0].a).toEqual({ x: 0, y: 0 });
  });

  it('moveWallEnd moves the chosen endpoint', () => {
    const d = addWall(base(), { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, typeId: null });
    const id = d.walls[0].id;
    const out = moveWallEnd(d, id, 'a', { x: -2, y: -2 });
    expect(out.walls[0].a).toEqual({ x: -2, y: -2 });
    expect(out.walls[0].b).toEqual({ x: 1, y: 0 });
  });

  it('deleteWall removes the wall AND its openings', () => {
    let d = addWall(base(), { a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, typeId: null });
    const wallId = d.walls[0].id;
    d = addOpening(d, { wallId, t0: 0.2, t1: 0.4, kind: 'door', sillM: 0, heightM: 2.1 });
    expect(d.openings).toHaveLength(1);
    const out = deleteWall(d, wallId);
    expect(out.walls).toHaveLength(0);
    expect(out.openings).toHaveLength(0);
    expect(planDataV2.safeParse(out).success).toBe(true);
  });

  it('addOpening normalizes t0>t1 to t0=min,t1=max', () => {
    const d = addWall(base(), { a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, typeId: null });
    const wallId = d.walls[0].id;
    const out = addOpening(d, { wallId, t0: 0.6, t1: 0.2, kind: 'window', sillM: 0.9, heightM: 1.2 });
    expect(out.openings[0].t0).toBe(0.2);
    expect(out.openings[0].t1).toBe(0.6);
    expect(planDataV2.safeParse(out).success).toBe(true);
  });

  it('deleteOpening removes only that opening', () => {
    const d0 = addWall(base(), { a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, typeId: null });
    const wallId = d0.walls[0].id;
    let d = addOpening(d0, { wallId, t0: 0.1, t1: 0.2, kind: 'door', sillM: 0, heightM: 2.1 });
    d = addOpening(d, { wallId, t0: 0.5, t1: 0.6, kind: 'window', sillM: 0.9, heightM: 1.2 });
    const keep = d.openings[1].id;
    const out = deleteOpening(d, d.openings[0].id);
    expect(out.openings).toHaveLength(1);
    expect(out.openings[0].id).toBe(keep);
  });

  it('selectors wallById / openingsOfWall / takeoff', () => {
    const d0 = addWall(base(), { a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, typeId: null });
    const wallId = d0.walls[0].id;
    const d = addOpening(d0, { wallId, t0: 0.1, t1: 0.2, kind: 'door', sillM: 0, heightM: 2.1 });
    expect(wallById(d, wallId)?.id).toBe(wallId);
    expect(wallById(d, 'nope')).toBeUndefined();
    expect(openingsOfWall(d, wallId)).toHaveLength(1);
    expect(takeoff(d)).toEqual({ floorM2: 0, wallsM2: 0 });
  });
});
