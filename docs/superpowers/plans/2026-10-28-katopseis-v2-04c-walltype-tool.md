# Κατόψεις v2 · Plan 04c — Wall-type tool + αποδοχή auto-walls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ο v2 editor αποκτά **επιλέξιμο layer τοίχων** οδηγούμενο από το store του 04b: ο χρήστης επιλέγει τοίχο στον καμβά, αλλάζει τον **τύπο** του (εργαλείο «Τύπος τοίχου», hotkeys 1–9 + δεξί πάνελ), και **αποδέχεται** τους διανυσματικούς τοίχους που βγάζει το `vectorizeWalls` (Plan 03) ως v2 οντότητες.

**Architecture:** Όλη η λογική αλληλεπίδρασης μπαίνει **καθαρή** στο `lib/floorplan/editor/interactions.ts` (meters↔px, hit-test, px→v2, χρώματα καμβά), με vitest. Το DOM/React είναι λεπτό wiring: ο `PlanViewer` (THREE.js, px-space) αποκτά presentational prop `vectorWalls` για να ζωγραφίζει το layer· ο `FloorPlanDialog` — **μόνο στο μονοπάτι `editorV2`** — δημιουργεί ένα store instance (04b), το δένει στο React, και συνδέει επιλογή/τύπο/αποδοχή. Το flag-off μονοπάτι (σημερινός editor) μένει byte-ταυτόσημο. Το project ΔΕΝ έχει E2E infra → safety net = vitest στην καθαρή λογική + manual QA πίσω από flag (όπως 04a/04b, roadmap §Plan 04).

**Tech Stack:** TypeScript, zustand 5 (`useStore` React binding πάνω στο vanilla `StoreApi` του 04b), immer 11, THREE.js (υπάρχων `PlanViewer`), vitest.

**Spec:** roadmap `docs/superpowers/plans/2026-10-28-katopseis-v2-00-roadmap.md` (§Plan 04 → 04c: «Εργαλείο Τύπος τοίχου (1–9), επιλογή/αλλαγή τύπου ανά τοίχο στο δεξί πάνελ, preview/Αποδοχή τοίχων από vectorize»). UI contract: `docs/design/floorplan-editor-v2.html`. Προαπαιτούμενα: 04a (EditorShell + flag), 04b (store + reducers).

## Global Constraints

- Git: commit + push στο `master`. Πριν push: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors), `npm audit` (0 high/critical)· αλλαγές εμφάνισης με screenshots (manual QA πίσω από το flag).
- Καμία νέα εξάρτηση — zustand/immer ήδη μπήκαν στο 04b. Καθαρή λογική σε `lib/floorplan/editor/` χωρίς DOM· tests κάτω από `lib/**`.
- **Flag-off αμετάβλητο:** ό,τι προστίθεται ενεργοποιείται μόνο όταν `editorV2 === true`. Ο σημερινός editor (και οι 6 points που ανοίγουν το dialog) δεν αλλάζει συμπεριφορά.
- Admin UI: ενέργειες σε ⋮ dropdown όπου υπάρχουν· το δεξί πάνελ/τύποι είναι ήδη στο `EditorShell`.
- **Wiki:** το route `/admin/floorplans` υπάρχει ήδη· η wiki entry για τον v2 editor γράφεται όταν «κατέβει» το flag (τέλος Φάσης 1), όχι ανά υπο-plan — συνεπές με 04a/04b. Καταγράφεται ως εκκρεμές, όχι σε αυτό το plan.

## Decisions

