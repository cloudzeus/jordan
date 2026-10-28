import { describe, it, expect } from 'vitest';
import { clampToolbarPos } from '../editor-ui';

describe('clampToolbarPos', () => {
  it('keeps a position inside bounds', () => {
    expect(clampToolbarPos({ x: 10, y: 20 }, { w: 800, h: 600 }, { w: 48, h: 400 }, 4)).toEqual({ x: 10, y: 20 });
  });
  it('clamps negatives to the pad', () => {
    expect(clampToolbarPos({ x: -50, y: -50 }, { w: 800, h: 600 }, { w: 48, h: 400 }, 4)).toEqual({ x: 4, y: 4 });
  });
  it('clamps overflow to bounds minus element minus pad', () => {
    expect(clampToolbarPos({ x: 999, y: 999 }, { w: 800, h: 600 }, { w: 48, h: 400 }, 4)).toEqual({ x: 800 - 48 - 4, y: 600 - 400 - 4 });
  });
  it('never goes past the pad when the element is larger than bounds', () => {
    expect(clampToolbarPos({ x: 10, y: 10 }, { w: 40, h: 40 }, { w: 48, h: 400 }, 4)).toEqual({ x: 4, y: 4 });
  });
});
