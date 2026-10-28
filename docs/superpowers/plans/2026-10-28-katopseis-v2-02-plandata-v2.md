# Κατόψεις v2 · Plan 02 — planData v2 + upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ένα δεύτερο, διανυσματικό μοντέλο δεδομένων κάτοψης (`planData` v2, σε **μέτρα**, με τοίχους ως οντότητες) και μια καθαρή `upgradePlanData` που μετατρέπει κάθε v1 σε v2 **διατηρώντας τα m²** (±1%), αποδεδειγμένα πάνω σε όλες τις αποθηκευμένες κατόψεις.

**Architecture:** Καθαρή βιβλιοθήκη, χωρίς αλλαγή στη ζωντανή ροή. Νέο zod schema `planDataV2` δίπλα στο υπάρχον `planData` (v1), καθαρό `upgradePlanData(unknown) → PlanDataV2` στο `lib/floorplan/upgrade.ts`, και αρμονία επιμέτρησης `roomTakeoffV2` που αποδεικνύει ισοδυναμία με το σημερινό `roomSheet`. Ο σημερινός editor/consumers **δεν αλλάζουν** — βλ. Decisions.

**Tech Stack:** TypeScript, zod, vitest, Prisma/PostgreSQL (μόνο για το dry-run script).

**Spec:** `docs/superpowers/plans/2026-10-28-katopseis-v2-00-roadmap.md` → §1.2 και §1.5 του paste «Κατόψεις v2». Προαπαιτούμενο: Plan 01 (`WallType`, `lib/floorplan/wall-types.ts`).

## Global Constraints

- Git: commit + push στο `master`. Πριν push: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors), `npm audit` (0 high/critical).
- Καθαρή λογική σε `lib/floorplan/` χωρίς DOM, με vitest. Tests κάτω από `lib/**` (vitest include).
- Μονάδες v2: **μέτρα** (SI). Οι συντεταγμένες v1 είναι pixels ανάλυσης.
- Συμβατότητα: κάθε v1 ανοίγει, μετατρέπεται και δίνει ίδια `floorM2`/`wallsM2` (ανοχή **1%**).
- Καμία αλλαγή στο `components/admin/floorplan/floor-plan-dialog.tsx` ή στους σημερινούς consumers (`roomSheet`, `planRooms`, `plan-3d`, `floorPlanOffer`) — βλ. Decisions.

## Decisions (κλειδωμένες — ρυθμίζουν το scope)

1. **Plan 02 = καθαρή βιβλιοθήκη, χωρίς live wiring.** Ο ΜΟΝΟΣ writer του `FloorPlan.data` είναι το 1.662-γραμμο `floor-plan-dialog.tsx`, που το Plan 04 ξαναγράφει v2-native. Το να γυρίσουμε reads/writes σε v2 **τώρα** σημαίνει μια προσωρινή γέφυρα v1↔v2 μέσα στο dialog που το Plan 04 διαγράφει. Άρα: Plan 02 παραδίδει schema + `upgradePlanData` + regression, **το `plans.ts` και οι consumers μένουν σε v1**. Το «upgrade-on-read» του spec (§1.5) και η στροφή των consumers σε v2 γίνονται στο Plan 04 μαζί με τον editor. Κανένα v2 blob δεν γράφεται στη βάση στο Plan 02, οπότε η ζωντανή ροή δεν αλλάζει.
2. **Διατήρηση m² με carry-forward.** Τα `wallsM2` v1 = `wallArea(perimeterM, room.walls)` (περίμετρος×ύψος − ανοίγματα, με `w×h×count`). Το v2 room κρατά αυτούσιο το `walls` (RoomWalls) και τα `floorM2`/`perimeterM` ως αριθμούς — άρα τα m² βγαίνουν **ακριβώς** ίδια. Η θέση των ανοιγμάτων (`at`→`t0/t1`) αφορά το 3D, όχι το άθροισμα m², οπότε η προβολή τους είναι additive metadata.
3. **`walls[]` από `drawnWalls` μόνο.** Οι αυτο-ανιχνευμένοι τοίχοι δεν ζουν στο v1 `data` (ξαναβγαίνουν από την εικόνα), άρα δεν μεταφέρονται. Τα `dividers` μένουν `dividers` (γραμμές κοπής flood-fill, όχι τοίχοι).
4. **Χωρίς κλίμακα → «μονάδες εικόνας».** Αν `mPerPxOf(v1) == null && pxPerM == null`, το upgrade κρατά τις συντεταγμένες ως έχουν, θέτει `underlay.mPerPx = null` και `rooms[].floorM2 = rooms[].perimeterM = 0` (όπως σήμερα το `roomSheet` επιστρέφει κενό). Καμία διαίρεση με το μηδέν / NaN.
5. **`typeId` μπορεί να είναι null** σε έναν v2 τοίχο όταν δεν δίνονται WallTypes ή δεν ταιριάζει κανείς — το schema το επιτρέπει· ο editor (Plan 04) ζητά τύπο.

