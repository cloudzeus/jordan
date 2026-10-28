// Τύποι κατασκευής (WallType) — καθαρός κατάλογος, κοινός για όλες τις κατόψεις (global). Κάθε τοίχος
// ή χώρισμα μιας κάτοψης v2 δείχνει σε έναν τύπο, που ορίζει πάχος, ύψη, χρώμα, υλικά (συνταγές/είδη
// SoftOne) και κανόνες επιμέτρησης. Χωρίς DOM — ελέγχεται με vitest· ο `wallTypeInput` χρησιμοποιείται
// και από τη φόρμα του admin και από τα server actions.
import { z } from 'zod';

export const WALL_TYPE_CATEGORIES = ['BEARING', 'MASONRY', 'DRYWALL', 'GLASS', 'INDICATIVE'] as const;
export type WallTypeCategory = (typeof WALL_TYPE_CATEGORIES)[number];

export const WALL_TYPE_CATEGORY_LABEL: Record<WallTypeCategory, string> = {
  BEARING: 'Φέρων',
  MASONRY: 'Τοιχοποιία',
  DRYWALL: 'Χώρισμα ξηράς δόμησης',
  GLASS: 'Υαλοπάνελ',
  INDICATIVE: 'Ενδεικτικό',
};

/** Ποιες όψεις του τοίχου μετρούν στην επιμέτρηση όψεων (none / μία / και οι δύο). */
export const MEASURE_FACES = ['none', 'one', 'both'] as const;
export type MeasureFaces = (typeof MEASURE_FACES)[number];

export const wallTypeInput = z
  .object({
    code: z.string().trim().min(1).max(32),
    name: z.string().trim().min(1).max(120),
    category: z.enum(WALL_TYPE_CATEGORIES),
    /** Πραγματικό πάχος σε μέτρα (0 … 2]. */
    thicknessM: z.number().finite().gt(0).max(2),
    /** Από πού ξεκινά (m από το δάπεδο). */
    bottomM: z.number().finite().min(0).max(20).default(0),
    /** Ως πού φτάνει· null = ως το ταβάνι (πετσέτες, παραπέτα). */
    topM: z.number().finite().min(0).max(20).nullish().transform((v) => v ?? null),
    color: z.string().max(32).default('#94a3b8'),
    pattern: z.string().max(32).nullish().transform((v) => v ?? null),
    /** Συνταγή κορμού (ανά m² επιφάνειας τοίχου). */
    coreRecipeId: z.string().max(64).nullish().transform((v) => v ?? null),
    /** Συνταγή όψης (ανά m² όψης — γύψος, βαφή). */
    faceRecipeId: z.string().max(64).nullish().transform((v) => v ?? null),
    /** Είδος SoftOne ανά μέτρο μήκους (οδηγοί, σοβατεπί). */
    lengthItemMtrl: z.number().int().positive().nullish().transform((v) => v ?? null),
    measureFaces: z.enum(MEASURE_FACES).default('both'),
    attenuationDb: z.number().finite().nullish().transform((v) => v ?? null),
    /** Λέξεις-κλειδιά layer που προτείνουν τον τύπο στην εισαγωγή CAD (Φάση 3). */
    cadLayerHints: z.array(z.string().max(64)).max(50).default([]),
    /** Συντόμευση 1–9 στον editor· null = καμία. */
    hotkey: z.string().regex(/^[1-9]$/).nullish().transform((v) => v ?? null),
    sortOrder: z.number().int().default(0),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.topM != null && v.topM <= v.bottomM) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['topM'], message: 'Η κορυφή πρέπει να είναι πάνω από τη βάση' });
    }
  });

export type WallTypeInput = z.infer<typeof wallTypeInput>;
/** Είσοδος πριν την επικύρωση (με προαιρετικά/defaults) — ό,τι δέχονται τα create/update. */
export type WallTypeInputRaw = z.input<typeof wallTypeInput>;

/** Βασικός κατάλογος (seed) — επεκτείνεται από τον διαχειριστή. Καλύπτει και τις πέντε κατηγορίες. */
export const WALL_TYPE_SEED: WallTypeInput[] = [
  { code: 'GB10', name: 'Γυψοσανίδα μονή 10 cm', category: 'DRYWALL', thicknessM: 0.1, bottomM: 0, topM: null, color: '#f59e0b', pattern: null, coreRecipeId: null, faceRecipeId: null, lengthItemMtrl: null, measureFaces: 'both', attenuationDb: null, cadLayerHints: ['γυψοσανιδα', 'drywall', 'gypsum'], hotkey: '1', sortOrder: 10, active: true },
  { code: 'GB125', name: 'Γυψοσανίδα διπλή 12,5 cm', category: 'DRYWALL', thicknessM: 0.125, bottomM: 0, topM: null, color: '#f97316', pattern: null, coreRecipeId: null, faceRecipeId: null, lengthItemMtrl: null, measureFaces: 'both', attenuationDb: null, cadLayerHints: ['γυψοσανιδα', 'drywall'], hotkey: '2', sortOrder: 20, active: true },
  { code: 'BRICK20', name: 'Τοιχοποιία 20 cm', category: 'MASONRY', thicknessM: 0.2, bottomM: 0, topM: null, color: '#b45309', pattern: null, coreRecipeId: null, faceRecipeId: null, lengthItemMtrl: null, measureFaces: 'both', attenuationDb: null, cadLayerHints: ['τοιχοποιια', 'wall', 'brick'], hotkey: '3', sortOrder: 30, active: true },
  { code: 'RC25', name: 'Φέρων τοίχος 25 cm', category: 'BEARING', thicknessM: 0.25, bottomM: 0, topM: null, color: '#6b7280', pattern: null, coreRecipeId: null, faceRecipeId: null, lengthItemMtrl: null, measureFaces: 'both', attenuationDb: null, cadLayerHints: ['φερων', 'concrete', 'rc', 'struct'], hotkey: '4', sortOrder: 40, active: true },
  { code: 'GLASS', name: 'Υαλοπάνελ 2 cm', category: 'GLASS', thicknessM: 0.02, bottomM: 0, topM: null, color: '#38bdf8', pattern: null, coreRecipeId: null, faceRecipeId: null, lengthItemMtrl: null, measureFaces: 'both', attenuationDb: null, cadLayerHints: ['υαλοπανελ', 'glass'], hotkey: '5', sortOrder: 50, active: true },
  { code: 'IND5', name: 'Ενδεικτικό χώρισμα 5 cm', category: 'INDICATIVE', thicknessM: 0.05, bottomM: 0, topM: null, color: '#94a3b8', pattern: 'dashed', coreRecipeId: null, faceRecipeId: null, lengthItemMtrl: null, measureFaces: 'none', attenuationDb: null, cadLayerHints: [], hotkey: '6', sortOrder: 60, active: true },
].map((s) => wallTypeInput.parse(s));
