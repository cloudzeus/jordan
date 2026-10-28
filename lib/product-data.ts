import 'server-only';
import { prisma } from '@/lib/db';
import { classificationMembers } from '@/lib/item-classifications';
import { readRegistry } from '@/lib/product-registry';

/**
 * Τα μητρώα που χαρακτηρίζουν ένα είδος στο SoftOne, σε μία σελίδα: **μάρκες** (MTRMARK),
 * **κατασκευαστές** (MTRMANFCTR), **εμπορικές κατηγορίες** (MTRCATEGORY) και **ομάδες** (MTRGROUP).
 *
 * Από πού διαβάζονται:
 *  - κατηγορίες/ομάδες → `SoftoneClassification` (έχουν αρίθμηση ανά SODTYPE 51/52 και ενεργό/ανενεργό)·
 *  - μάρκες/κατασκευαστές → `SoftoneLookup` (απλοί βοηθητικοί πίνακες, μία αρίθμηση).
 * Και τα δύο μητρώα γεμίζουν από τον ίδιο συγχρονισμό της σελίδας.
 *
 * Το «πόσα είδη το χρησιμοποιούν» έρχεται ΖΩΝΤΑΝΑ από το SoftOne (ένα GetTable στο MTRL, με μνήμη
 * 5 λεπτών) — ο τοπικός καθρέφτης ειδών δεν κρατά αυτά τα πεδία.
 *
 * ΕΓΓΡΑΦΗ: κατηγορίες (`ITECATEGORY`/`SRVCATEGORY`, βλ. `lib/item-classifications.ts`) και μάρκες/
 * κατασκευαστές (`$ITEMARK`/`$MTRMANFCTR`, βλ. `lib/product-registry.ts` — πλήρης λίστα κάθε φορά).
 *
 * ΟΜΑΔΕΣ: ΔΕΝ γράφονται. Δοκιμάστηκε ελεγχόμενα (2026-10-28) και το `getData ITEGROUP` αποδείχθηκε
 * ΑΝΑΞΙΟΠΙΣΤΟ: για ΚΑΘΕ KEY επέστρεφε την ίδια λάθος λίστα — έκρυβε υπαρκτή ομάδα (2 «Πλακάκια»)
 * και εμφάνιζε ανύπαρκτη (5). Ο πίνακας `MTRGROUP` (GetTable/SQL) έλεγε την αλήθεια και έμεινε
 * άθικτος. Χωρίς αξιόπιστο read-before-write, εγγραφή στις ομάδες σβήνει πραγματικές γραμμές.
 */

export type { ProductData, ProductDataRow, ProductTab } from './product-data-core';
import { type ProductData, type ProductDataRow, type ProductTab } from './product-data-core';

export async function listProductData(): Promise<ProductData> {
  // Μάρκες/κατασκευαστές: ζωντανά από το SoftOne, γιατί χρειαζόμαστε τον ΚΩΔΙΚΟ και το ενεργό/ανενεργό
  // που ο καθρέφτης `SoftoneLookup` δεν κρατά — και χωρίς αυτά η επεξεργασία θα έσβηνε τον κωδικό.
  // Αν το SoftOne δεν απαντήσει, πέφτουμε πίσω στον καθρέφτη (λίστα χωρίς κωδικούς, μόνο ανάγνωση).
  const [classes, lookups, members, live] = await Promise.all([
    prisma.softoneClassification.findMany({ orderBy: [{ sodtype: 'asc' }, { code: 'asc' }] }),
    prisma.softoneLookup.findMany({ where: { kind: { in: ['MTRMARK', 'MTRMANFCTR'] } }, orderBy: [{ kind: 'asc' }, { order: 'asc' }, { code: 'asc' }] }),
    classificationMembers().then((m) => ({ m, err: null as string | null })).catch((e) => ({ m: null, err: (e as Error).message })),
    Promise.all((['MTRMARK', 'MTRMANFCTR'] as const).map(async (k) => [k, await readRegistry(k).catch(() => null)] as const))
      .then((xs) => new Map(xs)),
  ]);

  // Μετρήσεις χρήσης ανά μητρώο. Κατηγορία/ομάδα μετρούν ανά SODTYPE (ίδιος αριθμός σε είδη και
  // υπηρεσίες είναι ΑΛΛΗ εγγραφή)· μάρκα/κατασκευαστής έχουν μία αρίθμηση για όλα.
  const count = new Map<string, number>();
  const bump = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
  for (const x of members.m ?? []) {
    if (x.category != null) bump(`categories:${x.sodtype}:${x.category}`);
    if (x.group != null) bump(`groups:${x.sodtype}:${x.group}`);
    if (x.brand != null) bump(`brands::${x.brand}`);
    if (x.manufacturer != null) bump(`manufacturers::${x.manufacturer}`);
  }
  const counted = (tab: ProductTab, sodtype: number | null, code: number) =>
    (members.m ? count.get(`${tab}:${sodtype ?? ''}:${code}`) ?? 0 : null);

  const fromClass = (tab: 'categories' | 'groups', kind: 'CATEGORY' | 'GROUP'): ProductDataRow[] =>
    classes.filter((r) => r.kind === kind).map((r) => ({
      code: r.code, shortCode: r.shortCode, name: r.name, isActive: r.isActive, sodtype: r.sodtype,
      itemCount: counted(tab, r.sodtype, r.code),
    }));
  const fromLookup = (tab: 'brands' | 'manufacturers', kind: 'MTRMARK' | 'MTRMANFCTR'): ProductDataRow[] => {
    const rows = live.get(kind);
    if (rows) {
      const idField = kind;
      return rows.map((r) => {
        const code = Number(r[idField]);
        return {
          code, shortCode: r.CODE?.trim() || null, name: (r.NAME || r.CODE || '').trim(),
          isActive: r.ISACTIVE !== '0', sodtype: null,
          itemCount: Number.isInteger(code) ? counted(tab, null, code) : null,
        };
      }).sort((a, b) => a.code - b.code);
    }
    return lookups.filter((r) => r.kind === kind).map((r) => {
      const code = Number(r.code);
      return {
        code, shortCode: null, name: r.name, isActive: true, sodtype: null,
        itemCount: Number.isInteger(code) ? counted(tab, null, code) : null,
      };
    });
  };

  return {
    rows: {
      brands: fromLookup('brands', 'MTRMARK'),
      manufacturers: fromLookup('manufacturers', 'MTRMANFCTR'),
      categories: fromClass('categories', 'CATEGORY'),
      groups: fromClass('groups', 'GROUP'),
    },
    membersError: members.err,
  };
}