## Review Focus

- **Κάτοψη χωρίς calib/pxPerM:** το upgrade πρέπει να βγάζει έγκυρο v2 με `mPerPx=null` και μηδενικά m² — όχι NaN/Infinity (Task 3 test).
- **Opening με `at` μακριά από κάθε τοίχο** (ή χωρίς `drawnWalls`): η προβολή δεν πρέπει να σκάσει ή να δέσει σε λάθος τοίχο — fallback σε «μόνο καταμέτρηση χώρου» (παραμένει στο room, εκτός top-level `openings`) (Task 3 test).
- **`drawnWalls` με `t=0` ή χωρίς WallTypes:** `nearestWallTypeByThickness` → `null`, ο τοίχος παίρνει `typeId=null` χωρίς σφάλμα (Task 1 + Task 3 tests).
- **Χειροκίνητοι χώροι (`manual:true`):** το πολύγωνο μεταφέρεται σε μέτρα, το `floorM2` μένει από `areaPx·mpp²` (παρ ity με v1) (Task 3 test).
- **Ιδιοδυναμία:** `upgradePlanData(upgradePlanData(x))` ισοδύναμο με `upgradePlanData(x)` για v1 και v2 είσοδο (Task 3 test).

---

### Task 1: `nearestWallTypeByThickness` (καθαρό)

**Files:**
- Modify: `lib/floorplan/wall-types.ts` (νέα εξαγόμενη συνάρτηση)
- Modify/Create test: `lib/floorplan/__tests__/wall-types.test.ts`

**Interfaces:**
- Produces: `nearestWallTypeByThickness(types: { id: string; thicknessM: number; active: boolean }[], thicknessM: number): string | null`

- [ ] **Step 1: Failing test** — προσθήκη στο `wall-types.test.ts`:

