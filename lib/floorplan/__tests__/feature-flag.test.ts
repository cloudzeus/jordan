import { describe, it, expect } from 'vitest';
import { floorplanV2Enabled } from '../feature-flag';

describe('floorplanV2Enabled', () => {
  it('is ON by default (v2 is the main editor)', () => {
    expect(floorplanV2Enabled(null, 'u1')).toBe(true);
    expect(floorplanV2Enabled({}, 'u1')).toBe(true);
    expect(floorplanV2Enabled({ all: true }, 'u1')).toBe(true);
  });
  it('only an explicit all:false turns it off', () => {
    expect(floorplanV2Enabled({ all: false }, 'u1')).toBe(false);
    expect(floorplanV2Enabled({ all: false }, null)).toBe(false);
  });
});