1. **04c = μόνο το layer τοίχων.** Το store γίνεται source-of-truth για τους v2 **τοίχους** (και τα ανοίγματά τους). Χώροι/συσκευές/καλώδια μένουν στο σημερινό v1 μονοπάτι του dialog (τα ζωγραφίζει ο ίδιος `PlanViewer`). Πλήρης γέφυρα v1↔v2 για όλα = εκτός scope (αργότερα).
2. **Seed του store** από `upgradePlanData(planDataNow(), { wallTypes })` όταν ανοίγει το dialog σε v2 (οι `drawnWalls` px → `walls[]` μέτρα γίνονται ήδη από το `upgradePlanData`, Plan 02). Χωρίς κλίμακα (`mPerPx == null`) το layer τοίχων **απενεργοποιείται** (τα v2 features θέλουν μέτρα).
3. **React binding:** `useStore` από `zustand` πάνω στο vanilla `StoreApi` του 04b (το store ζει σε `useRef`, φτιάχνεται μία φορά ανά άνοιγμα).
4. **Hit-test σε μέτρα** με ανοχή εξαρτώμενη από το πάχος/κλίμακα· κλικ επιλέγει μόνο με εργαλείο `select`.
5. **Χρώμα καμβά:** από τον τύπο τοίχου· `typeId == null` → ουδέτερο γκρι `#94A3B8`. Επιλεγμένος → περίγραμμα cyan `#22D3EE` (χρώματα mockup).
6. **Αποδοχή auto-walls:** τρέχει `vectorizeWalls` στη **συνδυασμένη μάσκα** (`autoMask`+`drawnMask`, ήδη στο dialog) → preview → «Αποδοχή» → px→μέτρα → `store.addWall` με `source:'auto'` και `typeId` από `nearestWallTypeByThickness`. Πάνω από το cap (`walls.max(20_000)`) η αποδοχή κόβεται με προειδοποίηση.

## Review Focus

- **Χωρίς κλίμακα (`mPerPx == null`):** το «Αποδοχή τοίχων» και η επιλογή/αλλαγή τύπου δεν κρασάρουν — είναι ανενεργά με σαφές μήνυμα (Task 1 `vectorWallsToNew` με `mPerPx<=0` → `[]`· Task 3/4 guard).
- **Hotkey χωρίς αντιστοιχία:** πλήκτρο '1'–'9' χωρίς τύπο με αυτό το `hotkey`, ή τύποι χωρίς hotkeys → `hotkeyToWallTypeId` επιστρέφει `null`, κανένα throw (Task 1).
- **Καμία ενεργή κατηγορία/τύπος στο `nearestWallTypeByThickness`:** `vectorWallsToNew` βάζει `typeId: null` αντί να σκάσει (Task 1).
- **Υπέρβαση cap:** `vectorizeWalls` που βγάζει >20.000 τμήματα (θορυβώδης μάσκα) → η αποδοχή περιορίζεται στο υπόλοιπο μέχρι το cap, χωρίς invalid v2 (Task 1 `clampAcceptCount` + Task 4 guard).
- **Κλικ εκτός τοίχου / με λάθος εργαλείο:** `pickWallAt` επιστρέφει `null` έξω από την ανοχή· η επιλογή αλλάζει μόνο με `select` tool (Task 1 + Task 3).

---

### Task 1: Καθαρή λογική αλληλεπίδρασης (meters↔px, hit-test, px→v2, χρώματα)

**Files:** Create `lib/floorplan/editor/interactions.ts` · Test `lib/floorplan/__tests__/editor-interactions.test.ts`

