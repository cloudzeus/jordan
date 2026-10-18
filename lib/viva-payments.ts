import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { roundStep, sortTiers, tierAt } from '@/lib/container-pricing';
import {
  cancelOrder, createOrder, missingConfig, refundTransaction, retrieveTransaction, transactionIdsOfOrder, vivaConfig,
  VivaError, type VivaConfig,
} from '@/lib/viva';
import {
  checkoutUrl, classifyTransaction, dedupeKey, formatEur, fullRefund, orderTimeoutSeconds, parseVivaJson, paymentAmount,
  priceDiffRefund, readWebhook, reusableOrder, statusAfterRefund, VIVA_EVENTS, type VivaTransaction,
} from '@/lib/viva-core';
import { appUrl } from '@/lib/app-url';

/**
 * Αιτήματα πληρωμής Viva για κρατήσεις κοινού container.
 *
 *  έγκριση κράτησης → VivaPayment (PENDING, ποσό στην τρέχουσα τιμή κλιμακίου + ΦΠΑ) → email με προσωπικό
 *  σύνδεσμο /pay/viva/<token> → ο σύνδεσμος φτιάχνει/ξαναχρησιμοποιεί payment order → Smart Checkout
 *  → webhook 1796 (επαληθεύεται από το API) → PAID. Στο κλείσιμο: επιστροφή της διαφοράς αν έπεσε η τιμή.
 */

export class PaymentError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export const payUrl = (token: string) => `${appUrl()}/pay/viva/${token}`;
const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });
const ACTIVE_PAYMENT = ['PENDING', 'PAID'];

// ── Τιμή κράτησης ─────────────────────────────────────────────────────────────────────────────

/** Η τρέχουσα (ή, σε κλεισμένο container, η τελική) τιμή κλιμακίου για την κράτηση. */
async function priceFor(reservationId: string) {
  const r = await prisma.containerReservation.findUnique({
    where: { id: reservationId },
    include: {
      offerItem: { select: { name: true, code: true, sqmPerPallet: true, baseUnit: true, prices: true } },
      offer: { select: { id: true, title: true, status: true, tiers: true, reservations: { select: { pallets: true, status: true } } } },
    },
  });
  if (!r) throw new PaymentError('Η κράτηση δεν υπάρχει', 404);
  const filled = roundStep(r.offer.reservations.filter((x) => x.status === 'ACTIVE').reduce((a, x) => a + x.pallets, 0));
  const levels = sortTiers(r.offer.tiers.map(({ level, fromPallets }) => ({ level, fromPallets })));
  const cur = tierAt(levels, filled);
  const level = cur?.level ?? 1;
  const unitPrice = r.offerItem.prices[level - 1];
  if (!(unitPrice > 0)) throw new PaymentError('Δεν υπάρχει τιμή για το τρέχον κλιμάκιο του προϊόντος');
  return { r, level, unitPrice };
}

// ── Ποιος πληρώνει ────────────────────────────────────────────────────────────────────────────

async function payerOf(r: { offerId: string; trdr: number | null; partnerId: string | null; createdById: string | null }) {
  const requester = r.createdById
    ? await prisma.user.findUnique({ where: { id: r.createdById }, select: { email: true, name: true, role: { select: { key: true } } } })
    : null;
  const portalUser = requester && (requester.role.key === 'CUSTOMER' || requester.role.key === 'COLLABORATOR') ? requester : null;
  const [trader, partner, recipient] = await Promise.all([
    r.trdr != null ? prisma.softoneTrader.findUnique({ where: { trdr: r.trdr }, select: { name: true, email: true, phone: true } }) : null,
    r.partnerId ? prisma.partner.findUnique({ where: { id: r.partnerId }, select: { name: true, email: true, phone: true } }) : null,
    prisma.offerRecipient.findFirst({
      where: { offerId: r.offerId, ...(r.trdr != null ? { kind: 'CUSTOMER', refId: String(r.trdr) } : { kind: 'PARTNER', refId: r.partnerId ?? '' }) },
      select: { email: true, name: true },
    }),
  ]);
  const company = trader?.name ?? partner?.name ?? recipient?.name ?? 'Πελάτης';
  return {
    company,
    contactName: portalUser?.name?.trim() || company,
    email: portalUser?.email ?? recipient?.email ?? trader?.email?.trim() ?? partner?.email?.trim() ?? null,
    phone: trader?.phone ?? partner?.phone ?? null,
  };
}

// ── Δημιουργία αιτήματος ──────────────────────────────────────────────────────────────────────

