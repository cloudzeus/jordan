// Καθαρή λογική της φόρμας τύπου κατασκευής (χωρίς DOM) — μετατροπές cm↔m και χτίσιμο της εισόδου
// από τα πεδία της φόρμας, ΔΙΑΤΗΡΩΝΤΑΣ τα πεδία που η φόρμα δεν δείχνει (pattern, συνταγές, απόσβεση).
// Ξεχωριστή ώστε να ελέγχεται με vitest: edit που αλλάζει ένα πεδίο δεν πρέπει να σβήνει τα υπόλοιπα.
import type { WallTypeCategory, MeasureFaces, WallTypeInput, WallTypeInputRaw } from './wall-types';

export type WallTypeForm = {
  code: string; name: string; category: WallTypeCategory; thicknessCm: string;
  bottomM: string; topM: string; color: string; measureFaces: MeasureFaces;
  hotkey: string; sortOrder: string; cadHints: string; active: boolean;
};

/** «12,5» ή «12.5» → 12.5· κενό/άκυρο → null. */
const dec = (v: string): number | null => {
  const s = v.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Πάχος σε μέτρα → τιμή πεδίου σε cm, χωρίς στρογγυλοποίηση σε ακέραιο (0,125 m → «12.5»). */
export const metersToCmField = (m: number): string => String(Math.round(m * 1e6) / 1e4);

/** Πάχος σε μέτρα → ετικέτα cm με ελληνικό κόμμα (0,125 m → «12,5 cm»). */
export const cmLabel = (m: number): string => `${(m * 100).toLocaleString('el-GR', { maximumFractionDigits: 2 })} cm`;

/**
 * Από τα πεδία της φόρμας στην είσοδο του validator. Τα πεδία που η φόρμα δεν επεξεργάζεται
 * (pattern, coreRecipeId, faceRecipeId, lengthItemMtrl, attenuationDb) έρχονται από το `initial`
 * — ώστε ένα edit να μην τα μηδενίζει (ο πίνακας κάνει full-row update).
 */
export function wallTypeFormToRaw(form: WallTypeForm, initial: WallTypeInput | null): WallTypeInputRaw {
  const cm = dec(form.thicknessCm);
  return {
    code: form.code,
    name: form.name,
    category: form.category,
    thicknessM: cm == null ? NaN : cm / 100,
    bottomM: dec(form.bottomM) ?? 0,
    topM: dec(form.topM),
    color: form.color,
    measureFaces: form.measureFaces,
    hotkey: form.hotkey.trim() || null,
    sortOrder: Math.round(dec(form.sortOrder) ?? 0),
    cadLayerHints: form.cadHints.split(',').map((s) => s.trim()).filter(Boolean),
    active: form.active,
    // Διατηρούμενα πεδία (δεν τα δείχνει η φόρμα):
    pattern: initial?.pattern ?? null,
    coreRecipeId: initial?.coreRecipeId ?? null,
    faceRecipeId: initial?.faceRecipeId ?? null,
    lengthItemMtrl: initial?.lengthItemMtrl ?? null,
    attenuationDb: initial?.attenuationDb ?? null,
  };
}
