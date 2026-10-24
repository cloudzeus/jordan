# DGEspa — Project Rules

## Git — απευθείας στο master (επιλογή του ιδιοκτήτη)

Οι αλλαγές γίνονται commit και **push απευθείας στο `master`** — χωρίς feature branch και χωρίς PR, εκτός αν ζητηθεί ρητά. Πριν από κάθε push: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors), `npm audit` (0 high/critical) και, για αλλαγές εμφάνισης, έλεγχος με screenshots. Μετά το push ο ιδιοκτήτης κάνει `git pull` στον φάκελό του και Redeploy στο Coolify.

## Εκδόσεις εξαρτήσεων (ΥΠΟΧΡΕΩΤΙΚΟ)

**Πάντα η τελευταία σταθερή έκδοση.** Κάθε νέο πακέτο μπαίνει στην τελευταία σταθερή έκδοση (`npm view <pkg> version`) — ποτέ παλιά major «επειδή έτσι το ξέραμε». Στοίβα: Next.js 16.2+, Tailwind CSS 4, Prisma (τελευταία 7.x, CLI και `@prisma/client` ΙΔΙΑ έκδοση), shadcn/ui, Auth.js (`@auth/core`), GSAP.

- **Ασφάλεια:** πριν από κάθε merge `npm audit` χωρίς high/critical. Ποτέ τυφλό `npm audit fix --force` — προτείνει υποβαθμίσεις (π.χ. `exceljs@3`, `swagger-ui-react@3`). Αν μια ευπάθεια είναι σε υπο-εξάρτηση που χρησιμοποιείται μόνο από CLI του πακέτου, λύση με `overrides` στο `package.json` (υπάρχουν ήδη: uuid, argparse, postcss-selector-parser).
- **Major αναβάθμιση:** διάβασε τα breaking changes και τρέξε `npx tsc --noEmit`, `npm test`, `npx next build`, και `npm ci` με το npm του Docker image (npm 10) ώστε το lockfile να δουλεύει εκεί.
- **shadcn CLI:** δεν μπαίνει στα dependencies — `npx shadcn@latest add <component>`.
- **Lint:** `npm run lint` (ESLint 10, `eslint.config.mjs`) πρέπει να βγάζει **0 errors** πριν από merge· οι προειδοποιήσεις διορθώνονται σταδιακά (`npm run lint:fix` για τις αυτόματες). Νέος κώδικας χωρίς νέες προειδοποιήσεις. Δεν χρησιμοποιούμε `@next/eslint-plugin-next` (φέρνει ευπάθεια χωρίς διόρθωση) — άρα όχι σχόλια `eslint-disable … @next/next/…`.

### Tailwind CSS 4 — τι προσέχουμε
- Είσοδος: `@import 'tailwindcss'` + `@config '../tailwind.config.ts'` στο `app/globals.css`· PostCSS: `@tailwindcss/postcss`.
- **Τα `@layer` είναι πραγματικά CSS cascade layers:** ένα `!important` ΜΕΣΑ σε layer νικά ένα `!important` εκτός layer. Κανόνες που πρέπει να «κερδίζουν» (font lock, `.site …`) μένουν ΕΚΤΟΣ `@layer`.
- Δικές μας κλάσεις-εργαλεία με `@utility name { … }` (όχι `.name` μέσα σε `@layer utilities`), ώστε να δουλεύουν με variants (`hover:shadow-card`).
- Variants διαβάζονται **αριστερά → δεξιά** (`*:data-[slot=x]:truncate`, `prose-a:hover:underline`). Τα `components/ui/*` (shadcn) είναι ήδη γραμμένα έτσι — μην τα «διορθώνεις».
- Ονόματα v4: `shadow-xs` (παλιό `shadow-sm`), `rounded-xs`, `outline-hidden` (παλιό `outline-none`), `ring-3` (παλιό `ring`), `text-(length:--fs-12)` για CSS variables.
- `dark:` ενεργοποιείται ΜΟΝΟ με `.dark` / `data-theme="dark"` (όχι από το σκούρο θέμα του λειτουργικού) — η εφαρμογή είναι ανοιχτού θέματος.
- Αλλαγές εμφάνισης: έλεγχος με screenshots πριν/μετά, όχι μόνο build.

## Συγχρονισμός με το postgres-boilerplate

Το jordan ξεκίνησε από το https://github.com/cloudzeus/postgres-boilerplate (χωρίς κοινό git ιστορικό). **Τελευταίο ενταγμένο commit του boilerplate: `e7aa12e` (2026-10-22).** Για νέες αλλαγές: διαφορά `e7aa12e..master` του boilerplate, εφαρμογή 3-way, και:
- οι κλάσεις του boilerplate είναι Tailwind 3 → μετατροπή σε v4 (`text-[length:var(--fs-12)]` → `text-(length:--fs-12)`, `shadow-sm` → `shadow-xs`, `outline-none` → `outline-hidden` κ.λπ.)·
- migrations μετονομάζονται ώστε να έρχονται ΜΕΤΑ τα δικά μας· `ADD COLUMN IF NOT EXISTS` όπου η στήλη μπορεί να υπάρχει ήδη·
- lint 0 (το boilerplate δεν έχει τους ίδιους κανόνες) και ενημέρωση αυτής της γραμμής με το νέο commit.

