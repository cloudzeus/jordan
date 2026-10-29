import { describe, it, expect } from 'vitest';
import { parseAiWallsResponse, aiWallsToSegments } from '@/lib/floorplan/ai-core';

describe('parseAiWallsResponse', () => {
  it('parses walls + openings from JSON', () => {
    const r = parseAiWallsResponse('{"walls":[{"points":[[0,0],[0,1000],[500,1000]]}],"openings":[{"a":[0,100],"b":[0,200],"kind":"door"}],"scale":{"a":[0,0],"b":[0,1000],"cm":1000}}');
    expect(r.walls).toHaveLength(1);
    expect(r.walls[0].points).toHaveLength(3);
    expect(r.openings).toHaveLength(1);
    expect(r.openings[0].kind).toBe('door');
    expect(r.scale?.cm).toBe(1000);
  });

  it('tolerates code fences and junk text around the JSON', () => {
    const r = parseAiWallsResponse('```json\n{"walls":[{"points":[[0,0],[100,0]]}]}\n```');
    expect(r.walls).toHaveLength(1);
  });

  it('drops malformed walls (fewer than 2 points) without failing', () => {
    const r = parseAiWallsResponse('{"walls":[{"points":[[0,0]]},{"points":[[0,0],[0,100]]}]}');
    expect(r.walls).toHaveLength(1);
  });
});

describe('aiWallsToSegments', () => {
  it('converts polylines (0-1000) to px segments between consecutive points', () => {
    const r = parseAiWallsResponse('{"walls":[{"points":[[0,0],[0,1000],[1000,1000]]}]}');
    const segs = aiWallsToSegments(r, 800, 600); // w=800, h=600
    expect(segs).toHaveLength(2);
    // [y,x]=[0,0] → px (0,0); [0,1000] → (800,0); [1000,1000] → (800,600)
    expect(segs[0].a).toEqual({ x: 0, y: 0 });
    expect(segs[0].b).toEqual({ x: 800, y: 0 });
    expect(segs[1].b).toEqual({ x: 800, y: 600 });
  });
});
