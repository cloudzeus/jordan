# Κατόψεις v2 · Plan 04a — Feature flag + v2 editor shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ένα νέο κέλυφος editor που δείχνει όπως το εγκεκριμένο mockup (full-screen dark pro chrome: top bar, αριστερή **draggable** παλέτα με όλα τα εργαλεία, δεξί πάνελ με κατάλογο τύπων τοίχου, status bar σε μέτρα, φωτεινό artboard), πίσω από feature flag `floorplanV2` — τυλίγοντας τον υπάρχοντα `PlanViewer` και το state, χωρίς κανένα ρίσκο για τους σημερινούς χρήστες.

**Architecture:** Καθαρή λογική (flag resolver, clamp παλέτας) με vitest· presentational component `editor-shell.tsx` που παίρνει τα εργαλεία/δεδομένα/handlers από το `FloorPlanDialog` και αποδίδει το chrome του mockup γύρω από τον ίδιο `PlanViewer`. Το flag ζει σε `AppSetting` (ανά χρήστη). **Καμία αλλαγή στη λογική διαστασιολόγησης/αποθήκευσης** — μόνο διάταξη/στυλ, υπό flag.

**Tech Stack:** Next.js 16.2+, React, Tailwind v4, shadcn, Prisma (AppSetting), vitest.

**Spec / UI contract:** [docs/design/floorplan-editor-v2.html](../../design/floorplan-editor-v2.html) + roadmap `…-00-roadmap.md` (§Plan 04 υπο-plans). Προαπαιτούμενα: Plan 01 (`WallType` + `listWallTypes`), Plan 03 (vectorize — χρησιμοποιείται από 04c, όχι εδώ).

## Global Constraints

- Git: commit + push στο `master`. Πριν push: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors), `npm audit` (0 high/critical).
- Admin UI: [docs/design/admin.md](../../design/admin.md). Tailwind v4 (`text-(length:--fs-…)`, `shadow-xs`, `outline-hidden`). Το chrome του editor είναι **σκούρο** (dark pro) — είναι εστιασμένος workspace, όχι admin σελίδα· το υπόλοιπο admin μένει ανοιχτό.
- Τυπογραφία fluid/rem (όχι fixed px) κατά τους κανόνες του project.
- Tests κάτω από `lib/**` (vitest include). Καθαρή λογική σε `lib/floorplan/`.
- **Flag off ⇒ 100% ο σημερινός editor.** Κανένας σημερινός χρήστης δεν βλέπει αλλαγή ώσπου ο SUPER_ADMIN τον ενεργοποιήσει.
- Visual verification: πίσω από auth — ο χρήστης το ελέγχει με το flag on (δεν υπάρχουν test creds για screenshot).

## Decisions

1. **Το shell τυλίγει το σημερινό state/PlanViewer.** ΔΕΝ γίνεται ακόμη zustand refactor (04b) ούτε τοίχοι-ως-οντότητες. Το δεξί πάνελ δείχνει τον κατάλογο τύπων (WallType, Plan 01) ως παλέτα + τις ιδιότητες της ΤΡΕΧΟΥΣΑΣ επιλογής (χώρος/συσκευή) όπως σήμερα. Η επιλογή/τύπος ανά τοίχο έρχεται με το v2 store (04b).
2. **Flag σε `AppSetting` key `floorplan.v2`**, value `{ all?: boolean; userIds?: string[] }`. Resolver καθαρός· ο SUPER_ADMIN το ρυθμίζει.
3. **Wire μόνο το κύριο σημείο** (admin floorplans gallery) σε αυτό το plan· τα άλλα 5 call sites μένουν v1 (default) και wire-άρονται όταν σταθεροποιηθεί το shell. Μηδέν blast radius.
4. **Playwright αναβάλλεται** (δεν υπάρχει E2E infra): safety net = vitest στην καθαρή λογική + manual QA πίσω από flag.
5. Draggable παλέτα: η θέση σε `localStorage` (per-viewer convenience), με try/catch· προεπιλογή πάνω-αριστερά.

## Review Focus

- **Flag off:** το `FloorPlanDialog` αποδίδει ΑΚΡΙΒΩΣ τη σημερινή διάταξη (καμία οπτική/λειτουργική αλλαγή) — όλα τα υπάρχοντα tests του editor μένουν πράσινα (Task 5).
- **Resolver άγνωστου/null χρήστη:** `floorplanV2Enabled(cfg, null)` → false· κενό `cfg` → false· `all:true` → όλοι (Task 1).
- **Παλέτα εκτός ορίων:** `clampToolbarPos` κρατά την παλέτα ΜΕΣΑ στον καμβά ακόμη κι όταν ο καμβάς είναι μικρότερος από την παλέτα (δεν βγαίνει αρνητικό/εκτός) (Task 3).
- **Δικαίωμα toggle:** μόνο ρόλος με `system.settings` (SUPER_ADMIN) αλλάζει το flag· αλλιώς `{ok:false}` χωρίς write (Task 2).
- **Separators παλέτας:** τα διαχωριστικά ΔΕΝ απλώνονται σε όλο το πλάτος (το σημερινό bug) — σταθερό πλάτος, κεντραρισμένα· η παλέτα έχει `w-fit` (Task 4).

