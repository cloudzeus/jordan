/**
 * Viva (Smart Checkout) — καθαρή λογική χωρίς I/O, ώστε να ελέγχεται με tests:
 * περιβάλλοντα/hosts, ποσό αιτήματος, διαφορά τιμής στο κλείσιμο, ανάγνωση webhook, ταξινόμηση συναλλαγής.
 */

export type VivaEnv = 'demo' | 'production';

/** Επίσημοι hosts του Viva ανά περιβάλλον. */
export const VIVA_HOSTS: Record<VivaEnv, { accounts: string; api: string; web: string }> = {
  demo: { accounts: 'https://demo-accounts.vivapayments.com', api: 'https://demo-api.vivapayments.com', web: 'https://demo.vivapayments.com' },
  production: { accounts: 'https://accounts.vivapayments.com', api: 'https://api.vivapayments.com', web: 'https://www.vivapayments.com' },
};

export const asEnv = (v: unknown): VivaEnv => (v === 'production' ? 'production' : 'demo');

/** Webhook events που χρησιμοποιούμε (Viva → Settings → API Access → Webhooks). */
export const VIVA_EVENTS = {
  PAYMENT_CREATED: 1796, // Transaction Payment Created
  REVERSAL_CREATED: 1797, // Transaction Reversal Created (επιστροφή/ακύρωση)
  FAILED: 1798, // Transaction Failed
} as const;

export const EVENT_LABELS: Record<number, string> = {
  1796: 'Transaction Payment Created',
  1797: 'Transaction Reversal Created',
  1798: 'Transaction Failed',
};

