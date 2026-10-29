# Κατόψεις v2 · Plan 06 — Εισαγωγή διανυσμάτων CAD/PDF (αναγνώριση με συμβάσεις) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Αντί να ισοπεδώνουμε το σχέδιο σε raster (που πιάνει ~0,9% και χάνει τοίχους/κολόνες/σκάλες), **διαβάζουμε τα πραγματικά διανύσματα του PDF** και αναγνωρίζουμε τα στοιχεία από τις **αρχιτεκτονικές τους συμβάσεις**: τοίχοι = ζεύγη παράλληλων γραμμών, κολόνες = μικρά κλειστά ορθογώνια, σκάλες = ισαπέχουσες παράλληλες. Οι τοίχοι γίνονται v2 οντότητες στο store· κολόνες/σκάλες προβάλλονται ως candidates.

**Architecture:** Όλη η γεωμετρία/αναγνώριση **καθαρή** σε `lib/floorplan/cad/` (flatten operator-list → segments· parallel-pair walls· element matchers), με vitest σε συνθετικά segment sets. Η εξαγωγή από το pdfjs (`page.getOperatorList`) είναι λεπτό I/O adapter στο `load-plan.ts`, στο **ίδιο px-space με το `analysis`** ώστε η υπάρχουσα κλίμακα (`mPerPx`) να μετατρέπει σε μέτρα. Η ενσωμάτωση τοίχων επαναχρησιμοποιεί `vectorWallsToNew` (04c) και helpers του Plan 03 (`mergeCollinear`/`snapNodes`/`snapAxisAligned`). DOM = νέα λειτουργία «CAD/PDF layers» στον v2 editor, πίσω από το flag, manual QA.

**Tech Stack:** TypeScript, `pdfjs-dist` 6.4 (ήδη dep, legacy build· `getOperatorList`), zustand store (04b), THREE (PlanViewer), vitest. Καμία νέα εξάρτηση.

**Spec:** roadmap `…-00-roadmap.md` (§Plan 06). UI reference: Hamina «CAD/PDF layers» + «AI-detected walls», material mapping. Προαπαιτούμενα: 01 (WallType), 02 (planData v2), 03 (vectorize helpers), 04b/04c (store, `vectorWallsToNew`).

## Global Constraints

- Git: commit + push στο `master`. Πριν push: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors, χωρίς νέες προειδοποιήσεις), `npm audit` (0 high/critical)· αλλαγές εμφάνισης → manual QA πίσω από flag.
- Καθαρή λογική σε `lib/floorplan/cad/` χωρίς DOM· tests κάτω από `lib/**`. SI μονάδες (μέτρα στο store, px αναγνώρισης στο analysis-space).
- **Flag-off αμετάβλητο:** η εισαγωγή CAD ενεργοποιείται μόνο στο μονοπάτι `editorV2` (& `mPerPx`). Ο σημερινός raster editor δεν αλλάζει· η raster ανίχνευση (`detectWalls`) μένει ως είναι (εφεδρεία/εικόνες).
- **Wiki:** γράφεται όταν «κατέβει» το flag (τέλος φάσης), όχι ανά plan — συνεπές με 04x.

## Decisions

1. **Scope = PDF διανύσματα.** DXF parser → **Plan 06b**, DWG→DXF service (container) → **Plan 06c** (ανεξάρτητα υποσυστήματα/infra, roadmap ενημερώνεται). Αυτό το plan λύνει την περίπτωση του χρήστη (διανυσματικό PDF) end-to-end.
2. **Μόνο οι ΤΟΙΧΟΙ persist-άρονται** στο v2 store σε αυτό το plan. **Κολόνες/σκάλες** αναγνωρίζονται και **προβάλλονται** (overlay candidates) — η τυποποιημένη μοντελοποίησή τους ως `ElementModel` ανήκει στο Plan 05. Έτσι ο χρήστης βλέπει ότι αναγνωρίζονται, χωρίς schema change εδώ.
3. **Κλίμακα από την υπάρχουσα calibration** (`mPerPx`): τα segments εξάγονται σε px του `analysis` (viewport στο μέγεθος του analysis), άρα ευθυγραμμίζονται με το σχέδιο και το `mPerPx` τα κάνει μέτρα. Χωρίς κλίμακα → η εισαγωγή είναι ανενεργή (ίδιο pattern με 04c/04d).
4. **Flatten σε δική μας μορφή op** (`RawOp`) ώστε η γεωμετρία να ελέγχεται χωρίς τα numeric `OPS` του pdfjs· ένας λεπτός adapter μεταφράζει pdfjs → `RawOp`.
5. **Αναγνώριση τοίχων = parallel-pair:** segments ομαδοποιούνται κατά διεύθυνση· ζεύγη παράλληλων σε απόσταση [min..max] πάχους τοίχου δίνουν centerline + πάχος· μετά `mergeCollinear`+`snapNodes` (Plan 03). Μονές γραμμές χωρίς ζεύγος → αγνοούνται (διαστάσεις/κείμενο/διαγράμμιση).

