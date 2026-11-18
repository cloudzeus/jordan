import { labelPoint, pointInPolygon, polygonArea, polygonPerimeter } from '../core';
import { mPerPxOf, type PlanData, type PlanDataV2, type SavedRoom } from '../saved';
import { roomsFromWalls } from './rooms';

const sameEdge = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }, tol: number): boolean => {
  const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const m2 = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
  return Math.hypot(m1.x - m2.x, m1.y - m2.y) <= tol;
};

/** Μετατρέπει τα v2 openings (παραμετρικά πάνω σε wall) σε v1 openings (at + room) για 3D/επιμέτρηση. */
function v2OpeningsToV1(
  walls: PlanDataV2['walls'], openings: PlanDataV2['openings'], rooms: SavedRoom[], mpp: number,
): SavedRoom[] {
  if (!openings.length) return rooms;
  const byWall = new Map(walls.map((w) => [w.id, w]));
  const px = (m: number) => m / mpp;
  const out = rooms.map((r) => (r.walls ? { ...r, walls: { ...r.walls, openings: [...r.walls.openings] } } : r));
  for (const o of openings) {
    const wall = byWall.get(o.wallId);
    if (!wall) continue;
    const a = { x: px(wall.a.x + o.t0 * (wall.b.x - wall.a.x)), y: px(wall.a.y + o.t0 * (wall.b.y - wall.a.y)) };
    const b = { x: px(wall.a.x + o.t1 * (wall.b.x - wall.a.x)), y: px(wall.a.y + o.t1 * (wall.b.y - wall.a.y)) };
    const lenM = Math.hypot(b.x - a.x, b.y - a.y) * mpp;
    const sill = o.sillM ?? 0;
    for (const r of out) {
      if (!r.walls) continue;
      const poly = r.polygon;
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
        if (!sameEdge(a, b, p1, p2, Math.max(3, 0.05 / mpp))) continue;
        // μην προσθέσεις duplicate (ίδιο id) σε διπλανό χώρο
        if (r.walls.openings.some((x) => x.id === o.id)) continue;
        r.walls.openings.push({ id: o.id, kind: o.kind, w: lenM, h: o.heightM, sill, count: 1, at: [a, b] });
      }
    }
  }
  return out;
}

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
  const roomsWithOpenings = v2OpeningsToV1(editor.walls, editor.openings, rooms, mpp);
  return {
    ...base, rooms: roomsWithOpenings,
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
    editorV2: { ...editor, rooms: roomsWithOpenings.map((r) => ({
      ...r, seed: null, polygon: r.polygon.map((p) => ({ x: p.x * mpp, y: p.y * mpp })), floorM2: r.areaPx * mpp * mpp, perimeterM: r.perimeterPx * mpp,
    })) },
  };
}
