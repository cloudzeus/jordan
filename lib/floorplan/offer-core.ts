// Κάτοψη → προσφορά: καθαρή λογική (χωρίς βάση), κοινή για server και tests.
// Κάθε χώρος της διαστασιολόγησης έχει (προαιρετικά) ένα υλικό: είτε συνταγή τοποθέτησης (υλικά με
// φύρα + εργασία, τιμές κόστους + περιθώριο) είτε σκέτο είδος (τιμή λιανικής × m², χωρίς περιθώριο).
// Οι γραμμές μένουν ανά χώρο, με σημείωση «Χώρος: … · m²», ώστε ο πελάτης να βλέπει τι αφορά κάθε μία.
import { recipeToOfferLines, type OfferLine, type OfferLineMode, type RecipeForOffer } from '@/lib/install-recipes-core';

export type FloorPlanMaterial = { type: 'recipe'; recipeId: string } | { type: 'item'; mtrl: number };
export type FloorPlanRoom = { name: string; areaM2: number; perimeterM: number | null; material: FloorPlanMaterial | null };
export type FloorPlanItem = { mtrl: number; code: string; name: string; price: number };

const nf2 = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export const roomNote = (r: Pick<FloorPlanRoom, 'name' | 'areaM2'>) => `Χώρος: ${r.name} · ${nf2.format(r.areaM2)} m²`;

export function floorPlanOffer(o: {
  rooms: FloorPlanRoom[];
  recipes: Map<string, RecipeForOffer>;
  items: Map<number, FloorPlanItem>;
  markupPct: number;
  mode: OfferLineMode;
}): { lines: OfferLine[]; kind: 'PRODUCT' | 'PRODUCT_INSTALL'; missing: string[] } {
  const lines: OfferLine[] = [];
  const missing: string[] = [];
  for (const room of o.rooms) {
    const area = round(room.areaM2);
    if (!(area > 0) || !room.material) continue;
    const note = roomNote({ name: room.name, areaM2: area });
    if (room.material.type === 'recipe') {
      const r = o.recipes.get(room.material.recipeId);
      if (!r) { missing.push(room.name); continue; }
      for (const l of recipeToOfferLines(r, area, { markupPct: o.markupPct, mode: o.mode })) {
        lines.push({ ...l, notes: l.notes ? `${note} — ${l.notes}` : note });
      }
    } else {
      const it = o.items.get(room.material.mtrl);
      if (!it) { missing.push(room.name); continue; }
      lines.push({ kind: 'MATERIAL', mtrl: it.mtrl, code: it.code, name: it.name, unit: 'm²', qty: area, unitPrice: round(it.price, 2), notes: note });
    }
  }
  return { lines, kind: lines.some((l) => l.kind === 'SERVICE') ? 'PRODUCT_INSTALL' : 'PRODUCT', missing };
}

/** Περίληψη της προσφοράς: όλοι οι χώροι (και όσοι δεν έχουν υλικό), εμβαδά, περίμετροι, σύνολο. */
export function floorPlanSummary(o: { rooms: FloorPlanRoom[]; materialLabel: (r: FloorPlanRoom) => string | null; source: string | null; wallLenM: number | null }): string {
  const total = o.rooms.reduce((s, r) => s + (r.areaM2 > 0 ? r.areaM2 : 0), 0);
  const rows = o.rooms.map((r) => {
    const parts = [`${nf2.format(r.areaM2)} m²`];
    if (r.perimeterM != null) parts.push(`περίμετρος ${nf2.format(r.perimeterM)} m`);
    parts.push(o.materialLabel(r) ?? 'χωρίς υλικό');
    return `• ${r.name}: ${parts.join(' · ')}`;
  });
  return [
    `Προσφορά από διαστασιολόγηση κάτοψης${o.source ? ` (${o.source})` : ''}.`,
    '',
    `Χώροι (${o.rooms.length}):`,
    ...rows,
    `Σύνολο: ${nf2.format(total)} m²`,
    ...(o.wallLenM != null ? [`Μήκος τοίχων: ${nf2.format(o.wallLenM)} m`] : []),
  ].join('\n');
}
