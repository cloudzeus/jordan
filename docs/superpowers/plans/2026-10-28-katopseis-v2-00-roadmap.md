# Κατόψεις v2 — Roadmap υλοποίησης (plan-of-plans)

**Spec:** το paste «Κατόψεις v2 — Προδιαγραφές (jordan), 28 Oct 2026». Κράτα το δίπλα· κάθε
επιμέρους plan επιχειρηματολογεί πάνω του.

Το spec καλύπτει πολλά ανεξάρτητα υποσυστήματα. Σύμφωνα με τον κανόνα «ένα plan = ένα
shippable, testable κομμάτι», σπάει σε **7 plans** που βγαίνουν σε σειρά εξάρτησης. Κάθε plan
παράγει δουλεύον λογισμικό από μόνο του και γράφεται αναλυτικά (task-by-task, TDD) **όταν έρθει
η σειρά του** — δεν τα γράφουμε όλα μπροστά, γιατί κάθε φάση κλειδώνει αποφάσεις της επόμενης.

## Σειρά & εξαρτήσεις

| # | Plan | Παραδοτέο (shippable) | Εξαρτάται από |
|---|------|------------------------|----------------|
| 01 | **WallType catalog** | Πίνακας `WallType` (global) + seed + admin CRUD σελίδα + permission `floorplans.catalog`. Καθαρά additive, μηδέν ρίσκο regression. | — |
| 02 | **planData v2 + upgrade** | zod discriminated union `v:1 | v:2` σε `saved.ts`, καθαρό `upgradePlanData(v1)→v2` (pixels→μέτρα, `drawnWalls`→`walls[]`, `opening.at`→`wallId+t0/t1`), adapter ώστε οι σημερινοί consumers (`roomSheet`, `planRooms`, `plan-3d`, `floorPlanOffer`) να διαβάζουν v2 χωρίς αλλαγή συμπεριφοράς· regression dry-run σε όλες τις κατόψεις (±1%). | 01 |
| 03 | **vectorize.ts** | `lib/floorplan/vectorize.ts`: μάσκα τοίχων → διανυσματικοί τοίχοι (λέπτυνση Zhang–Suen, ιχνηλάτηση, συγχώνευση/ίσιωμα, κούμπωμα κόμβων, πρόταση τύπου από πάχος). Καθαρές συναρτήσεις + tests· χωρίς UI ακόμη. | 01, 02 |
| 04 | **Editor refactor + flag** → σπάει σε 4 υπο-plans (βλ. κάτω). **UI contract: [docs/design/floorplan-editor-v2.html](../../design/floorplan-editor-v2.html)** (full-screen, dark pro chrome + φωτεινό artboard, στυλ Illustrator/Hamina). | 02, 03 |

### Plan 04 — υπο-plans (editor)

Το `floor-plan-dialog.tsx` (1.662 γρ.) είναι ζωντανός production editor που ανοίγει από 6 σημεία. Δεν τον αγγίζουμε «στα τυφλά»: κάθε βήμα πίσω από το feature flag `floorplanV2`, με vitest στην καθαρή λογική (το project ΔΕΝ έχει E2E infra — `@playwright/test` υπάρχει αλλά χωρίς config/test-DB/creds· Playwright αναβάλλεται, safety net = vitest + manual QA πίσω από flag).

