import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/appointments', () => ({ loadAvailability: vi.fn() }));
vi.mock('@/lib/appointment-parties', () => ({ searchParties: vi.fn(), resolveParty: vi.fn() }));
vi.mock('../search', () => ({ searchKnowledge: vi.fn() }));
const { pickParty } = await import('../calendar');

const c = (id: string, label: string, sub = '') => ({ kind: 'trader' as const, id, label, sub, email: null });
const cands = [c('123', 'ΚΟΥΝΑΣ ΔΗΜΗΤΡΙΟΣ ΘΕΟΔΩΡΟΣ', 'Πελάτης · 0123'), c('94', 'ΚΟΥΤΟΥΖΗ ΑΝΝΑ ΕΛΕΝΗ', 'Πελάτης · 0094'), c('200', 'ΚΟΥΡΙΝΟΥ ΝΕΦΕΛΗ', 'Πελάτης · 0200')];

describe('pickParty — με ποιον', () => {
  it('γενική πτώση / χωρίς τόνους / «πελάτη»', () => {
    expect(pickParty('Κουνά', cands)?.id).toBe('123');
    expect(pickParty('τον πελάτη Κουνά', cands)?.id).toBe('123');
    expect(pickParty('kouna', cands)?.id).toBe('123');
  });
  it('Τυροβολά ⇒ Δ ΤΥΡΟΒΟΛΑΣ ΑΕ', () => {
    expect(pickParty('Τυροβολά', [c('232', 'Δ ΤΥΡΟΒΟΛΑΣ ΑΝΩΝΥΜΟΣ ΕΤΑΙΡΕΙΑ'), c('242', 'ΒΛΑΧΟΥ ΓΕΩΡΓΙΑ')])?.id).toBe('232');
  });
  it('δύο που ταιριάζουν εξίσου ⇒ ερώτηση (null)', () => {
    expect(pickParty('Παπαδόπουλος', [c('1', 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ'), c('2', 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΝΙΚΟΣ')])).toBeNull();
    expect(pickParty('Παπαδόπουλος Νίκος', [c('1', 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ'), c('2', 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΝΙΚΟΣ')])?.id).toBe('2');
  });
});

describe('υπογεγραμμένη πρόταση ραντεβού', async () => {
  process.env.NEXTAUTH_SECRET = 'test-secret';
  const { signProposal, verifyProposal } = await import('../calendar');
  const base = { uid: 'u1', party: { kind: 'trader' as const, id: '123' }, start: '2026-10-19T13:00:00.000Z', minutes: 60, place: 'atelier' as const, location: null, topic: null, notes: null };

  it('ισχύει μόνο για τον ίδιο χρήστη', () => {
    const t = signProposal(base);
    expect(verifyProposal(t, 'u1')).toMatchObject({ party: { id: '123' }, start: base.start });
    expect(verifyProposal(t, 'u2')).toBeNull();
  });
  it('αλλοιωμένο περιεχόμενο ή υπογραφή ⇒ άκυρο', () => {
    const t = signProposal(base);
    const [body, sig] = t.split('.');
    const evil = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), minutes: 600 })).toString('base64url');
    expect(verifyProposal(`${evil}.${sig}`, 'u1')).toBeNull();
    expect(verifyProposal(`${body}.AAAA`, 'u1')).toBeNull();
    expect(verifyProposal('garbage', 'u1')).toBeNull();
  });
  it('λήγει', () => {
    expect(verifyProposal(signProposal(base, -1), 'u1')).toBeNull();
  });
});
