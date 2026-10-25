import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const tx = vi.hoisted(() => ({
  prospect: { update: vi.fn() },
  contract: { updateMany: vi.fn() },
  floorPlan: { updateMany: vi.fn() },
  customerContact: { count: vi.fn(async () => 0), create: vi.fn() },
  entityFolder: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  entityFile: { updateMany: vi.fn() },
}));
const db = vi.hoisted(() => ({
  contract: { findUnique: vi.fn() },
  prospect: { findUnique: vi.fn() },
  softoneTrader: { findUnique: vi.fn(async () => null), upsert: vi.fn() },
  softoneProject: { findMany: vi.fn(async () => [{ code: '0000063' }]), findUnique: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
}));
vi.mock('@/lib/db', () => ({ prisma: db }));
const s1 = vi.hoisted(() => ({ softoneCreateCustomer: vi.fn(), findCustomerByAfm: vi.fn(async () => null), findCustomerByEmail: vi.fn(async () => null), nextCustomerCode: vi.fn(async () => '0315') }));
vi.mock('@/lib/softone-lead', async () => ({ ...s1, prospectName: (await vi.importActual<typeof import('../softone-lead')>('../softone-lead')).prospectName }));
vi.mock('@/lib/softone', () => ({ SODTYPE_LABEL: { 13: 'Πελάτης' }, SoftoneError: class extends Error {} }));
vi.mock('@/lib/trader-classes-server', () => ({ proposeTraderClass: vi.fn(async () => null) }));
const svc = vi.hoisted(() => ({ transition: vi.fn(), ContractError: class extends Error { constructor(m: string, readonly status = 400) { super(m); } } }));
vi.mock('@/lib/contracts/service', () => svc);
const prj = vi.hoisted(() => ({ createPrjc: vi.fn(async () => ({ prjc: 900, code: '0000064', name: 'X' })) }));
vi.mock('@/lib/contracts/softone', () => prj);

import { acceptAndRegister, acceptPlan } from '../prospects';
import { prospectInput } from '../prospects-core';

const prospect = { id: 7, name: 'Μαρία Κ.', contactName: null, email: 'm@k.test', phone: '690', afm: null, doy: null, profession: null, address: 'Οδός 1', zip: '11111', city: 'Αθήνα', notes: null, trdr: null };
const offer = { id: 'c1', number: 12, title: 'Μπάνιο', status: 'SENT', stage: 'OFFER', trdr: null, prjc: null, prospectId: 7, customerName: 'Μαρία Κ.' };

beforeEach(() => {
  vi.clearAllMocks();
  db.contract.findUnique.mockResolvedValue(offer);
  db.prospect.findUnique.mockResolvedValue(prospect);
  s1.softoneCreateCustomer.mockResolvedValue({ trdr: 501, code: '0315', linked: false });
  tx.entityFolder.findUnique.mockResolvedValue(null);
});

describe('δυνητικός πελάτης — φόρμα', () => {
  it('ΑΦΜ χωρίς κενά, κενά πεδία → null, ελάχιστο όνομα', () => {
    expect(prospectInput.parse({ name: 'ΑΒ ΑΕ', afm: '099 999 999', email: '' })).toMatchObject({ afm: '099999999', email: null, phone: null });
    expect(prospectInput.safeParse({ name: 'Α' }).success).toBe(false);
    expect(prospectInput.safeParse({ name: 'ΑΒ', afm: '123' }).success).toBe(false);
  });
});

describe('αποδοχή προσφοράς δυνητικού', () => {
  it('προεπισκόπηση: νέος πελάτης + νέο έργο, χωρίς καμία εγγραφή', async () => {
    const plan = await acceptPlan('c1');
    expect(plan).toMatchObject({ accept: true, customer: { mode: 'create', code: '0315', name: 'ΜΑΡΙΑ Κ.' }, project: { mode: 'create', code: '0000064' } });
    expect(s1.softoneCreateCustomer).not.toHaveBeenCalled();
    expect(svc.transition).not.toHaveBeenCalled();
  });
  it('υπάρχων πελάτης με ίδιο email → σύνδεση, όχι διπλή καρτέλα', async () => {
    s1.findCustomerByEmail.mockResolvedValueOnce({ trdr: 77, code: '0042', isProspect: false } as never);
    expect((await acceptPlan('c1')).customer).toMatchObject({ mode: 'link', trdr: 77, by: 'email' });
  });
  it('εκτέλεση: πελάτης (κανονικός, όχι υποψήφιος) → αποδοχή → έργο, με μεταφορά προσφορών/κατόψεων/αρχείων', async () => {
    const pf = { id: 'f1', subfolders: [] };
    tx.entityFolder.findUnique.mockResolvedValueOnce(pf).mockResolvedValueOnce(null);
    const r = await acceptAndRegister('c1', { customerCode: '0315', projectCode: '0000064' }, 'u1');
    expect(s1.softoneCreateCustomer).toHaveBeenCalledWith(expect.objectContaining({ company: 'Μαρία Κ.', email: 'm@k.test' }), { prospect: false });
    expect(tx.contract.updateMany).toHaveBeenCalledWith({ where: { prospectId: 7, trdr: null }, data: { trdr: 501 } });
    expect(tx.floorPlan.updateMany).toHaveBeenCalledWith({ where: { prospectId: 7, trdr: null }, data: { trdr: 501 } });
    expect(tx.entityFolder.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { entityType: 'TRADER', entityId: 501 } });
    expect(svc.transition).toHaveBeenCalledWith('c1', 'accept', 'u1', undefined);
    expect(prj.createPrjc).toHaveBeenCalledWith('c1', '0000064', 'u1');
    expect(r).toMatchObject({ accepted: true, customer: { trdr: 501 }, project: { prjc: 900 }, warning: null });
    // Πρώτα ο πελάτης, μετά η αποδοχή, τελευταίο το έργο.
    expect(s1.softoneCreateCustomer.mock.invocationCallOrder[0]).toBeLessThan(svc.transition.mock.invocationCallOrder[0]);
    expect(svc.transition.mock.invocationCallOrder[0]).toBeLessThan(prj.createPrjc.mock.invocationCallOrder[0]);
  });
  it('άλλαξε ο κωδικός πελάτη από την προεπισκόπηση → τίποτα δεν γράφεται', async () => {
    s1.nextCustomerCode.mockResolvedValue('0316');
    await expect(acceptAndRegister('c1', { customerCode: '0315', projectCode: '0000064' }, 'u1')).rejects.toMatchObject({ status: 409 });
    expect(s1.softoneCreateCustomer).not.toHaveBeenCalled();
    expect(svc.transition).not.toHaveBeenCalled();
    s1.nextCustomerCode.mockResolvedValue('0315');
  });
  it('αποτυχία έργου: η αποδοχή μένει, επιστρέφεται προειδοποίηση για «Ολοκλήρωση εγγραφών»', async () => {
    prj.createPrjc.mockRejectedValueOnce(new svc.ContractError('δεν απαντά'));
    const r = await acceptAndRegister('c1', { customerCode: '0315', projectCode: '0000064' }, 'u1');
    expect(r.accepted).toBe(true);
    expect(r.project).toBeNull();
    expect(r.warning).toMatch(/Ολοκλήρωση εγγραφών/);
  });
});
