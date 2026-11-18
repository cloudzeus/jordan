import { labelPoint, pointInPolygon, polygonArea, polygonPerimeter } from '../core';
import { mPerPxOf, type PlanData, type PlanDataV2 } from '../saved';
import { roomsFromWalls } from './rooms';

/** Preserve the editable vector model plus the pixel takeoff consumed by existing offers/PDFs. */
export function editorSnapshot(base: PlanData, editor: PlanDataV2, types: { id: string; thicknessM: number }[]): PlanData {
  const mpp = mPerPxOf(base);
  if (!mpp || !Number.isFinite(mpp)) return base;
  const px = (p: { x: number; y: number }) => ({ x: p.x / mpp, y: p.y / mpp });
  const derived = roomsFromWalls(editor.walls);
  const used = new Set<string>();
  const rooms = editor.walls.length ? derived.map((r, index) => {
    const polygon = r.polygon.map(px);
    const center = labelPoint(polygon);
    const previous = base.rooms.find((old) => !used.has(old.id) && pointInPolygon(center, old.polygon));
    if (previous) used.add(previous.id);
    return {
      ...previous, id: previous?.id ?? `derived-${index + 1}`, name: previous?.name ?? `Χώρος ${index + 1}`,
      color: previous?.color ?? '#38BDF8', polygon, areaPx: polygonArea(polygon), perimeterPx: polygonPerimeter(polygon),
      manual: false, walls: previous?.walls, material: previous?.material ?? null, materialB: previous?.materialB ?? null,
    };
  }) : base.rooms;
  return {
    ...base, rooms,
    drawnWalls: editor.walls.map((wall) => {
      const type = types.find((t) => t.id === wall.typeId);
      return {
        a: px(wall.a), b: px(wall.b),
        t: (type?.thicknessM ?? base.wallCm / 100) / mpp,
        typeId: wall.typeId ?? null,
      };
    }),
    columns: editor.columns.map((c) => ({
      id: c.id,
      center: px(c.center),
      widthPx: c.widthM / mpp,
      heightPx: c.depthM / mpp,
      rotationDeg: c.rotationDeg,
    })),
    editorV2: { ...editor, rooms: rooms.map((r) => ({
      ...r, seed: null, polygon: r.polygon.map((p) => ({ x: p.x * mpp, y: p.y * mpp })), floorM2: r.areaPx * mpp * mpp, perimeterM: r.perimeterPx * mpp,
    })) },
  };
}
