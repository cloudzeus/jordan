import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async (p: string) => `hash(${p})`) } }));

const db = vi.hoisted(() => {
  const p = {
    customerContact: { findUnique: vi.fn(), update: vi.fn() },
    partnerContact: { findUnique: vi.fn(), update: vi.fn() },
    partner: { findUnique: vi.fn(), update: vi.fn() },
    softoneTrader: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    role: { findUnique: vi.fn() },
    session: { deleteMany: vi.fn() },
  };
  return Object.assign(p, { $transaction: vi.fn(async (fn: (tx: typeof p) => unknown) => fn(p)) });
});
vi.mock('@/lib/db', () => ({ prisma: db }));

import { AccessError, grantAccess, passwordSchema, setPassword, welcomeEmailHtml } from '../portal-access';
import { generatePassword, passwordProblem } from '@/components/admin/portal-access';

beforeEach(() => {
  vi.clearAllMocks();
  db.customerContact.findUnique.mockResolvedValue({ id: 'c1', trdr: 142, name: 'Μαρία', userId: null, email: null });
  db.softoneTrader.findUnique.mockResolvedValue({ name: 'ΑΤΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ' });
  db.role.findUnique.mockResolvedValue({ id: 'role-customer' });
  db.user.findUnique.mockResolvedValue(null);
  db.user.create.mockImplementation(async ({ data }: { data: { email: string } }) => ({ id: 'u1', email: data.email }));
});

describe('κωδικός', () => {
  it('≥ 8 χαρακτήρες, γράμματα ΚΑΙ αριθμοί', () => {
    expect(passwordSchema.safeParse('abc12').success).toBe(false);
    expect(passwordSchema.safeParse('abcdefgh').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
    expect(passwordSchema.safeParse('kodikos2026').success).toBe(true);
  });
  it('ο τυχαίος κωδικός περνά πάντα τους κανόνες', () => {
    for (let i = 0; i < 50; i++) expect(passwordProblem(generatePassword())).toBeNull();
  });
});

describe('grantAccess', () => {
  it('πρόσωπο πελάτη ⇒ χρήστης CUSTOMER δεμένος με τον πελάτη, hash, email επαληθευμένο, σύνδεση με το πρόσωπο', async () => {
    const r = await grantAccess('customer-contact', 'c1', { email: 'maria@x.gr', password: 'kodikos2026', sendWelcome: false });
    const data = db.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: 'maria@x.gr', name: 'Μαρία', passwordHash: 'hash(kodikos2026)', roleId: 'role-customer', customerTrdr: 142, partnerId: null, isActive: true });
    expect(data.emailVerified).toBeInstanceOf(Date);
    expect(db.customerContact.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { userId: 'u1' } });
    expect(r).toMatchObject({ role: 'CUSTOMER', welcome: 'skipped' });
  });
  it('email που υπάρχει ήδη ⇒ σφάλμα, κανένας χρήστης', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'other' });
    await expect(grantAccess('customer-contact', 'c1', { email: 'maria@x.gr', password: 'kodikos2026', sendWelcome: false })).rejects.toThrow(/χρησιμοποιείται ήδη/);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it('πρόσωπο που έχει ήδη πρόσβαση ⇒ σφάλμα', async () => {
    db.customerContact.findUnique.mockResolvedValue({ id: 'c1', trdr: 142, name: 'Μαρία', userId: 'u0', email: null });
    await expect(grantAccess('customer-contact', 'c1', { email: 'maria@x.gr', password: 'kodikos2026', sendWelcome: false })).rejects.toBeInstanceOf(AccessError);
  });
  it('εταιρία-συνεργάτης χωρίς πρόσωπο ⇒ σφάλμα (πρόσβαση μόνο σε πρόσωπο)', async () => {
    db.partner.findUnique.mockResolvedValue({ id: 'p1', type: 'COMPANY', name: 'X', userId: null });
    await expect(grantAccess('partner', 'p1', { email: 'a@x.gr', password: 'kodikos2026', sendWelcome: false })).rejects.toThrow(/πρόσωπο επικοινωνίας/);
  });
});

describe('setPassword', () => {
  it('ΔΕΝ αλλάζει κωδικό χρήστη προσωπικού μέσω αυτής της διαδρομής', async () => {
    db.customerContact.findUnique.mockResolvedValue({ id: 'c1', trdr: 142, name: 'Μαρία', userId: 'admin1', email: null });
    db.user.findUnique.mockResolvedValue({ id: 'admin1', email: 'boss@x.gr', role: { key: 'ADMIN' } });
    await expect(setPassword('customer-contact', 'c1', 'kodikos2026')).rejects.toThrow(/δεν είναι πελάτης/);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe('email καλωσορίσματος', () => {
  it('περιέχει όνομα χρήστη και σύνδεσμο — ΠΟΤΕ κωδικό· escaping', () => {
    const html = welcomeEmailHtml({ name: 'Ο&Σ <Μαρία>', email: 'maria@x.gr', orgName: 'ΑΤΤΙΚΟ', company: 'ATELIER', loginUrl: 'https://app/auth/signin', lostUrl: 'https://app/auth/lost-password' });
    expect(html).toContain('maria@x.gr');
    expect(html).toContain('href="https://app/auth/signin"');
    expect(html).toContain('Ο&amp;Σ &lt;Μαρία&gt;');
    expect(html).not.toMatch(/κωδικός σας είναι|password:/i);
  });
});