export type CreateResult =
  | { created: true; paymentId: string; emailed: boolean; emailError: string | null }
  | { created: false; reason: 'disabled' | 'not_configured' | 'exists' | 'not_active'; message: string; paymentId?: string };

/**
 * Αίτημα πληρωμής για ΕΝΕΡΓΗ κράτηση (καλείται μετά την έγκριση). Ιδεμποτέντ: αν υπάρχει ήδη ενεργό
 * αίτημα (PENDING/PAID) δεν φτιάχνει δεύτερο. Δεν μιλά ακόμη με το Viva — το order φτιάχνεται στο άνοιγμα.
 */
export async function createPaymentRequest(reservationId: string, userId: string | null, opts: { force?: boolean } = {}): Promise<CreateResult> {
  const c = await vivaConfig();
  if (!c.enabled && !opts.force) return { created: false, reason: 'disabled', message: 'Οι πληρωμές Viva είναι απενεργοποιημένες (Ρυθμίσεις → Πληρωμές / Viva)' };
  const missing = missingConfig(c);
  if (missing.length) return { created: false, reason: 'not_configured', message: `Λείπουν στοιχεία Viva: ${missing.join(', ')}` };
  const existing = await prisma.vivaPayment.findFirst({ where: { reservationId, status: { in: ACTIVE_PAYMENT } }, select: { id: true } });
  if (existing) return { created: false, reason: 'exists', message: 'Υπάρχει ήδη αίτημα πληρωμής για την κράτηση', paymentId: existing.id };
  const { r, level, unitPrice } = await priceFor(reservationId);
  if (r.status !== 'ACTIVE') return { created: false, reason: 'not_active', message: 'Αίτημα πληρωμής γίνεται μόνο για εγκεκριμένη (ενεργή) κράτηση' };
  const amt = paymentAmount({ pallets: r.pallets, perPallet: r.offerItem.sqmPerPallet, unitPrice, vatRate: c.vatRate });
  const payer = await payerOf(r);
  const p = await prisma.vivaPayment.create({
    data: {
      reservationId, token: randomBytes(24).toString('base64url'), env: c.env,
      pallets: r.pallets, quantity: amt.quantity, unit: r.offerItem.baseUnit ?? 'τ.μ.', level, unitPrice, vatRate: c.vatRate,
      netCents: amt.netCents, vatCents: amt.vatCents, amountCents: amt.amountCents, email: payer.email, createdById: userId,
    },
  });
  const mail = c.sendEmails ? await sendPaymentEmail(p.id) : { sent: false, error: null };
  return { created: true, paymentId: p.id, emailed: mail.sent, emailError: mail.error };
}

// ── Email ─────────────────────────────────────────────────────────────────────────────────────

/** Το email με τον προσωπικό σύνδεσμο (πρότυπο site-email). Best-effort: γράφει emailSentAt ή emailError. */
export async function sendPaymentEmail(paymentId: string): Promise<{ sent: boolean; error: string | null }> {
  const p = await prisma.vivaPayment.findUnique({
    where: { id: paymentId },
    include: { reservation: { include: { offer: { select: { title: true } }, offerItem: { select: { name: true, code: true } } } } },
  });
  if (!p) throw new PaymentError('Το αίτημα πληρωμής δεν υπάρχει', 404);
  if (p.status !== 'PENDING') throw new PaymentError('Email στέλνεται μόνο για αίτημα που αναμένει πληρωμή');
  const payer = await payerOf(p.reservation);
  const to = p.email ?? payer.email;
  if (!to) {
    await prisma.vivaPayment.update({ where: { id: p.id }, data: { emailError: 'Δεν βρέθηκε email παραλήπτη' } });
    return { sent: false, error: 'Δεν βρέθηκε email παραλήπτη' };
  }
  try {
    const [{ sendTransactionalEmail }, { emailBrand }, { paymentRequestEmail }] = await Promise.all([import('@/lib/mailgun'), import('@/lib/email/brand'), import('@/lib/email/templates')]);
    const [brand, inbox] = await Promise.all([emailBrand(), getSetting<string>('company.email')]);
    const unit = p.unit ?? 'τ.μ.';
    const m = paymentRequestEmail(brand, {
      contactName: payer.contactName, product: p.reservation.offerItem.name, offer: p.reservation.offer.title,
      quantity: `${num(p.pallets)} παλέτες · ${num(p.quantity)} ${unit}`,
      unitPriceLabel: `Τιμή κλιμακίου W0${p.level}`, unitPrice: `${p.unitPrice.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })} / ${unit}`,
      net: formatEur(p.netCents), vatLabel: `ΦΠΑ ${num(p.vatRate)}%`, vat: formatEur(p.vatCents), total: formatEur(p.amountCents), link: payUrl(p.token),
    });
    await sendTransactionalEmail(to, m.subject, m.html, { fromName: brand.name, replyTo: inbox ?? null, text: m.text });
    await prisma.vivaPayment.update({ where: { id: p.id }, data: { email: to, emailSentAt: new Date(), emailError: null } });
    return { sent: true, error: null };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    console.error('[viva-payments] email', msg);
    await prisma.vivaPayment.update({ where: { id: p.id }, data: { emailError: msg } });
    return { sent: false, error: msg };
  }
}

