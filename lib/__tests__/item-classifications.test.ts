import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { softone, db } = vi.hoisted(() => {
  class SoftoneError extends Error {}
  return {
    softone: { softoneCall: vi.fn(), softoneGetTable: vi.fn(), SoftoneError },
    db: {
      softoneClassification: {
        findFirst: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn(), upsert: vi.fn(), update: vi.fn(),
      },
    },
  };
});
vi.mock('@/lib/softone', () => softone);
vi.mock('@/lib/db', () => ({ prisma: db }));

import { createCategory, updateCategory, ClassificationError } from '../item-classifications';

const readBack = (row: Record<string, string>) => ({ success: true, data: { ITECATEGORY: [row] } });

beforeEach(() => {
  vi.clearAllMocks();
  db.softoneClassification.findFirst.mockResolvedValue(null);
  db.softoneClassification.upsert.mockImplementation(async ({ create }: { create: unknown }) => create);
  db.softoneClassification.update.mockImplementation(async ({ data }: { data: unknown }) => data);
});

describe('createCategory', () => {
  it('δίνει ΡΗΤΟ αριθμό (μέγιστος + 1) και επαληθεύει με getData', async () => {
    db.softoneClassification.aggregate.mockResolvedValue({ _max: { code: 8 } });
    softone.softoneCall
      .mockResolvedValueOnce({ success: true, id: '9' })
      .mockResolvedValueOnce(readBack({ MTRCATEGORY: '9', SODTYPE: '51', CODE: 'NEA', NAME: 'Νέα', ISACTIVE: '1' }));
    const c = await createCategory({ sodtype: 51, shortCode: 'NEA', name: 'Νέα' });
    expect(softone.softoneCall.mock.calls[0]).toEqual(['setData', {
      OBJECT: 'ITECATEGORY', KEY: '', data: { ITECATEGORY: [{ MTRCATEGORY: 9, CODE: 'NEA', NAME: 'Νέα' }] },
    }]);
    expect(c).toMatchObject({ code: 9, name: 'Νέα', isActive: true });
  });

  it('«υπάρχει ήδη» (κρυφή ανενεργή) ⇒ δοκιμάζει τον επόμενο αριθμό', async () => {
    db.softoneClassification.aggregate.mockResolvedValue({ _max: { code: 8 } });
    softone.softoneCall
      .mockResolvedValueOnce({ success: false, error: 'Το πεδίο "Κωδ." υπάρχει ήδη στο αρχείο.' })
      .mockResolvedValueOnce({ success: true, id: '10' })
      .mockResolvedValueOnce(readBack({ MTRCATEGORY: '10', SODTYPE: '51', CODE: 'NEA', NAME: 'Νέα', ISACTIVE: '1' }));
    const c = await createCategory({ sodtype: 51, shortCode: 'NEA', name: 'Νέα' });
    expect(softone.softoneCall.mock.calls[1][1].data.ITECATEGORY[0].MTRCATEGORY).toBe(10);
    expect(c.code).toBe(10);
  });

  it('success:true χωρίς εγγραφή ⇒ σφάλμα, τίποτα στον καθρέφτη', async () => {
    db.softoneClassification.aggregate.mockResolvedValue({ _max: { code: 8 } });
    softone.softoneCall.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: true, data: {} });
    await expect(createCategory({ sodtype: 51, shortCode: 'NEA', name: 'Νέα' })).rejects.toThrow(/δεν βρέθηκε μετά την εγγραφή/);
    expect(db.softoneClassification.upsert).not.toHaveBeenCalled();
  });

  it('υπηρεσίες ⇒ object SRVCATEGORY· διπλή σύντμηση απορρίπτεται πριν το SoftOne', async () => {
    db.softoneClassification.findFirst.mockResolvedValueOnce({ id: 1 });
    await expect(createCategory({ sodtype: 52, shortCode: 'ΒΚΑ', name: 'Χ' })).rejects.toThrow(/υπάρχει ήδη/);
    expect(softone.softoneCall).not.toHaveBeenCalled();
  });
});

describe('updateCategory', () => {
  it('δεν απενεργοποιεί κατηγορία με ενεργά είδη', async () => {
    db.softoneClassification.findUnique.mockResolvedValue({ id: 1, code: 8, sodtype: 51 });
    softone.softoneGetTable.mockResolvedValue([{ MTRL: '5', CODE: 'X', NAME: 'X', SODTYPE: '51', MTRCATEGORY: '8', MTRGROUP: '' }]);
    const err = await updateCategory(51, 8, { isActive: false }).catch((e) => e);
    expect(err).toBeInstanceOf(ClassificationError);
    expect(err.status).toBe(409);
    expect(softone.softoneCall).not.toHaveBeenCalled();
  });

  it('μερική ενημέρωση ΜΟΝΟ των πεδίων που άλλαξαν, με επαλήθευση', async () => {
    db.softoneClassification.findUnique.mockResolvedValue({ id: 1, code: 9, sodtype: 51 });
    softone.softoneCall
      .mockResolvedValueOnce({ success: true, id: '9' })
      .mockResolvedValueOnce(readBack({ MTRCATEGORY: '9', SODTYPE: '51', CODE: 'TC', NAME: 'Νέο όνομα', ISACTIVE: '1' }));
    await updateCategory(51, 9, { name: 'Νέο όνομα' });
    expect(softone.softoneCall.mock.calls[0]).toEqual(['setData', { OBJECT: 'ITECATEGORY', KEY: '9', data: { ITECATEGORY: [{ NAME: 'Νέο όνομα' }] } }]);
  });

  it('η ανάγνωση δείχνει την παλιά τιμή ⇒ σφάλμα', async () => {
    db.softoneClassification.findUnique.mockResolvedValue({ id: 1, code: 9, sodtype: 51 });
    softone.softoneCall
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(readBack({ MTRCATEGORY: '9', SODTYPE: '51', CODE: 'TC', NAME: 'Παλιό', ISACTIVE: '1' }));
    await expect(updateCategory(51, 9, { name: 'Νέο' })).rejects.toThrow(/δεν φαίνεται μετά την εγγραφή/);
    expect(db.softoneClassification.update).not.toHaveBeenCalled();
  });
});
