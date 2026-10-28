# Κατόψεις v2 · Plan 04b — Editor store + reducers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ένα καθαρό, ελεγμένο state engine για τον v2 editor: zustand store πάνω σε `planData v2`, με τοίχους/ανοίγματα ως **επιλέξιμες οντότητες**, καθαρούς reducers, selectors και **undo/redo** (immer patches). Θεμέλιο που το 04c (εργαλεία) και 04d (snapping) θα συνδέσουν με το UI.

**Architecture:** Καθαροί reducers σε `lib/floorplan/editor/reducers.ts` (συναρτήσεις `PlanDataV2 → PlanDataV2`, μέσω immer `produce`), με vitest. Ο zustand store (`editor/store.ts`) τους τυλίγει με `produceWithPatches` για undo/redo. **Καμία αλλαγή UI** σε αυτό το plan — ο v2 editor του 04a μένει ως έχει· η σύνδεση store↔canvas είναι το πρώτο βήμα του 04c.

**Tech Stack:** TypeScript, zustand 5, immer 11, vitest.

**Spec:** roadmap `…-00-roadmap.md` (§Plan 04 υπο-plans) + planData v2 (Plan 02: `planDataV2`, `wallEntity`, `openingEntity`, `roomTakeoffV2` στο `lib/floorplan/saved.ts`). Προαπαιτούμενο: Plan 02.

## Global Constraints

- Git: commit + push στο `master`. Πριν push: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors), `npm audit` (0 high/critical).
- Νέες εξαρτήσεις στην **τελευταία σταθερή** (`npm view … version`): zustand (5.x), immer (11.x). `npm audit` καθαρό μετά.
- Καθαρή λογική σε `lib/floorplan/editor/`, tests κάτω από `lib/**`. Χωρίς DOM.
- Οι reducers είναι **καθαροί** (δεν mutate-άρουν την είσοδο): επιστρέφουν νέο `PlanDataV2` μέσω immer. Κάθε αποτέλεσμα περνά `planDataV2.safeParse` (έγκυρο v2).

## Decisions

1. **Plan 04b = state engine, όχι UI.** Ο v2 editor (04a) δεν συνδέεται ακόμη με το store — αυτό γίνεται στο 04c (πρώτο task: render `walls[]` + σχεδίαση/επιλογή μέσω store). Έτσι το 04b είναι πλήρως ελεγμένο με vitest, μηδέν ρίσκο στο ζωντανό.
2. **Undo/redo με immer patches** (enablePatches), όριο 200 βήματα· κάθε action = ένα βήμα. `load()` καθαρίζει το ιστορικό.
3. **Διαγραφή τοίχου σβήνει και τα ανοίγματά του** (openings με `wallId` == id) — αλλιώς μένουν ορφανά.
4. **ToolKey** ορίζεται εδώ (set εργαλείων) + `activeTool` στο store· το interface των handlers (onPointerDown…) είναι UI → 04c.

## Review Focus

- **Immutability:** ένας reducer ΔΕΝ αλλάζει την είσοδο (`Object.isFrozen` / deep-equal του αρχικού μετά την κλήση) (Task 2).
- **Ορφανά openings:** `deleteWall` αφαιρεί και τα openings του τοίχου (Task 2).
- **Έγκυρη έξοδος:** κάθε reducer output περνά `planDataV2.safeParse` — π.χ. `addOpening` με `t0>t1` απορρίπτεται/κανονικοποιείται (Task 2).
- **Undo σε κενό ιστορικό:** `undo()`/`redo()` χωρίς βήματα = no-op, όχι crash· redo καθαρίζεται μετά από νέο action (Task 3).
- **Όριο ιστορικού:** πάνω από 200 βήματα, τα παλαιότερα πέφτουν (δεν μεγαλώνει απεριόριστα η μνήμη) (Task 3).

---

### Task 1: Εξαρτήσεις

**Files:** Modify `package.json` (+ lockfile)

- [ ] **Step 1:** `npm install zustand immer` (τελευταίες σταθερές). **Step 2:** `npm audit` → 0 high/critical· `npx tsc --noEmit` καθαρό. **Step 3: Commit** `git commit -m "Κατόψεις v2: προσθήκη zustand + immer για τον v2 editor store"`.

---

### Task 2: Καθαροί reducers + selectors

**Files:** Create `lib/floorplan/editor/reducers.ts` · Test `lib/floorplan/__tests__/editor-reducers.test.ts`