// ── Άνοιγμα του συνδέσμου → Smart Checkout ────────────────────────────────────────────────────

export type OpenResult = { kind: 'redirect'; url: string } | { kind: 'status'; status: 'paid' | 'cancelled' | 'refunded' | 'unavailable' | 'not_found'; offerId?: string; message?: string };

/**
 * Ο προσωπικός σύνδεσμος. Ποσό: το μικρότερο από το αρχικό και την ΤΡΕΧΟΥΣΑ τιμή (αν έπεσε στο μεταξύ,
 * χρεώνεται απευθείας η χαμηλότερη). Ανοιχτό order με ίδιο ποσό ξαναχρησιμοποιείται· αλλιώς νέο.
 */
export async function openCheckout(token: string): Promise<OpenResult> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { kind: 'status', status: 'not_found' };
  const p = await prisma.vivaPayment.findUnique({ where: { token }, include: { orders: { orderBy: { createdAt: 'desc' } }, reservation: { select: { offerId: true, status: true } } } });
  if (!p) return { kind: 'status', status: 'not_found' };
  const offerId = p.reservation.offerId;
  if (p.status === 'PAID') return { kind: 'status', status: 'paid', offerId };
  if (p.status === 'REFUNDED') return { kind: 'status', status: 'refunded', offerId };
  if (p.status === 'CANCELLED' || p.reservation.status !== 'ACTIVE') return { kind: 'status', status: 'cancelled', offerId };
  const c = await vivaConfig();
  if (c.env !== p.env || missingConfig(c).length) return { kind: 'status', status: 'unavailable', offerId, message: 'Η πληρωμή δεν είναι διαθέσιμη αυτή τη στιγμή.' };

  let pay = p;
  try {
    const { level, unitPrice } = await priceFor(p.reservationId);
    if (unitPrice < p.unitPrice) {
      const amt = paymentAmount({ pallets: p.pallets, perPallet: p.quantity / p.pallets, unitPrice, vatRate: p.vatRate });
      pay = { ...p, ...(await prisma.vivaPayment.update({ where: { id: p.id }, data: { level, unitPrice, netCents: amt.netCents, vatCents: amt.vatCents, amountCents: amt.amountCents } })) };
    }
  } catch { /* η αρχική τιμή ισχύει */ }

  const reuse = reusableOrder(pay.orders, pay.amountCents);
  if (reuse) return { kind: 'redirect', url: checkoutUrl(c.env, reuse.orderCode) };
  try {
    const r = await prisma.containerReservation.findUnique({ where: { id: p.reservationId }, include: { offerItem: { select: { name: true } }, offer: { select: { id: true } } } });
    const payer = await payerOf({ offerId, trdr: r?.trdr ?? null, partnerId: r?.partnerId ?? null, createdById: r?.createdById ?? null });
    const brand = ((await getSetting<string>('company.name')) ?? 'ATELIER').trim();
    const timeout = orderTimeoutSeconds(c.orderTimeoutMinutes);
    const orderCode = await createOrder(c, {
      amountCents: pay.amountCents,
      customerTrns: `${brand} — ${num(pay.pallets)} παλέτες «${r?.offerItem.name ?? 'κοινό container'}» (${num(pay.quantity)} ${pay.unit ?? 'τ.μ.'})`,
      merchantTrns: `dynoffer:${offerId}|res:${p.reservationId}|pay:${p.id}`,
      timeoutSeconds: timeout,
      customer: { email: pay.email ?? payer.email, fullName: payer.company, phone: payer.phone },
      tags: ['dynamic-offer', offerId],
    });
    await prisma.vivaOrder.create({ data: { paymentId: p.id, orderCode, amountCents: pay.amountCents, expiresAt: new Date(Date.now() + timeout * 1000) } });
    // Τα παλιότερα ανοιχτά orders δεν χρησιμοποιούνται πια (το Viva τα λήγει μόνο του).
    await prisma.vivaOrder.updateMany({ where: { paymentId: p.id, status: 'OPEN', orderCode: { not: orderCode } }, data: { status: 'EXPIRED' } });
    return { kind: 'redirect', url: checkoutUrl(c.env, orderCode) };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    console.error('[viva-payments] order', msg);
    await prisma.vivaPayment.update({ where: { id: p.id }, data: { lastError: msg } });
    return { kind: 'status', status: 'unavailable', offerId, message: 'Η σύνδεση με το Viva απέτυχε. Δοκιμάστε ξανά σε λίγο.' };
  }
}

