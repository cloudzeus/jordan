# Κατόψεις v2 · Plan 03 — vectorize.ts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Από τη μάσκα τοίχων (`detectWalls().walls`) να βγουν **διανυσματικοί τοίχοι** — ευθύγραμμα τμήματα με μετρημένο πάχος — ώστε οι αυτόματοι τοίχοι να σβήνονται, να διορθώνονται και να παίρνουν τύπο (πρόταση από το πάχος).

**Architecture:** Καθαρές συναρτήσεις σε `lib/floorplan/vectorize.ts` (χωρίς DOM, με vitest), πάνω στα υπάρχοντα primitives του `core.ts` (`Mask`, `Pt`, `removeSmall`). Αγωγός: λέπτυνση Zhang–Suen → χάρτης απόστασης (πάχος) → ιχνηλάτηση σκελετού σε πολυγραμμές → απλοποίηση → τμηματοποίηση → συγχώνευση σχεδόν-συνευθειακών + ίσιωμα σε 0°/90° → κούμπωμα κόμβων. Έξοδος σε **pixels** (χώρος της μάσκας)· η μετατροπή σε μέτρα + πρόταση τύπου γίνεται από τον caller (upgrade/editor, Plan 02/04).

**Tech Stack:** TypeScript, vitest. Καμία νέα εξάρτηση.

**Spec:** `docs/superpowers/plans/2026-10-28-katopseis-v2-00-roadmap.md` → §1.3 του paste «Κατόψεις v2». Προαπαιτούμενα: Plan 01 (`nearestWallTypeByThickness`), Plan 02 (`wallEntity` shape).

## Global Constraints

- Git: commit + push στο `master`. Πριν push: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors), `npm audit` (0 high/critical).
- Καθαρή λογική σε `lib/floorplan/`, tests κάτω από `lib/**`. Χωρίς DOM.
- Είσοδος: `Mask` (Uint8Array w×h, 1 = τοίχος) — όπως `WallResult.walls`. Έξοδος σε pixels.
- Καμία αλλαγή σε ζωντανή ροή: η `detectWalls` μένει ως έχει· το `vectorize.ts` είναι νέο, το καταναλώνει το preview/accept του editor στο Plan 04.

## Decisions

1. **Έξοδος σε pixels, όχι μέτρα, χωρίς typeId.** Η vectorize δεν ξέρει κλίμακα ούτε κατάλογο τύπων. Επιστρέφει `VectorWall { a, b, thicknessPx }`. Ο caller κάνει px→m (mpp) και `nearestWallTypeByThickness(types, thicknessPx*mpp)`. Έτσι μένει καθαρή και ανεξάρτητη από το app.
2. **Πηγή αλήθειας για πάχος = χάρτης απόστασης στον άξονα**, όχι `estimateWallThickness` (που δίνει μία επικρατούσα τιμή για όλη την εικόνα). Το πάχος είναι ανά τοίχο = 2× διάμεσος της απόστασης-προς-φόντο στα pixels του σκελετού του τμήματος.
3. **Ίσιωμα σε 0°/90° μόνο κάτω από 2°** — οι γνήσιες διαγώνιοι (λοξοί τοίχοι) διατηρούνται.
4. **Κλάδεμα spurs**: κλαδιά σκελετού κοντύτερα από `minBranchPx` (προεπιλογή ~ πάχος) πετιούνται — αλλιώς ο θόρυβος κακής φωτογραφίας γίνεται ψεύτικοι τοίχοι.

## Review Focus

- **Κακή/θορυβώδης μάσκα:** μικρά spurs/ψίχουλα δεν πρέπει να γίνονται τοίχοι — κλαδεύονται (Task 4 + Task 7 test με θόρυβο).
- **Λοξός τοίχος (π.χ. 30°):** `snapAxisAligned` ΔΕΝ τον γυρίζει σε 0/90 (απόκλιση >2°) (Task 5 test).
- **Ήδη λεπτή γραμμή (1px, χώρισμα):** η λέπτυνση είναι ιδιοδύναμη, το πάχος βγαίνει μικρό (Task 1 + Task 2 test).
- **Κόμβοι T/σταυρός:** η ιχνηλάτηση σπάει σε πολυγραμμές που συναντιούνται σε κόμβο, όχι μία μπερδεμένη πορεία (Task 3 test).
- **Ασύνδετες συνιστώσες:** κάθε μία ιχνηλατείται ξεχωριστά, χωρίς διασύνδεση (Task 3 test).

