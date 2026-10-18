// lib/supplier-products.ts — ΚΑΘΑΡΟ. Παραστατικά αγορών (κεφαλές + γραμμές) → προϊόντα ανά προμηθευτή.
//
// Ίδιος κανόνας με τις «Αγορές» του είδους (lib/item-purchases.ts): ποσότητα και αξία ΜΟΝΟ από
// τιμολόγια, μείον πιστωτικά (ποσότητα μόνο όταν το πιστωτικό επιστρέφει υλικό). Παραγγελίες, προσφορές
// και δελτία ΔΕΝ ξαναμετρούν την ίδια αγορά — μετρούν μόνο στο «σε πόσα παραστατικά εμφανίζεται».
import type { PurchaseKind } from '@/lib/purchase-kinds';

export interface PurchaseHead { findoc: number; trdr: number; date: Date | null; kind: PurchaseKind; returnsGoods: boolean }
export interface PurchaseLineRow { findoc: number; mtrl: number; qty: number; value: number }

export interface SupplierProductAgg {
  trdr: number; mtrl: number; docs: number; invoiceQty: number; invoiceValue: number;
  lastCost: number | null; firstDate: Date | null; lastDate: Date | null;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export function aggregateSupplierProducts(heads: PurchaseHead[], lines: PurchaseLineRow[]): SupplierProductAgg[] {
  const headBy = new Map(heads.map((h) => [h.findoc, h]));
  const out = new Map<string, SupplierProductAgg & { docSet: Set<number>; lastInvoiceAt: number }>();
  for (const l of lines) {
    const h = headBy.get(l.findoc);
    if (!h || !Number.isInteger(l.mtrl) || l.mtrl <= 0) continue;
    const key = `${h.trdr}:${l.mtrl}`;
    let a = out.get(key);
    if (!a) {
      a = { trdr: h.trdr, mtrl: l.mtrl, docs: 0, invoiceQty: 0, invoiceValue: 0, lastCost: null, firstDate: null, lastDate: null, docSet: new Set(), lastInvoiceAt: -Infinity };
      out.set(key, a);
    }
    a.docSet.add(l.findoc);
    if (h.date) {
      if (!a.firstDate || h.date < a.firstDate) a.firstDate = h.date;
      if (!a.lastDate || h.date > a.lastDate) a.lastDate = h.date;
    }
    const qty = Math.abs(l.qty) || 0;
    const value = Math.abs(l.value) || 0;
    if (h.kind === 'invoice') {
      a.invoiceQty += qty;
      a.invoiceValue += value;
      const at = h.date?.getTime() ?? 0;
      // Τελευταίο κόστος = από το πιο πρόσφατο τιμολόγιο με ποσότητα και αξία (όχι δελτίο με 0).
      if (qty > 0 && value > 0 && at >= a.lastInvoiceAt) { a.lastInvoiceAt = at; a.lastCost = round(value / qty); }
    } else if (h.kind === 'credit') {
      a.invoiceValue -= value;
      if (h.returnsGoods) a.invoiceQty -= qty;
    }
  }
  return [...out.values()].map(({ docSet, lastInvoiceAt: _skip, ...a }) => ({
    ...a, docs: docSet.size, invoiceQty: round(a.invoiceQty), invoiceValue: round(a.invoiceValue, 2),
  }));
}
