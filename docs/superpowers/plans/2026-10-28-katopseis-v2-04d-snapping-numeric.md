# Κατόψεις v2 · Plan 04d — Snapping + αριθμητική είσοδος + ορθογώνια επιλογή Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ο v2 editor αποκτά ακρίβεια σχεδίασης: **κούμπωμα (snapping)** σε άκρα/τμήματα/άξονες/κάναβο, **αριθμητική είσοδο μήκους** («3.45»+Enter) στη σχεδίαση και στην αλλαγή διάστασης επιλεγμένου τοίχου, και **ορθογώνια επιλογή** πολλών τοίχων με **μαζική αλλαγή τύπου**.

**Architecture:** Όλη η γεωμετρία/λογική μπαίνει **καθαρή** σε `lib/floorplan/editor/snapping.ts` (snap + applyLength) και σε προσθήκες στο `editor/interactions.ts` (wallsInRect), με vitest. Το store (04b) επεκτείνεται με πολλαπλή επιλογή + μαζική αλλαγή τύπου (vitest). Το DOM/React είναι λεπτό wiring στον `FloorPlanDialog`/`PlanViewer`, **μόνο στο μονοπάτι `editorV2`**, με manual QA πίσω από το flag (όπως 04a–04c· το project δεν έχει E2E infra). Flag-off = αμετάβλητο.

**Tech Stack:** TypeScript, zustand 5 / immer 11 (store 04b), THREE.js (PlanViewer), vitest. **Καμία νέα εξάρτηση.**

**Spec:** roadmap `docs/superpowers/plans/2026-10-28-katopseis-v2-00-roadmap.md` (§Plan 04 → 04d). Προαπαιτούμενα: 04b (store), 04c (interactions.ts, v2 wiring, το layer τοίχων). UI contract: `docs/design/floorplan-editor-v2.html` (status bar «Κούμπωμα», πεδίο «Μήκος»).

## Global Constraints

- Git: commit + push στο `master`. Πριν push: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors), `npm audit` (0 high/critical)· αλλαγές εμφάνισης → manual QA πίσω από το flag.
- Καθαρή λογική σε `lib/floorplan/editor/` χωρίς DOM· tests κάτω από `lib/**`. SI μονάδες (μέτρα στο store, px μόνο για render).
- **Flag-off αμετάβλητο:** κάθε προσθήκη ενεργοποιείται μόνο όταν `v2Active` (editorV2 && mPerPx). Ο σημερινός editor δεν αλλάζει.
- Admin UI: ενέργειες σε ⋮ dropdown όπου υπάρχουν· το δεξί πάνελ/τύποι είναι ήδη στο `EditorShell`.
- **Wiki:** γράφεται όταν «κατέβει» το flag (τέλος Φάσης 1), όχι ανά υπο-plan — συνεπές με 04a–04c. Εκκρεμές, όχι σε αυτό το plan.

## Decisions

1. **Snapping χωρίς spatial index (γραμμικό).** Ο αριθμός τοίχων σε τυπική κάτοψη είναι δεκάδες–εκατοντάδες· γραμμική σάρωση O(n) είναι αρκετή και κρατά το engine καθαρό/ελεγμένο. Το `flatbush/rbush` (roadmap) αναβάλλεται ως βελτιστοποίηση αν το profiling σε CAD-μεγέθους κατόψεις το απαιτήσει — καταγράφεται ως ανοιχτό, όχι blocker.
2. **Autosave (IndexedDB) → ξεχωριστό Plan 04e.** Είναι ανεξάρτητο υποσύστημα persistence· το roadmap το είχε μαζί στο 04d, αλλά ο κανόνας «ένα plan = ένα συνεκτικό κομμάτι» το βγάζει εκτός. Αυτό το 04d είναι το σετ ακρίβειας-σχεδίασης (snap + αριθμητική + επιλογή). Το roadmap ενημερώνεται αντίστοιχα.
3. **Ορθογώνια επιλογή = Shift+σύρσιμο** πάνω στον καμβά (rubber-band), με προσωρινή απενεργοποίηση του pan του OrbitControls όσο κρατιέται το Shift σε v2. Το απλό σύρσιμο μένει pan (πλοήγηση). Έτσι δεν χρειάζεται νέο `ViewerTool`.
4. **Πολλαπλή επιλογή στο store:** νέο `selectedWallIds: string[]` δίπλα στο υπάρχον μονό `selection`· μονή επιλογή συγχρονίζει `selectedWallIds=[id]`. Η μαζική αλλαγή τύπου είναι **ένα** undo step.
5. **Κούμπωμα — προτεραιότητα:** άκρο τοίχου > σημείο πάνω σε τμήμα (κάθετη προβολή) > ευθυγράμμιση άξονα/προέκταση από το anchor (ή κλείδωμα H/V όταν `ortho`) > κάναβος (αν ενεργός) > ωμή θέση. Πρώτο κατά προτεραιότητα εντός ανοχής κερδίζει· ισοπαλία → μικρότερη απόσταση.
6. **Αριθμητική είσοδος:** στη σχεδίαση τοίχου (ένα σημείο τοποθετημένο) «L»+Enter τοποθετεί το 2ο σημείο σε απόσταση L κατά την τρέχουσα κατεύθυνση· με έναν τοίχο επιλεγμένο, «L»+Enter αλλάζει το μήκος του μετακινώντας το άκρο `b` κατά τον άξονα a→b.