---

### Task 1: Λέπτυνση Zhang–Suen

**Files:** Create `lib/floorplan/vectorize.ts` · Test `lib/floorplan/__tests__/vectorize.test.ts`

**Interfaces:** Consumes `Mask`, `Pt` (`core.ts`). Produces `thinZhangSuen(mask: Mask, w: number, h: number): Mask` — σκελετός πάχους 1px.

- [ ] **Step 1: Failing test** — φτιάξε βοηθό `rectMask(w,h,x0,y0,x1,y1,thick)` (γεμίζει περίγραμμα ορθογωνίου πάχους `thick`). Για μια οριζόντια μπάρα 20×5 πάχους 5: μετά το `thinZhangSuen`, κάθε στήλη έχει ΑΚΡΙΒΩΣ 1 ενεργό pixel (πάχος 1), και τα άκρα διατηρούνται· για μάσκα ήδη 1px η έξοδος είναι ίδια (ιδιοδύναμη).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** τον κλασικό αλγόριθμο Zhang–Suen (δύο υπο-περάσματα ανά επανάληψη, μέχρι να μην αλλάζει τίποτα). **Step 4: Run** → PASS. **Step 5: Commit**.

---

### Task 2: Χάρτης απόστασης (πάχος)

**Files:** Modify `vectorize.ts` · Test same file

**Interfaces:** Produces `distanceToBackground(mask: Mask, w: number, h: number): Int32Array` — για κάθε ενεργό pixel, απόσταση Chebyshev προς το πλησιέστερο φόντο (two-pass).

- [ ] **Step 1: Failing test** — σε μπάρα πάχους 5, το pixel του άξονα έχει απόσταση 3 (⌈5/2⌉), άρα πάχος ≈ `2·3−1 = 5`. Για πάχος 1, απόσταση 1.
- [ ] **Step 2–4:** two-pass chamfer (forward/backward). **Step 5: Commit** (μαζί με Task 1 αν βγήκαν μαζί).

---

### Task 3: Ιχνηλάτηση σκελετού σε πολυγραμμές

**Files:** Modify `vectorize.ts` · Test same file

**Interfaces:** Produces `tracePolylines(skel: Mask, w: number, h: number): Pt[][]` — σπάει τον σκελετό σε πολυγραμμές στα άκρα (βαθμός 1) και στους κόμβους (βαθμός ≥3)· τα pixels βαθμού 2 είναι ενδιάμεσα.

- [ ] **Step 1: Failing test** — σκελετός σχήματος **Γ** (οριζόντια + κάθετη που μοιράζονται γωνία): μία πολυγραμμή με το σημείο-γωνία μέσα. Σκελετός **+** (σταυρός): οι τέσσερις βραχίονες γίνονται ξεχωριστές πολυγραμμές που τελειώνουν στον κεντρικό κόμβο. Δύο ασύνδετες μπάρες: δύο πολυγραμμές, καμία διασύνδεση.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — υπολόγισε βαθμό (8-γειτονιά) κάθε pixel· ξεκίνα από endpoints/junctions, προχώρα σε pixels βαθμού 2 μέχρι endpoint/junction· σημείωσε επισκεφθέντα· χειρίσου κλειστούς βρόχους (χωρίς endpoint) ξεκινώντας από αυθαίρετο pixel. **Step 4: Run** → PASS. **Step 5: Commit**.

---

### Task 4: Απλοποίηση + κλάδεμα spurs

**Files:** Modify `vectorize.ts` · Test same file

**Interfaces:** Produces `simplifyOpen(pts: Pt[], eps: number): Pt[]` (Douglas–Peucker για ανοιχτή γραμμή) και `pruneShort(polylines: Pt[][], minLenPx: number): Pt[][]` (πετά πολυγραμμές με μήκος < `minLenPx`).

