import { createStore, type StoreApi } from 'zustand/vanilla';
import { enablePatches, produceWithPatches, applyPatches, type Patch } from 'immer';
import type { PlanDataV2 } from '@/lib/floorplan/saved';
import {
  addWall as rAddWall, updateWall as rUpdateWall, setWallType as rSetWallType,
  moveWallEnd as rMoveWallEnd, deleteWall as rDeleteWall,
  addOpening as rAddOpening, deleteOpening as rDeleteOpening,
  type NewWall, type NewOpening, type Pt, type WallEntity,
} from './reducers';

enablePatches();

export const TOOL_KEYS = [
  'select', 'pan', 'wall', 'partition', 'room', 'opening',
  'element', 'dimension', 'scale', 'note', 'pin', 'network', 'erase',
] as const;
export type ToolKey = (typeof TOOL_KEYS)[number];

export const HISTORY_LIMIT = 200;

export type Selection = { kind: 'wall' | 'opening' | 'room' | 'device' | null; id: string | null };

export type EditorState = {
  data: PlanDataV2;
  activeTool: ToolKey;
  selection: Selection;
  activeWallTypeId: string | null;
  canUndo: boolean;
  canRedo: boolean;
};

export type EditorActions = {
  setTool(t: ToolKey): void;
  select(s: Selection): void;
  setActiveWallType(id: string | null): void;
  addWall(w: NewWall): void;
  updateWall(id: string, patch: Partial<Pick<WallEntity, 'a' | 'b' | 'typeId' | 'locked'>>): void;
  setWallType(id: string, typeId: string | null): void;
  moveWallEnd(id: string, end: 'a' | 'b', pt: Pt): void;
  deleteWall(id: string): void;
  addOpening(o: NewOpening): void;
  deleteOpening(id: string): void;
  load(d: PlanDataV2): void;
  undo(): void;
  redo(): void;
};

export type EditorStore = EditorState & EditorActions;

type HistoryEntry = { patches: Patch[]; inverse: Patch[] };

export function createEditorStore(initial: PlanDataV2): StoreApi<EditorStore> {
  // Ιστορικό εκτός του store state — αλλάζει μαζί με κάθε mutating action.
  const past: HistoryEntry[] = [];
  const future: HistoryEntry[] = [];

  return createStore<EditorStore>((set, get) => {
    /** Τρέχει έναν reducer του Task 2, καταγράφει patches για undo/redo. */
    const commit = (reducer: (d: PlanDataV2) => PlanDataV2) => {
      const [next, patches, inverse] = produceWithPatches(get().data, (draft) => {
        // Οι reducers είναι καθαροί (επιστρέφουν νέο αντικείμενο)· ο producer υιοθετεί το αποτέλεσμα.
        return reducer(draft as PlanDataV2) as PlanDataV2;
      });
      if (patches.length === 0) return; // no-op: καμία αλλαγή, κανένα βήμα
      past.push({ patches, inverse });
      if (past.length > HISTORY_LIMIT) past.shift();
      future.length = 0;
      set({ data: next as PlanDataV2, canUndo: past.length > 0, canRedo: false });
    };

    return {
      data: initial,
      activeTool: 'select',
      selection: { kind: null, id: null },
      activeWallTypeId: null,
      canUndo: false,
      canRedo: false,

      setTool: (t) => set({ activeTool: t }),
      select: (s) => set({ selection: s }),
      setActiveWallType: (id) => set({ activeWallTypeId: id }),

      addWall: (w) => commit((d) => rAddWall(d, w)),
      updateWall: (id, patch) => commit((d) => rUpdateWall(d, id, patch)),
      setWallType: (id, typeId) => commit((d) => rSetWallType(d, id, typeId)),
      moveWallEnd: (id, end, pt) => commit((d) => rMoveWallEnd(d, id, end, pt)),
      deleteWall: (id) => commit((d) => rDeleteWall(d, id)),
      addOpening: (o) => commit((d) => rAddOpening(d, o)),
      deleteOpening: (id) => commit((d) => rDeleteOpening(d, id)),

      load: (d) => {
        past.length = 0;
        future.length = 0;
        set({ data: d, canUndo: false, canRedo: false, selection: { kind: null, id: null } });
      },

      undo: () => {
        const entry = past.pop();
        if (!entry) return;
        future.push(entry);
        const next = applyPatches(get().data, entry.inverse);
        set({ data: next, canUndo: past.length > 0, canRedo: true });
      },

      redo: () => {
        const entry = future.pop();
        if (!entry) return;
        past.push(entry);
        const next = applyPatches(get().data, entry.patches);
        set({ data: next, canUndo: true, canRedo: future.length > 0 });
      },
    };
  });
}
