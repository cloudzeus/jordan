import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ροή webhook → πληρωμή με μνήμη αντί για βάση και ψεύτικο API Viva (καμία κλήση δικτύου, κανένα email).
 * Ελέγχει: επαλήθευση από το API, ιδεμποτέντ επανάληψη, ασυμφωνία ποσού, πλαστό POST, επιστροφή εκτός εφαρμογής.
 */

type Row = Record<string, unknown> & { id: string };
const db = { events: [] as Row[], orders: [] as Row[], payments: [] as Row[], refunds: [] as Row[] };
let seq = 0;
const apply = (row: Row, data: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in (v as object)) row[k] = (row[k] as number) + (v as { increment: number }).increment;
    else row[k] = v;
  }
  return row;
};
const byId = (list: Row[], id: unknown) => { const r = list.find((x) => x.id === id); if (!r) throw new Error('not found'); return r; };

const prismaMock = {
  vivaWebhookEvent: {
    findUnique: async ({ where }: { where: { dedupeKey: string } }) => db.events.find((e) => e.dedupeKey === where.dedupeKey) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => { const r = { id: `e${++seq}`, status: 'RECEIVED', attempts: 1, ...data }; db.events.push(r); return r; },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => apply(byId(db.events, where.id), data),
  },
  vivaOrder: {
    findUnique: async ({ where }: { where: { orderCode: string } }) => {
      const o = db.orders.find((x) => x.orderCode === where.orderCode);
      if (!o) return null;
      const p = byId(db.payments, o.paymentId);
      return { ...o, payment: { ...p, reservation: { offerId: 'offer1' } } };
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => apply(byId(db.orders, where.id), data),
    updateMany: async () => ({ count: 0 }),
  },
  vivaPayment: {
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => apply(byId(db.payments, where.id), data),
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({ ...byId(db.payments, where.id) }),
  },
  vivaRefund: {
    findFirst: async ({ where }: { where: { paymentId: string; transactionId: string } }) => db.refunds.find((r) => r.paymentId === where.paymentId && r.transactionId === where.transactionId) ?? null,
    upsert: async ({ where, create }: { where: { key: string }; create: Record<string, unknown> }) => {
      const ex = db.refunds.find((r) => r.key === where.key);
      if (ex) return ex;
      const r = { id: `r${++seq}`, ...create }; db.refunds.push(r); return r;
    },
  },
  $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (c: unknown) => unknown)(prismaMock) : Promise.all(arg as unknown[])),
};

const vivaTx = new Map<string, { transactionId: string; orderCode: string; statusId: string; amountCents: number; transactionTypeId: number | null; email: string | null }>();
const retrieve = vi.fn(async (_c: unknown, id: string) => vivaTx.get(id) ?? null);

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/settings', () => ({ getSetting: async () => undefined }));
vi.mock('@/lib/mailgun', () => ({ sendTransactionalEmail: vi.fn(async () => { throw new Error('no email in tests'); }) }));
vi.mock('@/lib/viva', () => ({
  VivaError: class extends Error {},
  vivaConfig: async () => ({ enabled: true, env: 'demo' }),
  missingConfig: () => [],
  retrieveTransaction: (c: unknown, id: string) => retrieve(c, id),
  createOrder: vi.fn(), cancelOrder: vi.fn(), refundTransaction: vi.fn(), transactionIdsOfOrder: vi.fn(),
}));

const { processWebhook } = await import('../viva-payments');

const TX = 'a1b2c3d4-e5f6-4711-8899-aabbccddeeff';
const ORDER = '1272214778972604';
const hook = (eventTypeId: number, tx = TX, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ EventTypeId: eventTypeId, MessageId: `m-${eventTypeId}`, EventData: { TransactionId: tx, OrderCode: Number(ORDER), StatusId: 'F', Amount: 3796.63, ...extra } });

beforeEach(() => {
  db.events = []; db.refunds = [];
  db.payments = [{ id: 'pay1', status: 'PENDING', amountCents: 379663, paidCents: null, refundedCents: 0, transactionId: null, lastError: null }];
  db.orders = [{ id: 'ord1', paymentId: 'pay1', orderCode: ORDER, amountCents: 379663, status: 'OPEN' }];
  vivaTx.clear();
  retrieve.mockClear();
});