**Interfaces:**
- Consumes: `WallEntity`, `NewWall`, `Pt` (από `editor/reducers.ts`)· `VectorWall` (`lib/floorplan/vectorize.ts`)· `nearestWallTypeByThickness` (`lib/floorplan/wall-types.ts`)· `EditorShellWallType` (`components/admin/floorplan/editor-shell.tsx`, πεδία `{id,code,name,color,thicknessM,hotkey}`).
- Produces:
  - `type CanvasWall = { id: string; a: Pt; b: Pt; thicknessPx: number; color: string; selected: boolean }`
  - `hotkeyToWallTypeId(wallTypes: EditorShellWallType[], key: string): string | null` — ταιριάζει το `hotkey` (string '1'..'9'), αλλιώς `null`.
  - `pickWallAt(walls: WallEntity[], p: Pt, tolM: number): string | null` — id του κοντινότερου τοίχου με απόσταση σημείου-προς-τμήμα ≤ `tolM`· ισοπαλία → μικρότερη απόσταση· κανένας → `null`.
  - `vectorWallsToNew(vw: VectorWall[], mPerPx: number, wallTypes: EditorShellWallType[]): NewWall[]` — px→μέτρα (`a`,`b` × `mPerPx`), `source:'auto'`, `typeId = nearestWallTypeByThickness(wallTypes.map(t => ({ id: t.id, thicknessM: t.thicknessM, active: true })), thicknessPx*mPerPx)` (οι `wallTypes` έρχονται ήδη φιλτραρισμένοι ως active από το `page.tsx`)· `mPerPx <= 0` ή μη-πεπερασμένο → `[]`.
  - `clampAcceptCount(existing: number, incoming: number, cap?: number): number` — πόσοι από τους `incoming` χωρούν χωρίς να ξεπεράσει το `cap` (default 20_000)· ≥0.
  - `wallsForCanvas(walls: WallEntity[], mPerPx: number, selectedId: string | null, wallTypes: EditorShellWallType[]): CanvasWall[]` — μέτρα→px (`/mPerPx`), `color` από τον τύπο (ή `#94A3B8` όταν `typeId==null`/άγνωστος), `thicknessPx = max(1, thicknessM/mPerPx)` (ή σταθερό 2px όταν `typeId==null`), `selected = id===selectedId`.

- [ ] **Step 1: Failing test** `editor-interactions.test.ts`:
  - `hotkeyToWallTypeId([{…hotkey:'1'…id:'a'},{…hotkey:'2'…id:'b'}], '2') === 'b'`· `'9'` χωρίς αντιστοιχία → `null`· πλήκτρο `'x'` → `null`.
  - `pickWallAt` — τοίχος a=(0,0) b=(3,0): σημείο (1.5, 0.05) με tol 0.1 → το id του· (1.5, 0.5) με tol 0.1 → `null`· δύο παράλληλοι τοίχοι, επιστρέφει τον κοντινότερο.
  - `vectorWallsToNew([{a:{x:0,y:0},b:{x:100,y:0},thicknessPx:20}], 0.01, [{id:'t',code:'T',name:'Τ',color:'#abc',thicknessM:0.2,hotkey:'1'}])` → 1 NewWall με `a:{x:0,y:0}`, `b:{x:1,y:0}`, `source:'auto'`, `typeId:'t'`· με `mPerPx:0` → `[]`· με `wallTypes:[]` → `typeId:null`.
  - `clampAcceptCount(19_995, 10)` → `5`· `clampAcceptCount(0, 3)` → `3`.
  - `wallsForCanvas` — ένας τοίχος με `typeId:'t'` (type color '#abc', thicknessM 0.2), `mPerPx:0.01`, selectedId = το id → `color:'#abc'`, `thicknessPx:20`, `selected:true`· τοίχος `typeId:null` → `color:'#94A3B8'`.
- [ ] **Step 2: Run** `npx vitest run lib/floorplan/__tests__/editor-interactions.test.ts` → FAIL (module missing). **Step 3: Implement** `interactions.ts` (point-segment distance: προβολή στο τμήμα με clamp 0..1). **Step 4: Run** → PASS. **Step 5: Commit** `git commit -m "Κατόψεις v2: καθαρή λογική αλληλεπίδρασης τοίχων (hit-test, px→v2, χρώματα) 04c"`.

---

### Task 2: `PlanViewer` ζωγραφίζει επιλέξιμο layer τοίχων (presentational prop)

**Files:** Modify `components/admin/floorplan/plan-viewer.tsx`

