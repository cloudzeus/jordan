import { describe, expect, it } from 'vitest';
import { doorSwing, segmentMid, wallCaps, wallEdges, windowLines } from '../openings-2d';

describe('architectural 2D helpers', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };

  it('offsets a wall into two parallel edges', () => {
    const { a1, b1, a2, b2 } = wallEdges(a, b, 20);
    expect(a1.y).toBeCloseTo(10);
    expect(a2.y).toBeCloseTo(-10);
    expect(b1.y).toBeCloseTo(10);
    expect(b2.y).toBeCloseTo(-10);
  });

  it('creates a door swing arc with the right radius', () => {
    const { leaf, arc } = doorSwing(a, b, 'a', 'left');
    expect(Math.hypot(leaf[1].x - a.x, leaf[1].y - a.y)).toBeCloseTo(100);
    expect(arc.length).toBeGreaterThan(10);
    expect(arc[0]).toEqual(a);
  });

  it('creates two offset lines for a window', () => {
    const { l1, l2, caps } = windowLines(a, b, 20);
    expect(l1[0].y).toBeCloseTo(6.4);
    expect(l2[0].y).toBeCloseTo(-6.4);
    expect(caps).toHaveLength(2);
  });

  it('creates wall end caps', () => {
    const caps = wallCaps(a, b, 20);
    expect(caps).toHaveLength(2);
    expect(caps[0][0].y).toBeCloseTo(10);
    expect(caps[0][1].y).toBeCloseTo(-10);
  });

  it('finds the segment midpoint', () => {
    expect(segmentMid(a, b)).toEqual({ x: 50, y: 0 });
  });
});
