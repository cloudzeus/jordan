// Feature flag «Editor κατόψεων v2» — καθαρός resolver (χωρίς DOM/βάση), ελέγχεται με vitest.
// Το flag ζει σε AppSetting key `floorplan.v2`· βλ. feature-flag-db.ts για ανάγνωση/εγγραφή.
import { z } from 'zod';

export const FLOORPLAN_V2_KEY = 'floorplan.v2';

export const floorplanV2Config = z.object({
  all: z.boolean().optional(),
  userIds: z.array(z.string().min(1).max(64)).max(1000).optional(),
});
/** `all`: ενεργό για όλους· `userIds`: μόνο για συγκεκριμένους χρήστες. */
export type FloorplanV2Config = z.infer<typeof floorplanV2Config>;

/** Είναι το v2 editor ενεργό για αυτόν τον χρήστη; Default: ΝΑΙ (ο v2 είναι ο κύριος editor)·
 *  μόνο ρητό `all: false` τον κλείνει. */
export function floorplanV2Enabled(cfg: FloorplanV2Config | null | undefined, _userId: string | null): boolean {
  return cfg?.all !== false;
}