**Interfaces:**
- Consumes: `CanvasWall` (Task 1).
- Produces: νέο optional prop `vectorWalls?: CanvasWall[]` στο `PlanViewerProps`. Ζωγραφίζεται πάνω από το plan/overlay (νέο Z layer, π.χ. `Z.walls2 = 0.3`): κάθε τοίχος ως «λωρίδα» (ευθύγραμμο τμήμα a→b σε px με πάχος `thicknessPx`, χρώμα `color`)· `selected` → περίγραμμα cyan `#22D3EE`. Όταν `vectorWalls` λείπει/κενό, τίποτα δεν αλλάζει (flag-off ταυτόσημο).

- [ ] **Step 1:** Πρόσθεσε `vectorWalls?: CanvasWall[]` στο `PlanViewerProps` και import του τύπου από `editor/interactions`. **Step 2:** Render του layer (THREE line/mesh ανά τοίχο στο px-space, ίδιος μετασχηματισμός με τα υπόλοιπα layers· reuse του υπάρχοντος pattern των dividers/openings). Το `selected` δίνει έντονο περίγραμμα. **Step 3:** `npx tsc --noEmit` καθαρό· manual QA: με flag-on φαίνονται οι τοίχοι, flag-off τίποτα δεν αλλάζει. **Step 4: Commit** `git commit -m "Κατόψεις v2: PlanViewer ζωγραφίζει layer v2 τοίχων (prop vectorWalls) 04c"`.

> Δεν υπάρχει DOM/THREE test infra· η επαλήθευση είναι tsc + manual QA πίσω από flag (roadmap §Plan 04). Η γεωμετρία του μετασχηματισμού είναι ήδη καλυμμένη από το Task 1 (`wallsForCanvas`).

---

### Task 3: Σύνδεση store↔dialog — επιλογή & αλλαγή τύπου (v2 μόνο)

**Files:** Modify `components/admin/floorplan/floor-plan-dialog.tsx`

**Interfaces:**
- Consumes: `createEditorStore` + `ToolKey` (`editor/store.ts`)· `useStore` (`zustand`)· `pickWallAt`, `wallsForCanvas`, `hotkeyToWallTypeId` (Task 1)· `upgradePlanData` (`lib/floorplan/upgrade.ts`)· `wallTypes` prop (ήδη υπάρχει)· `mPerPx`, `planDataNow`, `onPick`, `changeTool`, `EditorShell` props (ήδη υπάρχουν).
- Produces: μέσα στο `editorV2` μονοπάτι μόνο:
  - store instance σε `useRef` (seed `upgradePlanData(planDataNow(), { wallTypes })` στο πρώτο άνοιγμα με `mPerPx != null`).
  - `const v2 = useStore(storeRef.current, s => s)` (ή επιμέρους selectors) → `v2.data.walls`, `v2.selection`, `v2.activeWallTypeId`, actions.
  - `vectorWalls={wallsForCanvas(v2.data.walls, mPerPx, v2.selection.id, wallTypes)}` στον `PlanViewer`.
  - στο `onPick`: αν `editorV2 && tool==='select' && mPerPx` → `const id = pickWallAt(v2.data.walls, {x:p.x*mPerPx,y:p.y*mPerPx}, tolM)` (tolM π.χ. `max(0.1, 0.5*avgThicknessM)`), `v2.select({kind: id?'wall':null, id})`· **δεν** τρέχει η v1 λογική επιλογής όταν κάνει v2 pick (early return).
  - δεξί πάνελ (`EditorShell.onWallType` + `activeWallTypeId`): κλικ σε τύπο → αν υπάρχει επιλεγμένος τοίχος `v2.setWallType(sel.id, typeId)`, αλλιώς `v2.setActiveWallType(typeId)`.
  - hotkeys: στον υπάρχοντα `onKey`, αν `editorV2` και πλήκτρο 1–9 → `hotkeyToWallTypeId` → ίδια λογική με το κλικ τύπου· `Delete` με επιλεγμένο τοίχο → `v2.deleteWall(sel.id)`· `Ctrl/⌘+Z`/`Shift+Z` → `v2.undo()/redo()`.
  - `EditorShell.status.selection` = σύντομη περιγραφή επιλεγμένου τοίχου· `takeoff` από `v2` (προαιρετικά).