| # | Plan | Παραδοτέο | Εξαρτάται |
|---|------|-----------|-----------|
| 04a | **Flag + v2 shell (chrome)** | Feature flag `floorplanV2` (AppSetting, ανά χρήστη) + νέο κέλυφος editor που δείχνει όπως το mockup (top bar, αριστερή **draggable** παλέτα με όλα τα εργαλεία, δεξί πάνελ με κατάλογο τύπων τοίχου, status bar σε μέτρα, φωτεινό artboard) **τυλίγοντας τον υπάρχοντα `PlanViewer` + state**. Ορατό αποτέλεσμα, μηδέν ρίσκο για σημερινούς χρήστες (flag off). | 01, 03 |
| 04b | **v2 store + tool interface** | `editor/store.ts` (zustand + immer, planData v2, undo/redo) + tool interface· feature-parity με σήμερα· vitest στους reducers/selectors. Οι τοίχοι γίνονται επιλέξιμες οντότητες με `typeId`. | 02, 04a |
| 04c | **Wall-type tool + αποδοχή auto-walls** | Εργαλείο «Τύπος τοίχου» (1–9), επιλογή/αλλαγή τύπου ανά τοίχο στο δεξί πάνελ, και preview/«Αποδοχή τοίχων» από `vectorize` (Plan 03). | 04b |
| 04d | **Snapping + αριθμητική είσοδος + ορθογώνια επιλογή** | snap engine (γραμμικό· flatbush/rbush αναβάλλεται ως βελτιστοποίηση), αριθμητική είσοδος μήκους («3.45»+Enter), ορθογώνια επιλογή + μαζική αλλαγή τύπου. | 04b, 04c |
| 04e | **Autosave IndexedDB** | debounced persist του v2 store σε IndexedDB ανά κάτοψη + restore-on-open· ανεξάρτητο υποσύστημα persistence (βγήκε από το 04d). | 04b |
| 05 | **3D ανά τοίχο + ElementModel + χωρίσματα** | Νέο `walls3d.ts` με κόμβους (miter/T), R3F σκηνή, πίνακας `ElementModel` + 8 procedural μοντέλα + glb upload, πάνελ Στοιχείων, εργαλείο χωρίσματος. | 02, 04 |
| 06 | **CAD import — PDF διανύσματα** | `page.getOperatorList()` → segments· αναγνώριση με αρχιτεκτονικές συμβάσεις (τοίχοι=παράλληλα ζεύγη, κολόνες=μικρά κλειστά ορθογώνια, σκάλες=ισαπέχουσες παράλληλες)· λειτουργία «CAD/PDF layers» στον v2 editor. Λύνει τα διανυσματικά PDF (ο raster `detectWalls` πιάνει ~0,9%). | 02, 03, 04 |
| 06b | **CAD import — DXF** | DXF parser (worker), layer-mapping UI + προφίλ CAD, ίδιος αγωγός αναγνώρισης με το 06. | 06 |
| 06c | **CAD import — DWG** | DWG→DXF service (container, LibreDWG/ODA) → τροφοδοτεί το 06b. Ανεξάρτητο infra. | 06b |
| 07 | **Takeoff + offer + export** | Καθαρό `takeoff(planData, types, models)` → `lib/floorplan/takeoff.ts`· επέκταση `floorPlanOffer` (γραμμές ανά τύπο τοίχου & μοντέλο)· XLSX/PDF επιμέτρησης. | 02, 05 |

Snapping & Web Workers (Φάση 4 του spec) εντάσσονται στο 04 (snapping engine, αριθμητική είσοδος)
και σταδιακά στα 03/06 (workers για vectorize/DXF/PDF), όχι ως χωριστό plan.

### Νέα κατεύθυνση (χρήστης, 2026-10-29) — 3 input paths + reusable trace

Ο πελάτης ανεβάζει και **ΕΙΚΟΝΑ** (όχι μόνο PDF/DXF). Τα 3 input paths καταλήγουν σε **ένα ουδέτερο
FloorPlan model** (γεωμετρία μόνο): εικόνα → **AI vision trace**· vector PDF → 06· DXF → 06b.

| # | Plan | Παραδοτέο | Εξαρτάται |
|---|------|-----------|----------|
| 06i | **AI vision trace (εικόνες)** | Βελτιωμένο `FLOORPLAN_AI_PROMPT` + schema ώστε το vision μοντέλο να **ιχνηλατεί ΣΤΟΙΧΕΙΑ** (τοίχους-polylines, πόρτες/παράθυρα, κολόνες, σκάλες), όχι μόνο χώρους· ίδιος αγωγός → store (parity με 06). **Μέσω OpenRouter** (gateway· επιλογή vision μοντέλου, π.χ. Claude). Κλίμακα: **χειροκίνητη** (όπως τώρα — ΟΧΙ auto). | 02, 04 |
| R | **Reusable `blueprint-trace` component** | Εξαγωγή trace+editor σε app-agnostic boundary (ουδέτερο FloorPlan model, generic markers)· ΧΩΡΙΣ WallType/materials/offers/SoftOne. Για property-mgmt / IoT placement / site survey / CV camera mgmt. jordan = thin consumer. | 06, 06i |