```ts
import { nearestWallTypeByThickness } from '../wall-types';
const ts = [
  { id: 'a', thicknessM: 0.1, active: true },
  { id: 'b', thicknessM: 0.2, active: true },
  { id: 'c', thicknessM: 0.25, active: false },
];
it('picks the closest active type by thickness', () => {
  expect(nearestWallTypeByThickness(ts, 0.12)).toBe('a');
  expect(nearestWallTypeByThickness(ts, 0.19)).toBe('b');
});
it('ignores inactive types and returns null when none', () => {
  expect(nearestWallTypeByThickness(ts, 0.24)).toBe('b'); // c (0.25) is inactive
  expect(nearestWallTypeByThickness([], 0.1)).toBeNull();
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — φίλτρο `active`, `reduce` στο ελάχιστο `Math.abs(t.thicknessM - thicknessM)`, `null` σε κενό. **Step 4: Run** → PASS. **Step 5: Commit** `git commit -m "Κατόψεις v2: nearestWallTypeByThickness για τη μετατροπή τοίχων"`

---

### Task 2: `planDataV2` zod schema

**Files:**
- Modify: `lib/floorplan/saved.ts` (νέο schema + union + types· το `planData` v1 μένει ως έχει)
- Test: `lib/floorplan/__tests__/saved-v2.test.ts`

**Interfaces:**
- Consumes: τα `pt`, `roomMaterial`, `opening` (v1) από το ίδιο αρχείο.
- Produces:
  - `planDataV2` (zod) με `v: z.literal(2)` και πεδία: `floor {ceilingM, slabM}`, `underlay` (nullable: `{fileId?, page, wPx, hPx, mPerPx: number|null, rotation, offset:{x,y}, calib: {a,b,meters}|null, opacity}`), `walls: [{id, a, b, typeId: string|null, source: 'auto'|'cad'|'drawn', locked?: boolean}]`, `openings: [{id, wallId, t0, t1, modelId?: string|null, kind, sillM, heightM, swing?: 'left'|'right'|null}]`, `rooms: [{id, name, color, seed: pt|null, polygon: pt[] (meters), manual, walls: RoomWalls|undefined, material, materialB, floorM2, perimeterM}]`, `dividers`, `dims`, `pins`, `devices`, `cables`, `render3dFileId`.
  - `planDataAny = z.discriminatedUnion('v', [planData, planDataV2])`
  - `type PlanDataV2 = z.infer<typeof planDataV2>`

- [ ] **Step 1: Failing test** `saved-v2.test.ts`: ένα ελάχιστο v2 object κάνει `planDataV2.parse` με defaults (`floor.ceilingM` default 2.8, `walls:[]`, `openings:[]`), και `planDataAny.parse` διαλέγει σωστά v1 vs v2 από το `v`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** το schema (καθρέφτης του v1 όπου ταιριάζει, μέτρα αντί px, όρια πλήθους όπως v1). **Step 4: Run** → PASS. **Step 5: Commit**.

---

### Task 3: `upgradePlanData` (καθαρό)

**Files:**
- Create: `lib/floorplan/upgrade.ts`
- Test: `lib/floorplan/__tests__/upgrade.test.ts`

**Interfaces:**
- Consumes: `planData`/`planDataV2`/`mPerPxOf` (saved.ts), `nearestWallTypeByThickness` (Task 1), `labelPoint` (core.ts), `openingArea`/`wallArea` (walls.ts).
- Produces: `upgradePlanData(raw: unknown, opts?: { wallTypes?: { id: string; thicknessM: number; active: boolean }[] }): PlanDataV2`

- [ ] **Step 1: Failing test** `upgrade.test.ts` — χρησιμοποίησε το ίδιο `base` v1 του `saved.test.ts` (calib 100px=1m):

```ts
it('converts v1 to meters preserving floor and wall m² within 1%', () => {
  const v1 = /* planData.parse(base) */;
  const v2 = upgradePlanData(v1, { wallTypes: [{ id: 'gb', thicknessM: 0.15, active: true }] });
  expect(v2.v).toBe(2);
  const t = roomTakeoffV2(v2);          // Task 4
  expect(t.floorM2).toBeCloseTo(6.5, 2);
  expect(t.wallsM2).toBeCloseTo(22.11, 2);
  // drawnWall 500px@100px/m → 5 m, 15px → 0.15 m → nearest type 'gb'
  expect(v2.walls[0]).toMatchObject({ typeId: 'gb', source: 'drawn' });
  expect(v2.walls[0].a).toEqual({ x: 0, y: 0 });
  expect(v2.walls[0].b).toEqual({ x: 5, y: 0 });
});
it('a v2 input passes through (idempotent)', () => {
  const v2 = upgradePlanData(base_v1);
  expect(upgradePlanData(v2)).toEqual(v2);
});
it('a plan with no scale yields mPerPx null and zero m², no NaN', () => {
  const v2 = upgradePlanData({ ...base_v1, calib: null, pxPerM: null });
  expect(v2.underlay?.mPerPx).toBeNull();
  expect(roomTakeoffV2(v2).floorM2).toBe(0);
});
it('drawnWall with no matching types gets typeId null', () => {
  const v2 = upgradePlanData(base_v1, { wallTypes: [] });
  expect(v2.walls[0].typeId).toBeNull();
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `upgradePlanData`. Αλγόριθμος: αν `raw.v===2` → `planDataV2.parse(raw)` (passthrough). Αλλιώς `v1 = planData.parse(raw)`, `mpp = mPerPxOf(v1) ?? (v1.pxPerM ? 1/v1.pxPerM : null)`, `m = (p) => mpp ? {x:p.x*mpp, y:p.y*mpp} : p`. Χτίσε: `floor {ceilingM: 2.8, slabM: 0}`; `underlay {page: v1.page, wPx: v1.w, hPx: v1.h, mPerPx: mpp, rotation: 0, offset: {x:0,y:0}, calib: v1.calib ? {a:m(v1.calib.a), b:m(v1.calib.b), meters: v1.calib.meters} : null, opacity: 1}`; `walls` από `v1.drawnWalls` → `{id: uid(), a:m(a), b:m(b), typeId: mpp ? nearestWallTypeByThickness(opts.wallTypes ?? [], t*mpp) : null, source:'drawn'}`; `dividers` → `m` και στα δύο άκρα· `rooms` → `{...r, polygon: r.polygon.map(m), seed: labelPoint(r.polygon.map(m)) , floorM2: mpp ? r.areaPx*mpp*mpp : 0, perimeterM: mpp ? r.perimeterPx*mpp : 0, walls: r.walls, material: r.material, materialB: r.materialB}`· `openings` top-level: για κάθε `r.walls.openings` με `at`, πρόβαλε το μέσο του `at` στον πλησιέστερο v2 wall (ανοχή = πάχος τύπου ή σταθερό), βγάλε `{id, wallId, t0, t1, kind, sillM: sill, heightM: h}`· όσα δεν δένουν ή δεν έχουν `at` παραμένουν μόνο στο room (δεν μπαίνουν στο top-level). `dims/pins/devices/cables` → μέτρα.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit**.

---

### Task 4: `roomTakeoffV2` (καθαρό, για το regression)

**Files:**
- Modify: `lib/floorplan/saved.ts` (νέα συνάρτηση) ή `lib/floorplan/upgrade.ts`
- Test: μέσα στο `upgrade.test.ts` (χρησιμοποιείται ήδη από Task 3)

**Interfaces:**
- Produces: `roomTakeoffV2(d: Pick<PlanDataV2,'rooms'>): { floorM2: number; wallsM2: number }` — `floorM2 = Σ room.floorM2`, `wallsM2 = Σ (room.walls?.on ? wallArea(room.perimeterM, room.walls).net : 0)`.

- [ ] **Step 1–4:** Το test του Task 3 ήδη το ασκεί (floorM2 6.5, wallsM2 22.11). Γράψε τη συνάρτηση ώστε να περάσει· **Step 5: Commit** μαζί με το Task 3 αν βγήκαν μαζί, αλλιώς ξεχωριστά.

---

### Task 5: Regression — fixtures + dry-run όλης της βάσης

**Files:**
- Create: `lib/floorplan/__tests__/regression-upgrade.test.ts`
- Use: `lib/floorplan/__tests__/fixtures/ai-isogeio.json` (υπάρχον) + 2–3 νέα golden v1 blobs αν χρειαστεί
- Create: `scripts/floorplan/verify-upgrade.mjs`

**Interfaces:**
- Consumes: `planData`/`roomSheet` (v1), `upgradePlanData`/`roomTakeoffV2` (v2).

- [ ] **Step 1: Failing test** `regression-upgrade.test.ts`: για κάθε fixture, `const v1 = planData.parse(fixture); const a = roomSheet(v1); const b = roomTakeoffV2(upgradePlanData(v1));` και `expect(b.floorM2).toBeCloseTo(a.floorM2, 1%)`, ίδιο για `wallsM2`. (Υλοποίησε βοηθό ανοχής `within(a,b,0.01)`.)
- [ ] **Step 2: Run** → FAIL (αν λείπει κάτι) / PASS αν όλα σωστά — αν περάσει αμέσως, πρόσθεσε ένα fixture που σπάει για να δεις το gate να δουλεύει, μετά διόρθωσε.
- [ ] **Step 3:** `scripts/floorplan/verify-upgrade.mjs` — bootstrap Prisma με `PrismaPg` adapter (όπως `scripts/seed.js`), `findMany` όλα τα `FloorPlan {id,title,data,floorM2,wallsM2}`, για καθένα `upgradePlanData` + `roomTakeoffV2`, τύπωσε όσα αποκλίνουν >1% από τα αποθηκευμένα `floorM2/wallsM2`, και σύνολο «N/N εντός ανοχής». **Read-only** (κανένα write).
- [ ] **Step 4:** Τρέξε το script στη dev βάση· 0 εκτός ανοχής (ή κατέγραψε/διόρθωσε όσα βρεθούν με ruling). **Step 5: Commit** fixtures + test + script.

---

### Task 6: Πράσινη πύλη

- [ ] `npx tsc --noEmit` 0 errors · `npm test` πράσινο · `npm run lint` 0 errors · `npm audit` 0 high/critical · `git push origin master` (με έγκριση χρήστη).
