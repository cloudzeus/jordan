import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
const db = vi.hoisted(() => ({
  appointment: { count: vi.fn(), create: vi.fn() },
  appSetting: { findUnique: vi.fn(async () => null) },
  softoneTrader: { findUnique: vi.fn(), upsert: vi.fn() },
  customerContact: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  partner: { findUnique: vi.fn() },
  partnerContact: { findUnique: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(async () => undefined), setSetting: vi.fn() }));
const s1 = vi.hoisted(() => ({ softoneCreateCustomer: vi.fn(), softoneCreatePerson: vi.fn() }));
vi.mock('@/lib/softone-lead', () => ({ softoneCreateCustomer: s1.softoneCreateCustomer }));
vi.mock('@/lib/softone-person', () => ({ softoneCreatePerson: s1.softoneCreatePerson }));
vi.mock('@/lib/softone', () => ({ SODTYPE_LABEL: { 13: 'Πελάτης' } }));
vi.mock('@/lib/appointment-softone', () => ({ syncAppointmentToSoftone: vi.fn() }));
vi.mock('@/lib/newsletter', () => ({ subscribeNewsletter: vi.fn() }));
vi.mock('@/lib/lead-mail', () => ({ sendLeadMail: vi.fn(), staffRecipient: vi.fn(), appUrl: () => '' }));

import { scheduleStaffAppointment } from '../appointments';

const base = { start: '2026-10-24T09:00:00.000Z', minutes: 60 }; // Σάββατο (κλειστά) — το προσωπικό μπορεί

beforeEach(() => {
  vi.clearAllMocks();
  db.appointment.count.mockResolvedValue(0);
  db.appointment.create.mockImplementation(async ({ data }: any) => ({ id: 'ap1', number: 3, ...data }));
});

describe('ραντεβού από το προσωπικό', () => {
  it('με συναλλασσόμενο: εκτός ωραρίου επιτρέπεται, επιβεβαιωμένο, υπεύθυνος ο ίδιος', async () => {
    db.softoneTrader.findUnique.mockResolvedValue({ trdr: 63, name: 'DORIC ΙΚΕ', email: 'info@doric.gr', phone: '210' });
    db.customerContact.findFirst.mockResolvedValue({ name: 'Γιώργος', email: null });
    await scheduleStaffAppointment({ ...base, party: { kind: 'trader', id: '63' } }, 'u1');
    expect(db.appointment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: 'staff', status: 'CONFIRMED', trdr: 63, name: 'Γιώργος', company: 'DORIC ΙΚΕ', email: 'info@doric.gr', createdById: 'u1', assignedToId: 'u1' }) });
  });
  it('επικάλυψη με γεμάτη χωρητικότητα → 409 ΠΡΙΝ γραφτεί νέος πελάτης στο SoftOne', async () => {
    db.appointment.count.mockResolvedValue(1);
    await expect(scheduleStaffAppointment({ ...base, party: { kind: 'new', customer: { name: 'Νέα ΑΕ' } } }, 'u1')).rejects.toMatchObject({ status: 409 });
    expect(s1.softoneCreateCustomer).not.toHaveBeenCalled();
    db.appointment.count.mockResolvedValue(1);
    db.softoneTrader.findUnique.mockResolvedValue({ trdr: 63, name: 'X', email: null, phone: null });
    db.customerContact.findFirst.mockResolvedValue(null);
    await expect(scheduleStaffAppointment({ ...base, allowOverlap: true, party: { kind: 'trader', id: '63' } }, 'u1')).resolves.toBeTruthy();
  });
  it('νέος πελάτης: χωρίς ΑΦΜ → υποψήφιος στο SoftOne, καθρέφτης + υπεύθυνος ως πρόσωπο στο SoftOne', async () => {
    s1.softoneCreateCustomer.mockResolvedValue({ trdr: 900, code: '0313', linked: false });
    s1.softoneCreatePerson.mockResolvedValue({ prsn: 300, code: '000138', linked: false });
    db.customerContact.create.mockResolvedValue({ id: 'cc1' });
    await scheduleStaffAppointment({ ...base, party: { kind: 'new', customer: { name: 'Νέα ΑΕ', contactFirstName: 'Άννα', contactLastName: 'Πάνου', email: 'a@n.gr' } } }, 'u1');
    expect(s1.softoneCreateCustomer).toHaveBeenCalledWith(expect.objectContaining({ company: 'Νέα ΑΕ', name: 'Άννα Πάνου', afm: null }), { prospect: true });
    expect(db.softoneTrader.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { trdr: 900 } }));
    expect(s1.softoneCreatePerson).toHaveBeenCalledWith(expect.objectContaining({ trdr: 900, firstName: 'Άννα', lastName: 'Πάνου' }));
    expect(db.customerContact.create).toHaveBeenCalledWith({ data: expect.objectContaining({ trdr: 900, softonePrsn: 300 }) });
    expect(db.appointment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ trdr: 900, customerContactId: 'cc1', name: 'Άννα Πάνου', company: 'Νέα ΑΕ' }) });
  });
  it('νέα επαφή υπάρχοντος συναλλασσομένου → πρόσωπο στο SoftOne + επαφή στην εφαρμογή', async () => {
    db.softoneTrader.findUnique.mockResolvedValue({ trdr: 63, name: 'DORIC ΙΚΕ', email: 'info@doric.gr', phone: '210' });
    s1.softoneCreatePerson.mockResolvedValue({ prsn: 301, code: '000139', linked: false });
    db.customerContact.findFirst.mockResolvedValue(null);
    db.customerContact.create.mockImplementation(async ({ data }: any) => ({ id: 'cc2', ...data }));
    await scheduleStaffAppointment({ ...base, party: { kind: 'newContact', contact: { trdr: 63, firstName: 'Κώστας', lastName: 'Ιωάννου', mobile: '6900000000', role: 'Μηχανικός' } } }, 'u1');
    expect(s1.softoneCreatePerson).toHaveBeenCalledWith({ trdr: 63, firstName: 'Κώστας', lastName: 'Ιωάννου', email: null, mobile: '6900000000', role: 'Μηχανικός' });
    expect(db.appointment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ trdr: 63, customerContactId: 'cc2', name: 'Κώστας Ιωάννου', company: 'DORIC ΙΚΕ', phone: '6900000000' }) });
  });
  it('νέος πελάτης με ΑΦΜ → κανονικός πελάτης (όχι υποψήφιος)', async () => {
    s1.softoneCreateCustomer.mockResolvedValue({ trdr: 901, code: '0314', linked: false });
    await scheduleStaffAppointment({ ...base, party: { kind: 'new', customer: { name: 'Β ΑΕ', afm: '099 999 999' } } }, 'u1');
    expect(s1.softoneCreateCustomer).toHaveBeenCalledWith(expect.objectContaining({ afm: '099999999' }), { prospect: false });
  });
  it('επαφή συνεργάτη', async () => {
    db.partnerContact.findUnique.mockResolvedValue({ id: 'pc1', name: 'Νίκος', email: null, phone: null, mobile: '69', partnerId: 'p1', partner: { name: 'Αρχιτεκτονικό Χ', email: 'x@x.gr', phone: null } });
    await scheduleStaffAppointment({ ...base, party: { kind: 'partnerContact', id: 'pc1' } }, 'u1');
    expect(db.appointment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ partnerId: 'p1', partnerContactId: 'pc1', email: 'x@x.gr', phone: '69', company: 'Αρχιτεκτονικό Χ' }) });
  });
});
