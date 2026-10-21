import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { softone, db } = vi.hoisted(() => {
  class SoftoneError extends Error {}
  return {
    softone: { softoneCall: vi.fn(), softoneGetTable: vi.fn(), SoftoneError },
    db: {
      softoneUnit: { findFirst: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn(), upsert: vi.fn(), update: vi.fn() },
      softoneLookup: { upsert: vi.fn(), deleteMany: vi.fn() },
    },
  };
});
vi.mock('@/lib/softone', () => softone);
vi.mock('@/lib/db', () => ({ prisma: db }));

import { createUnit, updateUnit, unitCreateInput, UnitError } from '../units';

const unitRow = (over: Record<string, string> = {}) => ({
  MTRUNIT: '202', SHORTCUT: 'Κυβ', NAME: 'Κυβικά', INTERCODE: '', QDECIMALS: '3', SODIM: '1', SODIV: '1', MYDATACODE: '6', ISACTIVE: '1', ...over,
});
const readBack = (over: Record<string, string> = {}) => ({ success: true, data: { MTRUNIT: [unitRow(over)] } });

beforeEach(() => {
  vi.clearAllMocks();
  db.softoneUnit.findFirst.mockResolvedValue(null);
  db.softoneUnit.upsert.mockImplementation(async ({ create }: { create: unknown }) => create);
  db.softoneUnit.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ code: 202, ...data }));
});

describe('unitCreateInput', () => {
  it('σύντμηση έως 5 και μονάδα myDATA από τον πίνακα της ΑΑΔΕ', () => {
    expect(unitCreateInput.safeParse({ shortcut: 'ΠΟΛΥΜΑΚΡΥ', name: 'Χ', decimals: 2, myDataCode: 1 }).success).toBe(false);
    expect(unitCreateInput.safeParse({ shortcut: 'Χ', name: 'Χ', decimals: 2, myDataCode: 9 }).success).toBe(false);
    expect(unitCreateInput.parse({ shortcut: 'Χ', name: 'Χ', decimals: 2, myDataCode: 6, interCode: '' }).interCode).toBeNull();
  });
});

describe('createUnit', () => {
  it('ΡΗΤΟΣ αριθμός (μέγιστος + 1), διάσταση/διαιρέτης 1, επαλήθευση και ενημέρωση μητρώου αναφοράς', async () => {
    db.softoneUnit.aggregate.mockResolvedValue({ _max: { code: 201 } });
    softone.softoneCall.mockResolvedValueOnce({ success: true, id: '202' }).mockResolvedValueOnce(readBack());
    const u = await createUnit({ shortcut: 'Κυβ', name: 'Κυβικά', interCode: null, decimals: 3, myDataCode: 6 });
    expect(softone.softoneCall.mock.calls[0][1].data.MTRUNIT[0]).toEqual({
      MTRUNIT: 202, SHORTCUT: 'Κυβ', NAME: 'Κυβικά', QDECIMALS: 3, SODIM: 1, SODIV: 1, MYDATACODE: 6, ISACTIVE: 1,
    });
    expect(u).toMatchObject({ code: 202, decimals: 3, myDataCode: 6, isActive: true });
    expect(db.softoneLookup.upsert).toHaveBeenCalled();
  });

  it('«υπάρχει ήδη» ⇒ επόμενος αριθμός', async () => {
    db.softoneUnit.aggregate.mockResolvedValue({ _max: { code: 200 } });
    softone.softoneCall
      .mockResolvedValueOnce({ success: false, error: 'Το πεδίο "Κωδικός" υπάρχει ήδη στο αρχείο.' })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(readBack());
    await createUnit({ shortcut: 'Κυβ', name: 'Κυβικά', interCode: null, decimals: 3, myDataCode: 6 });
    expect(softone.softoneCall.mock.calls[1][1].data.MTRUNIT[0].MTRUNIT).toBe(202);
  });

  it('διπλή σύντμηση ⇒ σφάλμα πριν το SoftOne', async () => {
    db.softoneUnit.findFirst.mockResolvedValueOnce({ id: 1 });
    await expect(createUnit({ shortcut: 'Τεμ.', name: 'Χ', interCode: null, decimals: 2, myDataCode: 1 })).rejects.toThrow(/υπάρχει ήδη/);
    expect(softone.softoneCall).not.toHaveBeenCalled();
  });
});

describe('updateUnit', () => {
  it('μονάδα σε χρήση δεν απενεργοποιείται', async () => {
    db.softoneUnit.findUnique.mockResolvedValue({ code: 101 });
    softone.softoneGetTable.mockResolvedValue([{ MTRL: '1', CODE: 'A', NAME: 'A', SODTYPE: '51', MTRUNIT1: '101', MTRUNIT3: '101', MTRUNIT4: '' }]);
    const err = await updateUnit(101, { isActive: false }).catch((e) => e);
    expect(err).toBeInstanceOf(UnitError);
    expect(err.status).toBe(409);
    expect(softone.softoneCall).not.toHaveBeenCalled();
  });

  it('απενεργοποίηση ⇒ βγαίνει από το μητρώο αναφοράς των φορμών', async () => {
    db.softoneUnit.findUnique.mockResolvedValue({ code: 202 });
    softone.softoneGetTable.mockResolvedValue([]);
    softone.softoneCall.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce(readBack({ ISACTIVE: '0' }));
    await updateUnit(202, { isActive: false });
    expect(softone.softoneCall.mock.calls[0][1]).toEqual({ OBJECT: 'MTRUNIT', KEY: '202', data: { MTRUNIT: [{ ISACTIVE: 0 }] } });
    expect(db.softoneLookup.deleteMany).toHaveBeenCalledWith({ where: { kind: 'MTRUNIT', code: '202' } });
  });

  it('η ανάγνωση δεν δείχνει την αλλαγή ⇒ σφάλμα, ο καθρέφτης μένει ως έχει', async () => {
    db.softoneUnit.findUnique.mockResolvedValue({ code: 202 });
    softone.softoneCall.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce(readBack({ QDECIMALS: '3' }));
    await expect(updateUnit(202, { decimals: 0 })).rejects.toThrow(/δεν φαίνεται μετά την εγγραφή/);
    expect(db.softoneUnit.update).not.toHaveBeenCalled();
  });
});
