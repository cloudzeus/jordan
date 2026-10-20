import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const settings = vi.hoisted(() => ({ map: {} as Record<string, unknown> }));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(async (k: string) => settings.map[k]) }));
const mg = vi.hoisted(() => ({ sendTransactionalEmail: vi.fn(async () => ({})), mailgunConfig: () => ({ address: 'connect@dgsmart.gr' }), allowedRecipients: vi.fn(async (to: string) => to.split(',').map((x) => x.trim())) }));
vi.mock('@/lib/mailgun', () => mg);

import { isReservedRecipient, sendLeadMail, staffRecipient } from '../lead-mail';
import { bookingSchema, newsletterSchema } from '../public-form';

beforeEach(() => { vi.clearAllMocks(); settings.map = {}; delete process.env.MAIL_DRY_RUN; });

describe('email δοκιμών', () => {
  it('δεσμευμένα domains δεν παίρνουν ποτέ email', async () => {
    for (const to of ['a@example.com', 'b@sub.example.org', 'c@atelier.test', 'd@x.invalid', 'e@foo.localhost']) expect(isReservedRecipient(to), to).toBe(true);
    for (const to of ['a@gmail.com', 'b@atelier-dm.gr', 'c@example.gr', 'd@testing.com']) expect(isReservedRecipient(to), to).toBe(false);
    expect(await sendLeadMail('x@example.com', 's', '<p/>')).toBe('skipped');
    expect(mg.sendTransactionalEmail).not.toHaveBeenCalled();
  });
  it('MAIL_DRY_RUN=1 σταματά κάθε αποστολή', async () => {
    process.env.MAIL_DRY_RUN = '1';
    expect(await sendLeadMail('real@atelier-dm.gr', 's', '<p/>')).toBe('skipped');
    expect(mg.sendTransactionalEmail).not.toHaveBeenCalled();
  });
  it('αποτυχία Mailgun → «failed», δεν πετάει', async () => {
    mg.sendTransactionalEmail.mockRejectedValueOnce(new Error('401'));
    expect(await sendLeadMail('real@atelier-dm.gr', 's', '<p/>')).toBe('failed');
  });
  it('παραλήπτης προσωπικού: ρύθμιση → email εταιρείας → «off»', async () => {
    settings.map = { 'company.email': 'info@atelier-dm.gr' };
    expect(await staffRecipient()).toBe('info@atelier-dm.gr');
    settings.map['leads.notifyEmail'] = 'sales@atelier-dm.gr';
    expect(await staffRecipient()).toBe('sales@atelier-dm.gr');
    settings.map['leads.notifyEmail'] = ' OFF ';
    expect(await staffRecipient()).toBeNull();
  });
});

describe('δημόσιες φόρμες', () => {
  const ok = { start: '2026-10-20T07:00:00.000Z', name: 'Μαρία', company: 'Studio', email: 'A@B.GR', phone: '210 1234567', terms: true };
  it('ραντεβού: απαιτεί ώρα, εταιρεία, τηλέφωνο, συναίνεση', () => {
    const p = bookingSchema.safeParse(ok);
    expect(p.success && p.data.email).toBe('a@b.gr');
    expect(bookingSchema.safeParse({ ...ok, terms: false }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...ok, company: '' }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...ok, phone: 'abc' }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...ok, start: 'αύριο' }).success).toBe(false);
  });
  it('newsletter: απαιτεί συναίνεση', () => {
    expect(newsletterSchema.safeParse({ email: 'a@b.gr', consent: true }).success).toBe(true);
    expect(newsletterSchema.safeParse({ email: 'a@b.gr', consent: false }).success).toBe(false);
    expect(newsletterSchema.safeParse({ email: 'nope', consent: true }).success).toBe(false);
  });
});
