// Toggle action του flag floorplan.v2 — mocked rbac/settings. Ελέγχουμε δικαίωμα + εγγραφή AppSetting.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rbac, settings, audit } = vi.hoisted(() => ({
  rbac: { getCurrentUserWithPermissions: vi.fn() },
  settings: { setSetting: vi.fn(), getSetting: vi.fn() },
  audit: { logAudit: vi.fn() },
}));
vi.mock('@/lib/rbac', () => rbac);
vi.mock('@/lib/settings', () => settings);
vi.mock('@/lib/audit', () => audit);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { setFloorplanV2Action } from '@/app/admin/floorplans/flag-actions';

const USER = { id: 'u1', email: 'a@b.gr', role: { key: 'SUPER_ADMIN' }, permissionKeys: new Set(['system.settings']) };

beforeEach(() => {
  vi.clearAllMocks();
  rbac.getCurrentUserWithPermissions.mockResolvedValue(USER);
  settings.setSetting.mockResolvedValue(undefined);
  audit.logAudit.mockResolvedValue(undefined);
});

describe('setFloorplanV2Action', () => {
  it('refuses without system.settings and does not write', async () => {
    rbac.getCurrentUserWithPermissions.mockResolvedValue({ ...USER, role: { key: 'ADMIN' }, permissionKeys: new Set() });
    const r = await setFloorplanV2Action({ all: true });
    expect(r.ok).toBe(false);
    expect(settings.setSetting).not.toHaveBeenCalled();
  });

  it('writes the floorplan.v2 AppSetting when authorized', async () => {
    const r = await setFloorplanV2Action({ all: false, userIds: ['u1'] });
    expect(r.ok).toBe(true);
    expect(settings.setSetting).toHaveBeenCalledWith('floorplan.v2', { all: false, userIds: ['u1'] }, 'u1');
  });

  it('rejects malformed input without writing', async () => {
    const r = await setFloorplanV2Action({ userIds: 'nope' } as unknown as { userIds?: string[] });
    expect(r.ok).toBe(false);
    expect(settings.setSetting).not.toHaveBeenCalled();
  });
});