describe('webhook Viva → πληρωμή', () => {
  it('Transaction Payment Created: επαληθεύεται από το API και η πληρωμή γίνεται PAID', async () => {
    vivaTx.set(TX, { transactionId: TX, orderCode: ORDER, statusId: 'F', amountCents: 379663, transactionTypeId: 5, email: null });
    const r = await processWebhook(hook(1796));
    expect(r).toEqual({ status: 'processed', result: 'paid' });
    expect(retrieve).toHaveBeenCalledWith(expect.anything(), TX);
    expect(db.payments[0]).toMatchObject({ status: 'PAID', paidCents: 379663, transactionId: TX });
    expect(db.orders[0]).toMatchObject({ status: 'PAID', transactionId: TX });
    expect(db.events[0]).toMatchObject({ status: 'PROCESSED', result: 'paid', dedupeKey: `1796:${TX}` });
  });

  it('ιδεμποτέντ: η επανάληψη του ίδιου webhook δεν ξαναεφαρμόζεται', async () => {
    vivaTx.set(TX, { transactionId: TX, orderCode: ORDER, statusId: 'F', amountCents: 379663, transactionTypeId: 5, email: null });
    await processWebhook(hook(1796));
    const again = await processWebhook(hook(1796));
    expect(again.status).toBe('duplicate');
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(db.events).toHaveLength(1);
  });

  it('πλαστό POST (η συναλλαγή δεν υπάρχει στον λογαριασμό μας) δεν αλλάζει τίποτα', async () => {
    const r = await processWebhook(hook(1796));
    expect(r).toEqual({ status: 'ignored', result: 'transaction_not_found' });
    expect(db.payments[0].status).toBe('PENDING');
  });

  it('το ποσό του webhook ΔΕΝ μετράει — μόνο του API· διαφορετικό ποσό = καμία εξόφληση', async () => {
    vivaTx.set(TX, { transactionId: TX, orderCode: ORDER, statusId: 'F', amountCents: 100, transactionTypeId: 5, email: null });
    const r = await processWebhook(hook(1796));
    expect(r.result).toBe('amount_mismatch');
    expect(db.payments[0].status).toBe('PENDING');
    expect(String(db.payments[0].lastError)).toContain('δεν καταχωρίστηκε');
  });

  it('order άλλης εφαρμογής του ίδιου λογαριασμού Viva: αγνοείται χωρίς κλήση στο API', async () => {
    const r = await processWebhook(JSON.stringify({ EventTypeId: 1796, EventData: { TransactionId: TX, OrderCode: 999999999 } }));
    expect(r).toEqual({ status: 'ignored', result: 'unknown_order' });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('Transaction Failed: η πληρωμή μένει PENDING (ο πελάτης ξαναδοκιμάζει)', async () => {
    vivaTx.set(TX, { transactionId: TX, orderCode: ORDER, statusId: 'E', amountCents: 379663, transactionTypeId: 5, email: null });
    const r = await processWebhook(hook(1798));
    expect(r.result).toBe('failed_attempt');
    expect(db.payments[0].status).toBe('PENDING');
  });

  it('επιστροφή από το dashboard του Viva (1797): καταγράφεται μία φορά', async () => {
    db.payments[0] = { ...db.payments[0], status: 'PAID', paidCents: 379663, transactionId: TX };
    const REV = 'b1b2c3d4-e5f6-4711-8899-aabbccddeeff';
    vivaTx.set(REV, { transactionId: REV, orderCode: ORDER, statusId: 'F', amountCents: 30132, transactionTypeId: 4, email: null });
    await processWebhook(hook(1797, REV));
    await processWebhook(hook(1797, REV));
    expect(db.refunds).toHaveLength(1);
    expect(db.payments[0]).toMatchObject({ status: 'PAID', refundedCents: 30132 });
  });

  it('δεύτερη πληρωμή στο ίδιο αίτημα: δεν αλλάζει το πληρωμένο, σημειώνεται για επιστροφή', async () => {
    db.payments[0] = { ...db.payments[0], status: 'PAID', paidCents: 379663, transactionId: TX };
    const TX2 = 'c1b2c3d4-e5f6-4711-8899-aabbccddeeff';
    vivaTx.set(TX2, { transactionId: TX2, orderCode: ORDER, statusId: 'F', amountCents: 379663, transactionTypeId: 5, email: null });
    const r = await processWebhook(hook(1796, TX2));
    expect(r.result).toBe('duplicate_payment');
    expect(db.payments[0].transactionId).toBe(TX);
    expect(String(db.payments[0].lastError)).toContain('Δεύτερη πληρωμή');
  });

  it('προσωρινό σφάλμα του API: πετά (→ 503, το Viva ξαναστέλνει) και το event ξαναδοκιμάζεται', async () => {
    retrieve.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    await expect(processWebhook(hook(1796))).rejects.toThrow('ETIMEDOUT');
    expect(db.events[0]).toMatchObject({ status: 'ERROR' });
    vivaTx.set(TX, { transactionId: TX, orderCode: ORDER, statusId: 'F', amountCents: 379663, transactionTypeId: 5, email: null });
    const r = await processWebhook(hook(1796));
    expect(r.result).toBe('paid');
    expect(db.events[0]).toMatchObject({ status: 'PROCESSED', attempts: 2 });
  });

  it('μη έγκυρο σώμα: αγνοείται (200), τίποτα δεν γράφεται', async () => {
    expect((await processWebhook('not json')).status).toBe('ignored');
    expect((await processWebhook('{"EventTypeId":1796}')).status).toBe('ignored');
    expect(db.events).toHaveLength(0);
  });
});
