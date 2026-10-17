import { describe, expect, it, vi, beforeEach } from 'vitest';

const { softone, db, maint } = vi.hoisted(() => ({
  softone: { softoneCall: vi.fn(), softoneGetTable: vi.fn() },
  db: {
    softoneLookup: { findMany: vi.fn() },
    softoneClassification: { findMany: vi.fn(async (_q?: any): Promise<unknown[]> => []) },
    vatCategory: { findMany: vi.fn() },
    softoneItem: { updateMany: vi.fn() },
  },
  maint: { changeSoftoneItem: vi.fn() },
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/softone', () => softone);
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('../softone-sync/item-maintenance', async () => {
  class ItemMaintenanceError extends Error {
    constructor(public code: string, message: string, public status = 422) { super(message); }
  }
  return { ...maint, ItemMaintenanceError };
});

import { editSoftoneItem } from '../softone-sync/item-edit';

/** Μια γραμμή MTRL όπως την επιστρέφει το GetTable (όλα string). */
const row = (over: Record<string, string> = {}) => ({
  MTRL: '266', CODE: '0000168', SODTYPE: '51', NAME: 'DOLCI ARGILLA', NAME1: '', CODE1: '', CODE2: '', REMARKS: '',
  ISACTIVE: '1', VAT: '1410', MTRCATEGORY: '1', MTRGROUP: '', MTRMANFCTR: '8', MTRMARK: '',
  MTRUNIT1: '101', MTRUNIT2: '', MU21: '0', MU12MODE: '', MTRUNIT3: '101', MU31: '1', MU13MODE: '1', MTRUNIT4: '101', MU41: '1', MU14MODE: '1',
  PRICER: '0', PRICEW: '0', WEIGHT: '0', GWEIGHT: '0', VOLUME: '0', DIM1: '0', DIM2: '0', DIM3: '0', ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.softoneLookup.findMany.mockResolvedValue([
    { kind: 'MTRGROUP', code: '2' }, { kind: 'MTRCATEGORY', code: '1' }, { kind: 'MTRUNIT', code: '101' }, { kind: 'MTRUNIT', code: '107' }, { kind: 'MTRUNIT', code: '125' }, { kind: 'MTRUNIT', code: '202' }, { kind: 'MTRUNIT', code: '203' },
  ]);
  db.vatCategory.findMany.mockResolvedValue([{ code: '1410' }]);
  db.softoneItem.updateMany.mockResolvedValue({ count: 1 });
});

describe('editSoftoneItem', () => {
  it('στέλνει ΜΟΝΟ τα πεδία που άλλαξαν, στο object του ζωντανού τύπου, και επαληθεύει με ανάγνωση', async () => {
    softone.softoneGetTable
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([row({ MTRGROUP: '2', PRICER: '12.5' })]);
    softone.softoneCall.mockResolvedValue({ success: true });

    const r = await editSoftoneItem(266, { name: 'DOLCI ARGILLA', group: '2', priceRetail: 12.5 });

    expect(softone.softoneCall).toHaveBeenCalledTimes(1);
    expect(softone.softoneCall.mock.calls[0]).toEqual(['setData', { OBJECT: 'ITEM', KEY: '266', DATA: { ITEM: [{ MTRGROUP: '2', PRICER: 12.5 }] } }]);
    expect(r.changed.map((c) => c.field)).toEqual(['group', 'priceRetail']);
    expect(db.softoneItem.updateMany.mock.calls[0][0].data).toMatchObject({ price: 12.5 });
  });

  it('καμία αλλαγή ⇒ καμία κλήση setData', async () => {
    softone.softoneGetTable.mockResolvedValueOnce([row()]);
    const r = await editSoftoneItem(266, { name: 'DOLCI ARGILLA', category: '1' });
    expect(softone.softoneCall).not.toHaveBeenCalled();
    expect(r.changed).toEqual([]);
  });

  it('απορρίπτει τιμή λίστας που δεν υπάρχει στο τοπικό μητρώο — πριν φύγει οτιδήποτε', async () => {
    softone.softoneGetTable.mockResolvedValueOnce([row()]);
    await expect(editSoftoneItem(266, { group: '999' })).rejects.toThrow(/Άγνωστη τιμή για «Ομάδα»/);
    expect(softone.softoneCall).not.toHaveBeenCalled();
  });

  it('κατηγορία/ομάδα: δεκτές μόνο του ΙΔΙΟΥ μητρώου (η ομάδα 2 των ειδών δεν ισχύει σε υπηρεσία)', async () => {
    db.softoneClassification.findMany.mockImplementation(async (q: any) => (q.where.sodtype === 52
      ? [{ kind: 'GROUP', code: 1 }, { kind: 'CATEGORY', code: 1 }]
      : [{ kind: 'GROUP', code: 1 }, { kind: 'GROUP', code: 2 }, { kind: 'CATEGORY', code: 1 }]));
    softone.softoneGetTable.mockResolvedValueOnce([row({ SODTYPE: '52' })]);
    await expect(editSoftoneItem(266, { group: '2' })).rejects.toThrow(/Άγνωστη τιμή για «Ομάδα»/);
    expect(db.softoneClassification.findMany.mock.calls[0]?.[0]?.where).toEqual({ sodtype: 52, isActive: true });
    expect(softone.softoneCall).not.toHaveBeenCalled();
  });

  it('μονάδες: ίδια μονάδα με τη βασική και σχέση ≠ 1 ⇒ σφάλμα πριν φύγει οτιδήποτε', async () => {
    softone.softoneGetTable.mockResolvedValueOnce([row()]);
    await expect(editSoftoneItem(266, { sellRatio: 12 })).rejects.toThrow(/σχέση πρέπει να είναι 1/);
    expect(softone.softoneCall).not.toHaveBeenCalled();
  });

  it('η βασική μονάδα ΔΕΝ αλλάζει σε είδος με κινήσεις', async () => {
    softone.softoneGetTable
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([{ MTRL: '266' }]); // MTRLINES: υπάρχουν κινήσεις
    await expect(editSoftoneItem(266, { unit1: '125', unitBuy: '125', unitSell: '125' })).rejects.toThrow(/έχει ήδη κινήσεις/);
    expect(softone.softoneCall).not.toHaveBeenCalled();
  });

  it('πρότυπο Container → Παλέτα → τ.μ. σε είδος χωρίς κινήσεις: γράφει όλες τις θέσεις και τις σημαίες', async () => {
    const after = row({ MTRUNIT1: '125', MTRUNIT2: '202', MU21: '52', MU12MODE: '0', MTRUNIT3: '203', MU31: '1040', MTRUNIT4: '125' });
    softone.softoneGetTable
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([]) // MTRLINES: καμία κίνηση
      .mockResolvedValueOnce([after]);
    softone.softoneCall.mockResolvedValue({ success: true });
    await editSoftoneItem(266, { unit1: '125', unit2: '202', ratio2: 52, strict2: false, unitBuy: '203', buyRatio: 1040, unitSell: '125' });
    expect(softone.softoneCall.mock.calls[0][1].DATA.ITEM[0]).toEqual({ MTRUNIT1: '125', MTRUNIT2: '202', MU21: 52, MTRUNIT3: '203', MU31: 1040, MTRUNIT4: '125' });
  });

  it('αφαίρεση Μ.Μ.2 ⇒ μηδενίζεται και ο συντελεστής της', async () => {
    const withU2 = row({ MTRUNIT2: '107', MU21: '12', MU12MODE: '1' });
    softone.softoneGetTable.mockResolvedValueOnce([withU2]).mockResolvedValueOnce([row()]);
    softone.softoneCall.mockResolvedValue({ success: true });
    await editSoftoneItem(266, { unit2: null });
    expect(softone.softoneCall.mock.calls[0][1].DATA.ITEM[0]).toEqual({ MTRUNIT2: '', MU21: 0, MU12MODE: 0 });
  });

  it('success:true χωρίς πραγματική αποθήκευση ⇒ σφάλμα που ονομάζει το πεδίο', async () => {
    softone.softoneGetTable
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([row()]); // η ανάγνωση μετά δείχνει την ΠΑΛΙΑ τιμή
    softone.softoneCall.mockResolvedValue({ success: true });
    await expect(editSoftoneItem(266, { unitBuy: '107' })).rejects.toThrow(/ΔΕΝ αποθήκευσε: Μονάδα αγορών/);
  });

  it('υπηρεσία: object SERVICE και αγνοεί τα πεδία που δεν έχει (μονάδες αγορών/πώλησης)', async () => {
    softone.softoneGetTable
      .mockResolvedValueOnce([row({ SODTYPE: '52' })])
      .mockResolvedValueOnce([row({ SODTYPE: '52', PRICER: '30' })]);
    softone.softoneCall.mockResolvedValue({ success: true });
    await editSoftoneItem(266, { unitBuy: '107', priceRetail: 30 });
    expect(softone.softoneCall.mock.calls[0][1]).toEqual({ OBJECT: 'SERVICE', KEY: '266', DATA: { SERVICE: [{ PRICER: 30 }] } });
  });

  it('ο κωδικός περνά από τον έλεγχο μάσκας/μοναδικότητας (changeSoftoneItem)', async () => {
    softone.softoneGetTable
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([row({ CODE: '0000999' })]);
    maint.changeSoftoneItem.mockResolvedValue({});
    await editSoftoneItem(266, { code: '0000999' });
    expect(maint.changeSoftoneItem).toHaveBeenCalledWith(266, { code: '0000999' });
    expect(softone.softoneCall).not.toHaveBeenCalled();
  });
});