## Review Focus

- **Καμπύλες (bezier) & κλειστά paths:** `flattenPath` κόβει κυβικές σε segments και κλείνει τα `Z`/rect — χωρίς χαμένες/άπειρες ακμές (Task 1).
- **Εμφωλευμένα transforms (save/restore):** το CTM αποκαθίσταται σωστά· παράλειψη restore δεν «μολύνει» τα επόμενα paths (Task 1).
- **Παράλληλες που ΔΕΝ είναι τοίχος** (διαγράμμιση parking, κείμενο): ζεύγη εκτός εύρους πάχους ή πολύ κοντά/μακριά απορρίπτονται· δεν παράγονται ψευδοτοίχοι (Task 2).
- **Χωρίς κλίμακα:** η εισαγωγή είναι ανενεργή, κανένα crash (Task 4/5 guard).
- **Τεράστιο N segments (A0):** η parallel-pair είναι O(n·k) με bucket κατά διεύθυνση/θέση· τεκμηριωμένη απόδοση, όχι O(n²) (Task 2 — grid/bucket).

---

### Task 1: Εξαγωγή segments από το PDF (flatten operator-list)

**Files:** Create `lib/floorplan/cad/pdf-vectors.ts` · Test `lib/floorplan/__tests__/cad-pdf-vectors.test.ts` · Modify `components/admin/floorplan/load-plan.ts`

**Interfaces:**
- Produces:
  - `type CadSegment = { a: Pt; b: Pt }` (px, analysis-space)
  - `type Matrix = [number, number, number, number, number, number]`
  - `type RawOp = { op: 'move' | 'line' | 'cubic' | 'rect' | 'save' | 'restore' | 'transform'; args: number[] }`
  - `flattenPath(ops: RawOp[], base: Matrix, curveTolPx?: number): CadSegment[]` (καθαρό: εφαρμόζει CTM με save/restore stack, κόβει cubics σε segments ≤ tol, `rect`/`Z` κλείνουν)
  - (I/O, στο load-plan) `pageVectors(file: File, page: number, targetW: number): Promise<{ segments: CadSegment[]; w: number; h: number }>` — `getOperatorList()` → adapter `pdfOpsToRaw` → `flattenPath` με `base = viewport({scale: targetW/basewidth}).transform`.
- Consumes: `Pt` (reducers/core).

- [ ] **Step 1: Failing test** `cad-pdf-vectors.test.ts` (συνθετικά `RawOp[]`, χωρίς pdfjs):
  - ευθεία: `[move 0,0][line 10,0]` με identity base → 1 segment (0,0)-(10,0).
  - rect: `[rect 0,0,4,2]` → 4 segments (κλειστό ορθογώνιο).
  - transform: `[save][transform 2,0,0,2,0,0][move 0,0][line 5,0][restore][move 0,0][line 1,0]` → πρώτο segment μήκους 10, δεύτερο μήκους 1 (restore επανέφερε το CTM).
  - cubic: μία κυβική κόβεται σε ≥2 segments που ακολουθούν την καμπύλη (έλεγχος αρχή/τέλος + ότι το πλήθος > 1).
