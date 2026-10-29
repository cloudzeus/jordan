import { describe, it, expect, beforeAll } from 'vitest';
import { produceWithPatches, enablePatches } from 'immer';
import { planDataV2, type PlanDataV2 } from '@/lib/floorplan/saved';
import { addWall, addOpening, addWallRecipe, deleteWallRecipe } from '@/lib/floorplan/editor/reducers';

beforeAll(() => enablePatches());

function base(): PlanDataV2 {
  return planDataV2.parse({ v: 2, underlay: null, rooms: [] });
}

// Το ιστορικό undo/redo πρέπει να κρατά ΚΟΚΚΩΔΗ (granular) patches — όχι ολόκληρο στιγμιότυπο
// της κάτοψης ανά βήμα (αλλιώς σε κατόψεις CAD κοντά στα caps η μνήμη εκτινάσσεται).
describe('editor recipes emit granular immer patches', () => {
  it('addWallRecipe emits a scoped patch, never a whole-root replace', () => {
    const [, patches] = produceWithPatches(base(), (draft) => {
      addWallRecipe(draft, { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, typeId: null });
    });
    expect(patches.length).toBeGreaterThan(0);
    for (const p of patches) expect(p.path.length).toBeGreaterThan(0);
  });

  it('deleteWallRecipe removes wall + its openings with element-level patches', () => {
    let d = addWall(base(), { a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, typeId: null });
    const id = d.walls[0].id;
    d = addOpening(d, { wallId: id, t0: 0.2, t1: 0.4, kind: 'door', sillM: 0, heightM: 2.1 });
    const [next, patches] = produceWithPatches(d, (draft) => { deleteWallRecipe(draft, id); });
    expect(patches.length).toBeGreaterThan(0);
    for (const p of patches) expect(p.path.length).toBeGreaterThan(0);
    expect(next.walls).toHaveLength(0);
    expect(next.openings).toHaveLength(0);
  });
});
