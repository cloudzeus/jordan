import { describe, expect, it } from 'vitest';
import {
  checkoutUrl, classifyTransaction, dedupeKey, fullRefund, orderTimeoutSeconds, parseVivaJson, paymentAmount, priceDiffRefund,
  readWebhook, reusableOrder, statusAfterRefund, VIVA_HOSTS, vivaUrls,
} from '../viva-core';

describe('ποσό αιτήματος πληρωμής', () => {
  it('παλέτες × μονάδες/παλέτα × τιμή κλιμακίου + ΦΠΑ, σε λεπτά', () => {
    // 2,5 παλέτες × 64,8 τ.μ. = 162 τ.μ. × 18,90 € = 3.061,80 € + 24% = 734,83 € → 3.796,63 €
    expect(paymentAmount({ pallets: 2.5, perPallet: 64.8, unitPrice: 18.9, vatRate: 24 })).toEqual({ quantity: 162, netCents: 306180, vatCents: 73483, amountCents: 379663 });
  });
  it('στρογγυλοποίηση: πρώτα το καθαρό, μετά ο ΦΠΑ — χωρίς σφάλματα κινητής υποδιαστολής', () => {
    const a = paymentAmount({ pallets: 0.5, perPallet: 1.15, unitPrice: 10.05, vatRate: 24 });
    expect(a.quantity).toBe(0.575);
    expect(a.netCents).toBe(578); // 5,77875 € → 5,78
    expect(a.vatCents).toBe(139); // 1,3872 € → 1,39
    expect(a.amountCents).toBe(717);
  });
  it('ΦΠΑ 0% = μόνο καθαρό', () => {
    expect(paymentAmount({ pallets: 1, perPallet: 10, unitPrice: 5, vatRate: 0 }).amountCents).toBe(5000);
  });
  it('απορρίπτει μηδενικές/αρνητικές ποσότητες', () => {
    expect(() => paymentAmount({ pallets: 0, perPallet: 10, unitPrice: 5, vatRate: 24 })).toThrow();
    expect(() => paymentAmount({ pallets: 1, perPallet: 10, unitPrice: -1, vatRate: 24 })).toThrow();
  });
});

describe('διαφορά τιμής στο κλείσιμο', () => {
  const paid = { paidCents: 379663, refundedCents: 0, quantity: 162, vatRate: 24 };
  it('η τελική τιμή έπεσε → επιστρέφεται η διαφορά (με ΦΠΑ)', () => {
    // 162 × 17,40 = 2.818,80 + 676,51 = 3.495,31 € → διαφορά 301,32 €
    expect(priceDiffRefund(paid, 17.4)).toEqual({ finalCents: 349531, refundCents: 30132 });
  });
  it('ίδια ή υψηλότερη τελική τιμή → τίποτα', () => {
    expect(priceDiffRefund(paid, 18.9).refundCents).toBe(0);
    expect(priceDiffRefund(paid, 25).refundCents).toBe(0);
  });
  it('αφαιρεί όσα έχουν ήδη επιστραφεί (δεν επιστρέφει δύο φορές)', () => {
    expect(priceDiffRefund({ ...paid, refundedCents: 30132 }, 17.4).refundCents).toBe(0);
    expect(priceDiffRefund({ ...paid, refundedCents: 10000 }, 17.4).refundCents).toBe(20132);
  });
  it('πλήρης επιστροφή = ό,τι απομένει', () => {
    expect(fullRefund({ paidCents: 1000, refundedCents: 300 })).toBe(700);
    expect(fullRefund({ paidCents: 1000, refundedCents: 1000 })).toBe(0);
  });
  it('κατάσταση μετά την επιστροφή', () => {
    expect(statusAfterRefund(1000, 300)).toBe('PAID');
    expect(statusAfterRefund(1000, 1000)).toBe('REFUNDED');
  });
});

describe('webhook του Viva', () => {
  const tx = 'a1b2c3d4-e5f6-4711-8899-aabbccddeeff';
  const body = `{"Url":"https://x","EventData":{"TransactionId":"${tx.toUpperCase()}","OrderCode":1272214778972604,"StatusId":"F","Amount":3796.63},"Created":"2026-10-18T10:00:00Z","EventTypeId":1796,"MessageId":"m-1"}`;
  it('ο 16ψήφιος OrderCode διαβάζεται ακριβώς (όχι ως αριθμός JS)', () => {
    const n = readWebhook(parseVivaJson(body));
    expect(n).toEqual({ eventTypeId: 1796, transactionId: tx, orderCode: '1272214778972604', messageId: 'm-1', amountCents: 379663, statusId: 'F' });
  });
  it('κωδικός πάνω από 2^53: το απλό JSON.parse χάνει ψηφία, το parseVivaJson όχι', () => {
    const big = '{"EventData":{"OrderCode":9907199254740993}}';
    expect(String(JSON.parse(big).EventData.OrderCode)).not.toBe('9907199254740993');
    expect((parseVivaJson(big) as { EventData: { OrderCode: string } }).EventData.OrderCode).toBe('9907199254740993');
  });
  it('ιδεμποτέντ κλειδί ανά (τύπος, συναλλαγή)', () => {
    const n = readWebhook(parseVivaJson(body))!;
    expect(dedupeKey(n)).toBe(`1796:${tx}`);
  });
  it('αγνοεί payload χωρίς έγκυρη συναλλαγή', () => {
    expect(readWebhook(null)).toBeNull();
    expect(readWebhook({ EventTypeId: 1796, EventData: { TransactionId: "'; drop table" } })).toBeNull();
    expect(readWebhook({ EventTypeId: 'x', EventData: { TransactionId: tx } })).toBeNull();
  });
});