// ── Εφαρμογή επαληθευμένης συναλλαγής ─────────────────────────────────────────────────────────

export type ApplyResult = { result: string; paymentId: string | null; offerId: string | null };

/**
 * Η ΜΟΝΑΔΙΚΗ θέση που αλλάζει κατάσταση από στοιχεία του Viva — τα `tx` προέρχονται ΠΑΝΤΑ από το API
 * (retrieveTransaction), ποτέ απευθείας από το webhook/URL. Ιδεμποτέντ: η ίδια συναλλαγή δεύτερη φορά = noop.
 */
export async function applyTransaction(tx: VivaTransaction, hint: { reversal?: boolean } = {}): Promise<ApplyResult> {
  const order = tx.orderCode ? await prisma.vivaOrder.findUnique({ where: { orderCode: tx.orderCode }, include: { payment: { include: { reservation: { select: { offerId: true } } } } } }) : null;
  if (!order) return { result: 'unknown_order', paymentId: null, offerId: null };
  const p = order.payment;
  const ids = { paymentId: p.id, offerId: p.reservation.offerId };
  const outcome = hint.reversal && tx.statusId === 'F' ? 'reversal' : classifyTransaction(tx, order.amountCents);

  if (outcome === 'reversal') {
    const known = await prisma.vivaRefund.findFirst({ where: { paymentId: p.id, transactionId: tx.transactionId } });
    if (known) return { result: 'reversal_known', ...ids };
    // Επιστροφή που έγινε εκτός εφαρμογής (π.χ. από το dashboard του Viva): καταγραφή + ενημέρωση ποσού.
    await prisma.$transaction(async (db) => {
      await db.vivaRefund.upsert({
        where: { key: `${p.id}-tx-${tx.transactionId}` }, update: {},
        create: { paymentId: p.id, key: `${p.id}-tx-${tx.transactionId}`, kind: 'MANUAL', amountCents: tx.amountCents, status: 'DONE', transactionId: tx.transactionId },
      });
      const cur = await db.vivaPayment.findUniqueOrThrow({ where: { id: p.id } });
      const refunded = cur.refundedCents + tx.amountCents;
      await db.vivaPayment.update({ where: { id: p.id }, data: { refundedCents: refunded, status: cur.paidCents ? statusAfterRefund(cur.paidCents, refunded) : cur.status } });
    });
    return { result: 'reversal_recorded', ...ids };
  }

  if (outcome === 'paid') {
    if (p.status === 'PAID' && p.transactionId === tx.transactionId) return { result: 'already_paid', ...ids };
    if (p.status === 'PAID' || p.status === 'REFUNDED') {
      await prisma.vivaPayment.update({ where: { id: p.id }, data: { lastError: `Δεύτερη πληρωμή ${formatEur(tx.amountCents)} (συναλλαγή ${tx.transactionId}) — χρειάζεται επιστροφή από το Viva` } });
      return { result: 'duplicate_payment', ...ids };
    }
    // PENDING ή CANCELLED (πλήρωσε ενώ ακυρωνόταν): η πληρωμή μετράει, το προσωπικό αποφασίζει για επιστροφή.
    await prisma.$transaction([
      prisma.vivaPayment.update({
        where: { id: p.id },
        data: {
          status: 'PAID', paidCents: tx.amountCents, transactionId: tx.transactionId, paidAt: new Date(),
          lastError: p.status === 'CANCELLED' ? 'Πληρώθηκε μετά την ακύρωση του αιτήματος — έλεγξε αν χρειάζεται επιστροφή' : null,
          // Το ποσό του αιτήματος = αυτό του order που πληρώθηκε (ίδιο ή χαμηλότερο, αν έπεσε η τιμή).
          amountCents: order.amountCents,
        },
      }),
      prisma.vivaOrder.update({ where: { id: order.id }, data: { status: 'PAID', transactionId: tx.transactionId } }),
    ]);
    return { result: 'paid', ...ids };
  }

  if (outcome === 'amount_mismatch') {
    await prisma.vivaPayment.update({ where: { id: p.id }, data: { lastError: `Η συναλλαγή ${tx.transactionId} έχει ποσό ${formatEur(tx.amountCents)} αντί ${formatEur(order.amountCents)} — δεν καταχωρίστηκε` } });
    return { result: 'amount_mismatch', ...ids };
  }
  if (outcome === 'failed') {
    if (p.status === 'PENDING') await prisma.vivaPayment.update({ where: { id: p.id }, data: { lastError: 'Απέτυχε απόπειρα πληρωμής (ο πελάτης μπορεί να ξαναδοκιμάσει)' } });
    return { result: 'failed_attempt', ...ids };
  }
  return { result: outcome, ...ids };
}

