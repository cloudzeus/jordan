// Πλακάκι και στους τοίχους ενός χώρου: περίμετρος × ύψος πλακιδίων − ανοίγματα (πόρτες, παράθυρα).
// Καθαρή λογική (χωρίς DOM) — τη χρησιμοποιεί η «Διαστασιολόγηση κάτοψης» και το export.

export type OpeningKind = 'door' | 'window' | 'other';
export type Opening = {
  id: string; kind: OpeningKind; w: number; h: number; count: number;
  /** Ύψος της κάτω πλευράς από το δάπεδο (ποδιά παραθύρου)· 0 = από το δάπεδο (πόρτα). */
  sill?: number;
  /** Θέση πάνω στο σχέδιο (pixels ανάλυσης) όταν σχεδιάστηκε με το εργαλείο «Άνοιγμα». */
  at?: [{ x: number; y: number }, { x: number; y: number }];
};
export type RoomWalls = { on: boolean; heightM: number; openings: Opening[] };

export const OPENING_PRESETS: Record<OpeningKind, { label: string; w: number; h: number; sill: number }> = {
  door: { label: 'Πόρτα', w: 0.9, h: 2.1, sill: 0 },
  window: { label: 'Παράθυρο', w: 1.2, h: 1.4, sill: 1 },
  other: { label: 'Άνοιγμα', w: 1, h: 1, sill: 0 },
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

/**
 * Επιφάνεια ενός ανοίγματος μέσα στη ζώνη πλακιδίων (0 … ύψος): μόνο το κομμάτι από την ποδιά ως
 * ποδιά + ύψος που πέφτει μέσα στη ζώνη — π.χ. παράθυρο με ποδιά 1,0 και ύψος 1,4 σε πλακάκι ως 1,5
 * αφαιρεί μόνο 0,5 m ύψος.
 */
export const openingArea = (o: Opening, heightM: number) => {
  const zone = ok(heightM), sill = Math.min(ok(o.sill ?? 0), zone);
  return ok(o.w) * Math.max(0, Math.min(sill + ok(o.h), zone) - sill) * Math.max(0, Math.round(ok(o.count)));
};

type P = { x: number; y: number };
/** Προβολή του p στο τμήμα a–b: σημείο, παράμετρος t∈[0,1] και απόσταση. */
function project(p: P, a: P, b: P) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { q, t, d: Math.hypot(p.x - q.x, p.y - q.y) };
}

/**
 * Άνοιγμα που σχεδιάστηκε με δύο κλικ (a, b): βρίσκει τον χώρο και την πλευρά του που είναι πιο κοντά
 * στο μέσο του και «κουμπώνει» τα δύο άκρα πάνω σε αυτή. `maxDist` σε pixels· null αν κανένας χώρος.
 */
export function snapOpening(polygons: P[][], a: P, b: P, maxDist: number): { room: number; a: P; b: P } | null {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let best: { room: number; edge: [P, P]; d: number } | null = null;
  polygons.forEach((poly, ri) => {
    poly.forEach((p, i) => {
      const e: [P, P] = [p, poly[(i + 1) % poly.length]];
      const { d } = project(m, e[0], e[1]);
      if (d <= maxDist && (!best || d < best.d)) best = { room: ri, edge: e, d };
    });
  });
  if (!best) return null;
  const { room, edge } = best as { room: number; edge: [P, P]; d: number };
  return { room, a: project(a, edge[0], edge[1]).q, b: project(b, edge[0], edge[1]).q };
}

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
