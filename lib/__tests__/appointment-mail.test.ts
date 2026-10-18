import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const db = vi.hoisted(() => ({ appointment: { findUnique: vi.fn() }, user: { findMany: vi.fn() } }));
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(async () => 'Atelier by Damask') }));
vi.mock('@/lib/site-company', () => ({ ATELIER_PROFILE: { brand: 'Atelier by Damask', address: 'Λεωφ. Βουλιαγμένης 39, Αθήνα', phones: ['210 2162310'], salesEmail: 'sales@atelier-dm.gr', hours: '' } }));
const mail = vi.hoisted(() => ({ sendLeadMail: vi.fn(async () => 'skipped') }));
vi.mock('@/lib/lead-mail', () => mail);

import { inviteContent, sendAppointmentInvites } from '../appointment-mail';

const A = { id: 'a1', number: 4, startsAt: new Date('2026-10-20T07:00:00Z'), endsAt: new Date('2026-10-20T08:00:00Z'), topic: 'Τεχνική συνάντηση', name: 'Κώστας', company: 'DORIC ΙΚΕ', place: 'customer', location: 'Σαρωνίδα, εργοτάξιο', message: 'φέρνει σχέδια', staffNote: null, icsSequence: 1, email: 'info@doric.example', createdById: 'u1', assignedToId: 'u2' };

beforeEach(() => {
  vi.clearAllMocks();
  db.appointment.findUnique.mockResolvedValue(A);
  db.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Γιάννης', email: 'g@atelier.test' }, { id: 'u2', name: 'Στέλλα', email: 's@atelier.test' }]);
});

describe('email ραντεβού με .ics', () => {
  it('προσκεκλημένος: τόπος πελάτη, χωρίς εσωτερικές σημειώσεις· χρήστης: με ποιον + σημειώσεις', () => {
    const data = { id: 'a1', number: 4, start: A.startsAt, end: A.endsAt, topic: A.topic, name: A.name, company: A.company, place: 'customer', location: A.location, message: A.message, staffNote: null, sequence: 1 };
    const inv = inviteContent('created', data, 'Atelier by Damask', 'invitee', { name: 'Στέλλα', email: 's@x.gr' });
    expect(inv.subject).toMatch(/^Ραντεβού ΡΝΤ-000004 · Τρίτη/);
    expect(inv.ics).toContain('LOCATION:Σαρωνίδα\\, εργοτάξιο');
    expect(inv.ics).toContain('SEQUENCE:1');
    expect(inv.html).not.toContain('φέρνει σχέδια');
    const usr = inviteContent('created', data, 'Atelier by Damask', 'user', null);
    expect(usr.html).toContain('DORIC ΙΚΕ (Κώστας)');
    expect(usr.html).toContain('φέρνει σχέδια');
    expect(inviteContent('cancelled', data, 'B', 'user', null).ics).toContain('METHOD:CANCEL');
  });
  it('στέλνει στον προσκεκλημένο ΚΑΙ σε δημιουργό + υπεύθυνο, με συνημμένο text/calendar', async () => {
    const r = await sendAppointmentInvites('a1', 'created');
    expect(r.invitee).toBe('skipped');
    expect(r.users.map((u) => u.email)).toEqual(['g@atelier.test', 's@atelier.test']);
    expect(mail.sendLeadMail).toHaveBeenCalledTimes(3);
    const [, , , opts] = mail.sendLeadMail.mock.calls[0] as unknown as [string, string, string, { attachments: { filename: string; contentType: string; content: string }[] }];
    expect(opts.attachments[0]).toMatchObject({ filename: 'rantevou.ics', contentType: expect.stringContaining('text/calendar') });
    expect(opts.attachments[0].content).toContain('BEGIN:VCALENDAR');
  });
  it('χωρίς email προσκεκλημένου → «no-email», οι χρήστες ενημερώνονται κανονικά', async () => {
    db.appointment.findUnique.mockResolvedValue({ ...A, email: null });
    const r = await sendAppointmentInvites('a1', 'created');
    expect(r.invitee).toBe('no-email');
    expect(r.users).toHaveLength(2);
  });
  it('διακόπτης κλειστός → μόνο στους χρήστες', async () => {
    const r = await sendAppointmentInvites('a1', 'rescheduled', { invitee: false });
    expect(r.invitee).toBe('off');
    expect(mail.sendLeadMail).toHaveBeenCalledTimes(2);
  });
});