// ── Webhook ───────────────────────────────────────────────────────────────────────────────────

const HANDLED = new Set<number>([VIVA_EVENTS.PAYMENT_CREATED, VIVA_EVENTS.REVERSAL_CREATED, VIVA_EVENTS.FAILED]);

/**
 * POST του Viva. Inbox: κάθε (τύπος, συναλλαγή) γράφεται μία φορά· ολοκληρωμένο event δεν ξαναεφαρμόζεται.
 * Επαλήθευση: τα στοιχεία διαβάζονται ξανά από το API του Viva με τα ΔΙΚΑ μας credentials — πλαστό POST
 * με συναλλαγή που δεν υπάρχει στον λογαριασμό μας δεν αλλάζει τίποτα. Σφάλμα δικτύου → throw (το Viva ξαναστέλνει).
 */
export async function processWebhook(raw: string): Promise<{ status: 'processed' | 'duplicate' | 'ignored'; result?: string }> {
  let body: unknown;
  try { body = parseVivaJson(raw); } catch { return { status: 'ignored', result: 'invalid_json' }; }
  const n = readWebhook(body);
  if (!n) return { status: 'ignored', result: 'unrecognised_payload' };
  const key = dedupeKey(n);
  const prev = await prisma.vivaWebhookEvent.findUnique({ where: { dedupeKey: key } });
  if (prev && (prev.status === 'PROCESSED' || prev.status === 'IGNORED')) return { status: 'duplicate', result: prev.result ?? undefined };
  const ev = prev
    ? await prisma.vivaWebhookEvent.update({ where: { id: prev.id }, data: { attempts: { increment: 1 }, payload: body as object } })
    : await prisma.vivaWebhookEvent.create({ data: { dedupeKey: key, eventTypeId: n.eventTypeId, messageId: n.messageId, orderCode: n.orderCode, transactionId: n.transactionId, payload: body as object } });

  const finish = (status: 'PROCESSED' | 'IGNORED' | 'ERROR', result: string, error: string | null = null) =>
    prisma.vivaWebhookEvent.update({ where: { id: ev.id }, data: { status, result, error, processedAt: status === 'ERROR' ? null : new Date() } });

  if (!HANDLED.has(n.eventTypeId)) { await finish('IGNORED', 'event_not_handled'); return { status: 'ignored', result: 'event_not_handled' }; }
  if (n.orderCode && !(await prisma.vivaOrder.findUnique({ where: { orderCode: n.orderCode }, select: { id: true } }))) {
    await finish('IGNORED', 'unknown_order'); return { status: 'ignored', result: 'unknown_order' };
  }
  try {
    const c = await vivaConfig();
    const tx = await retrieveTransaction(c, n.transactionId);
    if (!tx) { await finish('IGNORED', 'transaction_not_found'); return { status: 'ignored', result: 'transaction_not_found' }; }
    const r = await applyTransaction(tx, { reversal: n.eventTypeId === VIVA_EVENTS.REVERSAL_CREATED });
    await finish(r.paymentId ? 'PROCESSED' : 'IGNORED', r.result);
    return { status: r.paymentId ? 'processed' : 'ignored', result: r.result };
  } catch (e) {
    await finish('ERROR', 'error', (e as Error).message.slice(0, 500));
    throw e;
  }
}