---

### Task 1: Καθαρός flag resolver

**Files:** Create `lib/floorplan/feature-flag.ts` · Test `lib/floorplan/__tests__/feature-flag.test.ts`

**Interfaces:**
- `type FloorplanV2Config = { all?: boolean; userIds?: string[] }`
- `floorplanV2Enabled(cfg: FloorplanV2Config | null | undefined, userId: string | null): boolean`

- [ ] **Step 1: Failing test**:

```ts
import { floorplanV2Enabled } from '../feature-flag';
it('is off by default / for unknown config or user', () => {
  expect(floorplanV2Enabled(null, 'u1')).toBe(false);
  expect(floorplanV2Enabled({}, 'u1')).toBe(false);
  expect(floorplanV2Enabled({ userIds: ['u2'] }, 'u1')).toBe(false);
  expect(floorplanV2Enabled({ userIds: ['u1'] }, null)).toBe(false);
});
it('is on when all=true or the user is listed', () => {
  expect(floorplanV2Enabled({ all: true }, 'u1')).toBe(true);
  expect(floorplanV2Enabled({ userIds: ['u1', 'u2'] }, 'u1')).toBe(true);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (`cfg?.all === true || (!!userId && (cfg?.userIds ?? []).includes(userId))`). **Step 4: Run** → PASS. **Step 5: Commit**.

---

### Task 2: Server helper + toggle action

**Files:** Create `lib/floorplan/feature-flag-db.ts` · Create `app/admin/floorplans/flag-actions.ts` · Test `lib/floorplan/__tests__/flag-actions.test.ts` (mock rbac/db/settings, pattern: wall-types actions test)

**Interfaces:**
- `getFloorplanV2Config(): Promise<FloorplanV2Config>` — διαβάζει `AppSetting` key `floorplan.v2` (default `{}`).
- `floorplanV2ForUser(userId: string | null): Promise<boolean>` — `floorplanV2Enabled(await getFloorplanV2Config(), userId)`.
- `setFloorplanV2Action(input: { all?: boolean; userIds?: string[] }): Promise<ActionResult>` — `actor('system.settings')`, γράφει το AppSetting (upsert), `revalidatePath('/admin/floorplans')`.

- [ ] **Step 1: Failing test** — με mocked `getCurrentUserWithPermissions`/`prisma`:
  - χρήστης ΧΩΡΙΣ `system.settings` → `setFloorplanV2Action` `{ok:false}`, κανένα `appSetting.upsert`.
  - με δικαίωμα → upsert με key `floorplan.v2` και το value.
- [ ] **Step 2–4.** **Step 5: Commit**.

---

### Task 3: Clamp θέσης παλέτας (καθαρό)

**Files:** Modify `lib/floorplan/feature-flag.ts` → όχι· Create `lib/floorplan/editor-ui.ts` · Test `lib/floorplan/__tests__/editor-ui.test.ts`

**Interfaces:** `clampToolbarPos(pos: {x:number;y:number}, bounds: {w:number;h:number}, el: {w:number;h:number}, pad?: number): {x:number;y:number}`

- [ ] **Step 1: Failing test**: μέσα στα όρια → ίδιο· αρνητικό → `pad`· πέρα δεξιά/κάτω → `bounds − el − pad`· όταν `el > bounds` → `pad` (δεν βγαίνει αρνητικό πέρα από pad).

```ts
expect(clampToolbarPos({x:-50,y:-50},{w:800,h:600},{w:48,h:400},4)).toEqual({x:4,y:4});
expect(clampToolbarPos({x:999,y:999},{w:800,h:600},{w:48,h:400},4)).toEqual({x:800-48-4,y:600-400-4});
expect(clampToolbarPos({x:10,y:10},{w:40,h:40},{w:48,h:400},4)).toEqual({x:4,y:4}); // el > bounds
```

- [ ] **Step 2–4.** Υλοποίηση: `x = Math.max(pad, Math.min(pos.x, Math.max(pad, bounds.w - el.w - pad)))` (ίδιο για y). **Step 5: Commit**.

---

### Task 4: `EditorShell` chrome (presentational)

**Files:** Create `components/admin/floorplan/editor-shell.tsx`
Πρότυπο στυλ/δομής: [docs/design/floorplan-editor-v2.html](../../design/floorplan-editor-v2.html).

**Interfaces (props):**
```ts
type EditorShellProps = {
  title: string; subtitle?: string;
  tools: Array<{ key: string; label: string; kbd: string; icon: React.ReactNode; group: string }>;
  activeTool: string; onTool: (k: string) => void;
  ortho: boolean; onToggleOrtho: () => void;
  view3d: boolean; onView: (v: boolean) => void; canUse3d: boolean;
  zoomPct?: number; scaleLabel?: string; ceilingLabel?: string;
  wallTypes: Array<{ id: string; code: string; name: string; color: string; thicknessM: number; hotkey: string | null }>;
  status: { xM?: string; yM?: string; lengthM?: string; angleDeg?: string; selection?: string; snap?: string };
  takeoff?: { floorM2: string; wallsM2: string; openings?: string };
  onSave: () => void; saving?: boolean; onExport?: () => void;
  rightExtra?: React.ReactNode; // ιδιότητες τρέχουσας επιλογής (από τον dialog)
  children: React.ReactNode;    // ο καμβάς (PlanViewer) — φωτεινό artboard
};
```
Αποδίδει: top bar (τίτλος, scale/ceiling chips, 2D/3D, zoom, Επιμέτρηση, Αποθήκευση), αριστερή **draggable** παλέτα (grip handle + κουμπιά ανά group με hotkeys + 90°/F8), δεξί inspector (λίστα `wallTypes` με χρώμα+hotkey, μετά `rightExtra`, μετά `takeoff`), bottom status bar.

- [ ] **Step 1: Build** το component με τα tokens του mockup (`#0F172A`/violet `#7C3AED`/cyan `#22D3EE`, Inter), **`w-fit`** παλέτα, διαχωριστικά `w-7 self-center` (όχι stretch), `role="toolbar"`. Η παλέτα σέρνεται από το grip (pointer events + `clampToolbarPos`, θέση σε `localStorage` με try/catch). Touch targets ≥ 36–44px, `cursor-pointer`, focus rings, `prefers-reduced-motion` για τις μεταβάσεις.
- [ ] **Step 2: Verify render απομονωμένα** — πρόσθεσε προσωρινά ένα route/story ή απόδωσε με mock props σε ένα μικρό harness ώστε να παρθεί screenshot (δεν απαιτεί auth)· έλεγξε ότι τα διαχωριστικά ΔΕΝ είναι full-width και η παλέτα σέρνεται. **Screenshot** πριν/μετά.
- [ ] **Step 3: Commit**.

