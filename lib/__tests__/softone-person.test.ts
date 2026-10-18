import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const s1 = vi.hoisted(() => ({ softoneCall: vi.fn(), softoneGetTable: vi.fn(), softoneGetData: vi.fn() }));
vi.mock('@/lib/softone', () => ({ ...s1, SoftoneError: class SoftoneError extends Error {} }));

import { buildPersonPayload, softoneCreatePerson } from '../softone-person';

beforeEach(() => vi.clearAllMocks());

describe('επαφή συναλλασσομένου στο SoftOne (PRSNOUT)', () => {
  it('payload: ένα INSERT με το πρόσωπο ΚΑΙ τη σύνδεση TRDPRSNOUT', () => {
    expect(buildPersonPayload({ trdr: 63, firstName: 'Κώστας', lastName: 'Ιωάννου', email: 'k@d.gr', mobile: '69', role: 'Μηχανικός' }, '000138')).toEqual({
      OBJECT: 'PRSNOUT', KEY: '', DATA: {
        PRSNOUT: [{ CODE: '000138', NAME: 'Κώστας', NAME2: 'Ιωάννου', TPRSN: 1, ISACTIVE: 1, EMAIL: 'k@d.gr', MOBILEPHONE: '69', REMARKS: 'Ιδιότητα: Μηχανικός' }],
        TRDPRSNOUT: [{ LINENUM: 9000001, TRDR: 63, ISACTIVE: 1 }],
      },
    });
  });
  it('νέο: επόμενος κωδικός, setData, read-back σύνδεσης', async () => {
    s1.softoneGetTable
      .mockResolvedValueOnce([{ CODE: '000136' }, { CODE: '000137' }])
      .mockResolvedValueOnce([{ TRDR: '63', PRSN: '300' }]);
    s1.softoneCall.mockResolvedValue({ success: true, id: '300' });
    expect(await softoneCreatePerson({ trdr: 63, firstName: 'Κ', lastName: 'Ι' })).toEqual({ prsn: 300, code: '000138', linked: false });
  });
  it('υπάρχον πρόσωπο με ίδιο email → σύνδεση κρατώντας ΟΛΕΣ τις υπάρχουσες γραμμές', async () => {
    s1.softoneGetTable
      .mockResolvedValueOnce([{ PRSN: '205', CODE: '000137' }]) // ίδιο email
      .mockResolvedValueOnce([{ TRDR: '63', PRSN: '205' }]); // read-back
    s1.softoneGetData.mockResolvedValue({ TRDPRSNOUT: [{ LINENUM: '1', TRDR: '143|0080', ISACTIVE: '1' }] });
    s1.softoneCall.mockResolvedValue({ success: true });
    expect(await softoneCreatePerson({ trdr: 63, firstName: 'Κ', lastName: 'Ι', email: 'x@y.gr' })).toEqual({ prsn: 205, code: '000137', linked: true });
    expect(s1.softoneCall).toHaveBeenCalledWith('setData', { OBJECT: 'PRSNOUT', KEY: '205', DATA: { TRDPRSNOUT: [{ LINENUM: 1, TRDR: 143, ISACTIVE: 1 }, { LINENUM: 9000001, TRDR: 63, ISACTIVE: 1 }] } });
  });
  it('ήδη συνδεδεμένο → καμία εγγραφή', async () => {
    s1.softoneGetTable.mockResolvedValueOnce([{ PRSN: '205', CODE: '000137' }]);
    s1.softoneGetData.mockResolvedValue({ TRDPRSNOUT: [{ LINENUM: '1', TRDR: '63', ISACTIVE: '1' }] });
    await softoneCreatePerson({ trdr: 63, firstName: 'Κ', lastName: 'Ι', email: 'x@y.gr' });
    expect(s1.softoneCall).not.toHaveBeenCalled();
  });
  it('success:true χωρίς σύνδεση στη βάση → σφάλμα', async () => {
    s1.softoneGetTable.mockResolvedValueOnce([{ CODE: '000001' }]).mockResolvedValueOnce([]);
    s1.softoneCall.mockResolvedValue({ success: true, id: 9 });
    await expect(softoneCreatePerson({ trdr: 63, firstName: 'Κ', lastName: 'Ι' })).rejects.toThrow(/δεν επιβεβαιώθηκε/);
  });
});
