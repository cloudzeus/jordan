// Λογική βάσης του καταλόγου τύπων κατασκευής — με mocked prisma. Ελέγχουμε το mapping του διπλού
// κωδικού (P2002) σε φιλικό WallTypeError και τη σειρά ανάγνωσης.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: { wallType: { create: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ prisma: db }));

import { listWallTypes, createWallType, WallTypeError } from '../wall-types-db';

const valid = { code: 'GB10', name: 'Γυψοσανίδα', category: 'DRYWALL' as const, thicknessM: 0.1 };

beforeEach(() => { vi.clearAllMocks(); });

describe('wall-types-db', () => {
  it('lists types ordered by sortOrder then code', async () => {
    db.wallType.findMany.mockResolvedValue([]);
    await listWallTypes();
    expect(db.wallType.findMany).toHaveBeenCalledWith({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
  });

  it('maps a duplicate code (P2002) to a friendly WallTypeError', async () => {
    db.wallType.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(createWallType(valid)).rejects.toBeInstanceOf(WallTypeError);
    db.wallType.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(createWallType(valid)).rejects.toThrow(/κωδικ/i);
  });

  it('creates a type with the parsed, defaulted fields', async () => {
    db.wallType.create.mockResolvedValue({ id: 'w1' });
    const r = await createWallType(valid);
    expect(r.id).toBe('w1');
    const arg = db.wallType.create.mock.calls[0][0].data;
    expect(arg.measureFaces).toBe('both');
    expect(arg.active).toBe(true);
  });
});
