# Κατόψεις v2 · Plan 01 — WallType catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Προσθήκη ενός global καταλόγου «τύπων κατασκευής» (`WallType`) με seed και admin CRUD σελίδα, ώστε κάθε μελλοντικός τοίχος/χώρισμα να δείχνει σε τύπο με πάχος, ύψος, υλικά και κανόνες επιμέτρησης.

**Architecture:** Καθαρό core σε `lib/floorplan/wall-types.ts` (κατηγορίες, zod validator, seed) — χωρίς DOM, με vitest. Νέο Prisma model `WallType` (global, χωρίς tenant). Admin σελίδα `app/admin/floorplans/wall-types/` με server actions πίσω από νέο permission `floorplans.catalog`, mirroring το pattern των `app/admin/recipes/` + `app/admin/classifications/`.

**Tech Stack:** Next.js 16.2+, Prisma/PostgreSQL, zod, shadcn/ui, Tailwind v4, vitest.

**Spec:** `docs/superpowers/plans/2026-10-28-katopseis-v2-00-roadmap.md` → §1.1 του paste «Κατόψεις v2». Το roadmap εξηγεί γιατί αυτό προηγείται του editor-split.

## Global Constraints

- Git: commit + push στο `master`. Πριν push: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors), `npm audit` (0 high/critical). Αλλαγές εμφάνισης: screenshots.
- Prisma: τελευταία 7.x· migration με timestamp **μετά** τα υπάρχοντα· νέος πίνακας (όχι `ADD COLUMN`).
- `WallType` είναι **global** (καμία στήλη office/tenant) — απόφαση roadmap #1.
- Admin UI: [docs/design/admin.md](../../design/admin.md) — ρίζα 15px, μία γραμμή ανά στοιχείο, σύνολα/εμφάσεις, **ενέργειες πάντα σε ⋮ dropdown** (ποτέ χαλαρά κουμπιά).
- Permission list σε `lib/permissions.ts` **και** mirrored στο `scripts/seed.js` (σχόλιο «Keep in sync»)· για υπάρχουσες βάσεις τρέχει `npm run permissions:sync`.
- Server actions: auth μέσω `actor(...keys)` από `lib/server-actions.ts` (επιστρέφει `{user}` ή `{error}`).
- Ελληνικό UI/copy. Τιμές/πάχη σε μέτρα (SI).
- Wiki entry υποχρεωτικό για το νέο route (CLAUDE.md «Wiki convention»).

## Review Focus

- **Διπλός `code`:** δύο τύποι με ίδιο `code` — unique constraint στη βάση + φιλικό μήνυμα στο action αντί για 500 (Task 4 action test με P2002).
- **`topM < bottomM`:** τύπος με κορυφή κάτω από τη βάση παράγει αρνητικό ύψος σε όλα τα downstream — ο validator το απορρίπτει (Task 1 test).
- **`thicknessM ≤ 0` ή τεράστιο:** μηδενικό/αρνητικό πάχος σπάει miter/offset σε Plans 02/05 — ο validator δένει σε (0, 2] m (Task 1 test).
- **`hotkey` εκτός 1–9 ή διπλός:** το spec δίνει hotkeys 1–9· ο validator δέχεται μόνο `null` ή ένα ψηφίο 1–9 (Task 1 test). Μοναδικότητα hotkey ανά κατάλογο: soft — δεν μπλοκάρεται, αλλά το UI προειδοποιεί (Task 5).
- **Διαγραφή τύπου σε χρήση:** στο Plan 01 κανένα `planData` δεν δείχνει ακόμη σε `WallType`, άρα το delete είναι ασφαλές· **όταν μπει το Plan 02**, το delete πρέπει να γίνει «απενεργοποίηση» (`active=false`) αν υπάρχουν αναφορές. Σημειώνεται στον κώδικα του action ως TODO(Plan 02) και δεν υλοποιείται εδώ.

---

### Task 1: Core τύπων κατασκευής (καθαρό, με validator + seed)