**Interfaces:**
- Consumes: `PlanDataV2`, `planDataV2`, `wallEntity`, `openingEntity`, `roomTakeoffV2` (saved.ts).
- Produces (όλα καθαρά, `PlanDataV2 → PlanDataV2` εκτός των selectors):
  - `type NewWall = { a: Pt; b: Pt; typeId: string | null; source?: 'auto'|'cad'|'drawn' }`
  - `addWall(d, w: NewWall): PlanDataV2` (νέο `id`, default source `'drawn'`)
  - `updateWall(d, id, patch: Partial<Pick<WallEntity,'a'|'b'|'typeId'|'locked'>>): PlanDataV2`
  - `setWallType(d, id, typeId: string | null): PlanDataV2`
  - `moveWallEnd(d, id, end: 'a'|'b', pt: Pt): PlanDataV2`
  - `deleteWall(d, id): PlanDataV2` (+ openings με `wallId==id`)
  - `addOpening(d, o: { wallId; t0; t1; kind; sillM; heightM }): PlanDataV2` (κανονικοποιεί `t0=min,t1=max`)
  - `deleteOpening(d, id): PlanDataV2`
  - selectors: `wallById(d, id): WallEntity | undefined`, `openingsOfWall(d, wallId): OpeningEntity[]`, `takeoff(d) = roomTakeoffV2(d)`
  - `type WallEntity = z.infer<typeof wallEntity>` κ.λπ. (ή import από saved.ts αν εξαχθούν)

- [ ] **Step 1: Failing test** — ξεκίνα από `upgradePlanData(baseV1)` ή ένα minimal `planDataV2.parse({v:2,underlay:null,rooms:[]})`:
  - `addWall` προσθέτει έναν τοίχο με νέο id, source 'drawn'· output περνά `planDataV2.safeParse`.
  - `setWallType` αλλάζει μόνο το `typeId` του στοχευμένου τοίχου.
  - `deleteWall` αφαιρεί τον τοίχο ΚΑΙ τα openings του (πρόσθεσε opening σε αυτόν πρώτα).
  - `addOpening` με `{t0:0.6,t1:0.2}` → αποθηκεύει `t0:0.2,t1:0.6`.
  - **immutability:** η είσοδος `d` μένει αμετάβλητη μετά από `addWall(d,…)` (deep-equal με αντίγραφο).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** με immer `produce`. **Step 4: Run** → PASS. **Step 5: Commit**.

---

### Task 3: zustand store + undo/redo

**Files:** Create `lib/floorplan/editor/store.ts` · Test `lib/floorplan/__tests__/editor-store.test.ts`

**Interfaces:**
- `const TOOL_KEYS = ['select','pan','wall','partition','room','opening','element','dimension','scale','note','pin','network','erase'] as const; type ToolKey = (typeof TOOL_KEYS)[number]`
- `type Selection = { kind: 'wall'|'opening'|'room'|'device'|null; id: string | null }`
- `type EditorState = { data: PlanDataV2; activeTool: ToolKey; selection: Selection; activeWallTypeId: string | null; canUndo: boolean; canRedo: boolean }`
- `type EditorActions = { setTool(t); select(s); setActiveWallType(id); addWall(w); updateWall(id,patch); setWallType(id,typeId); moveWallEnd(id,end,pt); deleteWall(id); addOpening(o); deleteOpening(id); load(d: PlanDataV2); undo(); redo() }`
- `createEditorStore(initial: PlanDataV2): StoreApi<EditorState & EditorActions>` (vanilla zustand `createStore` — όχι React hook, για testability· το React binding έρχεται στο 04c)

- [ ] **Step 1: Failing test** `editor-store.test.ts`:
  - `addWall` αυξάνει `data.walls` κατά 1 και `canUndo` γίνεται true· `undo()` επαναφέρει (0 walls, `canRedo` true)· `redo()` ξαναβάζει τον τοίχο.
  - `undo()` σε κενό ιστορικό = no-op (καμία αλλαγή, χωρίς exception).
  - νέο action μετά από `undo()` καθαρίζει το `future` (`canRedo` false).
  - `load(d2)` αντικαθιστά τα δεδομένα και μηδενίζει το ιστορικό (`canUndo=false`).
  - πάνω από 200 actions → το ιστορικό δεν ξεπερνά 200 (undo φτάνει ως εκεί, όχι άπειρα).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — immer `enablePatches` + `produceWithPatches(state.data, draft => { apply reducer })`· κράτα `past: Patch[][]`, `future: Patch[][]` (inverse/forward), όριο 200. Τα mutating actions καλούν τους reducers του Task 2 μέσα στον producer (ή εφαρμόζουν την ίδια αλλαγή). **Step 4: Run** → PASS. **Step 5: Commit**.

---

### Task 4: Πράσινη πύλη

- [ ] `npx tsc --noEmit` 0 · `npm test` πράσινο · `npm run lint` 0 errors · `npm audit` 0 high/critical · `git push origin master` (με έγκριση χρήστη).