/** Επιστροφή από το checkout (?t=<transactionId>&s=<orderCode>): επαλήθευση από το API, ίδια ροή με το webhook. */
export async function handleReturn(t: string | null, s: string | null): Promise<{ offerId: string | null; paid: boolean; token: string | null }> {
  const order = s && /^\d{6,20}$/.test(s) ? await prisma.vivaOrder.findUnique({ where: { orderCode: s }, include: { payment: { include: { reservation: { select: { offerId: true } } } } } }) : null;
  if (t) {
    try {
      const tx = await retrieveTransaction(await vivaConfig(), t);
      if (tx && (!s || tx.orderCode === s)) await applyTransaction(tx);
    } catch (e) { console.error('[viva-payments] return', (e as Error).message); }
  }
  if (!order) return { offerId: null, paid: false, token: null };
  const fresh = await prisma.vivaPayment.findUnique({ where: { id: order.paymentId }, select: { status: true, token: true } });
  return { offerId: order.payment.reservation.offerId, paid: fresh?.status === 'PAID', token: fresh?.token ?? null };
}

// ── Ενέργειες προσωπικού ──────────────────────────────────────────────────────────────────────

async function paymentOrThrow(offerId: string, paymentId: string) {
  const p = await prisma.vivaPayment.findUnique({ where: { id: paymentId }, include: { orders: true, reservation: { select: { offerId: true, status: true } } } });
  if (!p || p.reservation.offerId !== offerId) throw new PaymentError('Το αίτημα πληρωμής δεν βρέθηκε', 404);
  return p;
}

/** «Έλεγχος στο Viva»: διαβάζει τις συναλλαγές κάθε order και τις εφαρμόζει (όταν δεν έφτασε webhook). */
export async function syncPayment(offerId: string, paymentId: string) {
  const p = await paymentOrThrow(offerId, paymentId);
  const c = await vivaConfig();
  if (c.env !== p.env) throw new PaymentError(`Το αίτημα ανήκει στο περιβάλλον ${p.env} — οι ρυθμίσεις είναι σε ${c.env}`);
  const results: string[] = [];
  for (const o of p.orders) {
    for (const id of await transactionIdsOfOrder(c, o.orderCode)) {
      const tx = await retrieveTransaction(c, id);
      if (tx) results.push((await applyTransaction(tx)).result);
    }
    if (o.status === 'OPEN' && o.expiresAt.getTime() < Date.now()) await prisma.vivaOrder.update({ where: { id: o.id }, data: { status: 'EXPIRED' } });
  }
  return { results };
}

/** Ακύρωση αιτήματος που δεν πληρώθηκε: κλείνει τα ανοιχτά orders στο Viva και δεν δέχεται πια πληρωμή. */
export async function cancelPayment(offerId: string, paymentId: string) {
  const p = await paymentOrThrow(offerId, paymentId);
  if (p.status !== 'PENDING') throw new PaymentError('Ακυρώνεται μόνο αίτημα που αναμένει πληρωμή');
  const c = await vivaConfig();
  for (const o of p.orders.filter((x) => x.status === 'OPEN')) {
    try { if (c.env === p.env) await cancelOrder(c, o.orderCode); } catch (e) { console.error('[viva-payments] cancel order', (e as Error).message); }
  }
  await prisma.$transaction([
    prisma.vivaOrder.updateMany({ where: { paymentId: p.id, status: 'OPEN' }, data: { status: 'CANCELLED' } }),
    prisma.vivaPayment.update({ where: { id: p.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } }),
  ]);
}

/** Όταν ακυρώνεται μια κράτηση: το ανοιχτό αίτημα ακυρώνεται μαζί (το πληρωμένο μένει για επιστροφή). */
export async function onReservationCancelled(offerId: string, reservationId: string) {
  const open = await prisma.vivaPayment.findMany({ where: { reservationId, status: 'PENDING' }, select: { id: true } });
  for (const p of open) await cancelPayment(offerId, p.id).catch((e) => console.error('[viva-payments] cancel', (e as Error).message));
}

export type RefundKind = 'PRICE_DIFF' | 'FULL';

/** Τι επιστροφή προτείνεται για ένα πληρωμένο αίτημα (για το ⋮ και τη μαζική επιστροφή). */
export async function refundSuggestion(p: { id: string; status: string; paidCents: number | null; refundedCents: number; quantity: number; vatRate: number; reservationId: string }, ctx: { offerStatus: string; reservationStatus: string; finalPrice: number | null }) {
  if (p.status !== 'PAID' || !p.paidCents) return null;
  if (ctx.reservationStatus !== 'ACTIVE' || ctx.offerStatus === 'CANCELLED') {
    const cents = fullRefund({ paidCents: p.paidCents, refundedCents: p.refundedCents });
    return cents > 0 ? { kind: 'FULL' as const, cents } : null;
  }
  if (ctx.offerStatus === 'CLOSED' && ctx.finalPrice != null) {
    const { refundCents } = priceDiffRefund({ paidCents: p.paidCents, refundedCents: p.refundedCents, quantity: p.quantity, vatRate: p.vatRate }, ctx.finalPrice);
    return refundCents > 0 ? { kind: 'PRICE_DIFF' as const, cents: refundCents } : null;
  }
  return null;
}