**Files:**
- Create: `lib/floorplan/wall-types.ts`
- Test: `lib/floorplan/__tests__/wall-types.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces:
  - `WALL_TYPE_CATEGORIES: readonly ['BEARING','MASONRY','DRYWALL','GLASS','INDICATIVE']`
  - `type WallTypeCategory = (typeof WALL_TYPE_CATEGORIES)[number]`
  - `WALL_TYPE_CATEGORY_LABEL: Record<WallTypeCategory, string>` (Φέρων, Τοιχοποιία, Χώρισμα ξηράς δόμησης, Υαλοπάνελ, Ενδεικτικό)
  - `MEASURE_FACES: readonly ['none','one','both']`, `type MeasureFaces`
  - `wallTypeInput: z.ZodType<WallTypeInput>` και `type WallTypeInput`
  - `WALL_TYPE_SEED: WallTypeInput[]`

- [ ] **Step 1: Write the failing test** `lib/floorplan/__tests__/wall-types.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { wallTypeInput, WALL_TYPE_SEED, WALL_TYPE_CATEGORIES, WALL_TYPE_CATEGORY_LABEL } from '../wall-types';

describe('wallTypeInput', () => {
  const base = { code: 'GB10', name: 'Γυψοσανίδα μονή 10 cm', category: 'DRYWALL', thicknessM: 0.1 };
  it('parses a minimal valid type with defaults', () => {
    const t = wallTypeInput.parse(base);
    expect(t.measureFaces).toBe('both');
    expect(t.active).toBe(true);
    expect(t.bottomM).toBe(0);
    expect(t.topM).toBeNull();
    expect(t.cadLayerHints).toEqual([]);
  });
  it('rejects non-positive or oversized thickness', () => {
    expect(wallTypeInput.safeParse({ ...base, thicknessM: 0 }).success).toBe(false);
    expect(wallTypeInput.safeParse({ ...base, thicknessM: 3 }).success).toBe(false);
  });
  it('rejects topM at or below bottomM', () => {
    expect(wallTypeInput.safeParse({ ...base, bottomM: 1, topM: 1 }).success).toBe(false);
    expect(wallTypeInput.safeParse({ ...base, bottomM: 1, topM: 0.5 }).success).toBe(false);
    expect(wallTypeInput.safeParse({ ...base, bottomM: 0, topM: 2.6 }).success).toBe(true);
  });
  it('accepts only null or a single digit 1-9 as hotkey', () => {
    expect(wallTypeInput.safeParse({ ...base, hotkey: '5' }).success).toBe(true);
    expect(wallTypeInput.safeParse({ ...base, hotkey: '0' }).success).toBe(false);
    expect(wallTypeInput.safeParse({ ...base, hotkey: 'A' }).success).toBe(false);
  });
});