## Review Focus

- **Χωρίς τοίχους / anchor null:** `snapPoint` επιστρέφει ωμή θέση (`kind:'none'`), χωρίς throw· με `ortho` + anchor κλειδώνει H/V ακόμη κι όταν δεν υπάρχει τίποτα να κουμπώσει (Task 1).
- **Μη έγκυρο μήκος:** `applyLength` με `0`/αρνητικό/NaN → δεν παράγει εκφυλισμένο τοίχο (επιστρέφει το anchor ή απορρίπτεται· το DOM δεν καλεί `addWall`/`moveWallEnd`) (Task 1 + Task 4 guard).
- **Ορθογώνιο μηδενικού εμβαδού:** `wallsInRect` με `a==b` → `[]` (κλικ χωρίς σύρσιμο δεν αλλάζει επιλογή) (Task 2 + Task 5 guard).
- **Μαζική αλλαγή σε κενή επιλογή:** `setWallTypeMany([], …)` → no-op, κανένα undo step (Task 3).
- **Απόδοση γραμμικού snap σε μεγάλο N:** τεκμηριωμένα αποδεκτή για τυπικές κατόψεις· flatbush αναβάλλεται (Decision 1) — ο reviewer το ελέγχει ως συνειδητή απόφαση, όχι bug.

---

### Task 1: Snap engine + αριθμητικό μήκος (καθαρό)

**Files:** Create `lib/floorplan/editor/snapping.ts` · Test `lib/floorplan/__tests__/editor-snapping.test.ts`

**Interfaces:**
- Consumes: `WallEntity`, `Pt` (`editor/reducers.ts`).
- Produces:
  - `type SnapKind = 'endpoint' | 'segment' | 'axis' | 'grid' | 'none'`
  - `type Snap = { point: Pt; kind: SnapKind; refId: string | null }` (refId = id τοίχου για endpoint/segment, αλλιώς null)
  - `type SnapOpts = { tolM: number; ortho?: boolean; anchor?: Pt | null; gridM?: number | null; excludeId?: string | null }`
  - `snapPoint(walls: WallEntity[], cursor: Pt, opts: SnapOpts): Snap` — προτεραιότητα Decision 5· `excludeId` παραλείπει τον τοίχο που επεξεργάζεται· `ortho && anchor` → κλείδωμα στον κοντινότερο άξονα (H/V) του anchor πριν τα χαμηλότερα.
  - `applyLength(anchor: Pt, toward: Pt, lengthM: number): Pt` — σημείο σε απόσταση `lengthM` από `anchor` προς `anchor→toward`· `lengthM<=0`/μη-πεπερασμένο ή `toward==anchor` → επιστρέφει `anchor`.

- [ ] **Step 1: Failing test** `editor-snapping.test.ts`:
  - endpoint: τοίχος a=(0,0) b=(3,0)· cursor (3.02,0.01), tol 0.1 → `{kind:'endpoint', point:(3,0), refId:<id>}`.
  - segment: cursor (1.5,0.05), tol 0.1 → `{kind:'segment', point:(1.5,0)}`.
  - axis (ortho): anchor (0,0), cursor (2.9,0.2), ortho true, καθόλου τοίχοι → `{kind:'axis', point:(2.9,0)}` (κλείδωμα H).
  - grid: gridM 0.1, cursor (1.23,0.07), καθόλου snap αλλιώς → `{kind:'grid', point:(1.2,0.1)}`.
  - none: cursor μακριά από όλα, χωρίς ortho/grid → `{kind:'none', point:cursor}`.
  - excludeId: ο ίδιος ο τοίχος δεν κουμπώνει στον εαυτό του.
  - `applyLength((0,0),(1,0),3)` → (3,0)· `applyLength((0,0),(0,0),3)` → (0,0)· `applyLength((0,0),(1,0),0)` → (0,0)· NaN → (0,0).
