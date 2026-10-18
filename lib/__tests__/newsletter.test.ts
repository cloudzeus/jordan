import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const db = vi.hoisted(() => ({ newsletterSubscriber: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } }));
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(async () => undefined) }));
const mail = vi.hoisted(() => ({ sendLeadMail: vi.fn(async () => 'skipped'), staffRecipient: vi.fn(async () => 'staff@atelier.test'), appUrl: () => 'https://atelier.test' }));
vi.mock('@/lib/lead-mail', () => mail);
const leads = vi.hoisted(() => ({ upsertLead: vi.fn(async () => ({ id: 'lead1' })), syncLeadToSoftone: vi.fn(async () => 'DISABLED') }));
vi.mock('@/lib/leads', () => leads);

import { confirmNewsletter, subscribeNewsletter } from '../newsletter';

beforeEach(() => {
  vi.clearAllMocks();
  db.newsletterSubscriber.create.mockImplementation(async ({ data }: any) => ({ id: 's1', ...data }));
  db.newsletterSubscriber.update.mockImplementation(async ({ data }: any) => ({ id: 's1', token: 'tok', ...data }));
});

describe('newsletter double opt-in', () => {
  it('εγγραφή → PENDING + email επιβεβαίωσης, ΧΩΡΙΣ lead', async () => {
    db.newsletterSubscriber.findUnique.mockResolvedValue(null);
    expect(await subscribeNewsletter({ email: 'New@Studio.gr', source: 'footer' })).toBe('pending');
    expect(db.newsletterSubscriber.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'new@studio.gr', source: 'footer', token: expect.any(String) }) });
    expect(mail.sendLeadMail).toHaveBeenCalledWith('new@studio.gr', expect.stringContaining('Επιβεβαιώστε'), expect.stringContaining('/newsletter/confirm?token='));
    expect(leads.upsertLead).not.toHaveBeenCalled();
  });
  it('ήδη επιβεβαιωμένος → «already», κανένα email', async () => {
    db.newsletterSubscriber.findUnique.mockResolvedValue({ id: 's1', status: 'CONFIRMED' });
    expect(await subscribeNewsletter({ email: 'x@y.gr' })).toBe('already');
    expect(mail.sendLeadMail).not.toHaveBeenCalled();
  });
  it('ξανά μέσα σε 2 λεπτά → δεν ξαναστέλνει', async () => {
    db.newsletterSubscriber.findUnique.mockResolvedValue({ id: 's1', status: 'PENDING', confirmSentAt: new Date(Date.now() - 30_000) });
    expect(await subscribeNewsletter({ email: 'x@y.gr' })).toBe('resent-too-soon');
    expect(mail.sendLeadMail).not.toHaveBeenCalled();
  });
  it('επιβεβαίωση → CONFIRMED, lead, SoftOne (gated), ειδοποίηση προσωπικού', async () => {
    db.newsletterSubscriber.findUnique.mockResolvedValue({ id: 's1', email: 'x@y.gr', name: 'Νίκος', status: 'PENDING', source: 'modal' });
    const r = await confirmNewsletter('tok');
    expect(r).toEqual({ ok: true, email: 'x@y.gr', already: false });
    expect(leads.upsertLead).toHaveBeenCalledWith({ email: 'x@y.gr', name: 'Νίκος' }, 'newsletter');
    expect(db.newsletterSubscriber.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: expect.objectContaining({ status: 'CONFIRMED', leadId: 'lead1' }) });
    expect(leads.syncLeadToSoftone).toHaveBeenCalledWith('lead1');
    expect(mail.sendLeadMail).toHaveBeenCalledWith('staff@atelier.test', expect.stringContaining('Νέος συνδρομητής'), expect.any(String), { replyTo: 'x@y.gr' });
  });
  it('άκυρο token → ok:false', async () => {
    db.newsletterSubscriber.findUnique.mockResolvedValue(null);
    expect((await confirmNewsletter('nope')).ok).toBe(false);
    expect(leads.upsertLead).not.toHaveBeenCalled();
  });
});
