import 'server-only';
import { getSetting } from '@/lib/settings';
import { asEnv, parseVivaJson, toCents, VIVA_HOSTS, type VivaEnv, type VivaTransaction } from '@/lib/viva-core';

/**
 * Client του Viva (επίσημα APIs):
 *  • OAuth2 client credentials (Smart Checkout credentials) → Bearer για /checkout/v2/* (orders, transactions)
 *  • Basic Merchant ID:API Key → webhook verification key, ακύρωση order, επιστροφή χρημάτων, αναζήτηση
 * Τα στοιχεία είναι στις Ρυθμίσεις → Πληρωμές / Viva. Demo και production έχουν ΔΙΑΦΟΡΕΤΙΚΑ στοιχεία.
 */

export class VivaError extends Error {
  constructor(message: string, readonly status = 502, readonly code = 'viva_error') { super(message); }
}

export type VivaConfig = {
  enabled: boolean; env: VivaEnv; merchantId: string; apiKey: string; clientId: string; clientSecret: string;
  sourceCode: string; webhookKey: string; vatRate: number; orderTimeoutMinutes: number; sendEmails: boolean;
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

export async function vivaConfig(): Promise<VivaConfig> {
  const keys = ['viva.enabled', 'viva.environment', 'viva.merchantId', 'viva.apiKey', 'viva.clientId', 'viva.clientSecret', 'viva.sourceCode', 'viva.webhookKey', 'viva.vatRate', 'viva.orderTimeoutMinutes', 'viva.sendEmails'] as const;
  const v = await Promise.all(keys.map((k) => getSetting<unknown>(k)));
  const vat = Number(v[8]);
  return {
    enabled: v[0] === true || v[0] === 'true', env: asEnv(v[1]),
    merchantId: str(v[2]), apiKey: str(v[3]), clientId: str(v[4]), clientSecret: str(v[5]), sourceCode: str(v[6]), webhookKey: str(v[7]),
    vatRate: Number.isFinite(vat) && vat >= 0 ? vat : 24,
    orderTimeoutMinutes: Number(v[9]) || 60,
    sendEmails: v[10] !== false && v[10] !== 'false',
  };
}

/** Τι λείπει για να δουλέψει η ροή (κενό = όλα εντάξει). */
export function missingConfig(c: VivaConfig) {
  const out: string[] = [];
  if (!c.clientId || !c.clientSecret) out.push('Client ID / Client secret');
  if (!c.merchantId || !c.apiKey) out.push('Merchant ID / API key');
  if (!c.sourceCode) out.push('Source code');
  return out;
}

const TIMEOUT = 20_000;

async function readJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try { return parseVivaJson(text) as Record<string, unknown>; } catch { return { raw: text.slice(0, 300) }; }
}

function errorText(body: Record<string, unknown> | null, status: number) {
  const m = body?.message ?? body?.Message ?? body?.ErrorText ?? body?.error_description ?? body?.error ?? body?.raw;
  return `Viva ${status}${m ? `: ${String(m).slice(0, 300)}` : ''}`;
}

// ── OAuth ─────────────────────────────────────────────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; exp: number }>();

export async function accessToken(c: VivaConfig): Promise<string> {
  if (!c.clientId || !c.clientSecret) throw new VivaError('Λείπουν Client ID / Client secret του Viva (Ρυθμίσεις → Πληρωμές / Viva)', 400, 'viva_not_configured');
  const ck = `${c.env}:${c.clientId}`;
  const hit = tokenCache.get(ck);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const res = await fetch(`${VIVA_HOSTS[c.env].accounts}/connect/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT),
  });
  const body = await readJson(res);
  if (!res.ok || typeof body?.access_token !== 'string') throw new VivaError(`OAuth: ${errorText(body, res.status)}`, res.status === 400 || res.status === 401 ? 400 : 502, 'viva_auth');
  tokenCache.set(ck, { token: body.access_token, exp: Date.now() + (Number(body.expires_in) || 3600) * 1000 });
  return body.access_token;
}

async function bearer(c: VivaConfig, path: string, init: RequestInit = {}) {
  const token = await accessToken(c);
  const res = await fetch(`${VIVA_HOSTS[c.env].api}${path}`, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401) tokenCache.delete(`${c.env}:${c.clientId}`);
  return { res, body: await readJson(res) };
}

async function basic(c: VivaConfig, path: string, init: RequestInit = {}) {
  if (!c.merchantId || !c.apiKey) throw new VivaError('Λείπουν Merchant ID / API key του Viva (Ρυθμίσεις → Πληρωμές / Viva)', 400, 'viva_not_configured');
  const res = await fetch(`${VIVA_HOSTS[c.env].web}${path}`, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT),
    headers: { Authorization: `Basic ${Buffer.from(`${c.merchantId}:${c.apiKey}`).toString('base64')}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  return { res, body: await readJson(res) };
}

// ── Payment orders ────────────────────────────────────────────────────────────────────────────

export type CreateOrderInput = {
  amountCents: number; customerTrns: string; merchantTrns: string; timeoutSeconds: number;
  customer: { email?: string | null; fullName?: string | null; phone?: string | null }; tags?: string[];
};

/**
 * POST /checkout/v2/orders — ΟΛΕΣ οι μέθοδοι της πηγής πληρωμής (κάρτες, Apple/Google Pay, IRIS κ.λπ.):
 * δεν περιορίζουμε paymentMethod· ποιες εμφανίζονται ορίζεται στο Viva (πηγή → μέθοδοι).
 */
export async function createOrder(c: VivaConfig, o: CreateOrderInput): Promise<string> {
  const { res, body } = await bearer(c, '/checkout/v2/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount: o.amountCents,
      customerTrns: o.customerTrns.slice(0, 2048),
      customer: {
        email: o.customer.email || undefined, fullName: o.customer.fullName?.slice(0, 120) || undefined,
        phone: o.customer.phone || undefined, countryCode: 'GR', requestLang: 'el-GR',
      },
      paymentTimeout: o.timeoutSeconds,
      preauth: false, allowRecurring: false, maxInstallments: 0, paymentNotification: false,
      disableExactAmount: false, disableCash: false, disableWallet: false,
      sourceCode: c.sourceCode || 'Default',
      merchantTrns: o.merchantTrns.slice(0, 2048),
      tags: o.tags,
    }),
  });
  const code = body?.orderCode;
  if (!res.ok || code == null) throw new VivaError(`Δημιουργία πληρωμής: ${errorText(body, res.status)}`);
  return String(code);
}