describe('WALL_TYPE_SEED', () => {
  it('every entry is valid', () => {
    for (const s of WALL_TYPE_SEED) expect(wallTypeInput.safeParse(s).success).toBe(true);
  });
  it('codes are unique', () => {
    const codes = WALL_TYPE_SEED.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it('covers every category label', () => {
    for (const c of WALL_TYPE_CATEGORIES) expect(WALL_TYPE_CATEGORY_LABEL[c]).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run lib/floorplan/__tests__/wall-types.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/floorplan/wall-types.ts`**

Define the constants and `WALL_TYPE_CATEGORY_LABEL` exactly as the Interfaces block. `wallTypeInput` is a `z.object` with: `code` `z.string().trim().min(1).max(32)`, `name` `z.string().trim().min(1).max(120)`, `category` `z.enum(WALL_TYPE_CATEGORIES)`, `thicknessM` `z.number().finite().gt(0).max(2)`, `bottomM` `z.number().finite().min(0).max(20).default(0)`, `topM` `z.number().finite().min(0).max(20).nullish().transform(v => v ?? null)`, `color` `z.string().max(32).default('#94a3b8')`, `pattern` `z.string().max(32).nullish().transform(v => v ?? null)`, `coreRecipeId`/`faceRecipeId` `z.string().max(64).nullish().transform(v => v ?? null)`, `lengthItemMtrl` `z.number().int().positive().nullish().transform(v => v ?? null)`, `measureFaces` `z.enum(MEASURE_FACES).default('both')`, `attenuationDb` `z.number().finite().nullish().transform(v => v ?? null)`, `cadLayerHints` `z.array(z.string().max(64)).max(50).default([])`, `hotkey` `z.string().regex(/^[1-9]$/).nullish().transform(v => v ?? null)`, `sortOrder` `z.number().int().default(0)`, `active` `z.boolean().default(true)`. Add `.superRefine` that reports an issue on `topM` when `topM != null && topM <= bottomM`. `WALL_TYPE_SEED`: ~6 entries covering all five categories (π.χ. `GB10` DRYWALL 0.1, `GB125` DRYWALL 0.125 (διπλή), `BRICK20` MASONRY 0.2, `RC25` BEARING 0.25, `GLASS` GLASS 0.02 measureFaces `both`, `IND5` INDICATIVE 0.05 measureFaces `none`), με hotkeys 1–6 και αύξοντα sortOrder.

- [ ] **Step 4: Run test to verify it passes** — same command → PASS.

- [ ] **Step 5: Commit** — `git add lib/floorplan/wall-types.ts lib/floorplan/__tests__/wall-types.test.ts && git commit -m "Κατόψεις v2: core τύπων κατασκευής (WallType) με validator και seed"`

---

### Task 2: Prisma model `WallType` + migration

**Files:**
- Modify: `prisma/schema.prisma` (νέο model + 2 enums, κοντά στο `FloorPlan`, γραμμή ~3943)
- Create: `prisma/migrations/<timestamp>_wall_type/migration.sql` (μέσω `prisma migrate dev`)

**Interfaces:**
- Produces: πίνακα `WallType` με στήλες που αντιστοιχούν 1-1 στο `WallTypeInput` (Task 1) + `id`, `createdAt`, `updatedAt`. Enums `WallTypeCategory { BEARING MASONRY DRYWALL GLASS INDICATIVE }`, `WallMeasureFaces { none one both }`.

- [ ] **Step 1: Add the model** στο `prisma/schema.prisma`:

```prisma
enum WallTypeCategory { BEARING MASONRY DRYWALL GLASS INDICATIVE }
enum WallMeasureFaces { none one both }

model WallType {
  id             String           @id @default(cuid())
  code           String           @unique
  name           String
  category       WallTypeCategory
  thicknessM     Float
  bottomM        Float            @default(0)
  topM           Float?
  color          String           @default("#94a3b8")
  pattern        String?
  coreRecipeId   String?
  faceRecipeId   String?
  lengthItemMtrl Int?
  measureFaces   WallMeasureFaces @default(both)
  attenuationDb  Float?
  cadLayerHints  String[]
  hotkey         String?
  sortOrder      Int              @default(0)
  active         Boolean          @default(true)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  @@index([active, sortOrder])
}
```

- [ ] **Step 2: Generate the migration** — `npx prisma migrate dev --name wall_type`. Expected: νέος πίνακας, `npx prisma generate` τρέχει.
- [ ] **Step 3: Verify client types** — `npx tsc --noEmit` → PASS (ο τύπος `WallType` υπάρχει στο `@prisma/client`).
- [ ] **Step 4: Commit** — `git add prisma/schema.prisma prisma/migrations && git commit -m "Κατόψεις v2: πίνακας WallType (global κατάλογος τύπων κατασκευής)"`

---

### Task 3: Permission `floorplans.catalog` + seed του καταλόγου

**Files:**
- Modify: `lib/permissions.ts` (`PERMISSIONS`, `RESOURCE_LABELS`, `ROLE_DEFAULTS`)
- Modify: `scripts/seed.js` (mirror του permission + upsert των WallType seed rows)
- Test: `lib/__tests__/permissions.test.ts` (ή νέο, αν δεν υπάρχει) — βλ. Step 1

**Interfaces:**
- Consumes: `WALL_TYPE_SEED` (Task 1), `PrismaClient`.
- Produces: κλειδί permission `'floorplans.catalog'`· seeded `WallType` rows (upsert by `code`).

- [ ] **Step 1: Write the failing test** — προσθήκη στο permissions test (ή νέο `lib/__tests__/permissions.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ROLE_DEFAULTS, RESOURCE_LABELS } from '../permissions';

it('defines the floorplans.catalog permission for SUPER_ADMIN and ADMIN', () => {
  expect(PERMISSIONS.some((p) => p.key === 'floorplans.catalog')).toBe(true);
  expect(RESOURCE_LABELS.floorplans).toBeTruthy();
  expect(ROLE_DEFAULTS.ADMIN).toContain('floorplans.catalog');
});
```

- [ ] **Step 2: Run** — `npx vitest run lib/__tests__/permissions.test.ts` → FAIL.
- [ ] **Step 3: Implement** — πρόσθεσε `{ key: 'floorplans.catalog', resource: 'floorplans', action: 'catalog', description: 'Διαχείριση καταλόγου τύπων τοίχου & στοιχείων κατόψεων' }` στο `PERMISSIONS`· `floorplans: 'Κατόψεις'` στο `RESOURCE_LABELS`· `'floorplans.catalog'` στο `ROLE_DEFAULTS.ADMIN` (ο SUPER_ADMIN το παίρνει αυτόματα). Στο `scripts/seed.js`: ίδιο entry στο mirrored `PERMISSIONS`, `'floorplans.catalog'` στο ADMIN grant array, και νέο seed loop που upsert-άρει τα 6 WallType rows **by `code`** (πλ)· αντιγράφεται πλήρως ο πίνακας `WALL_TYPE_SEED` σε plain-JS array με σχόλιο «Keep in sync με lib/floorplan/wall-types.ts».
- [ ] **Step 4: Run** test → PASS· και `node scripts/seed.js` σε dev DB → τυπώνει seeded permissions + `✓ Seeded N wall types`.
- [ ] **Step 5: Commit** — `git add lib/permissions.ts scripts/seed.js lib/__tests__/permissions.test.ts && git commit -m "Κατόψεις v2: permission floorplans.catalog και seed τύπων κατασκευής"`

---

### Task 4: Server actions CRUD

**Files:**
- Create: `app/admin/floorplans/wall-types/actions.ts`
- Test: `app/admin/floorplans/wall-types/__tests__/actions.test.ts` (πρότυπο: όποιο route/action test χρησιμοποιεί mock του `actor` + `prisma`, π.χ. `lib/templates/__tests__/*-routes.test.ts`)

**Interfaces:**
- Consumes: `wallTypeInput`/`WallTypeInput` (Task 1), `actor` (`lib/server-actions.ts`), `prisma` (`lib/db`).
- Produces (server actions, `'use server'`):
  - `listWallTypes(): Promise<WallType[]>` — ταξινομημένα `sortOrder, code`.
  - `createWallType(input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }>`
  - `updateWallType(id: string, input: unknown): Promise<{ ok: true } | { ok: false; error: string }>`
  - `deleteWallType(id: string): Promise<{ ok: true } | { ok: false; error: string }>`
  - `reorderWallTypes(ids: string[]): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Write the failing test** — με mocked `actor` (returns `{user}`) και mocked `prisma.wallType`:
  - `createWallType` με invalid input (thicknessM 0) → `{ ok: false }` και **δεν** καλεί `prisma.wallType.create`.
  - `createWallType` με valid input → καλεί `create` με τα parsed πεδία· επιστρέφει `{ ok: true, id }`.
  - `createWallType` όταν `prisma` ρίχνει `PrismaClientKnownRequestError` code `P2002` → `{ ok: false, error: /κωδικ/i }` (διπλός `code`).
  - κάθε action όταν `actor` επιστρέφει `{error}` → `{ ok: false }` χωρίς κλήση prisma.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — κάθε action ξεκινά με `const a = await actor('floorplans.catalog'); if ('error' in a) return { ok: false, error: a.error.message };`. Τα create/update κάνουν `wallTypeInput.safeParse`, γυρίζουν friendly error σε `!success`. Το create/update τυλίγεται σε try/catch για `P2002` → μήνυμα «Υπάρχει ήδη τύπος με αυτόν τον κωδικό». `delete`: απλό `prisma.wallType.delete` **με σχόλιο** `// TODO(Plan 02): απενεργοποίηση αντί διαγραφής όταν το planData δείχνει σε τύπους`. `reorder`: `prisma.$transaction` που θέτει `sortOrder` κατά τη σειρά του `ids`. Όλα καλούν `revalidatePath('/admin/floorplans/wall-types')`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Κατόψεις v2: server actions για τον κατάλογο τύπων κατασκευής"`

---

### Task 5: Admin σελίδα + datatable + modal

**Files:**
- Create: `app/admin/floorplans/wall-types/page.tsx`
- Create: `app/admin/floorplans/wall-types/wall-types-table-client.tsx`
- Πρότυπα: `app/admin/classifications/classifications-table-client.tsx` (resizable/sortable datatable), `app/admin/recipes/recipe-editor.tsx` (modal editor).

**Interfaces:**
- Consumes: `listWallTypes` + CRUD actions (Task 4), `wallTypeInput`/labels (Task 1), `requirePermission` (`lib/rbac`).

- [ ] **Step 1: Server page** — `page.tsx`: `await requirePermission('floorplans.catalog')`, φορτώνει `listWallTypes()`, περνά τα rows στο client component. Header με `<PageHeader title="Τύποι κατασκευής" helpAnchor="wall-types" />` (βλ. Task 6). Σύμφωνα με admin.md: ρίζα 15px, πυκνός πίνακας.
- [ ] **Step 2: Client datatable** — `wall-types-table-client.tsx`: πίνακας με resizable/sortable στήλες (κωδικός, όνομα, κατηγορία με label+χρώμα, πάχος, ύψος bottom→top, όψεις που μετρούν, hotkey, ενεργό). **Μία γραμμή ανά τύπο**, ενέργειες σε **⋮ dropdown** (Επεξεργασία, Απενεργοποίηση/Ενεργοποίηση, Διαγραφή με επιβεβαίωση). Κουμπί «Νέος τύπος» ανοίγει modal φόρμα με **σταδιακή αποκάλυψη** (βασικά: κωδικός/όνομα/κατηγορία/πάχος· «Προχωρημένα»: ύψη, χρώμα/pattern, συνταγές, lengthItemMtrl, measureFaces, cadLayerHints, hotkey). Client-side validation με `wallTypeInput`· προειδοποίηση (όχι block) αν hotkey ήδη σε χρήση. Σε submit καλεί το αντίστοιχο action και δείχνει `toast`.
- [ ] **Step 3: Verify στο preview** — `preview_start {name}`, πλοήγηση στο `/admin/floorplans/wall-types`: δημιουργία τύπου, επεξεργασία, reorder, διαγραφή· `read_console_messages` χωρίς errors· **screenshot** (λίστα + modal) για το before/after της admin.md (ρίζα 15px, μία γραμμή/στοιχείο, ⋮ dropdown).
- [ ] **Step 4: Commit** — `git commit -m "Κατόψεις v2: admin σελίδα διαχείρισης τύπων κατασκευής"`

---

### Task 6: Wiki entry

**Files:**
- Create (scaffold): `docs/wiki/floorplans/wall-types.mdx`
- Modify: `lib/wiki/modules-meta.ts` (αν δεν υπάρχει module `floorplans`, προσθήκη: label «Κατόψεις», description, icon, gradient hex)
- Modify: `app/admin/floorplans/wall-types/page.tsx` (ήδη `helpAnchor="wall-types"` από Task 5)

- [ ] **Step 1: Scaffold** — `npm run wiki:new -- floorplans/wall-types --roles "SUPER_ADMIN,ADMIN" --title "Τύποι κατασκευής"`.
- [ ] **Step 2: Content (Ελληνικά)** — επισκόπηση· `<Steps>` για «προσθήκη/επεξεργασία τύπου»· `<Callout type="warning">` ότι το πάχος/ύψη τροφοδοτούν επιμετρήσεις και ότι η διαγραφή θα γίνει «απενεργοποίηση» όταν οι τύποι χρησιμοποιούνται σε κατόψεις (Plan 02). Frontmatter `roles`, `description`, `helpAnchors: [wall-types]`, `screenshots: [{ file: list.png, route: /admin/floorplans/wall-types, caption: "Κατάλογος τύπων κατασκευής" }]`.
- [ ] **Step 3: Commit** — `git commit -m "Κατόψεις v2: wiki entry για τους τύπους κατασκευής"`

---

### Task 7: Πράσινη πύλη πριν το push

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm test` → όλα πράσινα (νέα tests Tasks 1,3,4 περιλαμβάνονται)
- [ ] `npm run lint` → 0 errors
- [ ] `npm audit` → 0 high/critical
- [ ] screenshots admin λίστας + modal επισυναπτόμενα
- [ ] `git push origin master`