/** Σύνδεσμος checkout για ένα payment order. */
export const checkoutUrl = (env: VivaEnv, orderCode: string, color?: string) =>
  `${VIVA_HOSTS[env].web}/web/checkout?ref=${encodeURIComponent(orderCode)}${color ? `&color=${encodeURIComponent(color.replace(/^#/, ''))}` : ''}`;

/** Τα URL που επικολλώνται στο dashboard του Viva (webhook + επιστροφή από το checkout). */
export function vivaUrls(appUrl: string) {
  const base = appUrl.replace(/\/$/, '');
  let domain: string;
  try { domain = base ? new URL(base).host : ''; } catch { domain = ''; }
  return {
    domain,
    webhook: `${base}/api/payments/viva/webhook`,
    successPath: '/api/payments/viva/return/success',
    failurePath: '/api/payments/viva/return/failure',
    success: `${base}/api/payments/viva/return/success`,
    failure: `${base}/api/payments/viva/return/failure`,
  };
}

// ── Ποσά ──────────────────────────────────────────────────────────────────────────────────────

export type AmountInput = { pallets: number; perPallet: number; unitPrice: number; vatRate: number };
export type Amount = { quantity: number; netCents: number; vatCents: number; amountCents: number };

/**
 * Ποσό αιτήματος: παλέτες × μονάδες/παλέτα × καθαρή τιμή κλιμακίου, + ΦΠΑ. Στρογγυλοποίηση σε λεπτά
 * πρώτα στο καθαρό και μετά στον ΦΠΑ (όπως σε τιμολόγιο). Ποσότητα στα 3 δεκαδικά.
 */
export function paymentAmount({ pallets, perPallet, unitPrice, vatRate }: AmountInput): Amount {
  if (!(pallets > 0) || !(perPallet > 0) || !(unitPrice >= 0) || !(vatRate >= 0)) throw new Error('Μη έγκυρα στοιχεία ποσού');
  const quantity = Math.round(pallets * perPallet * 1000) / 1000;
  const netCents = Math.round(quantity * unitPrice * 100 + 1e-7);
  const vatCents = Math.round((netCents * vatRate) / 100 + 1e-7);
  return { quantity, netCents, vatCents, amountCents: netCents + vatCents };
}

/**
 * Επιστροφή διαφοράς στο κλείσιμο: ό,τι πληρώθηκε πάνω από το ποσό στην ΤΕΛΙΚΗ τιμή, μείον ό,τι έχει
 * ήδη επιστραφεί. Ποτέ αρνητικό (αν η τελική τιμή είναι ίδια ή μεγαλύτερη, δεν χρωστάμε τίποτα).
 */
export function priceDiffRefund(p: { paidCents: number; refundedCents: number; quantity: number; vatRate: number }, finalUnitPrice: number) {
  const netCents = Math.round(p.quantity * finalUnitPrice * 100 + 1e-7);
  const finalCents = netCents + Math.round((netCents * p.vatRate) / 100 + 1e-7);
  return { finalCents, refundCents: Math.max(0, p.paidCents - finalCents - p.refundedCents) };
}

/** Πλήρης επιστροφή (π.χ. ακυρώθηκε η κράτηση): ό,τι απομένει. */
export const fullRefund = (p: { paidCents: number; refundedCents: number }) => Math.max(0, p.paidCents - p.refundedCents);

export const toCents = (euros: number) => Math.round(euros * 100 + (euros >= 0 ? 1e-7 : -1e-7));
export const eurosOf = (cents: number) => cents / 100;

// ── Webhook / συναλλαγές ──────────────────────────────────────────────────────────────────────

/**
 * JSON.parse με τους κωδικούς παραγγελίας/συναλλαγής ως STRING: τα orderCode του Viva έχουν 16 ψηφία
 * και ένας αριθμός JS χάνει ακρίβεια πάνω από 2^53.
 */
export function parseVivaJson(text: string): unknown {
  return JSON.parse(text.replace(/("(?:OrderCode|orderCode|ParentId|parentId)"\s*:\s*)(\d{6,})/g, '$1"$2"'));
}

export type WebhookNotice = { eventTypeId: number; transactionId: string; orderCode: string | null; messageId: string | null; amountCents: number | null; statusId: string | null };

/** Ελάχιστη, ανεκτική ανάγνωση του POST του Viva — τα στοιχεία επαληθεύονται ΜΕΤΑ από το API. */
export function readWebhook(body: unknown): WebhookNotice | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const eventTypeId = Number(b.EventTypeId);
  const d = (b.EventData && typeof b.EventData === 'object' ? b.EventData : null) as Record<string, unknown> | null;
  const tx = d?.TransactionId;
  if (!Number.isInteger(eventTypeId) || typeof tx !== 'string' || !/^[0-9a-f-]{32,36}$/i.test(tx)) return null;
  const oc = d?.OrderCode;
  const amount = typeof d?.Amount === 'number' ? toCents(d.Amount) : null;
  return {
    eventTypeId, transactionId: tx.toLowerCase(),
    orderCode: oc == null || oc === '' ? null : String(oc),
    messageId: typeof b.MessageId === 'string' ? b.MessageId : null,
    amountCents: amount, statusId: typeof d?.StatusId === 'string' ? d.StatusId : null,
  };
}

export const dedupeKey = (n: { eventTypeId: number; transactionId: string }) => `${n.eventTypeId}:${n.transactionId}`;

/** Η συναλλαγή όπως την επιστρέφει το API (GET /checkout/v2/transactions/{id}). */
export type VivaTransaction = { transactionId: string; orderCode: string; statusId: string; amountCents: number; transactionTypeId: number | null; email: string | null };

/**
 * Συναλλαγές επιστροφής χρημάτων (Viva TransactionTypeId): card refund/void, wallet refund, cash refund και
 * τα «…Refund» των εναλλακτικών μεθόδων (IRIS 61, PayPal 49, Klarna 53 κ.λπ.).
 */
const REVERSAL_TYPES = new Set([4, 7, 11, 13, 17, 18, 21, 24, 26, 28, 30, 35, 37, 39, 41, 45, 49, 51, 53, 55, 57, 59, 61, 63, 65, 67, 71, 75, 79]);
export const isReversal = (t: Pick<VivaTransaction, 'transactionTypeId'>) => t.transactionTypeId != null && REVERSAL_TYPES.has(t.transactionTypeId);

export type TxOutcome = 'paid' | 'amount_mismatch' | 'pending' | 'failed' | 'reversal' | 'other';

/**
 * Τι σημαίνει μια (επαληθευμένη) συναλλαγή για ένα order: StatusId F = ολοκληρώθηκε, A = σε εξέλιξη,
 * E/X = απέτυχε/ακυρώθηκε. Πληρωμή μετράει ΜΟΝΟ αν το ποσό είναι ακριβώς αυτό του order.
 */
export function classifyTransaction(t: Pick<VivaTransaction, 'statusId' | 'amountCents' | 'transactionTypeId'>, expectedCents: number): TxOutcome {
  if (isReversal(t)) return t.statusId === 'F' ? 'reversal' : 'other';
  if (t.statusId === 'F') return t.amountCents === expectedCents ? 'paid' : 'amount_mismatch';
  if (t.statusId === 'A') return 'pending';
  if (t.statusId === 'E' || t.statusId === 'X') return 'failed';
  return 'other';
}

// ── Κατάσταση αιτήματος ───────────────────────────────────────────────────────────────────────

export type PaymentStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED';

export const PAYMENT_LABELS: Record<string, string> = {
  PENDING: 'Αναμένεται πληρωμή', PAID: 'Πληρώθηκε', CANCELLED: 'Ακυρώθηκε', REFUNDED: 'Επιστράφηκε',
};

/** Κατάσταση μετά από επιστροφή: όλο το ποσό → REFUNDED, αλλιώς παραμένει PAID (μερική επιστροφή). */
export const statusAfterRefund = (paidCents: number, refundedCents: number): PaymentStatus => (refundedCents >= paidCents ? 'REFUNDED' : 'PAID');

/** Επαναχρησιμοποιείται το ανοιχτό order όσο απομένουν ≥ 5′ και το ποσό δεν άλλαξε. */
export function reusableOrder<T extends { status: string; expiresAt: Date; amountCents: number }>(orders: T[], amountCents: number, now = Date.now()): T | null {
  return orders.find((o) => o.status === 'OPEN' && o.amountCents === amountCents && o.expiresAt.getTime() - now > 5 * 60_000) ?? null;
}

/** Πόσα δευτερόλεπτα ζει ένα payment order (ρύθμιση σε λεπτά, 5′–24ω). */
export const orderTimeoutSeconds = (minutes: unknown) => Math.round(Math.min(1440, Math.max(5, Number(minutes) || 60)) * 60);

export const formatEur = (cents: number) => (cents / 100).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
