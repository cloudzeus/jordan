import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ROLE_DEFAULTS, RESOURCE_LABELS } from '../permissions';

describe('floorplans.catalog permission', () => {
  it('is defined with resource "floorplans"', () => {
    const p = PERMISSIONS.find((x) => x.key === 'floorplans.catalog');
    expect(p).toBeDefined();
    expect(p?.resource).toBe('floorplans');
  });

  it('has a Greek label for the floorplans resource group', () => {
    expect(RESOURCE_LABELS.floorplans).toBeTruthy();
  });

  it('is granted to ADMIN by default (SUPER_ADMIN gets all)', () => {
    expect(ROLE_DEFAULTS.ADMIN).toContain('floorplans.catalog');
  });
});
