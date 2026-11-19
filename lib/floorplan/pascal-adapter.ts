// Μετατροπή PlanDataV2 → Pascal scene graph (nodes + rootNodeIds).
// Καθαρή λογική (χωρίς DOM) — ελέγχεται με vitest.
import type { PlanDataV2 } from './saved';

type Pt = { x: number; y: number };

export type PascalSceneGraph = {
  nodes: Record<string, unknown>;
  rootNodeIds: string[];
};

const uid = (prefix: string, id: string) => `${prefix}_${id}`;

function wallCenter(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Μετατρέπει ένα v2 plan σε Pascal scene graph.
 * - Ένα level node (ισόγειο).
 * - Wall nodes από τα v2 walls (start/end σε μέτρα).
 * - Door/Window nodes από τα v2 openings (position 3D πάνω στον τοίχο).
 * - Column nodes από τα v2 columns.
 */
export function planDataV2ToPascal(d: PlanDataV2, wallTypes: { id: string; thicknessM: number }[]): PascalSceneGraph {
  const nodes: Record<string, unknown> = {};
  const levelId = 'level_ground';
  const levelChildren: string[] = [];

  // Level
  nodes[levelId] = {
    object: 'node', id: levelId, type: 'level',
    name: 'Ισόγειο', parentId: null, level: 0, baseElevation: 0,
    height: d.floor.ceilingM,
    children: levelChildren,
  };

  // Walls
  const wallIdMap = new Map<string, string>();
  for (const w of d.walls) {
    const id = uid('wall', w.id);
    wallIdMap.set(w.id, id);
    const type = wallTypes.find((t) => t.id === w.typeId);
    const thickness = type?.thicknessM ?? 0.15;
    const openings = d.openings.filter((o) => o.wallId === w.id);
    const children: string[] = [];
    for (const o of openings) {
      const childId = uid(o.kind === 'door' ? 'door' : 'window', o.id);
      children.push(childId);
    }
    nodes[id] = {
      object: 'node', id, type: 'wall',
      parentId: levelId,
      start: [w.a.x, w.a.y] as [number, number],
      end: [w.b.x, w.b.y] as [number, number],
      thickness,
      height: d.floor.ceilingM,
      children,
    };
    levelChildren.push(id);
  }

  // Openings (doors/windows)
  for (const o of d.openings) {
    const wall = d.walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const wallId = wallIdMap.get(o.wallId)!;
    const tMid = (o.t0 + o.t1) / 2;
    const pos: [number, number, number] = [
      wall.a.x + tMid * (wall.b.x - wall.a.x),
      o.sillM,
      wall.a.y + tMid * (wall.b.y - wall.a.y),
    ];
    const width = Math.hypot(
      (o.t1 - o.t0) * (wall.b.x - wall.a.x),
      (o.t1 - o.t0) * (wall.b.y - wall.a.y),
    );
    const id = uid(o.kind === 'door' ? 'door' : 'window', o.id);
    const base = {
      object: 'node', id,
      parentId: wallId,
      wallId,
      position: pos,
      width,
      height: o.heightM,
    };
    if (o.kind === 'door') {
      nodes[id] = {
        ...base, type: 'door',
        hingesSide: o.swing === 'right' ? 'right' : 'left',
      };
    } else {
      nodes[id] = {
        ...base, type: 'window',
        sill: o.sillM,
      };
    }
  }

  // Columns
  for (const c of d.columns) {
    const id = uid('column', c.id);
    nodes[id] = {
      object: 'node', id, type: 'column',
      parentId: levelId,
      position: [c.center.x, 0, c.center.y] as [number, number, number],
      width: c.widthM,
      depth: c.depthM,
      height: c.heightM,
      rotation: c.rotationDeg,
    };
    levelChildren.push(id);
  }

  return { nodes, rootNodeIds: [levelId] };
}
