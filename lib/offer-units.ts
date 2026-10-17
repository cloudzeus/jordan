/**
 * Προαιρετική ενημέρωση μονάδων ενός είδους στο SoftOne από τον οδηγό δυναμικής προσφοράς.
 * Η προσφορά ΔΕΝ εξαρτάται ποτέ από αυτήν: τ.μ./παλέτα και παλέτες/container ζουν στην προσφορά.
 *
 * Το SoftOne αρνείται αλλαγή Μ.Μ.2 (MTRUNIT2/MU21) σε είδος με παραστατικά («Δεν μπορεί να γίνει
 * αλλαγή του πεδίου 'Μ.Μ.2'. Υπάρχουν καταχωρημένα παραστατικά.») — τότε στέλνουμε μόνο τη μονάδα αγορών.
 */
export type UnitIds = { pallet: string; container: string };
export type UnitsPatch = { unit2?: string; ratio2?: number; strict2?: boolean; unitBuy: string; buyRatio: number };

/** Αν είναι ήδη Παλέτα με την ίδια σχέση, η Μ.Μ.2 δεν χρειάζεται αλλαγή. */
const unit2Same = (cur: { unit2?: string | null; ratio2?: number | null } | null, ids: UnitIds, perPallet: number) =>
  !!cur && cur.unit2 === ids.pallet && Math.abs((cur.ratio2 ?? 0) - perPallet) < 1e-6;

/**
 * Τι στέλνουμε: με παραστατικά (ή Μ.Μ.2 ήδη σωστή) → ΜΟΝΟ μονάδα αγορών· αλλιώς και Μ.Μ.2 = Παλέτα.
 * `hasMovements === null` (άγνωστο) → δοκιμάζουμε πλήρες και, αν απορριφθεί η Μ.Μ.2, ξανά μόνο αγορών.
 */
export function unitsPatch(opts: {
  ids: UnitIds; perPallet: number; capacity: number; hasMovements: boolean | null;
  current?: { unit2?: string | null; ratio2?: number | null } | null;
}): UnitsPatch {
  const buy = { unitBuy: opts.ids.container, buyRatio: Math.round(opts.capacity * opts.perPallet * 10000) / 10000 };
  if (opts.hasMovements === true || unit2Same(opts.current ?? null, opts.ids, opts.perPallet)) return buy;
  return { unit2: opts.ids.pallet, ratio2: opts.perPallet, strict2: false, ...buy };
}

/** Το μήνυμα του SoftOne για κλειδωμένη Μ.Μ.2 (ή ο κωδικός `unit2_locked` του API). */
export const isUnit2Locked = (msg: string | null | undefined, code?: string | null) =>
  code === 'unit2_locked' || /Μ\.Μ\.2/.test(msg ?? '') && /παραστατικ/i.test(msg ?? '');

export type UnitsResult = { code: string; ok: boolean; partial: boolean; message: string | null };

/**
 * Εκτέλεση για ένα είδος — ΠΟΤΕ δεν πετά σφάλμα: επιστρέφει αποτέλεσμα για τη σύνοψη.
 * `put` κάνει το PUT και επιστρέφει { ok, message, code }.
 */
export async function applyUnits(
  code: string,
  patch: UnitsPatch,
  put: (body: UnitsPatch) => Promise<{ ok: boolean; message?: string | null; code?: string | null }>,
): Promise<UnitsResult> {
  try {
    const r = await put(patch);
    if (r.ok) return { code, ok: true, partial: patch.unit2 == null, message: null };
    if (patch.unit2 != null && isUnit2Locked(r.message, r.code)) {
      const r2 = await put({ unitBuy: patch.unitBuy, buyRatio: patch.buyRatio });
      return r2.ok
        ? { code, ok: true, partial: true, message: 'Η Μ.Μ.2 δεν άλλαξε (υπάρχουν παραστατικά) — ενημερώθηκε μόνο η μονάδα αγορών.' }
        : { code, ok: false, partial: false, message: r2.message ?? 'αποτυχία' };
    }
    return { code, ok: false, partial: false, message: r.message ?? 'αποτυχία' };
  } catch (e) {
    return { code, ok: false, partial: false, message: (e as Error).message || 'δεν υπάρχει σύνδεση' };
  }
}
