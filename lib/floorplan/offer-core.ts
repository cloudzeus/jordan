// Κάτοψη → προσφορά: καθαρή λογική (χωρίς βάση), κοινή για server και tests.
// Κάθε χώρος της διαστασιολόγησης έχει (προαιρετικά) ένα υλικό: είτε συνταγή τοποθέτησης (υλικά με
// φύρα + εργασία, τιμές κόστους + περιθώριο) είτε σκέτο είδος (τιμή λιανικής × m², χωρίς περιθώριο).
// Οι γραμμές μένουν ανά χώρο, με σημείωση «Χώρος: … · m²», ώστε ο πελάτης να βλέπει τι αφορά κάθε μία.
// Χώρος με «πλακάκι και στους τοίχους»: το ίδιο υλικό και για τα καθαρά m² τοίχων, σε δικές τους γραμμές.
import { recipeToOfferLines, type OfferLine, type OfferLineMode, type RecipeForOffer } from '@/lib/install-recipes-core';

export type FloorPlanMaterial = { type: 'recipe'; recipeId: string } | { type: 'item'; mtrl: number };
export type FloorPlanRoom = {
  name: string; areaM2: number; perimeterM: number | null; material: FloorPlanMaterial | null;
  /** Καθαρά m² τοίχων με πλακάκι (περίμετρος × ύψος − ανοίγματα)· 0/κενό = μόνο δάπεδο. */
  wallsM2?: number | null;
};
export type FloorPlanItem = { mtrl: number; code: string; name: string; price: number };

const nf2 = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export const roomNote = (r: Pick<FloorPlanRoom, 'name' | 'areaM2'>) => `Χώρος: ${r.name} · ${nf2.format(r.areaM2)} m²`;
/** Σημείωση για τις γραμμές τοίχων ενός χώρου. */
export const wallsNote = (name: string, m2: number) => `Χώρος: ${name} · τοίχοι ${nf2.format(m2)} m²`;

export function floorPlanOffer(o: {
  rooms: FloorPlanRoom[];
  recipes: Map<string, RecipeForOffer>;
  items: Map<number, FloorPlanItem>;
  markupPct: number;
  mode: OfferLineMode;
  /** Και οι τοίχοι των χώρων που έχουν πλακάκι στους τοίχους (προεπιλογή: ναι). */
  includeWalls?: boolean;
}): { lines: OfferLine[]; kind: 'PRODUCT' | 'PRODUCT_INSTALL'; missing: string[] } {
  const lines: OfferLine[] = [];
  const missing: string[] = [];
  const includeWalls = o.includeWalls ?? true;
  for (const room of o.rooms) {
    if (!room.material) continue;
    const parts: Array<[number, string]> = [];
    const area = round(room.areaM2);
    if (area > 0) parts.push([area, roomNote({ name: room.name, areaM2: area })]);
    const walls = round(room.wallsM2 ?? 0);
    if (includeWalls && walls > 0) parts.push([walls, wallsNote(room.name, walls)]);
    if (!parts.length) continue;
    if (room.material.type === 'recipe') {
      const r = o.recipes.get(room.material.recipeId);
      if (!r) { missing.push(room.name); continue; }
      for (const [m2, note] of parts) {
        for (const l of recipeToOfferLines(r, m2, { markupPct: o.markupPct, mode: o.mode })) {
          lines.push({ ...l, notes: l.notes ? `${note} — ${l.notes}` : note });
        }
      }
    } else {
      const it = o.items.get(room.material.mtrl);
      if (!it) { missing.push(room.name); continue; }
      for (const [m2, note] of parts) {
        lines.push({ kind: 'MATERIAL', mtrl: it.mtrl, code: it.code, name: it.name, unit: 'm²', qty: m2, unitPrice: round(it.price, 2), notes: note });
      }
    }
  }
  return { lines, kind: lines.some((l) => l.kind === 'SERVICE') ? 'PRODUCT_INSTALL' : 'PRODUCT', missing };
}

/** Περίληψη της προσφοράς: όλοι οι χώροι (και όσοι δεν έχουν υλικό), εμβαδά, περίμετροι, σύνολο. */
export function floorPlanSummary(o: { rooms: FloorPlanRoom[]; materialLabel: (r: FloorPlanRoom) => string | null; source: string | null; wallLenM: number | null }): string {
  const total = o.rooms.reduce((s, r) => s + (r.areaM2 > 0 ? r.areaM2 : 0), 0);
  const walls = o.rooms.reduce((s, r) => s + (r.wallsM2 && r.wallsM2 > 0 ? r.wallsM2 : 0), 0);
  const rows = o.rooms.map((r) => {
    const parts = [`${nf2.format(r.areaM2)} m²`];
    if (r.perimeterM != null) parts.push(`περίμετρος ${nf2.format(r.perimeterM)} m`);
    if (r.wallsM2 && r.wallsM2 > 0) parts.push(`τοίχοι ${nf2.format(r.wallsM2)} m²`);
    parts.push(o.materialLabel(r) ?? 'χωρίς υλικό');
    return `• ${r.name}: ${parts.join(' · ')}`;
  });
  return [
    `Προσφορά από διαστασιολόγηση κάτοψης${o.source ? ` (${o.source})` : ''}.`,
    '',
    `Χώροι (${o.rooms.length}):`,
    ...rows,
    `Σύνολο δαπέδου: ${nf2.format(total)} m²`,
    ...(walls > 0 ? [`Σύνολο τοίχων: ${nf2.format(walls)} m²`] : []),
    ...(o.wallLenM != null ? [`Μήκος τοίχων: ${nf2.format(o.wallLenM)} m`] : []),
  ].join('\n');
}