describe('ταξινόμηση επαληθευμένης συναλλαγής', () => {
  it('F με ακριβές ποσό = πληρώθηκε · διαφορετικό ποσό = ασυμφωνία', () => {
    expect(classifyTransaction({ statusId: 'F', amountCents: 1000, transactionTypeId: 5 }, 1000)).toBe('paid');
    expect(classifyTransaction({ statusId: 'F', amountCents: 999, transactionTypeId: 5 }, 1000)).toBe('amount_mismatch');
  });
  it('IRIS / wallet χρεώσεις μετρούν ως πληρωμή, οι επιστροφές τους όχι', () => {
    expect(classifyTransaction({ statusId: 'F', amountCents: 1000, transactionTypeId: 60 }, 1000)).toBe('paid'); // IrisCharge
    expect(classifyTransaction({ statusId: 'F', amountCents: 1000, transactionTypeId: 16 }, 1000)).toBe('paid'); // Cash
    expect(classifyTransaction({ statusId: 'F', amountCents: 300, transactionTypeId: 61 }, 1000)).toBe('reversal'); // IrisRefund
    expect(classifyTransaction({ statusId: 'F', amountCents: 300, transactionTypeId: 4 }, 1000)).toBe('reversal'); // CardRefund
  });
  it('A = σε εξέλιξη · E/X = απέτυχε', () => {
    expect(classifyTransaction({ statusId: 'A', amountCents: 1000, transactionTypeId: 5 }, 1000)).toBe('pending');
    expect(classifyTransaction({ statusId: 'E', amountCents: 1000, transactionTypeId: 5 }, 1000)).toBe('failed');
    expect(classifyTransaction({ statusId: 'X', amountCents: 1000, transactionTypeId: 5 }, 1000)).toBe('failed');
  });
});

describe('payment orders & URL', () => {
  const now = Date.parse('2026-10-18T10:00:00Z');
  const o = (min: number, amountCents = 1000, status = 'OPEN') => ({ status, amountCents, expiresAt: new Date(now + min * 60_000) });
  it('ξαναχρησιμοποιεί ανοιχτό order με ίδιο ποσό που ζει > 5′', () => {
    expect(reusableOrder([o(30)], 1000, now)).not.toBeNull();
    expect(reusableOrder([o(4)], 1000, now)).toBeNull();
    expect(reusableOrder([o(30, 900)], 1000, now)).toBeNull(); // έπεσε η τιμή → νέο order
    expect(reusableOrder([o(30, 1000, 'PAID')], 1000, now)).toBeNull();
  });
  it('διάρκεια order: 5′ έως 24ω, προεπιλογή 60′', () => {
    expect(orderTimeoutSeconds(undefined)).toBe(3600);
    expect(orderTimeoutSeconds(1)).toBe(300);
    expect(orderTimeoutSeconds(99999)).toBe(86400);
  });
  it('checkout ανά περιβάλλον', () => {
    expect(checkoutUrl('demo', '1272214778972604')).toBe('https://demo.vivapayments.com/web/checkout?ref=1272214778972604');
    expect(checkoutUrl('production', '1')).toBe('https://www.vivapayments.com/web/checkout?ref=1');
    expect(VIVA_HOSTS.demo.accounts).toBe('https://demo-accounts.vivapayments.com');
    expect(VIVA_HOSTS.production.api).toBe('https://api.vivapayments.com');
  });
  it('URL για το dashboard του Viva από το APP_URL', () => {
    expect(vivaUrls('https://b2b.example.gr/')).toEqual({
      domain: 'b2b.example.gr',
      webhook: 'https://b2b.example.gr/api/payments/viva/webhook',
      successPath: '/api/payments/viva/return/success', failurePath: '/api/payments/viva/return/failure',
      success: 'https://b2b.example.gr/api/payments/viva/return/success', failure: 'https://b2b.example.gr/api/payments/viva/return/failure',
    });
  });
});
