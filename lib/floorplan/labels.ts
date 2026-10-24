// lib/floorplan/labels.ts — καθαρή λογική για τις ετικέτες της κάτοψης (όπως στα σχέδια/χάρτες):
// η ετικέτα ενός χώρου δείχνει όσα χωρούν μέσα του στην τρέχουσα μεγέθυνση (όνομα + m² → μόνο m² → τίποτα)
// και δύο ετικέτες δεν πέφτουν ποτέ η μία πάνω στην άλλη — κερδίζει η επιλεγμένη και μετά ο μεγαλύτερος χώρος.

export type LabelMode = 'full' | 'area' | 'hidden';
type Size = { w: number; h: number };

export type LabelInput = {
  id: string;
  kind: 'room' | 'dim';
  /** Κέντρο της ετικέτας στην οθόνη (px). */
  cx: number; cy: number;
  /** Χώρος: διαστάσεις του περιγράμματος στην οθόνη · διάσταση: μήκος της γραμμής στην οθόνη. */
  fitW: number; fitH: number;
  /** Μέγεθος της ετικέτας ανά μορφή (px)· η διάσταση έχει μόνο `full`. */
  full: Size; area?: Size;
  /** Μεγαλύτερο = πρώτο (επιλεγμένος χώρος, εμβαδό). */
  prio: number;
  /** Ο επιλεγμένος χώρος δείχνει πάντα τουλάχιστον τα m². */
  pinned?: boolean;
};

type Rect = { l: number; t: number; r: number; b: number };
const rect = (cx: number, cy: number, s: Size, pad: number): Rect => ({ l: cx - s.w / 2 - pad, t: cy - s.h / 2 - pad, r: cx + s.w / 2 + pad, b: cy + s.h / 2 + pad });
const hit = (a: Rect, b: Rect) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

export function layoutLabels(items: LabelInput[], pad = 2): Map<string, LabelMode> {
  const out = new Map<string, LabelMode>();
  const placed: Rect[] = [];
  const order = [...items].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.prio - a.prio);
  for (const it of order) {
    const tries: Array<[LabelMode, Size]> = [];
    if (it.kind === 'dim') {
      // Η ένδειξη μήκους μόνο όταν χωράει πάνω στη γραμμή της.
      if (it.full.w + 6 <= it.fitW) tries.push(['full', it.full]);
    } else {
      // Λίγη υπερχείλιση στο πλάτος επιτρέπεται (όπως στα σχέδια)· στο ύψος όχι.
      const fits = (s: Size, k: number) => s.w <= it.fitW * k && s.h <= it.fitH;
      if (fits(it.full, 1.15)) tries.push(['full', it.full]);
      if (it.area && (fits(it.area, 1.4) || it.pinned)) tries.push(['area', it.area]);
    }
    let mode: LabelMode = 'hidden';
    for (const [m, s] of tries) {
      const r = rect(it.cx, it.cy, s, pad);
      if (it.pinned || !placed.some((p) => hit(p, r))) { mode = m; placed.push(r); break; }
    }
    out.set(it.id, mode);
  }
  return out;
}

/** Μέγεθος των σημαδιών (συσκευές, σημειώσεις) ανάλογα με τη μεγέθυνση: μικραίνουν λίγο όταν βλέπεις όλο το σχέδιο. */
export const markerScale = (pxPerUnit: number) => Math.min(1, Math.max(0.7, pxPerUnit / 0.6));
