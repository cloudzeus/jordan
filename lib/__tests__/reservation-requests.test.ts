import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/softone-sync/item-edit', () => ({ editSoftoneItem: vi.fn() }));

type R = { id: string; offerId: string; trdr: number | null; partnerId: string | null; pallets: number; status: string; notes?: string | null };
const mem = vi.hoisted(() => ({ rs: [] as R[], recipients: [] as { offerId: string; kind: string; refId: string }[], offer: null as any, seq: 0 }));
const db = vi.hoisted(() => {
  const p: Record<string, any> = {
    containerOffer: { findUnique: vi.fn(async () => (mem.offer ? { ...mem.offer, reservations: mem.rs.filter((r) => r.offerId === mem.offer.id) } : null)) },
    offerRecipient: { findFirst: vi.fn(async ({ where }: any) => mem.recipients.find((r) => r.offerId === where.offerId && r.kind === where.kind && r.refId === where.refId) ?? null) },
    containerReservation: {
      create: vi.fn(async ({ data }: any) => { const r = { id: `r${++mem.seq}`, ...data }; mem.rs.push(r); return r; }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(mem.rs.find((r) => r.id === where.id)!, data)),
      findFirst: vi.fn(async ({ where }: any) => mem.rs.find((r) => r.id === where.id && r.offerId === where.offerId && (!where.status || r.status === where.status)
        && (where.trdr === undefined || r.trdr === where.trdr) && (where.partnerId === undefined || r.partnerId === where.partnerId)) ?? null),
    },
  };
  p.$transaction = vi.fn(async (fn: any) => fn(p));
  return p;
});
vi.mock('@/lib/db', () => ({ prisma: db }));

import { approveReservation, bookerOf, rejectReservation, requestReservation, withdrawRequest } from '../container-offers';

const partner = { trdr: null, partnerId: 'p1' };
const customer = { trdr: 142, partnerId: null };

beforeEach(() => {
  mem.rs = []; mem.seq = 0;
  // 20 παλέτες × 50 τ.μ.
  mem.offer = { id: 'o1', status: 'OPEN', closesAt: null, sqmPerContainer: 1000, sqmPerPallet: 50, minOrder: 0.5 };
  mem.recipients = [{ offerId: 'o1', kind: 'PARTNER', refId: 'p1' }, { offerId: 'o1', kind: 'CUSTOMER', refId: '142' }];
});

describe('bookerOf', () => {
  it('πελάτης ή συνεργάτης — ποτέ κανένας', () => {
    expect(bookerOf({ customerTrdr: 142, partnerId: null })).toEqual(customer);
    expect(bookerOf({ customerTrdr: null, partnerId: 'p1' })).toEqual(partner);
    expect(bookerOf({ customerTrdr: null, partnerId: null })).toBeNull();
  });
});

describe('αίτημα κράτησης από το portal', () => {
  it('μένει PENDING και κρατά θέση έναντι επόμενων αιτημάτων', async () => {
    const r = await requestReservation('o1', partner, { pallets: 15, notes: null }, 'u1');
    expect(r.status).toBe('PENDING');
    await expect(requestReservation('o1', customer, { pallets: 6, notes: null }, 'u2')).rejects.toThrow(/Χωρούν ακόμη 5/);
    await expect(requestReservation('o1', customer, { pallets: 5, notes: null }, 'u2')).resolves.toMatchObject({ status: 'PENDING' });
  });
  it('μόνο παραλήπτες, μόνο ανοιχτή, βήμα ½', async () => {
    await expect(requestReservation('o1', { trdr: null, partnerId: 'x' }, { pallets: 1, notes: null }, null)).rejects.toThrow(/δεν είναι διαθέσιμη/);
    await expect(requestReservation('o1', partner, { pallets: 0.3, notes: null }, null)).rejects.toThrow(/ανά ½/);
    mem.offer.status = 'CLOSED';
    await expect(requestReservation('o1', partner, { pallets: 1, notes: null }, null)).rejects.toThrow(/δεν δέχεται/);
  });
  it('έγκριση → ACTIVE· δεύτερη φορά απορρίπτεται· ελέγχει χώρο έναντι ενεργών', async () => {
    const a = await requestReservation('o1', partner, { pallets: 12, notes: null }, null);
    const b = await requestReservation('o1', customer, { pallets: 8, notes: null }, null);
    await expect(approveReservation('o1', a.id, 'admin')).resolves.toMatchObject({ status: 'ACTIVE' });
    await expect(approveReservation('o1', a.id, 'admin')).rejects.toThrow(/έχει ήδη απαντηθεί/);
    // ο διαχειριστής πρόσθεσε στο μεταξύ ενεργή κράτηση — το b (8) δεν χωράει πια στις 8 − 1
    mem.rs.push({ id: 'manual', offerId: 'o1', trdr: 7, partnerId: null, pallets: 1, status: 'ACTIVE' });
    await expect(approveReservation('o1', b.id, 'admin')).rejects.toThrow(/Δεν χωράει/);
  });
  it('απόρριψη με σημείωση· απόσυρση μόνο δικού, μόνο σε αναμονή', async () => {
    const a = await requestReservation('o1', partner, { pallets: 2, notes: null }, null);
    await expect(withdrawRequest('o1', a.id, customer)).rejects.toThrow(/δεν βρέθηκε/);
    await expect(withdrawRequest('o1', a.id, partner)).resolves.toMatchObject({ status: 'CANCELLED' });
    const b = await requestReservation('o1', partner, { pallets: 2, notes: null }, null);
    await expect(rejectReservation('o1', b.id, 'admin', '  Δεν υπάρχει απόθεμα  ')).resolves.toMatchObject({ status: 'REJECTED', decisionNote: 'Δεν υπάρχει απόθεμα' });
    await expect(withdrawRequest('o1', b.id, partner)).rejects.toThrow(/δεν βρέθηκε/);
  });
});
