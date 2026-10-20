import { afterEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ prisma: { user: { findMany: vi.fn() } } }));
vi.mock('@/lib/db', () => db);
const create = vi.hoisted(() => vi.fn(async () => ({ id: 'm1' })));
vi.mock('mailgun.js', () => ({ default: class { client() { return { messages: { create } }; } } }));

import { allowedRecipients, sendTransactionalEmail } from '@/lib/mailgun';

describe('φραγμός email πριν το live', () => {
  afterEach(() => { delete process.env.MAIL_LIVE; create.mockClear(); });

  it('κρατά μόνο email χρηστών προσωπικού', async () => {
    db.prisma.user.findMany.mockResolvedValue([{ email: 'Staff@Atelier.gr' }]);
    expect(await allowedRecipients('staff@atelier.gr, pelatis@gmail.com')).toEqual(['staff@atelier.gr']);
    const where = db.prisma.user.findMany.mock.calls[0][0].where;
    expect(where.role.key.in).toEqual(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']);
  });

  it('δεν στέλνει σε πελάτη/προμηθευτή', async () => {
    db.prisma.user.findMany.mockResolvedValue([]);
    process.env.MAILGUN_API_KEY = 'k';
    const r = await sendTransactionalEmail('promitheftis@example.org', 'Θέμα', '<p>x</p>');
    expect(r).toMatchObject({ blocked: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('με MAIL_LIVE=1 ανοίγει για όλους', async () => {
    process.env.MAIL_LIVE = '1';
    expect(await allowedRecipients('a@b.gr')).toEqual(['a@b.gr']);
  });
});