/**
 * Επιστροφή χρημάτων στο ίδιο μέσο πληρωμής. ΙΔΕΜΠΟΤΕΝΤ: μία επιστροφή ανά (αίτημα, είδος) — δεύτερο
 * πάτημα δεν ξαναεπιστρέφει· αποτυχημένη ξαναδοκιμάζεται. Το ποσό υπολογίζεται εδώ, όχι από τον client.
 */
export async function refundPayment(offerId: string, paymentId: string, userId: string | null) {
  const p = await paymentOrThrow(offerId, paymentId);
  const { r, unitPrice } = await priceFor(p.reservationId);
  const s = await refundSuggestion(p, { offerStatus: r.offer.status, reservationStatus: r.status, finalPrice: r.offer.status === 'CLOSED' ? unitPrice : null });
  if (!s) throw new PaymentError('Δεν οφείλεται επιστροφή για αυτό το αίτημα');
  if (!p.transactionId) throw new PaymentError('Δεν βρέθηκε η συναλλαγή πληρωμής');
  const c = await vivaConfig();
  if (c.env !== p.env) throw new PaymentError(`Το αίτημα ανήκει στο περιβάλλον ${p.env} — οι ρυθμίσεις είναι σε ${c.env}`);
  const key = `${p.id}-${s.kind}`;
  const prev = await prisma.vivaRefund.findUnique({ where: { key } });
  if (prev?.status === 'DONE') throw new PaymentError('Η επιστροφή έχει ήδη γίνει');
  if (prev?.status === 'PENDING' && prev.updatedAt.getTime() > Date.now() - 2 * 60_000) throw new PaymentError('Η επιστροφή είναι ήδη σε εξέλιξη', 409);
  const row = prev
    ? await prisma.vivaRefund.update({ where: { id: prev.id }, data: { status: 'PENDING', amountCents: s.cents, error: null, createdById: userId } })
    : await prisma.vivaRefund.create({ data: { paymentId: p.id, key, kind: s.kind, amountCents: s.cents, createdById: userId } });
  try {
    const txId = await refundTransaction(c, p.transactionId, s.cents);
    await prisma.$transaction(async (db) => {
      await db.vivaRefund.update({ where: { id: row.id }, data: { status: 'DONE', transactionId: txId } });
      const cur = await db.vivaPayment.findUniqueOrThrow({ where: { id: p.id } });
      const refunded = cur.refundedCents + s.cents;
      await db.vivaPayment.update({ where: { id: p.id }, data: { refundedCents: refunded, status: statusAfterRefund(cur.paidCents ?? 0, refunded), lastError: null } });
    });
    return { kind: s.kind, cents: s.cents };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    await prisma.vivaRefund.update({ where: { id: row.id }, data: { status: 'FAILED', error: msg } });
    throw e instanceof VivaError ? new PaymentError(msg, 502) : e;
  }
}

/** Κλεισμένο container: επιστροφή διαφοράς σε ΟΛΑ τα πληρωμένα αιτήματα που οφείλεται. */
export async function refundPriceDiffs(offerId: string, userId: string | null) {
  const o = await prisma.containerOffer.findUnique({ where: { id: offerId }, select: { status: true } });
  if (o?.status !== 'CLOSED') throw new PaymentError('Οι διαφορές επιστρέφονται όταν κλείσει το container');
  const pays = await prisma.vivaPayment.findMany({ where: { status: 'PAID', reservation: { offerId, status: 'ACTIVE' } }, select: { id: true } });
  let done = 0; let cents = 0; const failed: string[] = [];
  for (const p of pays) {
    try { const r = await refundPayment(offerId, p.id, userId); done++; cents += r.cents; } catch (e) {
      if (!(e instanceof PaymentError && e.message === 'Δεν οφείλεται επιστροφή για αυτό το αίτημα')) failed.push((e as Error).message);
    }
  }
  return { done, cents, failed };
}

// ── Ανάγνωση (διαχείριση / portal) ────────────────────────────────────────────────────────────

