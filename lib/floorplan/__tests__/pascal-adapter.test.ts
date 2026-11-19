import { describe, expect, it } from 'vitest';
import { planDataV2ToPascal } from '../pascal-adapter';
import { planDataV2 } from '../saved';

describe('pascal adapter', () => {
  const base = planDataV2.parse({
    v: 2,
    underlay: null,
    floor: { ceilingM: 2.8, slabM: 0 },
    walls: [
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, typeId: 't1', source: 'drawn' },
      { id: 'w2', a: { x: 4, y: 0 }, b: { x: 4, y: 3 }, typeId: 't1', source: 'drawn' },
    ],
    openings: [
      { id: 'o1', wallId: 'w1', t0: 0.2, t1: 0.4, kind: 'door', sillM: 0, heightM: 2.1, modelId: null, swing: 'left' },
    ],
    columns: [
      { id: 'c1', center: { x: 1, y: 1 }, widthM: 0.25, depthM: 0.25, rotationDeg: 0, heightM: 2.8, typeId: null },
    ],
    rooms: [],
  });

  it('creates a level with walls, doors and columns', () => {
    const graph = planDataV2ToPascal(base, [{ id: 't1', thicknessM: 0.2 }]);
    expect(graph.rootNodeIds).toEqual(['level_ground']);
    const level = graph.nodes.level_ground as { children: string[] };
    expect(level.children).toContain('wall_w1');
    expect(level.children).toContain('wall_w2');
    expect(level.children).toContain('column_c1');
    const wall = graph.nodes.wall_w1 as { start: [number, number]; end: [number, number]; thickness: number; children: string[] };
    expect(wall.start).toEqual([0, 0]);
    expect(wall.end).toEqual([4, 0]);
    expect(wall.thickness).toBe(0.2);
    expect(wall.children).toContain('door_o1');
    const door = graph.nodes.door_o1 as { position: [number, number, number]; width: number };
    expect(door.position[0]).toBeCloseTo(1.2);
    expect(door.width).toBeCloseTo(0.8);
  });
});