- [ ] **Step 2: Run** `npx vitest run lib/floorplan/__tests__/cad-pdf-vectors.test.ts` → FAIL. **Step 3: Implement** `flattenPath` + `pdfOpsToRaw` + `pageVectors` (τελευταίο = I/O, χωρίς unit test· manual QA στο Task 5). **Step 4: Run** → PASS. **Step 5: Commit** `git commit -m "Κατόψεις v2: εξαγωγή διανυσμάτων PDF (flatten operator-list) 06"`.

---

### Task 2: Αναγνώριση τοίχων (parallel-pair)

**Files:** Create `lib/floorplan/cad/recognize-walls.ts` · Test `lib/floorplan/__tests__/cad-recognize-walls.test.ts`

**Interfaces:**
- Consumes: `CadSegment` (Task 1)· `VectorWall` (`lib/floorplan/vectorize.ts`, `{a,b,thicknessPx}`)· `mergeCollinear`, `snapNodes`, `snapAxisAligned`, `type Seg` (vectorize.ts).
- Produces: `recognizeWalls(segs: CadSegment[], opts: { minThicknessPx: number; maxThicknessPx: number; minLenPx?: number; angleTolDeg?: number }): VectorWall[]` — ομαδοποίηση κατά διεύθυνση (bucket γωνίας) & θέση· για κάθε ζεύγος παράλληλων σε κάθετη απόσταση ∈ [min,max] και με επικάλυψη κατά μήκος → centerline (μέση) + `thicknessPx = απόσταση`· `mergeCollinear` + `snapAxisAligned` + `snapNodes` στο τέλος. Μονές/εκτός εύρους → αγνοούνται.