---

### Task 5: Wire flag + shell στο `FloorPlanDialog` και στο gallery

**Files:** Modify `components/admin/floorplan/floor-plan-dialog.tsx` (νέο prop `editorV2?: boolean`, default false· όταν true & υπάρχει `plan` & `!view-empty`, απόδωσε `<EditorShell …>{<PlanViewer …/>}</EditorShell>` αντί της σημερινής grid· περνά tools/handlers/wallTypes/status/takeoff), Modify `app/admin/floorplans/floorplans-gallery.tsx` (resolve `floorplanV2ForUser(currentUserId)` server-side → `editorV2` prop· για SUPER_ADMIN ένα Switch «Editor v2 (beta)» που καλεί `setFloorplanV2Action`).

**Interfaces:** Consumes Task 1–4 + `listWallTypes` (Plan 01) + `roomSheet`/takeoff (υπάρχον).

- [ ] **Step 1:** Πέρνα `wallTypes` (από `listWallTypes()` server-side στο gallery → prop) και `editorV2` στον dialog. Μέσα στον dialog, κράτα ΟΛΗ τη σημερινή λογική· μόνο η **διάταξη** διαφέρει όταν `editorV2`. Οι σημερινές κλάσεις/overlays (αριστερή παλέτα 1532, δεξιά 1570, status 1641) μετακινούνται μέσα στο `EditorShell`.
- [ ] **Step 2: Regression** — τρέξε ΟΛΟ το vitest· τα υπάρχοντα tests του floorplan μένουν πράσινα. `editorV2=false` ⇒ ο παλιός κώδικας path αμετάβλητος (διάβασε/επιβεβαίωσε ότι το default δεν αλλάζει τίποτα).
- [ ] **Step 3: Manual QA (χρήστης)** — SUPER_ADMIN ενεργοποιεί το flag, ανοίγει κάτοψη, βλέπει το νέο chrome, σέρνει την παλέτα, εναλλάσσει εργαλεία/2D-3D/ορθο· flag off ⇒ ο παλιός editor. **Screenshots** on/off.
- [ ] **Step 4: Commit**.

---

### Task 6: Wiki + πράσινη πύλη

- [ ] Σύντομη wiki σημείωση «Editor v2 (beta)» στο module floorplans (πώς ενεργοποιείται, τι αλλάζει) — αν υπάρχει χρόνος, αλλιώς TODO.
- [ ] `npx tsc --noEmit` 0 · `npm test` πράσινο · `npm run lint` 0 errors · `npm audit` 0 high/critical · `git push origin master` (με έγκριση χρήστη).
