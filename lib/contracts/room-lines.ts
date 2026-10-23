// lib/contracts/room-lines.ts — ΚΑΘΑΡΟ. Χώρος κάτοψης + υλικό/συνταγή → γραμμές προσφοράς με `roomId`,
// ώστε η φόρμα να ξαναϋπολογίζει μόνο τις γραμμές του χώρου όταν αλλάξει το υλικό του. Ίδιοι κανόνες
// με το «Κάτοψη → προσφορά» (floorPlanOffer): συνταγή με περιθώριο, είδος σε m² στην τιμή λιανικής.
import { floorPlanOffer, type FloorPlanItem } from '@/lib/floorplan/offer-core';
import type { OfferLine, OfferLineMode, RecipeForOffer } from '@/lib/install-recipes-core';

export type RoomForLines = { id: string; name: string; floorM2: number; wallsM2: number };
export type RoomMaterialRef = { type: 'recipe'; recipeId: string } | { type: 'item'; mtrl: number };
export type RoomLine = OfferLine & { roomId: string };

export function roomLines(o: {
  room: RoomForLines;
  material: RoomMaterialRef | null;
  recipes: Map<string, RecipeForOffer>;
  items: Map<number, FloorPlanItem>;
  markupPct: number;
  mode: OfferLineMode;
}): { lines: RoomLine[]; missing: boolean } {
  if (!o.material) return { lines: [], missing: false };
  const material = o.material.type === 'recipe' ? { type: 'recipe' as const, recipeId: o.material.recipeId } : { type: 'item' as const, mtrl: o.material.mtrl };
  const r = floorPlanOffer({
    rooms: [{ name: o.room.name, areaM2: o.room.floorM2, perimeterM: null, wallsM2: o.room.wallsM2, material }],
    recipes: o.recipes, items: o.items, markupPct: o.markupPct, mode: o.mode,
  });
  return { lines: r.lines.map((l) => ({ ...l, roomId: o.room.id })), missing: r.missing.length > 0 };
}

/** Καθαρή αξία των γραμμών ενός χώρου (για το «κόστος ανά χώρο» της φόρμας). */
export function roomNet(lines: { roomId?: string | null; qty: number; unitPrice: number; discount?: number | null }[], roomId: string): number {
  const net = lines.filter((l) => l.roomId === roomId).reduce((s, l) => s + l.qty * l.unitPrice * (1 - Math.min(100, Math.max(0, l.discount ?? 0)) / 100), 0);
  return Math.round(net * 100) / 100;
}