- [ ] **Step 1: Failing test** `cad-recognize-walls.test.ts`:
  - δύο οριζόντιες παράλληλες y=0 και y=20 (px), ίδιο x-span → 1 wall, centerline y=10, `thicknessPx≈20`.
  - δύο παράλληλες σε απόσταση 200px (πολύ χοντρό, > max) → κανένας τοίχος.
  - δύο μη-παράλληλες → κανένας τοίχος.
  - δύο παράλληλες χωρίς επικάλυψη κατά μήκος → κανένας (δεν είναι τοίχος).
  - L-σχήμα (δύο ζεύγη κάθετα) → 2 walls με κουμπωμένο κοινό κόμβο (`snapNodes`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (bucket κατά quantized γωνία + perpendicular offset για O(n·k)). **Step 4: Run** → PASS. **Step 5: Commit** `git commit -m "Κατόψεις v2: αναγνώριση τοίχων parallel-pair από vectors 06"`.

---

### Task 3: Αναγνώριση στοιχείων (κολόνες + σκάλες) — preview candidates

**Files:** Create `lib/floorplan/cad/recognize-elements.ts` · Test `lib/floorplan/__tests__/cad-recognize-elements.test.ts`

**Interfaces:**
- Consumes: `CadSegment` (Task 1).
- Produces:
  - `type RecColumn = { center: Pt; wPx: number; hPx: number }`
  - `type RecStair = { bbox: [Pt, Pt]; treads: number }`
  - `recognizeColumns(segs: CadSegment[], opts: { minPx: number; maxPx: number }): RecColumn[]` — μικρά **κλειστά ορθογώνια** (4 ακμές που σχηματίζουν κλειστό βρόχο) με πλευρές ∈ [min,max].
  - `recognizeStairs(segs: CadSegment[], opts: { minTreads?: number; tolPx?: number }): RecStair[]` — ομάδες **ισαπεχουσών παράλληλων** segments (βήμα σταθερό εντός `tolPx`, ≥ `minTreads`).

- [ ] **Step 1: Failing test** `cad-recognize-elements.test.ts`:
  - τετράγωνο 30×30px (4 segments κλειστά) με min/max γύρω του → 1 column, center σωστό.
  - ορθογώνιο 300×300 (εκτός max) → κανένα.
  - 6 παράλληλες οριζόντιες ανά 15px, ίδιο x-span → 1 stair, `treads=6`.
  - 3 παράλληλες με ΑΝΙΣΑ κενά → κανένα stair.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS. **Step 5: Commit** `git commit -m "Κατόψεις v2: αναγνώριση κολόνων + σκαλών από vectors 06"`.

---

### Task 4: Αγωγός εισαγωγής (segments → v2 τοίχοι σε μέτρα)

**Files:** Create `lib/floorplan/cad/import.ts` · Test `lib/floorplan/__tests__/cad-import.test.ts`

**Interfaces:**
- Consumes: `recognizeWalls` (Task 2)· `vectorWallsToNew` (`editor/interactions.ts`, 04c)· `EditorShellWallType`.
- Produces: `cadWallsToNew(segs: CadSegment[], mPerPx: number, wallTypes: EditorShellWallType[], opts?): NewWall[]` — `recognizeWalls` → `VectorWall[]` → `vectorWallsToNew(…, mPerPx, wallTypes)` (px→μέτρα + τύπος από πάχος). `mPerPx<=0` → `[]`. Το `minThicknessPx/maxThicknessPx` προκύπτει από τα πάχη του καταλόγου τύπων σε px (`thicknessM/mPerPx`, με περιθώριο).

- [ ] **Step 1: Failing test** `cad-import.test.ts`: δύο παράλληλες 20px σε απόσταση, `mPerPx=0.01`, τύπος 0.2m → 1 NewWall ~0,2m με `typeId` του τύπου· `mPerPx<=0` → `[]`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS. **Step 5: Commit** `git commit -m "Κατόψεις v2: αγωγός εισαγωγής CAD τοίχων → v2 06"`.

---

### Task 5: DOM — λειτουργία «CAD/PDF layers» στον v2 editor (flag)

**Files:** Modify `components/admin/floorplan/floor-plan-dialog.tsx` · `components/admin/floorplan/plan-viewer.tsx` (preview στοιχείων)

**Interfaces:**
- Consumes: `pageVectors` (Task 1)· `cadWallsToNew` (Task 4)· `recognizeColumns`/`recognizeStairs` (Task 3)· store `addWalls` (04c)· η πηγή `File` της κάτοψης (ο dialog κρατά τον `File` — αν όχι, πρόσθεσε `useRef<File>` στο `load`).
- Produces (μόνο `v2Active`):
  - κουμπί «Εισαγωγή από CAD/PDF» (rightExtra) → `pageVectors(file, page, analysisW)` → `cadWallsToNew` (walls) + `recognizeColumns/Stairs` (elements) → **preview** (τοίχοι cyan + κολόνες/σκάλες ως markers) χωρίς να μπουν στο store.
  - «Αποδοχή τοίχων» → `store.addWalls` (με `clampAcceptCount`, 04c)· οι κολόνες/σκάλες μένουν preview (Decision 2) με σημείωση «μοντελοποίηση στο Plan 05».
  - guard χωρίς `mPerPx` (ανενεργό + tooltip «Όρισε κλίμακα»).
- [ ] **Step 1:** Κράτημα `File` + κουμπί/ροή εξαγωγής. **Step 2:** Preview τοίχων (reuse `vectorWalls` prop) + markers στοιχείων (νέο optional prop στο PlanViewer ή reuse pins). **Step 3:** «Αποδοχή» → store. **Step 4:** `npx tsc --noEmit` + `npm run lint` 0 errors/no new warnings· manual QA behind flag στο PDF του χρήστη: περίμετρος+εσωτερικοί τοίχοι αναγνωρίζονται, κολόνες/σκάλες φαίνονται ως candidates· flag-off ανέπαφο. **Step 5: Commit** `git commit -m "Κατόψεις v2: λειτουργία CAD/PDF layers — εισαγωγή τοίχων από vectors 06"`.

> Χωρίς DOM test infra· επαλήθευση tsc+lint+manual QA (roadmap). Η αναγνώριση/γεωμετρία καλύπτεται από Tasks 1-4.

---

### Task 6: Πράσινη πύλη

- [ ] `npx tsc --noEmit` 0 · `npm test` πράσινο · `npm run lint` 0 errors · `npm audit` 0 high/critical · manual QA screenshots (CAD import στο πραγματικό PDF· flag-off ανέπαφο) · `git push origin master` (με έγκριση χρήστη).