- [ ] **Step 1:** Instantiate store + `useStore` binding πίσω από `editorV2` (χωρίς αλλαγή στο flag-off μονοπάτι). **Step 2:** Τροφοδότησε `vectorWalls` στον `PlanViewer`. **Step 3:** Σύνδεσε επιλογή (`onPick`→`pickWallAt`→`select`), αλλαγή τύπου (πάνελ + hotkeys 1–9), delete/undo/redo. **Step 4:** `npx tsc --noEmit` + `npm run lint` 0 errors· manual QA behind flag: επιλογή τοίχου, 1–9 αλλάζει χρώμα/τύπο, undo/redo, flag-off ανέπαφο. **Step 5: Commit** `git commit -m "Κατόψεις v2: σύνδεση store↔dialog — επιλογή & τύπος τοίχου (v2) 04c"`.

---

### Task 4: Preview + «Αποδοχή τοίχων» από vectorize

**Files:** Modify `components/admin/floorplan/floor-plan-dialog.tsx` (+ μικρό UI control, π.χ. στο `EditorShell.rightExtra`)

**Interfaces:**
- Consumes: `vectorizeWalls` (`lib/floorplan/vectorize.ts`)· η συνδυασμένη μάσκα τοίχων (ήδη υπολογίζεται στο dialog: `drawnMask` + `autoMask`)· `vectorWallsToNew`, `clampAcceptCount` (Task 1)· store actions (Task 3).
- Produces: μέσα στο `editorV2` μονοπάτι:
  - action «Προεπισκόπηση τοίχων»: `const vw = vectorizeWalls(combinedMask, w, h)` → κράτησέ το σε state· δείξε το ως preview layer (ξεχωριστό χρώμα, π.χ. μέσω `vectorWalls` με flag `preview` ή δεύτερο prop) — **χωρίς** να μπει στο store ακόμη.
  - «Αποδοχή τοίχων»: `const incoming = vectorWallsToNew(vw, mPerPx, wallTypes)`· `const n = clampAcceptCount(v2.data.walls.length, incoming.length)`· για τους πρώτους `n` → `v2.addWall(...)` (ένα undo step ανά τοίχο είναι αποδεκτό για το 04c)· αν `n < incoming.length` → `toast` προειδοποίησης για το cap· καθάρισε το preview.
  - guard: χωρίς `mPerPx` το control είναι ανενεργό με tooltip «Όρισε πρώτα κλίμακα».

- [ ] **Step 1:** Control προεπισκόπησης/αποδοχής στο v2 UI (rightExtra). **Step 2:** Preview layer (δεν γράφει store). **Step 3:** Αποδοχή → `vectorWallsToNew`+`clampAcceptCount`→`addWall`· cap toast· καθάρισμα preview. **Step 4:** `npx tsc --noEmit` + `npm run lint` 0 errors· manual QA behind flag: προεπισκόπηση δείχνει τους τοίχους, αποδοχή τους βάζει με σωστό τύπο (από πάχος), undo αναιρεί. **Step 5: Commit** `git commit -m "Κατόψεις v2: preview + αποδοχή διανυσματικών τοίχων στο store 04c"`.

---

### Task 5: Πράσινη πύλη

- [ ] `npx tsc --noEmit` 0 · `npm test` πράσινο · `npm run lint` 0 errors · `npm audit` 0 high/critical · manual QA screenshots (flag-on: επιλογή/τύπος/αποδοχή· flag-off: ανέπαφο) · `git push origin master` (με έγκριση χρήστη).
