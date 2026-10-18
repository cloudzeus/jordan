import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const s1 = vi.hoisted(() => ({ softoneCall: vi.fn(), softoneGetTable: vi.fn() }));
vi.mock('@/lib/softone', () => ({ ...s1, SoftoneError: class SoftoneError extends Error {} }));
const db = vi.hoisted(() => ({ appointment: { findUnique: vi.fn(), update: vi.fn() }, user: { findUnique: vi.fn() } }));
vi.mock('@/lib/db', () => ({ prisma: db }));
const settings = vi.hoisted(() => ({ v: undefined as unknown }));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(async () => settings.v) }));

import { buildActionPayload, s1DateTime, softoneCreateAction } from '../softone-action';
import { syncAppointmentToSoftone } from '../appointment-softone';

const START = new Date('2026-10-20T07:00:00Z'); // 10:00 Αθήνας
const END = new Date('2026-10-20T08:00:00Z');
const APPT = { id: 'a1', number: 7, startsAt: START, endsAt: END, status: 'CONFIRMED', topic: 'Τεχνική συνάντηση', name: 'Μαρία', company: 'Studio Λίθος', phone: '210', email: 'm@s.gr', message: null, trdr: 63, assignedToId: 'u1', softoneAction: null, softoneSync: null };

beforeEach(() => { vi.clearAllMocks(); settings.v = undefined; db.appointment.update.mockResolvedValue({}); });

describe('SOACTION payload', () => {
  it('σειρά 1002 «Συνάντηση», ώρα Αθήνας, χειριστής και πελάτης', () => {
    expect(s1DateTime(START)).toBe('2026-10-20 10:00:00');
    expect(buildActionPayload({ actor: 8, trdr: 63, start: START, end: END, subject: 'Θέμα', remarks: 'Λεπτομέρειες' })).toEqual({
      OBJECT: 'SOACTION', KEY: '', DATA: { SOACTION: [{ SERIES: 1002, TRNDATE: '2026-10-20', FROMDATE: '2026-10-20 10:00:00', FINALDATE: '2026-10-20 11:00:00', ACTOR: 8, TRDR: 63, COMMENTS: 'Θέμα', REMARKS: 'Λεπτομέρειες' }] },
    });
  });
  it('ενημέρωση: KEY, χωρίς σειρά', () => {
    const p = buildActionPayload({ actor: 8, start: START, end: END, subject: 'x' }, 12);
    expect(p.KEY).toBe('12');
    expect(p.DATA.SOACTION[0]).not.toHaveProperty('SERIES');
  });
  it('success:true χωρίς πραγματική εγγραφή → σφάλμα', async () => {
    s1.softoneCall.mockResolvedValue({ success: true, id: 9 });
    s1.softoneGetTable.mockResolvedValue([{ SOACTION: '9', ACTOR: '13', FROMDATE: '2026-10-20 10:00:00' }]);
    await expect(softoneCreateAction({ actor: 8, start: START, end: END, subject: 'x' })).rejects.toThrow(/δεν επιβεβαιώθηκε/);
  });
});

describe('ραντεβού → SoftOne', () => {
  it('ρύθμιση κλειστή (προεπιλογή) → ΚΑΜΙΑ κλήση', async () => {
    db.appointment.findUnique.mockResolvedValue(APPT);
    expect(await syncAppointmentToSoftone('a1')).toBe('DISABLED');
    expect(s1.softoneCall).not.toHaveBeenCalled();
  });
  it('υπεύθυνος χωρίς χρήστη SoftOne → τίποτα', async () => {
    settings.v = true;
    db.appointment.findUnique.mockResolvedValue(APPT);
    db.user.findUnique.mockResolvedValue({ softoneUserId: null });
    expect(await syncAppointmentToSoftone('a1')).toBe('SKIPPED');
    expect(s1.softoneCall).not.toHaveBeenCalled();
  });
  it('αίτημα σε αναμονή → όχι ακόμη', async () => {
    settings.v = true;
    db.appointment.findUnique.mockResolvedValue({ ...APPT, status: 'PENDING' });
    db.user.findUnique.mockResolvedValue({ softoneUserId: 8 });
    expect(await syncAppointmentToSoftone('a1')).toBe('SKIPPED');
  });
  it('επιβεβαιωμένο + συνδεδεμένος → νέα ενέργεια, αποθηκεύεται ο κωδικός', async () => {
    settings.v = true;
    db.appointment.findUnique.mockResolvedValue(APPT);
    db.user.findUnique.mockResolvedValue({ softoneUserId: 8 });
    s1.softoneCall.mockResolvedValue({ success: true, id: 77 });
    s1.softoneGetTable.mockResolvedValue([{ SOACTION: '77', SOACTIONCODE: 'ΣΥΝ0000001', ACTOR: '8', FROMDATE: '2026-10-20 10:00:00' }]);
    expect(await syncAppointmentToSoftone('a1')).toBe('SYNCED');
    expect(s1.softoneCall).toHaveBeenCalledWith('setData', expect.objectContaining({ OBJECT: 'SOACTION', KEY: '', DATA: { SOACTION: [expect.objectContaining({ ACTOR: 8, TRDR: 63, COMMENTS: 'Τεχνική συνάντηση — Studio Λίθος (Μαρία)' })] } }));
    expect(db.appointment.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { softoneSync: 'SYNCED', softoneError: null, softoneAction: 77, softoneActionCode: 'ΣΥΝ0000001' } });
  });
  it('ακύρωση υπάρχουσας ενέργειας → ενημέρωση θέματος με «ΑΚΥΡΩΘΗΚΕ», ποτέ διαγραφή', async () => {
    settings.v = true;
    db.appointment.findUnique.mockResolvedValue({ ...APPT, status: 'CANCELLED', softoneAction: 77 });
    db.user.findUnique.mockResolvedValue({ softoneUserId: 8 });
    s1.softoneCall.mockResolvedValue({ success: true });
    s1.softoneGetTable.mockResolvedValue([{ SOACTION: '77', ACTOR: '8', FROMDATE: '2026-10-20 10:00:00' }]);
    expect(await syncAppointmentToSoftone('a1')).toBe('SYNCED');
    const [service, payload] = s1.softoneCall.mock.calls[0];
    expect(service).toBe('setData');
    expect(payload.KEY).toBe('77');
    expect(payload.DATA.SOACTION[0].COMMENTS).toMatch(/^ΑΚΥΡΩΘΗΚΕ — /);
  });
  it('σφάλμα SoftOne → FAILED με μήνυμα, δεν πετάει', async () => {
    settings.v = true;
    db.appointment.findUnique.mockResolvedValue(APPT);
    db.user.findUnique.mockResolvedValue({ softoneUserId: 8 });
    s1.softoneCall.mockResolvedValue({ success: false, error: 'Access denied' });
    expect(await syncAppointmentToSoftone('a1')).toBe('FAILED');
    expect(db.appointment.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { softoneSync: 'FAILED', softoneError: 'Access denied' } });
  });
});
