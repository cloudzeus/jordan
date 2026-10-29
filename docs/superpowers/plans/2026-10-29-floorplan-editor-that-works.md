# Κατόψεις — «Editor που δουλεύει» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Καθαρός, αξιόπιστος v2 editor κάτοψης: AI best-effort πρώτη εκδοχή τοίχων → preview → Αποδοχή → εύκολη χειροκίνητη διόρθωση. Αφαίρεση των raster «σκουπιδιών»· μία σαφής ροή· οι τοίχοι ορίζουν τους χώρους.

**Architecture:** Καθαρή λογική σε `lib/floorplan/` (AI parse/convert, walls→rooms) με vitest. DOM wiring στον `FloorPlanDialog`/`PlanViewer` πίσω από το (default-on) `editorV2`, με manual QA. Επαναχρήση: store (04b), snapping/interactions (04c/04d), `ai.ts`+`vision-config` (OpenRouter/Claude), `EditorShell`.

**Tech Stack:** TypeScript, zustand/immer, THREE.js, OpenRouter (vision), vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-floorplan-editor-that-works-design.md` (εγκεκριμένο). Σχετικά προηγούμενα: 04b/04c/04d (store, snapping, rect-select), 06/06i (vector/AI — μερικώς· υπάρχει WIP stash «AI preview + prompt + raster-removal»).

## Global Constraints

- Git: commit + push στο `master`. Πριν push: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors, χωρίς νέες προειδοποιήσεις), `npm audit` (0 high/critical)· αλλαγές εμφάνισης → manual QA.
- Καθαρή λογική σε `lib/floorplan/` χωρίς DOM· tests κάτω από `lib/**`. SI μονάδες (μέτρα στο store, px αναλυσης στον καμβά).
- Το `editorV2` είναι default-on· ο v1 μένει ως fallback (δεν τον σπάμε). Admin UI: ενέργειες σε ⋮ dropdown.
- **WIP stash:** υπάρχει `git stash@{0}` με strong prompt + AI→preview rewire. Ο implementer ΑΓΝΟΕΙ το stash και υλοποιεί καθαρά από το plan (το stash είναι απλώς επιβεβαίωση ότι τα κομμάτια είναι μικρά)· προαιρετικά `git stash drop` στο τέλος.

## Review Focus

- **AI preview δεν δεσμεύει:** το αποτέλεσμα AI μπαίνει σε preview state, ΟΧΙ απευθείας στο store· «Άκυρο» το πετά χωρίς παρενέργεια (Task 4).
- **Preview διαθέσιμο και για εικόνες:** το Αποδοχή/Άκυρο ΔΕΝ είναι gated σε `isPdf` (Task 3/4).
- **walls→rooms με ανοιχτά περιγράμματα:** `roomsFromWalls` με κενά/ανοίγματα βγάζει μόνο τα κλειστά δωμάτια, δεν σκάει, δεν βγάζει το εξωτερικό «face» ως δωμάτιο (Task 2).
- **Χωρίς κλίμακα:** AI/επιλογή-περιοχής/rooms ανενεργά με tooltip (Task 4/6).
- **Flag-off / v1 ανέπαφο:** η αφαίρεση της raster διαδρομής αφορά ΜΟΝΟ το v2 path· ο v1 editor δεν αλλάζει (Task 3).

---

### Task 1: Δυνατό AI walls prompt (καθαρό)

**Files:** Modify `lib/floorplan/ai-core.ts` · Test `lib/floorplan/__tests__/ai-walls.test.ts` (υπάρχει)

**Interfaces:** `FLOORPLAN_WALLS_PROMPT`, `aiWallsResponse`, `parseAiWallsResponse`, `aiWallsToSegments` (όλα υπάρχουν ήδη από 06i· εδώ ΜΟΝΟ ενισχύεται το prompt).

- [ ] **Step 1:** Ενίσχυσε το `FLOORPLAN_WALLS_PROMPT`: ΜΟΝΟ δομικοί τοίχοι ως centerlines· ΑΥΣΤΗΡΑ αγνόησε κείμενα/γράμματα/αριθμούς/διαστάσεις/βελάκια/διαγραμμίσεις/έπιπλα/parking/οικόπεδο/κάδρο-σφραγίδα· προτίμησε λίγους μακριούς ίσιους τοίχους· «αν αμφιβάλλεις, παράλειψε». **Step 2:** Τα υπάρχοντα tests (`ai-walls.test.ts`, 4) πρέπει να μένουν πράσινα (το schema/converter δεν αλλάζει)· τρέξε τα. Το prompt-κείμενο δεν ελέγχεται με unit test (είναι οδηγία μοντέλου). **Step 3: Commit** `git commit -m "Κατόψεις: δυνατό AI walls prompt"`.

---

### Task 2: `roomsFromWalls` — οι τοίχοι ορίζουν τους χώρους (καθαρό)

**Files:** Create `lib/floorplan/editor/rooms.ts` · Test `lib/floorplan/__tests__/editor-rooms.test.ts`

**Interfaces:**
- Consumes: `WallEntity`, `Pt` (`editor/reducers.ts`).
- Produces:
  - `type DerivedRoom = { polygon: Pt[]; areaM2: number }`
  - `roomsFromWalls(walls: WallEntity[], opts?: { weldTolM?: number }): DerivedRoom[]` — planar subdivision: (1) μάζεψε τμήματα a–b· (2) **κόψε** στα σημεία τομής· (3) **κόλλησε** κόμβους εντός `weldTolM` (default 0.05m, union-find)· (4) half-edge traversal (σε κάθε κόμβο, το επόμενο directed edge = η πιο δεξιόστροφη στροφή) για εύρεση **bounded faces**· (5) κάθε face με εμβαδό (shoelace) > min → δωμάτιο· **απόρριψε** το εξωτερικό (unbounded/μεγαλύτερο αρνητικού προσανατολισμού) face.

- [ ] **Step 1: Failing test** `editor-rooms.test.ts`:
  - ένα τετράγωνο 4×4m (4 τοίχοι κλειστοί) → 1 room, `areaM2≈16`, polygon 4 κορυφές.
  - δύο γειτονικά τετράγωνα με κοινό τοίχο → 2 rooms.
  - L-σχήμα (6 τοίχοι) → 1 room με σωστό εμβαδό.
  - ανοιχτό περίγραμμα (λείπει ένας τοίχος) → 0 rooms (δεν σκάει).
  - το εξωτερικό περίγραμμα ΔΕΝ επιστρέφεται ως room.
- [ ] **Step 2: Run** `npx vitest run lib/floorplan/__tests__/editor-rooms.test.ts` → FAIL. **Step 3: Implement** (reuse `snapNodes`-style weld από `vectorize.ts` αν βοηθά). **Step 4: Run** → PASS. **Step 5: Commit** `git commit -m "Κατόψεις: roomsFromWalls (planar faces)"`.

---

### Task 3: Αφαίρεση raster «σκουπιδιών» + καθαρό δεξί πάνελ (v2, DOM)

**Files:** Modify `components/admin/floorplan/floor-plan-dialog.tsx`

**Interfaces:** Αφαιρούνται: `previewVectorWalls`, `acceptVectorWalls`, `wallPreview`/`setWallPreview`, το «Διανυσματικοί τοίχοι» block στο `rightExtra`, το `...(wallPreview ?? [])` στο `vectorWalls` prop, και το auto-populate effect (raster vectorize στο άνοιγμα). Ένα unified preview state `wallDraft: NewWall[] | null` (αντικαθιστά το `cadWalls`) για AI ΚΑΙ CAD. Νέα σειρά `rightExtra`: Κλίμακα → Ανίχνευση με AI (+preview) → Υπολογισμός χώρων → (δευτερεύον) CAD/PDF → Τύποι τοίχου.

- [ ] **Step 1:** Αφαίρεσε raster UI + handlers + state + auto-populate effect. **Step 2:** Εισήγαγε `wallDraft` unified preview + standalone block «Αποδοχή (N) / Άκυρο» (ΟΧΙ gated σε `isPdf`). **Step 3:** Αναδιάταξη `rightExtra` στη νέα σειρά. **Step 4:** `npx tsc --noEmit` + `npm run lint` 0 errors/no new warnings· manual QA: ο v2 δείχνει καθαρό πάνελ, ο v1 ανέπαφος. **Step 5: Commit** `git commit -m "Κατόψεις: αφαίρεση raster διαδρομής + καθαρό v2 πάνελ"`.

---

### Task 4: AI → preview + επιλογή περιοχής (v2, DOM)

**Files:** Modify `components/admin/floorplan/floor-plan-dialog.tsx`

**Interfaces:** Consumes `aiWallsResponse`/`aiWallsToSegments` (ai-core)· το route `${apiBase}/floorplan-ai` με `mode=walls` (υπάρχει, `detectStructure`)· `wallDraft` (Task 3)· store `addWalls`· `aiRegionMode` + `onMarquee` (04d).
- «Ανίχνευση με AI» (όλο): render `plan.display` (ή crop) → JPEG → POST `mode=walls` → `aiWallsResponse.parse` → `aiWallsToSegments(resp, cropW, cropH)` → offset (rx0,ry0) → μέτρα (×`mPerPx`) → `setWallDraft(incoming)` (preview, ΟΧΙ addWalls).
- «Επίλεξε περιοχή» → `aiRegionMode` → Shift+σύρσιμο → crop region → ίδιο μονοπάτι.
- «Αποδοχή» → `store.addWalls(wallDraft)` (με `clampAcceptCount`)· «Άκυρο» → `setWallDraft(null)`.
- Guards: χωρίς `mPerPx` ανενεργά + tooltip.

- [ ] **Step 1:** Σύνδεση «Ανίχνευση με AI» (όλο) → preview. **Step 2:** Επιλογή περιοχής (crop) → preview. **Step 3:** Αποδοχή/Άκυρο → store. **Step 4:** `npx tsc --noEmit` + `npm run lint` 0 errors· manual QA behind flag (έχεις OpenRouter key): AI βγάζει preview, Άκυρο το πετά, Αποδοχή τους βάζει· περιοχή σκανάρει μόνο το κτίσμα. **Step 5: Commit** `git commit -m "Κατόψεις: AI ανίχνευση τοίχων → preview + επιλογή περιοχής"`.

> Χωρίς unit test (DOM + AI I/O)· η καθαρή μετατροπή καλύπτεται από Task 1. Η ποιότητα AI = manual QA.

---

### Task 5: Λαβές άκρων τοίχου (επεξεργασία) στον PlanViewer (v2, DOM)

**Files:** Modify `components/admin/floorplan/plan-viewer.tsx` · `components/admin/floorplan/floor-plan-dialog.tsx`

**Interfaces:** Νέο optional prop `editWalls?: { id: string; a: Pt; b: Pt }[]` (οι επιλεγμένοι τοίχοι v2)· νέο callback `onWallEnd?(id, end: 'a'|'b', pt: Pt)`. Ο PlanViewer δείχνει **λαβές** στα a/b των `editWalls`· σύρσιμο λαβής → `onWallEnd` (με snapping στο dialog). Μοτίβο: όπως το υπάρχον room-vertex drag (`editHit`/`drag` kind 'vertex'), προσαρμοσμένο σε wall endpoints.

- [ ] **Step 1:** PlanViewer: render λαβών για `editWalls` + hit-test + drag → `onWallEnd`. **Step 2:** Dialog (v2): `editWalls` = ο επιλεγμένος τοίχος· `onWallEnd` → `snapPoint` (04d) → `store.moveWallEnd`. **Step 3:** `npx tsc --noEmit` + `npm run lint` 0 errors· manual QA: επιλογή τοίχου → σύρσιμο άκρου κουμπώνει σε γειτονικά· flag-off ανέπαφο. **Step 4: Commit** `git commit -m "Κατόψεις: λαβές άκρων τοίχου (επεξεργασία v2)"`.

---

### Task 6: «Υπολογισμός χώρων» από τοίχους (v2, DOM)

**Files:** Modify `components/admin/floorplan/floor-plan-dialog.tsx`

**Interfaces:** Consumes `roomsFromWalls` (Task 2)· `v2.data.walls` (μέτρα)· η υπάρχουσα προβολή χώρων (`viewerRooms`/`rooms` ή render στον PlanViewer).
- Κουμπί «Υπολογισμός χώρων» (v2 rightExtra) → `roomsFromWalls(v2.data.walls)` → πολύγωνα+εμβαδά → εμφάνιση στον καμβά (ως υπάρχον room layer) + σύνοψη στο status/takeoff. (Η αποθήκευση/σύνδεση με προσφορά = sub-project C, εκτός εδώ.)
- Guard: χωρίς τοίχους → toast «σχεδίασε/ανίχνευσε πρώτα τοίχους».

- [ ] **Step 1:** Κουμπί + κλήση `roomsFromWalls` → εμφάνιση δωματίων (px μέσω `/mPerPx`) στον καμβά. **Step 2:** Σύνοψη εμβαδών στο status/takeoff. **Step 3:** `npx tsc --noEmit` + `npm run lint` 0 errors· manual QA: μετά από τοίχους, «Υπολογισμός χώρων» δείχνει δωμάτια με εμβαδά. **Step 4: Commit** `git commit -m "Κατόψεις: υπολογισμός χώρων από τοίχους (v2)"`.

---

### Task 7: Πράσινη πύλη

- [ ] `npx tsc --noEmit` 0 · `npm test` πράσινο · `npm run lint` 0 errors · `npm audit` 0 high/critical · manual QA screenshots (v2: AI→preview→αποδοχή→διόρθωση→χώροι· v1 ανέπαφο) · `git push origin master` (με έγκριση χρήστη) · `git stash drop` (το WIP δεν χρειάζεται πια).