- [ ] **Step 2: Run** `npx vitest run lib/floorplan/__tests__/editor-snapping.test.ts` → FAIL. **Step 3: Implement** `snapping.ts`. **Step 4: Run** → PASS. **Step 5: Commit** `git commit -m "Κατόψεις v2: snap engine + αριθμητικό μήκος (04d)"`.

---

### Task 2: `wallsInRect` (καθαρό)

**Files:** Modify `lib/floorplan/editor/interactions.ts` · Test `lib/floorplan/__tests__/editor-interactions.test.ts` (προσθήκη)

**Interfaces:**
- Produces: `wallsInRect(walls: WallEntity[], a: Pt, b: Pt): string[]` — ids τοίχων των οποίων το τμήμα **τέμνει** το ευθυγραμμισμένο ορθογώνιο με γωνίες a,b (άκρο μέσα στο ορθογώνιο ή τμήμα που τέμνει πλευρά του). `a==b` (μηδενικό εμβαδόν) → `[]`.

- [ ] **Step 1: Failing test** (προσθήκη describe):
  - τοίχος εντελώς μέσα → περιλαμβάνεται· τοίχος που τέμνει πλευρά → περιλαμβάνεται· τοίχος εντελώς έξω → όχι· `a==b` → `[]`· ορθογώνιο δοσμένο με οποιαδήποτε σειρά γωνιών (normalize min/max).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (segment-vs-AABB: endpoint-inside ή τομή με τις 4 πλευρές). **Step 4: Run** → PASS. **Step 5: Commit** `git commit -m "Κατόψεις v2: wallsInRect για ορθογώνια επιλογή (04d)"`.

---

### Task 3: Store — πολλαπλή επιλογή + μαζική αλλαγή τύπου

**Files:** Modify `lib/floorplan/editor/store.ts` · Test `lib/floorplan/__tests__/editor-store.test.ts` (προσθήκη)

**Interfaces:**
- Consumes: `setWallTypeRecipe` (reducers).
- Produces στο `EditorState`/`EditorActions`:
  - `selectedWallIds: string[]` (αρχικά `[]`).
  - `selectWalls(ids: string[]): void` — θέτει `selectedWallIds`· `selection = ids.length === 1 ? {kind:'wall', id:ids[0]} : {kind:null, id:null}`.
  - `setWallTypeMany(ids: string[], typeId: string | null): void` — ένα undo step (ένα `commit` που τρέχει `setWallTypeRecipe` για κάθε id)· `ids` κενό → no-op (0 patches).
  - Το υπάρχον `select(s)` συγχρονίζει `selectedWallIds = s.kind === 'wall' && s.id ? [s.id] : []`.

- [ ] **Step 1: Failing test** `editor-store.test.ts` (προσθήκη):
  - `selectWalls(['a','b'])` → `selectedWallIds==['a','b']`, `selection.kind==null`· `selectWalls(['a'])` → `selection=={wall,'a'}`.
  - `select({kind:'wall',id:'x'})` → `selectedWallIds==['x']`· `select({kind:null,id:null})` → `[]`.
  - `setWallTypeMany([id1,id2],'t')` αλλάζει τύπο και στους δύο, `canUndo` true, **ένα** `undo()` τα επαναφέρει και τα δύο.
  - `setWallTypeMany([], 't')` → καμία αλλαγή, `canUndo` false.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS. **Step 5: Commit** `git commit -m "Κατόψεις v2: store πολλαπλή επιλογή + μαζική αλλαγή τύπου (04d)"`.

---

### Task 4: DOM — snapping + αριθμητική είσοδος στη σχεδίαση/διάσταση (v2, flag)

**Files:** Modify `components/admin/floorplan/floor-plan-dialog.tsx` (+ ίσως μικρό πεδίο «Μήκος» στο `EditorShell.status`/`rightExtra`)

**Interfaces:**
- Consumes: `snapPoint`, `applyLength` (Task 1)· store `addWall`, `moveWallEnd`, `selection` (04b)· υπάρχοντα `draft`/`onPick`/`onFinish`, `mPerPx`, `ortho`, `v2Active`.
- Produces (μόνο `v2Active`):
  - **Σχεδίαση τοίχου (tool `wall`):** στο `onPick`, μετατροπή px→μέτρα, `snapPoint(store.walls, pM, { tolM: 10*mPerPx, ortho, anchor: firstPointM })`· 1ο κλικ κρατά anchor, 2ο κλικ → `store.addWall({a,b,typeId: activeWallTypeId})`· ο καμβάς δείχνει το κουμπωμένο σημείο (reuse draft) και το `status.snap` την `kind`.
  - **Αριθμητική είσοδος:** πεδίο «Μήκος» (reuse `MetersInput`) — στη σχεδίαση με anchor τοποθετημένο, «L»+Enter → `b = applyLength(anchorM, cursorDirM, L)` → `addWall`· με έναν τοίχο επιλεγμένο, «L»+Enter → `moveWallEnd(id,'b', applyLength(a,b,L))`· `L<=0`/κενό → αγνοείται.
  - `status.snap` = ετικέτα της `SnapKind` (π.χ. «άκρο», «τοίχος», «άξονας», «κάναβος»).
