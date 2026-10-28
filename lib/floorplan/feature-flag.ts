// Feature flag «Editor κατόψεων v2» — καθαρός resolver (χωρίς DOM/βάση), ελέγχεται με vitest.
// Το flag ζει σε AppSetting key `floorplan.v2`· βλ. feature-flag-db.ts για ανάγνωση/εγγραφή.

/** `all`: ενεργό για όλους· `userIds`: μόνο για συγκεκριμένους χρήστες. */
export type FloorplanV2Config = { all?: boolean; userIds?: string[] };

/** Είναι το v2 editor ενεργό για αυτόν τον χρήστη; (default: όχι). */
export function floorplanV2Enabled(cfg: FloorplanV2Config | null | undefined, userId: string | null): boolean {
  if (cfg?.all === true) return true;
  return !!userId && (cfg?.userIds ?? []).includes(userId);
}
