import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const db = vi.hoisted(() => ({
  lead: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ prisma: db }));
const settings = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(async () => settings.value) }));
const s1 = vi.hoisted(() => ({ softoneCreateProspect: vi.fn() }));
vi.mock('@/lib/softone-lead', () => s1);

import { syncLeadToSoftone, upsertLead } from '../leads';

const LEAD = { id: 'l1', email: 'arch@studio.gr', name: 'Μαρία', company: null, phone: null, profession: null, sources: ['appointment'], softoneStatus: 'PENDING' };

beforeEach(() => {
  vi.clearAllMocks();
  settings.value = undefined;
  db.lead.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...LEAD, ...data }));
  db.lead.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new', ...data }));
});

describe('upsertLead', () => {
  it('νέο email → νέο lead, πεζά', async () => {
    db.lead.findUnique.mockResolvedValue(null);
    await upsertLead({ email: ' Arch@Studio.GR ', name: 'Μαρία', company: 'Studio' }, 'newsletter');
    expect(db.lead.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'arch@studio.gr', company: 'Studio', sources: ['newsletter'] }) });
  });
  it('υπάρχον email → συμπληρώνει μόνο τα κενά και προσθέτει πηγή', async () => {
    db.lead.findUnique.mockResolvedValue(LEAD);
    await upsertLead({ email: 'arch@studio.gr', name: 'Άλλο όνομα', company: 'Studio', phone: '210 0000000' }, 'newsletter');
    expect(db.lead.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { company: 'Studio', phone: '210 0000000', sources: ['appointment', 'newsletter'] } });
  });
  it('τίποτα νέο → καμία εγγραφή', async () => {
    db.lead.findUnique.mockResolvedValue(LEAD);
    await upsertLead({ email: 'arch@studio.gr', name: '' }, 'appointment');
    expect(db.lead.update).not.toHaveBeenCalled();
  });
});

describe('SoftOne (υποψήφιος πελάτης)', () => {
  it('ρύθμιση κλειστή (προεπιλογή) → ΚΑΜΙΑ κλήση στο SoftOne, κατάσταση DISABLED', async () => {
    db.lead.findUnique.mockResolvedValue(LEAD);
    expect(await syncLeadToSoftone('l1')).toBe('DISABLED');
    expect(s1.softoneCreateProspect).not.toHaveBeenCalled();
    expect(db.lead.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { softoneStatus: 'DISABLED' } });
  });
  it('ρύθμιση ανοιχτή → CREATED με TRDR/CODE', async () => {
    settings.value = true;
    db.lead.findUnique.mockResolvedValue(LEAD);
    s1.softoneCreateProspect.mockResolvedValue({ trdr: 9001, code: '0313', linked: false });
    expect(await syncLeadToSoftone('l1')).toBe('CREATED');
    expect(db.lead.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: expect.objectContaining({ softoneStatus: 'CREATED', softoneTrdr: 9001, softoneCode: '0313', softoneError: null }) });
  });
  it('υπάρχων πελάτης με το email → LINKED', async () => {
    settings.value = 'true';
    db.lead.findUnique.mockResolvedValue(LEAD);
    s1.softoneCreateProspect.mockResolvedValue({ trdr: 77, code: '0077', linked: true });
    expect(await syncLeadToSoftone('l1')).toBe('LINKED');
  });
  it('σφάλμα → FAILED με μήνυμα, δεν πετάει· δεν ξαναδοκιμάζει χωρίς force', async () => {
    settings.value = true;
    db.lead.findUnique.mockResolvedValue(LEAD);
    s1.softoneCreateProspect.mockRejectedValue(new Error('setData CUSTOMER απέτυχε'));
    expect(await syncLeadToSoftone('l1')).toBe('FAILED');
    expect(db.lead.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: expect.objectContaining({ softoneStatus: 'FAILED', softoneError: 'setData CUSTOMER απέτυχε' }) });
    db.lead.findUnique.mockResolvedValue({ ...LEAD, softoneStatus: 'FAILED' });
    s1.softoneCreateProspect.mockClear();
    expect(await syncLeadToSoftone('l1')).toBe('FAILED');
    expect(s1.softoneCreateProspect).not.toHaveBeenCalled();
  });
  it('ήδη στο SoftOne → τίποτα', async () => {
    settings.value = true;
    db.lead.findUnique.mockResolvedValue({ ...LEAD, softoneStatus: 'CREATED' });
    expect(await syncLeadToSoftone('l1', { force: true })).toBe('CREATED');
    expect(s1.softoneCreateProspect).not.toHaveBeenCalled();
  });
});
