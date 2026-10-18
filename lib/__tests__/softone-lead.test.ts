import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const s1 = vi.hoisted(() => ({ softoneCall: vi.fn(), softoneGetTable: vi.fn() }));
vi.mock('@/lib/softone', () => ({ ...s1, SoftoneError: class SoftoneError extends Error {} }));

import { buildProspectPayload, softoneCreateProspect } from '../softone-lead';

beforeEach(() => vi.clearAllMocks());

describe('υποψήφιος πελάτης στο SoftOne', () => {
  it('payload: CUSTOMER, ISPROSP=1, ΚΕΦΑΛΑΙΑ επωνυμία, επαφή στις παρατηρήσεις', () => {
    const p = buildProspectPayload({ email: 'a@b.gr', name: 'Μαρία Π.', company: 'Studio Λίθος', phone: '6900000000', profession: 'Αρχιτέκτονας', note: 'Lead website' }, '0313');
    expect(p).toEqual({ OBJECT: 'CUSTOMER', KEY: '', DATA: { CUSTOMER: [{ CODE: '0313', NAME: 'STUDIO ΛΙΘΟΣ', ISPROSP: 1, ISACTIVE: 1, EMAIL: 'a@b.gr', PHONE01: '6900000000', JOBTYPETRD: 'Αρχιτέκτονας', REMARKS: 'Επαφή: Μαρία Π.\nLead website' }] } });
  });
  it('υπάρχων πελάτης με το ίδιο email → σύνδεση, ΚΑΝΕΝΑ setData', async () => {
    s1.softoneGetTable.mockResolvedValueOnce([{ TRDR: '55', CODE: '0055', ISPROSP: '0' }]);
    expect(await softoneCreateProspect({ email: "o'brien@x.gr" })).toEqual({ trdr: 55, code: '0055', linked: true });
    expect(s1.softoneGetTable.mock.calls[0][2]).toBe("SODTYPE=13 AND EMAIL='o''brien@x.gr'");
    expect(s1.softoneCall).not.toHaveBeenCalled();
  });
  it('νέος: επόμενος κωδικός πελάτη, setData, read-back', async () => {
    s1.softoneGetTable
      .mockResolvedValueOnce([]) // email
      .mockResolvedValueOnce([{ CODE: '0311' }, { CODE: '0312' }]) // κωδικοί
      .mockResolvedValueOnce([{ TRDR: '9001', CODE: '0313', SODTYPE: '13', ISPROSP: '1' }]); // read-back
    s1.softoneCall.mockResolvedValue({ success: true, id: '9001' });
    expect(await softoneCreateProspect({ email: 'n@x.gr', name: 'Νίκος' })).toEqual({ trdr: 9001, code: '0313', linked: false });
    expect(s1.softoneCall).toHaveBeenCalledWith('setData', expect.objectContaining({ OBJECT: 'CUSTOMER', DATA: { CUSTOMER: [expect.objectContaining({ CODE: '0313', ISPROSP: 1, NAME: 'ΝΙΚΟΣ' })] } }));
  });
  it('success:true χωρίς πραγματική εγγραφή → σφάλμα', async () => {
    s1.softoneGetTable.mockResolvedValueOnce([]).mockResolvedValueOnce([{ CODE: '0001' }]).mockResolvedValueOnce([{ TRDR: '9', SODTYPE: '13', ISPROSP: '0' }]);
    s1.softoneCall.mockResolvedValue({ success: true, id: 9 });
    await expect(softoneCreateProspect({ email: 'n@x.gr' })).rejects.toThrow(/δεν επιβεβαιώθηκε/);
  });
});