export type PaymentSummary = {
  id: string; status: string; env: string; amountCents: number; paidCents: number | null; refundedCents: number;
  level: number; unitPrice: number; email: string | null; emailSentAt: string | null; emailError: string | null;
  lastError: string | null; paidAt: string | null; createdAt: string; url: string;
  refund: { kind: RefundKind; cents: number } | null;
};

/** Ανά κράτηση: το πιο πρόσφατο αίτημα πληρωμής της προσφοράς (+ προτεινόμενη επιστροφή). */
export async function paymentsForOffer(offerId: string): Promise<Record<string, PaymentSummary>> {
  const o = await prisma.containerOffer.findUnique({ where: { id: offerId }, select: { status: true, tiers: true, items: { select: { id: true, prices: true } }, reservations: { select: { id: true, pallets: true, status: true, offerItemId: true } } } });
  if (!o) return {};
  const pays = await prisma.vivaPayment.findMany({ where: { reservation: { offerId } }, orderBy: { createdAt: 'asc' } });
  const filled = roundStep(o.reservations.filter((x) => x.status === 'ACTIVE').reduce((a, x) => a + x.pallets, 0));
  const level = tierAt(sortTiers(o.tiers.map(({ level, fromPallets }) => ({ level, fromPallets }))), filled)?.level ?? 1;
  const resById = new Map(o.reservations.map((r) => [r.id, r]));
  const priceById = new Map(o.items.map((i) => [i.id, i.prices[level - 1] ?? null]));
  const out: Record<string, PaymentSummary> = {};
  for (const p of pays) {
    const res = resById.get(p.reservationId);
    const refund = res ? await refundSuggestion(p, { offerStatus: o.status, reservationStatus: res.status, finalPrice: o.status === 'CLOSED' ? priceById.get(res.offerItemId) ?? null : null }) : null;
    out[p.reservationId] = {
      id: p.id, status: p.status, env: p.env, amountCents: p.amountCents, paidCents: p.paidCents, refundedCents: p.refundedCents,
      level: p.level, unitPrice: p.unitPrice, email: p.email, emailSentAt: p.emailSentAt?.toISOString() ?? null, emailError: p.emailError,
      lastError: p.lastError, paidAt: p.paidAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(), url: payUrl(p.token), refund,
    };
  }
  return out;
}

/** Η σελίδα του προσωπικού συνδέσμου: τι πληρώνεται (χωρίς να αγγίζει το Viva — τα φίλτρα των mail servers ανοίγουν συνδέσμους). */
export async function peekPayment(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const p = await prisma.vivaPayment.findUnique({
    where: { token },
    include: { reservation: { select: { offerId: true, status: true, offer: { select: { title: true } }, offerItem: { select: { name: true, code: true } } } } },
  });
  if (!p) return null;
  return {
    status: p.reservation.status !== 'ACTIVE' && p.status === 'PENDING' ? 'CANCELLED' : p.status,
    env: p.env, offerId: p.reservation.offerId, offerTitle: p.reservation.offer.title, product: p.reservation.offerItem.name, code: p.reservation.offerItem.code,
    pallets: p.pallets, quantity: p.quantity, unit: p.unit ?? 'τ.μ.', level: p.level, unitPrice: p.unitPrice, vatRate: p.vatRate,
    netCents: p.netCents, vatCents: p.vatCents, amountCents: p.amountCents, paidCents: p.paidCents, refundedCents: p.refundedCents,
    paidAt: p.paidAt?.toISOString() ?? null,
  };
}

/** Portal: τα αιτήματα πληρωμής των ΔΙΚΩΝ μου κρατήσεων σε αυτή την προσφορά. */
export async function myPayments(offerId: string, b: { trdr: number | null; partnerId: string | null }) {
  const where = b.trdr != null ? { trdr: b.trdr } : { partnerId: b.partnerId ?? '__none__' };
  const pays = await prisma.vivaPayment.findMany({
    where: { status: { in: ['PENDING', 'PAID', 'REFUNDED'] }, reservation: { offerId, ...where } },
    orderBy: { createdAt: 'desc' },
    include: { reservation: { select: { pallets: true, offerItem: { select: { name: true } } } } },
  });
  return pays.map((p) => ({
    id: p.id, status: p.status, product: p.reservation.offerItem.name, pallets: p.pallets, quantity: p.quantity, unit: p.unit ?? 'τ.μ.',
    amountCents: p.amountCents, paidCents: p.paidCents, refundedCents: p.refundedCents, paidAt: p.paidAt?.toISOString() ?? null,
    url: p.status === 'PENDING' ? `/pay/viva/${p.token}` : null,
  }));
}
