import { describe, expect, it } from 'vitest';
import { aggregateSupplierProducts, type PurchaseHead } from '@/lib/supplier-products';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const heads: PurchaseHead[] = [
  { findoc: 1, trdr: 10, date: d('2026-01-10'), kind: 'order', returnsGoods: false },
  { findoc: 2, trdr: 10, date: d('2026-01-15'), kind: 'movement', returnsGoods: false },
  { findoc: 3, trdr: 10, date: d('2026-01-20'), kind: 'invoice', returnsGoods: false },
  { findoc: 4, trdr: 10, date: d('2026-03-01'), kind: 'invoice', returnsGoods: false },
  { findoc: 5, trdr: 10, date: d('2026-03-05'), kind: 'credit', returnsGoods: true },
  { findoc: 6, trdr: 20, date: d('2026-02-01'), kind: 'credit', returnsGoods: false },
  { findoc: 7, trdr: 20, date: d('2026-01-01'), kind: 'invoice', returnsGoods: false },
];

describe('aggregateSupplierProducts', () => {
  const rows = aggregateSupplierProducts(heads, [
    { findoc: 1, mtrl: 100, qty: 10, value: 1000 },  // παραγγελία: μόνο docs
    { findoc: 2, mtrl: 100, qty: 10, value: 0 },     // δελτίο: μόνο docs
    { findoc: 3, mtrl: 100, qty: 10, value: 1000 },  // τιμολόγιο @100
    { findoc: 4, mtrl: 100, qty: 5, value: 550 },    // τιμολόγιο @110 (τελευταίο)
    { findoc: 5, mtrl: 100, qty: 2, value: 220 },    // πιστωτικό με επιστροφή
    { findoc: 7, mtrl: 200, qty: 4, value: 400 },
    { findoc: 6, mtrl: 200, qty: 1, value: 50 },     // πιστωτικό έκπτωσης: μόνο αξία
    { findoc: 3, mtrl: 0, qty: 1, value: 1 },        // χωρίς είδος: αγνοείται
    { findoc: 99, mtrl: 100, qty: 1, value: 1 },     // χωρίς κεφαλή: αγνοείται
  ]);
  const by = (trdr: number, mtrl: number) => rows.find((r) => r.trdr === trdr && r.mtrl === mtrl)!;

  it('μία γραμμή ανά (προμηθευτή, είδος)', () => expect(rows).toHaveLength(2));

  it('μόνο τιμολόγια − πιστωτικά για ποσότητα/αξία· docs από όλα', () => {
    expect(by(10, 100)).toMatchObject({ docs: 5, invoiceQty: 13, invoiceValue: 1330, lastCost: 110 });
  });

  it('πιστωτικό έκπτωσης αφαιρεί μόνο αξία', () => {
    expect(by(20, 200)).toMatchObject({ invoiceQty: 4, invoiceValue: 350, lastCost: 100 });
  });

  it('πρώτη / τελευταία ημερομηνία από κάθε παραστατικό', () => {
    expect(by(10, 100).firstDate).toEqual(d('2026-01-10'));
    expect(by(10, 100).lastDate).toEqual(d('2026-03-05'));
  });
});