Βλ. memory `blueprint-trace-reusable`. Το `lib/floorplan/{cad,vectorize,snapping,editor}` είναι ήδη
~80% καθαρή γεωμετρία· το coupling είναι `EditorShellWallType`/materials + offers + ο dialog.

## Γιατί το 01 (WallType) προηγείται του editor-split

Το spec βάζει πρώτο το σπάσιμο του editor «γιατί οι Φάσεις 1–3 δεν χωράνε στο dialog». Ισχύει —
αλλά ο κατάλογος `WallType` (model + admin σελίδα) **δεν αγγίζει** το dialog καθόλου: είναι καθαρά
additive, χωρίς ρίσκο regression, και είναι prerequisite για vectorize/3D/takeoff/CAD. Άρα
προηγείται με ασφάλεια. Το editor-split (04) παραμένει πριν από τα βαριά UI κομμάτια (05/06).

## Αποφάσεις (κλειδωμένες για αυτό το roadmap)

1. **Multi-tenant: ΟΧΙ τώρα.** `WallType` (και αργότερα `ElementModel`) είναι global, κοινός για όλες
   τις κατόψεις — όπως λέει το spec. Χωρίς στήλη office/tenant. Διαδρομή μετανάστευσης αν δοθεί σε
   γραφεία εκτός DGSMART: προσθήκη nullable `ownerOfficeId` + scoping στα queries — δεν σπάει τα
   global rows (owner = null = global). Καταγράφεται ως ανοιχτό, όχι blocker.
2. **planData migration στο διάβασμα**, όχι μαζικό script. v1 γράφεται πίσω ως v2 μόνο στην επόμενη
   αποθήκευση (Plan 02).
3. **Feature flag `floorplanV2`** χτίζεται στο Plan 04 (δεν υπάρχει flag system σήμερα), ανά χρήστη,
   ώστε ο σημερινός editor να μένει διαθέσιμος ως το τέλος της Φάσης 1. Τα Plans 01–03 είναι
   αόρατα στον τελικό χρήστη (catalog + καθαρές συναρτήσεις), δεν χρειάζονται flag.

## Ανοιχτά ερωτήματα (δένονται στο plan που τα χρειάζεται πρώτο)

- **Plan 06:** ODA File Converter (εμπορική άδεια) ή μόνο LibreDWG; → default LibreDWG, αξιολόγηση ODA αν αποτυγχάνει σε νέες DWG.
- **Plan 07:** προεπιλεγμένος κανόνας αφαίρεσης ανοιγμάτων (>0,5 m² / 1 m² / όλα); → ορίζεται ανά συνταγή· **default που θέλει επιβεβαίωση χρήστη πριν το Plan 07.**
- **Plan 05:** μοντέλα στοιχείων ↔ είδη SoftOne από την αρχή ή αργότερα; → default «αργότερα» (nullable `itemMtrl`).
- **Plan 06:** εξαγωγή DXF της τελικής κάτοψης πίσω στο γραφείο; → εκτός scope v2 εκτός αν ζητηθεί.

## Μη-λειτουργικά (ισχύουν σε όλα τα plans)

- Next.js 16.2+, Prisma/PostgreSQL (τελευταία 7.x), Auth.js, shadcn, Tailwind v4, vitest, next-intl, SI μονάδες.
- Git: commit + push απευθείας στο `master`. Πριν push: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors), `npm audit` (0 high/critical)· αλλαγές εμφάνισης με screenshots.
- Admin UI κανόνες: [docs/design/admin.md](../../design/admin.md) — ρίζα 15px, μία γραμμή ανά στοιχείο, ενέργειες πάντα σε ⋮ dropdown.
- Wiki entry για κάθε νέο user-facing route (βλ. CLAUDE.md «Wiki convention»).
- Καθαρή λογική σε `lib/floorplan/` χωρίς DOM, με vitest.