- [ ] **Step 1:** Snapping στο v2 `onPick` για tool `wall` (anchor + 2ο σημείο → addWall). **Step 2:** Πεδίο «Μήκος» + commit (σχεδίαση & resize επιλεγμένου). **Step 3:** `status.snap` ένδειξη. **Step 4:** `npx tsc --noEmit` + `npm run lint` 0 errors· manual QA behind flag: κούμπωμα σε άκρα/άξονες, «3.45»+Enter φτιάχνει τοίχο 3,45 m, resize επιλεγμένου· flag-off ανέπαφο. **Step 5: Commit** `git commit -m "Κατόψεις v2: snapping + αριθμητική είσοδος στη σχεδίαση v2 (04d)"`.

> Χωρίς DOM test infra· επαλήθευση tsc+lint+manual QA (roadmap §Plan 04). Η γεωμετρία καλύπτεται από Task 1.

---

### Task 5: DOM — ορθογώνια επιλογή + μαζική αλλαγή τύπου (v2, flag)

**Files:** Modify `components/admin/floorplan/floor-plan-dialog.tsx` · `components/admin/floorplan/plan-viewer.tsx`

**Interfaces:**
- Consumes: `wallsInRect` (Task 2)· store `selectWalls`, `setWallTypeMany`, `selectedWallIds` (Task 3)· `wallsForCanvas` (04c, για highlight πολλαπλής επιλογής).
- Produces (μόνο `v2Active`):
  - **PlanViewer:** υποστήριξη rubber-band — όταν ο host κρατά **Shift**, το pan του OrbitControls απενεργοποιείται και το σύρσιμο ζωγραφίζει ορθογώνιο επιλογής (νέο optional prop/callback, π.χ. `onMarquee?(aPx, bPx)`), σε px.
  - **Dialog:** `onMarquee` → μετατροπή px→μέτρα → `wallsInRect(store.walls, aM, bM)` → `selectWalls(ids)`· `a==b` → αγνοείται.
  - **Μαζικός τύπος:** στο `EditorShell.onWallType`, αν `selectedWallIds.length > 1` → `setWallTypeMany(selectedWallIds, id)`, αλλιώς η υπάρχουσα μονή λογική· `status.selection` δείχνει «N τοίχοι».
  - **Αλλαγή στο `wallsForCanvas` (04c):** η παράμετρος `selectedId: string | null` γίνεται `selectedIds: string[]` (ο καμβάς μαρκάρει `selected` κάθε id στο σύνολο). Ενημερώνεται ο μοναδικός caller (dialog → `v2.selectedWallIds`) και το υπάρχον test `editor-interactions.test.ts` (η περίπτωση μονής επιλογής περνά `['w1']`).
- [ ] **Step 1:** PlanViewer rubber-band σε Shift+drag (pan off όσο Shift) + `onMarquee`. **Step 2:** `wallsForCanvas` → `selectedIds: string[]` (update caller + test)· Dialog wiring (marquee→wallsInRect→selectWalls· μαζικός τύπος· status). **Step 3:** Highlight πολλαπλής επιλογής στον καμβά (όλοι οι `selectedWallIds`). **Step 4:** `npx tsc --noEmit` + `npm run lint` 0 errors· manual QA behind flag: Shift+σύρσιμο επιλέγει πολλούς τοίχους, κλικ σε τύπο τους αλλάζει όλους με ένα undo· απλό σύρσιμο = pan· flag-off ανέπαφο. **Step 5: Commit** `git commit -m "Κατόψεις v2: ορθογώνια επιλογή + μαζική αλλαγή τύπου (04d)"`.

> Ρίσκο: η απενεργοποίηση του pan του OrbitControls υπό Shift είναι η λεπτή αλλαγή στον PlanViewer — κρατά το pan άθικτο εκτός Shift/εκτός v2.

---

### Task 6: Πράσινη πύλη

- [ ] `npx tsc --noEmit` 0 · `npm test` πράσινο · `npm run lint` 0 errors · `npm audit` 0 high/critical · manual QA screenshots (flag-on: snap/αριθμητική/ορθογώνια επιλογή· flag-off: ανέπαφο) · `git push origin master` (με έγκριση χρήστη).