/** GET /checkout/v2/transactions/{id} — η ΑΥΘΕΝΤΙΚΗ εικόνα μιας συναλλαγής (επαλήθευση webhook/επιστροφής). */
export async function retrieveTransaction(c: VivaConfig, transactionId: string): Promise<VivaTransaction | null> {
  if (!/^[0-9a-f-]{32,36}$/i.test(transactionId)) return null;
  const { res, body } = await bearer(c, `/checkout/v2/transactions/${encodeURIComponent(transactionId)}`);
  if (res.status === 404) return null;
  if (!res.ok || !body) throw new VivaError(`Ανάγνωση συναλλαγής: ${errorText(body, res.status)}`);
  return {
    transactionId: transactionId.toLowerCase(),
    orderCode: String(body.orderCode ?? ''),
    statusId: String(body.statusId ?? ''),
    amountCents: toCents(Number(body.amount ?? 0)),
    transactionTypeId: body.transactionTypeId == null ? null : Number(body.transactionTypeId),
    email: typeof body.email === 'string' ? body.email : null,
  };
}

/** Συναλλαγές ενός order (GET /api/transactions?ordercode=) — για τον χειροκίνητο «Έλεγχο στο Viva». */
export async function transactionIdsOfOrder(c: VivaConfig, orderCode: string): Promise<string[]> {
  const { res, body } = await basic(c, `/api/transactions?ordercode=${encodeURIComponent(orderCode)}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new VivaError(`Αναζήτηση συναλλαγών: ${errorText(body, res.status)}`);
  const list = Array.isArray(body?.Transactions) ? (body.Transactions as Record<string, unknown>[]) : [];
  return list.map((t) => String(t.TransactionId ?? '')).filter(Boolean);
}

/** DELETE /api/orders/{orderCode} — ακυρώνει ανοιχτό payment order (δεν πληρώνεται πια). */
export async function cancelOrder(c: VivaConfig, orderCode: string) {
  const { res, body } = await basic(c, `/api/orders/${encodeURIComponent(orderCode)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new VivaError(`Ακύρωση order: ${errorText(body, res.status)}`);
}

/**
 * Επιστροφή χρημάτων: DELETE /api/transactions/{id}?amount=<λεπτά>&sourceCode= (Cancel Transaction με
 * ποσό = μερική ή πλήρης επιστροφή). Επιστρέφει το TransactionId της επιστροφής.
 */
export async function refundTransaction(c: VivaConfig, transactionId: string, amountCents: number): Promise<string | null> {
  if (!(amountCents > 0)) throw new VivaError('Μηδενικό ποσό επιστροφής', 400);
  const qs = new URLSearchParams({ amount: String(amountCents), ...(c.sourceCode ? { sourceCode: c.sourceCode } : {}) });
  const { res, body } = await basic(c, `/api/transactions/${encodeURIComponent(transactionId)}?${qs}`, { method: 'DELETE' });
  if (!res.ok || body?.Success === false || (body?.ErrorCode != null && Number(body.ErrorCode) !== 0)) throw new VivaError(`Επιστροφή: ${errorText(body, res.status)}`);
  return body?.TransactionId ? String(body.TransactionId).toLowerCase() : null;
}

// ── Webhook verification ──────────────────────────────────────────────────────────────────────

const keyCache = new Map<string, { key: string; exp: number }>();

/**
 * Το κλειδί που ζητά το Viva όταν πατάς «Verify» στο webhook (GET στο URL μας → `{ "Key": "…" }`).
 * Από τις Ρυθμίσεις αν έχει δοθεί, αλλιώς GET /api/messages/config/token (Basic Merchant ID:API key).
 */
export async function webhookKey(c: VivaConfig): Promise<string> {
  if (c.webhookKey) return c.webhookKey;
  const ck = `${c.env}:${c.merchantId}`;
  const hit = keyCache.get(ck);
  if (hit && hit.exp > Date.now()) return hit.key;
  const { res, body } = await basic(c, '/api/messages/config/token');
  if (!res.ok || typeof body?.Key !== 'string') throw new VivaError(`Webhook key: ${errorText(body, res.status)}`);
  keyCache.set(ck, { key: body.Key, exp: Date.now() + 6 * 3600_000 });
  return body.Key;
}

/** Δοκιμή σύνδεσης από τις Ρυθμίσεις: OAuth token + webhook key (δεν δημιουργεί πληρωμή). */
export async function testConnection() {
  const c = await vivaConfig();
  const out = { env: c.env, enabled: c.enabled, oauth: false, basic: false, missing: missingConfig(c), error: null as string | null };
  try { await accessToken(c); out.oauth = true; } catch (e) { out.error = (e as Error).message; }
  try { await webhookKey({ ...c, webhookKey: '' }); out.basic = true; } catch (e) { out.error = out.error ?? (e as Error).message; }
  return out;
}
