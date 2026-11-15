import { describe, expect, it } from 'vitest';
import { groupBySupplier, orderText, orderMailto, type SupplierRef } from '../supplier-orders-core';

const sup = (trdr: number, name: string, email: string | null = null): SupplierRef => ({ trdr, name, email });

describe('groupBySupplier', () => {
  const items = [
    { mtrl: 1, code: 'A', name: 'Πλακάκι', unit: 'm²', qty: 10, lastCost: 20 },
    { mtrl: 2, code: 'B', name: 'Κόλλα', unit: 'kg', qty: 5, lastCost: 3 },
    { mtrl: 3, code: 'C', name: 'Αρμόστοκος', unit: 'kg', qty: 2, lastCost: null },
  ];
  const supplierOf = (mtrl: number) => (mtrl === 1 ? sup(100, 'Προμηθευτής Α', 'a@x.gr') : mtrl === 2 ? sup(100, 'Προμηθευτής Α', 'a@x.gr') : null);

  it('ομαδοποιεί ανά προμηθευτή και αθροίζει το κόστος', () => {
    const g = groupBySupplier(items, supplierOf);
    expect(g).toHaveLength(2);
    expect(g[0].supplier?.trdr).toBe(100);
    expect(g[0].lines).toHaveLength(2);
    expect(g[0].total).toBe(10 * 20 + 5 * 3); // 215
  });

  it('βάζει τον άγνωστο προμηθευτή τελευταίο', () => {
    const g = groupBySupplier(items, supplierOf);
    expect(g[g.length - 1].supplier).toBeNull();
    expect(g[g.length - 1].lines[0].mtrl).toBe(3);
    expect(g[g.length - 1].total).toBe(0); // lastCost null
  });

  it('αγνοεί γραμμές με μη θετική ποσότητα', () => {
    const g = groupBySupplier([{ mtrl: 9, code: null, name: 'X', unit: null, qty: 0, lastCost: 5 }], () => null);
    expect(g).toHaveLength(0);
  });

  it('το κείμενο και το mailto περιέχουν τα είδη και το θέμα', () => {
    const g = groupBySupplier(items, supplierOf)[0];
    const txt = orderText(g, 'ΣΥΜ-001');
    expect(txt).toContain('Παραγγελία υλικών — ΣΥΜ-001');
    expect(txt).toContain('Πλακάκι [A] — 10 m²');
    const url = orderMailto(g, 'ΣΥΜ-001');
    expect(url.startsWith('mailto:a@x.gr?')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Κόλλα');
  });
});