- [ ] **Step 1: Failing test** — `simplifyOpen` σε σχεδόν ευθεία 10 σημείων → 2 σημεία (άκρα)· διατηρεί γωνία πάνω από `eps`. `pruneShort` πετά πολυγραμμή 3px με `minLenPx=8`, κρατά μία 50px.
- [ ] **Step 2–4.** `simplifyOpen` = κλασικό DP (διαφορετικό από το `simplifyClosed` του core). **Step 5: Commit**.

---

### Task 5: Τμήματα — συγχώνευση συνευθειακών + ίσιωμα αξόνων

**Files:** Modify `vectorize.ts` · Test same file

**Interfaces:**
- `type Seg = { a: Pt; b: Pt }`
- `mergeCollinear(segs: Seg[], o: { maxAngleDeg: number; maxGapPx: number }): Seg[]` — ενώνει δύο τμήματα όταν η γωνία τους < `maxAngleDeg` και το κενό άκρων < `maxGapPx`.
- `snapAxisAligned(seg: Seg, maxDeg: number): Seg` — αν η απόκλιση από 0°/90° < `maxDeg`, ευθυγραμμίζει (ισιώνει) το τμήμα· αλλιώς αμετάβλητο.

- [ ] **Step 1: Failing test** — δύο σχεδόν συνευθειακά τμήματα (γωνία 1°, κενό 3px) → ένα· τμήμα σε 1° από οριζόντιο → `snapAxisAligned(…,2)` το κάνει ακριβώς οριζόντιο (ίδιο y)· τμήμα σε **30°** → αμετάβλητο.
- [ ] **Step 2–4.** **Step 5: Commit**.

---

### Task 6: Κούμπωμα κόμβων

**Files:** Modify `vectorize.ts` · Test same file

**Interfaces:** `snapNodes(segs: Seg[], tolPx: number): Seg[]` — άκρα τμημάτων σε απόσταση < `tolPx` συγχωνεύονται σε έναν κοινό κόμβο (μέσος όρος), ώστε οι γωνίες να κλείνουν.

- [ ] **Step 1: Failing test** — δύο τμήματα με άκρα `(100,100)` και `(102,101)` (απόσταση ~2,2) με `tolPx=4` → και τα δύο δείχνουν στο ίδιο σημείο· με `tolPx=1` → αμετάβλητα.
- [ ] **Step 2–4.** **Step 5: Commit**.

---

### Task 7: Ενορχήστρωση `vectorizeWalls`

**Files:** Modify `vectorize.ts` · Test same file

**Interfaces:**
- `type VectorWall = { a: Pt; b: Pt; thicknessPx: number }`
- `vectorizeWalls(mask: Mask, w: number, h: number, opts?: { minBranchPx?: number; simplifyEps?: number; mergeAngleDeg?: number; snapTolPx?: number; axisDeg?: number }): VectorWall[]`
- Αγωγός: `thinZhangSuen` → `distanceToBackground` (κράτα το, για πάχος) → `tracePolylines` → `pruneShort(minBranchPx)` → `simplifyOpen(eps)` ανά πολυγραμμή → σπάσε σε `Seg[]` → `mergeCollinear` → `snapAxisAligned` ανά seg → `snapNodes` → για κάθε seg, `thicknessPx = 2·median(distance στα pixels του σκελετού κατά μήκος) − 1`.

- [ ] **Step 1: Failing test** — μάσκα 80×60 με **ορθογώνιο δωμάτιο** περίγραμμα πάχους 6px: `vectorizeWalls` επιστρέφει **4** `VectorWall`, το καθένα με `thicknessPx` 5–7, τα άκρα κουμπωμένα (οι τέσσερις γωνίες κλείνουν — κοινά σημεία). Δεύτερη μάσκα: ίδιο ορθογώνιο + ένα μικρό spur 3px → πάλι 4 (το spur κλαδεύτηκε).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** την ενορχήστρωση με λογικά defaults (`minBranchPx` ~ μέσο πάχος, `simplifyEps≈1.5`, `mergeAngleDeg=3`, `snapTolPx≈πάχος`, `axisDeg=2`). **Step 4: Run** → PASS. **Step 5: Commit**.

---

### Task 8: Πράσινη πύλη

- [ ] `npx tsc --noEmit` 0 · `npm test` πράσινο · `npm run lint` 0 errors · `npm audit` 0 high/critical · `git push origin master` (με έγκριση χρήστη).
