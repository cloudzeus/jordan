// Server Actions του καταλόγου τύπων κατασκευής, με mocked rbac / db / audit. Ελέγχουμε τον έλεγχο
// δικαιωμάτων, τον έλεγχο εισόδου, τη σωστή κλήση της βάσης και το φιλικό μήνυμα σε διπλό κωδικό.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rbac, dbmod, audit } = vi.hoisted(() => ({
  rbac: { getCurrentUserWithPermissions: vi.fn() },
  dbmod: {
    listWallTypes: vi.fn(), createWallType: vi.fn(), updateWallType: vi.fn(),
    deleteWallType: vi.fn(), setWallTypeActive: vi.fn(), reorderWallTypes: vi.fn(),
    WallTypeError: class WallTypeError extends Error { constructor(message: string, readonly status = 400) { super(message); } },
  },
  audit: { logAudit: vi.fn() },
}));

vi.mock('@/lib/rbac', () => rbac);
vi.mock('@/lib/floorplan/wall-types-db', () => dbmod);
vi.mock('@/lib/audit', () => audit);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { listWallTypesAction, saveWallTypeAction, deleteWallTypeAction } from '@/app/admin/floorplans/wall-types/actions';

const USER = { id: 'u1', email: 'a@b.gr', role: { key: 'ADMIN' }, permissionKeys: new Set(['floorplans.catalog']) };
const valid = { code: 'GB10', name: 'Γυψοσανίδα', category: 'DRYWALL', thicknessM: 0.1 };

beforeEach(() => {
  vi.clearAllMocks();
  rbac.getCurrentUserWithPermissions.mockResolvedValue(USER);
  audit.logAudit.mockResolvedValue(undefined);
});

describe('wall-types actions', () => {
  it('refuses when the user lacks the permission, without touching the db', async () => {
    rbac.getCurrentUserWithPermissions.mockResolvedValue({ ...USER, permissionKeys: new Set() });
    const r = await saveWallTypeAction(null, valid);
    expect(r.ok).toBe(false);
    expect(dbmod.createWallType).not.toHaveBeenCalled();
  });

  it('rejects invalid input without touching the db', async () => {
    const r = await saveWallTypeAction(null, { ...valid, thicknessM: 0 });
    expect(r.ok).toBe(false);
    expect(dbmod.createWallType).not.toHaveBeenCalled();
  });

  it('creates a new type and returns its id', async () => {
    dbmod.createWallType.mockResolvedValue({ id: 'w1' });
    const r = await saveWallTypeAction(null, valid);
    expect(r).toEqual({ ok: true, data: { id: 'w1' } });
    expect(dbmod.createWallType).toHaveBeenCalledTimes(1);
    expect(dbmod.updateWallType).not.toHaveBeenCalled();
  });

  it('updates an existing type when an id is given', async () => {
    dbmod.updateWallType.mockResolvedValue({ id: 'w2' });
    const r = await saveWallTypeAction('w2', valid);
    expect(r).toEqual({ ok: true, data: { id: 'w2' } });
    expect(dbmod.updateWallType).toHaveBeenCalledTimes(1);
    expect(dbmod.createWallType).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate-code error as a friendly message', async () => {
    dbmod.createWallType.mockRejectedValue(new dbmod.WallTypeError('Υπάρχει ήδη τύπος με αυτόν τον κωδικό.'));
    const r = await saveWallTypeAction(null, valid);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/κωδικ/i);
  });

  it('lists types for an authorized user', async () => {
    dbmod.listWallTypes.mockResolvedValue([{ id: 'w1' }]);
    const r = await listWallTypesAction();
    expect(r).toEqual({ ok: true, data: [{ id: 'w1' }] });
  });

  it('deletes a type', async () => {
    dbmod.deleteWallType.mockResolvedValue(undefined);
    const r = await deleteWallTypeAction('w1');
    expect(r.ok).toBe(true);
    expect(dbmod.deleteWallType).toHaveBeenCalledWith('w1');
  });
});
