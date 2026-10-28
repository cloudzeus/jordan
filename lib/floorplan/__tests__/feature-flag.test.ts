import { describe, it, expect } from 'vitest';
import { floorplanV2Enabled } from '../feature-flag';

describe('floorplanV2Enabled', () => {
  it('is off by default / for unknown config or user', () => {
    expect(floorplanV2Enabled(null, 'u1')).toBe(false);
    expect(floorplanV2Enabled({}, 'u1')).toBe(false);
    expect(floorplanV2Enabled({ userIds: ['u2'] }, 'u1')).toBe(false);
    expect(floorplanV2Enabled({ userIds: ['u1'] }, null)).toBe(false);
  });
  it('is on when all=true or the user is listed', () => {
    expect(floorplanV2Enabled({ all: true }, 'u1')).toBe(true);
    expect(floorplanV2Enabled({ userIds: ['u1', 'u2'] }, 'u1')).toBe(true);
  });
});
