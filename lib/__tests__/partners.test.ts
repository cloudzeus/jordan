import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const prisma = vi.hoisted(() => {
  const p = {
    partner: { findUnique: vi.fn() },
    partnerContact: { count: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    partnerCustomer: { findUnique: vi.fn(), createMany: vi.fn(), delete: vi.fn() },
    partnerProject: { upsert: vi.fn(), deleteMany: vi.fn() },
    softoneTrader: { findMany: vi.fn() },
    softoneProject: { findUnique: vi.fn(), findMany: vi.fn() },
  };
  return Object.assign(p, {
    $transaction: vi.fn(async (arg: ((tx: typeof p) => unknown) | Promise<unknown>[]) => (typeof arg === 'function' ? arg(p) : Promise.all(arg))),
  });
});
vi.mock('@/lib/db', () => ({ prisma }));

import {
  addContact, linkCustomers, linkProject, partnerDisplayName, partnerInput, PartnerError, unlinkCustomer,
} from '../partners';

beforeEach(() => vi.clearAllMocks());

describe('partnerInput', () => {
  it('εταιρία χωρίς επωνυμία → σφάλμα στο name', () => {
    const r = partnerInput.safeParse({ type: 'COMPANY', name: '  ' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['name']);
  });
  it('πρόσωπο χωρίς επώνυμο → σφάλμα στο lastName', () => {
    const r = partnerInput.safeParse({ type: 'PERSON', firstName: 'Κώστας' });
    expect(r.error?.issues[0]?.path).toEqual(['lastName']);
  });
  it('κενά πεδία γίνονται null· κενό email επιτρέπεται, λάθος email όχι', () => {
    const ok = partnerInput.parse({ type: 'COMPANY', name: 'Α', email: '', phone: '' });
    expect(ok.email).toBeNull();
    expect(ok.phone).toBeNull();
    expect(partnerInput.safeParse({ type: 'COMPANY', name: 'Α', email: 'όχι-email' }).success).toBe(false);
  });
});

describe('partnerDisplayName', () => {
  it('πρόσωπο = «Επώνυμο Όνομα», εταιρία = επωνυμία', () => {
    expect(partnerDisplayName({ type: 'PERSON', firstName: 'Κώστας', lastName: 'Νικολάου' })).toBe('Νικολάου Κώστας');
    expect(partnerDisplayName({ type: 'COMPANY', name: ' ΑΛΦΑ ΑΕ ' })).toBe('ΑΛΦΑ ΑΕ');
  });
});

describe('πρόσωπα επικοινωνίας', () => {
  const input = { name: 'Μαρία', role: null, phone: null, mobile: null, email: null, notes: null, isPrimary: false };

  it('μόνο οι εταιρίες έχουν πρόσωπα', async () => {
    prisma.partner.findUnique.mockResolvedValue({ type: 'PERSON' });
    await expect(addContact('p1', input)).rejects.toThrow('μόνο οι εταιρίες');
  });

  it('το πρώτο πρόσωπο γίνεται κύριο', async () => {
    prisma.partner.findUnique.mockResolvedValue({ type: 'COMPANY' });
    prisma.partnerContact.count.mockResolvedValue(0);
    prisma.partnerContact.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    const c = await addContact('p1', input);
    expect(c.isPrimary).toBe(true);
    expect(prisma.partnerContact.updateMany).toHaveBeenCalledWith({ where: { partnerId: 'p1' }, data: { isPrimary: false } });
  });

  it('επόμενο πρόσωπο δεν αλλάζει το κύριο, εκτός αν ζητηθεί', async () => {
    prisma.partner.findUnique.mockResolvedValue({ type: 'COMPANY' });
    prisma.partnerContact.count.mockResolvedValue(2);
    prisma.partnerContact.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    expect((await addContact('p1', input)).isPrimary).toBe(false);
    expect(prisma.partnerContact.updateMany).not.toHaveBeenCalled();
  });
});

describe('συσχετίσεις', () => {
  it('δέχεται ΜΟΝΟ πελάτες (SODTYPE 13)', async () => {
    prisma.partner.findUnique.mockResolvedValue({ id: 'p1', name: 'Χ' });
    prisma.softoneTrader.findMany.mockResolvedValue([{ trdr: 5, sodtype: 13 }, { trdr: 6, sodtype: 12 }]);
    await expect(linkCustomers('p1', [5, 6, 7])).rejects.toThrow('Δεν είναι πελάτες: 6, 7');
    expect(prisma.partnerCustomer.createMany).not.toHaveBeenCalled();
  });

  it('έργο μόνο αν ο πελάτης του είναι ήδη συνδεδεμένος', async () => {
    prisma.partner.findUnique.mockResolvedValue({ id: 'p1', name: 'Χ' });
    prisma.softoneProject.findUnique.mockResolvedValue({ prjc: 9, trdr: 5, name: 'Έργο' });
    prisma.partnerCustomer.findUnique.mockResolvedValue(null);
    const err = await linkProject('p1', 9, null).catch((e) => e);
    expect(err).toBeInstanceOf(PartnerError);
    expect(err.message).toMatch('Σύνδεσε πρώτα τον πελάτη');

    prisma.partnerCustomer.findUnique.mockResolvedValue({ partnerId: 'p1', trdr: 5 });
    prisma.partnerProject.upsert.mockResolvedValue({ prjc: 9, role: 'Επιβλέπων' });
    await linkProject('p1', 9, 'Επιβλέπων');
    expect(prisma.partnerProject.upsert).toHaveBeenCalled();
  });

  it('αποσύνδεση πελάτη αφαιρεί και τα έργα ΑΥΤΟΥ του πελάτη', async () => {
    prisma.partnerCustomer.findUnique.mockResolvedValue({ partnerId: 'p1', trdr: 5 });
    prisma.softoneProject.findMany.mockResolvedValue([{ prjc: 9 }, { prjc: 10 }]);
    prisma.partnerCustomer.delete.mockResolvedValue({});
    prisma.partnerProject.deleteMany.mockResolvedValue({ count: 1 });
    expect(await unlinkCustomer('p1', 5)).toEqual({ projectsRemoved: 1 });
    expect(prisma.partnerProject.deleteMany).toHaveBeenCalledWith({ where: { partnerId: 'p1', prjc: { in: [9, 10] } } });
  });
});