## UI/UX (ΥΠΟΧΡΕΩΤΙΚΟ)

Κάθε οθόνη ακολουθεί τους κανόνες σχεδίασης. Ο χρήστης δεν πρέπει να μπερδεύεται: τα δεδομένα είναι οργανωμένα, η οθόνη πυκνή και το κύλισμα ελάχιστο.

- **Διαχείριση (`app/admin/**`):** [docs/design/admin.md](docs/design/admin.md).
  - Ρίζα 15px.
  - Μία γραμμή ανά στοιχείο.
  - Τα σύνολα με έμφαση.
  - Accordion κλειστά με σύνοψη και προβλήματα στην κεφαλίδα.
  - Λίγα στοιχεία με «Όλα (N)».
  - Σταδιακή αποκάλυψη στις φόρμες.
- **Πύλη πελατών (`app/dashboard/**`):** [docs/design/portal.md](docs/design/portal.md).
- **Πριν/μετά:** σε κάθε αλλαγή εμφάνισης μέτρα το ύψος της σελίδας και έλεγξε με screenshot.

## Wiki convention (ΥΠΟΧΡΕΩΤΙΚΟ)

**Κάθε νέο feature που αλλάζει το UI πρέπει να συνοδεύεται από αντίστοιχη wiki entry.**

Όταν προστίθεται νέα σελίδα/λειτουργία στο `/admin/*` ή σε οποιοδήποτε άλλο user-facing route:

1. **Scaffold wiki page** στην ίδια PR/commit:
   ```
   npm run wiki:new -- <module>/<slug> --roles "ADMIN,EMPLOYEE" --title "Τίτλος"
   ```
   Modules registry: `lib/wiki/modules-meta.ts`. Αν το module δεν υπάρχει εκεί, πρόσθεσε εγγραφή (label, description, icon, gradient colors).

2. **Γράψε περιεχόμενο** στο `docs/wiki/<module>/<slug>.mdx` στα **Ελληνικά**:
   - Επισκόπηση (1 σύντομη παράγραφος)
   - Βήματα ως `<Steps>` με `<li>` αν είναι workflow
   - `<Callout type="info|warning|danger|success">` για σημαντικές σημειώσεις (κυρίως destructive actions, gotchas)
   - Frontmatter `roles:` — όσοι ρόλοι έχουν πραγματικά access (όχι μόνο τυπικά)
   - Frontmatter `description:` — μία γραμμή που εξηγεί τι κάνει
   - Frontmatter `helpAnchors: [anchor1]` — λέξεις-κλειδιά που θα συνδέσουν το `<PageHeader helpAnchor="...">` με αυτή τη σελίδα.

3. **Πρόσθεσε `helpAnchor` prop** στο αντίστοιχο `<PageHeader>` της σελίδας:
   ```tsx
   <PageHeader title="..." helpAnchor="<one-of-the-helpAnchors>" />
   ```
   Το εικονίδιο `?` θα ανοίγει αυτόματα τη σωστή wiki σελίδα.

4. **Screenshot** — πρόσθεσε στο frontmatter:
   ```yaml
   screenshots:
     - file: list.png
       route: /admin/<your-route>
       caption: "Σύντομη λεζάντα"
   ```
   Τρέξε `npm run wiki:screenshots` όταν είσαι έτοιμος (απαιτεί dev server up + `WIKI_USER_*` env vars).

5. **Search index** — `npm run wiki:index` αν θες να ενημερωθεί το `public/wiki/index.json`.

### Διαθέσιμα MDX components
- `<Steps>` `<li>...</li>` `</Steps>` — αριθμημένη ροή
- `<Callout type="info|warning|danger|success">` — έγχρωμο banner
- `<Screenshot src="x.png" caption="..." />` — inline εικόνα
- `<RoleBadge role="ADMIN" />` — έγχρωμο role chip

### Ρόλοι (`prisma/schema.prisma → enum RoleKey`)
`SUPER_ADMIN`, `ADMIN`, `EMPLOYEE`, `COLLABORATOR`, `SUPPLIER`, `CUSTOMER`. Ο SUPER_ADMIN βλέπει αυτόματα όλες τις σελίδες.

### Modules registry
Όλα τα colors / icons / labels της wiki UI ορίζονται **μόνο** στο [lib/wiki/modules-meta.ts](lib/wiki/modules-meta.ts). Μην χρησιμοποιείς δυναμικά Tailwind classes (π.χ. `from-sky-400`) γιατί ο JIT τα purge-άρει — χρησιμοποίησε hex inline styles ή ήδη ορισμένες κλάσεις.

### Συντομογραφία checklist για κάθε νέο feature
- [ ] `npm run wiki:new -- module/slug ...`
- [ ] Γράψε content (Ελληνικά, με Steps + Callouts όπου χρειάζεται)
- [ ] Πρόσθεσε `helpAnchor` στο `<PageHeader>`
- [ ] Πρόσθεσε screenshot route στο frontmatter
- [ ] (προαιρετικά) `npm run wiki:screenshots -- --module <name>`
