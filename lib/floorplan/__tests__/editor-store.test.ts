import { describe, it, expect } from 'vitest';
import { planDataV2, type PlanDataV2 } from '@/lib/floorplan/saved';
import { createEditorStore, TOOL_KEYS, HISTORY_LIMIT } from '@/lib/floorplan/editor/store';

function base(): PlanDataV2 {
  return planDataV2.parse({ v: 2, underlay: null, rooms: [] });
}
const seg = (n: number) => ({ a: { x: n, y: 0 }, b: { x: n + 1, y: 0 }, typeId: null });

describe('editor store', () => {
  it('addWall grows walls and enables undo; undo/redo round-trip', () => {
    const s = createEditorStore(base());
    s.getState().addWall(seg(0));
    expect(s.getState().data.walls).toHaveLength(1);
    expect(s.getState().canUndo).toBe(true);
    expect(s.getState().canRedo).toBe(false);

    s.getState().undo();
    expect(s.getState().data.walls).toHaveLength(0);
    expect(s.getState().canRedo).toBe(true);

    s.getState().redo();
    expect(s.getState().data.walls).toHaveLength(1);
  });

  it('undo on empty history is a no-op', () => {
    const s = createEditorStore(base());
    expect(() => s.getState().undo()).not.toThrow();
    expect(s.getState().data.walls).toHaveLength(0);
    expect(s.getState().canUndo).toBe(false);
  });

  it('a new action after undo clears the redo future', () => {
    const s = createEditorStore(base());
    s.getState().addWall(seg(0));
    s.getState().undo();
    expect(s.getState().canRedo).toBe(true);
    s.getState().addWall(seg(5));
    expect(s.getState().canRedo).toBe(false);
    expect(s.getState().data.walls).toHaveLength(1);
  });

  it('load replaces data and resets history', () => {
    const s = createEditorStore(base());
    s.getState().addWall(seg(0));
    const d2 = planDataV2.parse({ v: 2, underlay: null, rooms: [] });
    s.getState().load(d2);
    expect(s.getState().data.walls).toHaveLength(0);
    expect(s.getState().canUndo).toBe(false);
    expect(s.getState().canRedo).toBe(false);
  });

  it('history is capped at HISTORY_LIMIT', () => {
    const s = createEditorStore(base());
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) s.getState().addWall(seg(i));
    let undos = 0;
    while (s.getState().canUndo) { s.getState().undo(); undos++; if (undos > HISTORY_LIMIT + 100) break; }
    expect(undos).toBe(HISTORY_LIMIT);
  });

  it('setTool / select / setActiveWallType update ui state', () => {
    const s = createEditorStore(base());
    s.getState().setTool('wall');
    expect(s.getState().activeTool).toBe('wall');
    s.getState().setActiveWallType('brick-25');
    expect(s.getState().activeWallTypeId).toBe('brick-25');
    s.getState().addWall(seg(0));
    const id = s.getState().data.walls[0].id;
    s.getState().select({ kind: 'wall', id });
    expect(s.getState().selection).toEqual({ kind: 'wall', id });
    expect(TOOL_KEYS).toContain('wall');
  });

  it('addWalls adds many walls as ONE undoable step', () => {
    const s = createEditorStore(base());
    s.getState().addWalls([seg(0), seg(2), seg(4)]);
    expect(s.getState().data.walls).toHaveLength(3);
    expect(s.getState().canUndo).toBe(true);
    s.getState().undo();
    expect(s.getState().data.walls).toHaveLength(0); // single undo removes all three
  });

  it('addWalls with an empty array is a no-op (no undo step)', () => {
    const s = createEditorStore(base());
    s.getState().addWalls([]);
    expect(s.getState().data.walls).toHaveLength(0);
    expect(s.getState().canUndo).toBe(false);
  });

  it('selectWalls sets selectedWallIds; a single id also sets selection', () => {
    const s = createEditorStore(base());
    s.getState().selectWalls(['a', 'b']);
    expect(s.getState().selectedWallIds).toEqual(['a', 'b']);
    expect(s.getState().selection).toEqual({ kind: null, id: null });
    s.getState().selectWalls(['a']);
    expect(s.getState().selection).toEqual({ kind: 'wall', id: 'a' });
  });

  it('single select syncs selectedWallIds', () => {
    const s = createEditorStore(base());
    s.getState().select({ kind: 'wall', id: 'x' });
    expect(s.getState().selectedWallIds).toEqual(['x']);
    s.getState().select({ kind: null, id: null });
    expect(s.getState().selectedWallIds).toEqual([]);
  });

  it('setWallTypeMany changes all given walls in ONE undo step', () => {
    const s = createEditorStore(base());
    s.getState().addWalls([seg(0), seg(2)]);
    const [id1, id2] = s.getState().data.walls.map((w) => w.id);
    s.getState().setWallTypeMany([id1, id2], 't');
    expect(s.getState().data.walls.every((w) => w.typeId === 't')).toBe(true);
    s.getState().undo();
    expect(s.getState().data.walls.every((w) => w.typeId === null)).toBe(true);
  });

  it('setWallTypeMany with an empty list is a no-op', () => {
    const s = createEditorStore(base());
    s.getState().addWall(seg(0));
    const before = s.getState().canUndo;
    s.getState().setWallTypeMany([], 't');
    // the only undo step is the addWall; no new step was pushed
    s.getState().undo();
    expect(before).toBe(true);
    expect(s.getState().data.walls).toHaveLength(0);
  });

  it('deleteWall removes wall and its openings as one undoable step', () => {
    const s = createEditorStore(base());
    s.getState().addWall(seg(0));
    const id = s.getState().data.walls[0].id;
    s.getState().addOpening({ wallId: id, t0: 0.2, t1: 0.4, kind: 'door', sillM: 0, heightM: 2.1 });
    s.getState().deleteWall(id);
    expect(s.getState().data.walls).toHaveLength(0);
    expect(s.getState().data.openings).toHaveLength(0);
    s.getState().undo();
    expect(s.getState().data.walls).toHaveLength(1);
    expect(s.getState().data.openings).toHaveLength(1);
  });
});
