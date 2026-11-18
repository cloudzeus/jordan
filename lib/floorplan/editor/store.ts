import { createStore, type StoreApi } from 'zustand/vanilla';
import { enablePatches, produceWithPatches, applyPatches, type Patch, type Draft } from 'immer';
import type { PlanDataV2 } from '@/lib/floorplan/saved';
import {
  addWallRecipe, updateWallRecipe, setWallTypeRecipe,
  moveWallEndRecipe, deleteWallRecipe,
  moveWallRecipe, splitWallRecipe, mergeWallsRecipe,
  addOpeningRecipe, deleteOpeningRecipe, updateOpeningRecipe,
  addColumnRecipe, updateColumnRecipe, deleteColumnRecipe,
  type NewWall, type NewOpening, type NewColumn, type Pt, type WallEntity,
} from './reducers';

enablePatches();

export const TOOL_KEYS = [
  'select', 'pan', 'wall', 'partition', 'room', 'opening',
  'element', 'dimension', 'scale', 'note', 'pin', 'network', 'erase',
] as const;
export type ToolKey = (typeof TOOL_KEYS)[number];

export const HISTORY_LIMIT = 200;

export type Selection = { kind: 'wall' | 'opening' | 'column' | 'room' | 'device' | null; id: string | null };

export type EditorState = {
  data: PlanDataV2;
  activeTool: ToolKey;
  selection: Selection;
  /** Πολλαπλή επιλογή τοίχων (ορθογώνια επιλογή)· μονή επιλογή → [id]. */
  selectedWallIds: string[];
  /** Πολλαπλή επιλογή κολωνών. */
  selectedColumnIds: string[];
  activeWallTypeId: string | null;
  canUndo: boolean;
  canRedo: boolean;
};

export type EditorActions = {
  setTool(t: ToolKey): void;
  select(s: Selection): void;
  selectWalls(ids: string[]): void;
  selectColumns(ids: string[]): void;
  setWallTypeMany(ids: string[], typeId: string | null): void;
  setActiveWallType(id: string | null): void;
  addWall(w: NewWall): void;
  addWalls(ws: NewWall[]): void;
  updateWall(id: string, patch: Partial<Pick<WallEntity, 'a' | 'b' | 'typeId' | 'locked'>>): void;
  setWallType(id: string, typeId: string | null): void;
  moveWallEnd(id: string, end: 'a' | 'b', pt: Pt): void;
  moveWall(id: string, delta: Pt): void;
  splitWall(id: string, at: Pt): void;
  mergeWalls(idA: string, idB: string): void;
  deleteWall(id: string): void;
  addOpening(o: NewOpening): void;
  updateOpening(id: string, patch: Partial<Pick<import('./reducers').OpeningEntity, 't0' | 't1' | 'kind' | 'sillM' | 'heightM' | 'swing'>>): void;
  deleteOpening(id: string): void;
  addColumn(c: NewColumn): void;
  updateColumn(id: string, patch: Partial<Pick<import('./reducers').ColumnEntity, 'center' | 'widthM' | 'depthM' | 'rotationDeg' | 'heightM' | 'typeId'>>): void;
  deleteColumn(id: string): void;
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
    /** Τρέχει ένα mutating recipe επί του draft· το immer παράγει κοκκώδη patches για undo/redo. */
    const commit = (recipe: (draft: Draft<PlanDataV2>) => void) => {
      const [next, patches, inverse] = produceWithPatches(get().data, recipe);
      if (patches.length === 0) return; // no-op: καμία αλλαγή, κανένα βήμα
      past.push({ patches, inverse });
      if (past.length > HISTORY_LIMIT) past.shift();
      future.length = 0;
      set({ data: next, canUndo: past.length > 0, canRedo: false });
    };

    return {
      data: initial,
      activeTool: 'select',
      selection: { kind: null, id: null },
      selectedWallIds: [],
      selectedColumnIds: [],
      activeWallTypeId: null,
      canUndo: false,
      canRedo: false,

      setTool: (t) => set({ activeTool: t }),
      select: (s) => set({
        selection: s,
        selectedWallIds: s.kind === 'wall' && s.id ? [s.id] : [],
        selectedColumnIds: s.kind === 'column' && s.id ? [s.id] : [],
      }),
      selectWalls: (ids) => set({
        selectedWallIds: ids,
        selectedColumnIds: [],
        selection: ids.length === 1 ? { kind: 'wall', id: ids[0] } : { kind: null, id: null },
      }),
      selectColumns: (ids) => set({
        selectedColumnIds: ids,
        selectedWallIds: [],
        selection: ids.length === 1 ? { kind: 'column', id: ids[0] } : { kind: null, id: null },
      }),
      setWallTypeMany: (ids, typeId) => commit((d) => { for (const id of ids) setWallTypeRecipe(d, id, typeId); }),
      setActiveWallType: (id) => set({ activeWallTypeId: id }),

      addWall: (w) => commit((d) => addWallRecipe(d, w)),
      addWalls: (ws) => commit((d) => { for (const w of ws) addWallRecipe(d, w); }),
      updateWall: (id, patch) => commit((d) => updateWallRecipe(d, id, patch)),
      setWallType: (id, typeId) => commit((d) => setWallTypeRecipe(d, id, typeId)),
      moveWallEnd: (id, end, pt) => commit((d) => moveWallEndRecipe(d, id, end, pt)),
      moveWall: (id, delta) => commit((d) => moveWallRecipe(d, id, delta)),
      splitWall: (id, at) => commit((d) => splitWallRecipe(d, id, at)),
      mergeWalls: (idA, idB) => commit((d) => mergeWallsRecipe(d, idA, idB)),
      deleteWall: (id) => commit((d) => deleteWallRecipe(d, id)),
      addOpening: (o) => commit((d) => addOpeningRecipe(d, o)),
      updateOpening: (id, patch) => commit((d) => updateOpeningRecipe(d, id, patch)),
      deleteOpening: (id) => commit((d) => deleteOpeningRecipe(d, id)),
      addColumn: (c) => commit((d) => addColumnRecipe(d, c)),
      updateColumn: (id, patch) => commit((d) => updateColumnRecipe(d, id, patch)),
      deleteColumn: (id) => commit((d) => deleteColumnRecipe(d, id)),

      load: (d) => {
        past.length = 0;
        future.length = 0;
        set({ data: d, canUndo: false, canRedo: false, selection: { kind: null, id: null }, selectedWallIds: [], selectedColumnIds: [] });
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
