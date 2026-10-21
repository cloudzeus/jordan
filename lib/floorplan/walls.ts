// Πλακάκι και στους τοίχους ενός χώρου: περίμετρος × ύψος πλακιδίων − ανοίγματα (πόρτες, παράθυρα).
// Καθαρή λογική (χωρίς DOM) — τη χρησιμοποιεί η «Διαστασιολόγηση κάτοψης» και το export.

export type OpeningKind = 'door' | 'window' | 'other';
export type Opening = { id: string; kind: OpeningKind; w: number; h: number; count: number };
export type RoomWalls = { on: boolean; heightM: number; openings: Opening[] };

export const OPENING_PRESETS: Record<OpeningKind, { label: string; w: number; h: number }> = {
  door: { label: 'Πόρτα', w: 0.9, h: 2.1 },
  window: { label: 'Παράθυρο', w: 1.2, h: 1.4 },
  other: { label: 'Άνοιγμα', w: 1, h: 1 },
};

/** Συνηθισμένα ύψη πλακιδίων (m): μπάνιο έως ~2,40, ως το ταβάνι 2,60–3,00. */
export const HEIGHT_PRESETS = [2.4, 2.6, 2.8, 3] as const;
export const DEFAULT_HEIGHT = 2.6;

export type WallCalc = {
  /** Περίμετρος × ύψος. */
  gross: number;
  /** Άθροισμα ανοιγμάτων (το ύψος τους κόβεται στο ύψος των πλακιδίων). */
  openings: number;
  /** Καθαρά m² τοίχων (ποτέ αρνητικά). */
  net: number;
};

const ok = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Επιφάνεια ενός ανοίγματος μέσα στη ζώνη πλακιδίων. */
export const openingArea = (o: Opening, heightM: number) => ok(o.w) * Math.min(ok(o.h), ok(heightM)) * Math.max(0, Math.round(ok(o.count)));

export function wallArea(perimeterM: number, walls: Pick<RoomWalls, 'heightM' | 'openings'>): WallCalc {
  const gross = ok(perimeterM) * ok(walls.heightM);
  const openings = walls.openings.reduce((s, o) => s + openingArea(o, walls.heightM), 0);
  return { gross: r2(gross), openings: r2(openings), net: r2(Math.max(0, gross - openings)) };
}

/** «2,6» ή «2.60» → 2.6 · κενό/άκυρο → NaN. */
export function parseMeters(v: string): number {
  const s = v.trim().replace(/\s/g, '').replace(',', '.');
  return s ? Number(s) : NaN;
}
