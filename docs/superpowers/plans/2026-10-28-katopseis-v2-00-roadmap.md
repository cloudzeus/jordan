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
| 04 | **Editor refactor + flag** | Σπάσιμο του `floor-plan-dialog.tsx` (1.662 γρ.) σε `editor/` (zustand store + tool interface), με Playwright characterization tests **πριν** το refactor· εργαλείο «Τύπος τοίχου» (hotkeys 1–9)· feature flag `floorplanV2` ανά χρήστη· ίδιες λειτουργίες με σήμερα + αποδοχή/απόρριψη auto-walls. | 02, 03 |
| 05 | **3D ανά τοίχο + ElementModel + χωρίσματα** | Νέο `walls3d.ts` με κόμβους (miter/T), R3F σκηνή, πίνακας `ElementModel` + 8 procedural μοντέλα + glb upload, πάνελ Στοιχείων, εργαλείο χωρίσματος. | 02, 04 |
| 06 | **CAD import** | DXF worker, DWG→DXF service (container), PDF paths, οθόνη αντιστοίχισης layers + προφίλ CAD, `cad-walls.ts` με tests σε 3 πραγματικά σχέδια. | 02, 04 |
| 07 | **Takeoff + offer + export** | Καθαρό `takeoff(planData, types, models)` → `lib/floorplan/takeoff.ts`· επέκταση `floorPlanOffer` (γραμμές ανά τύπο τοίχου & μοντέλο)· XLSX/PDF επιμέτρησης. | 02, 05 |

Snapping & Web Workers (Φάση 4 του spec) εντάσσονται στο 04 (snapping engine, αριθμητική είσοδος)
και σταδιακά στα 03/06 (workers για vectorize/DXF/PDF), όχι ως χωριστό plan.

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
