import { describe, expect, it } from 'vitest';
import { overheadRateFor } from '../overheads-resolve';
import {
  ageOpenInvoices, buildContext, computeProject, projectShare, SUPPLIER_SPECIAL,
  CUSTOMER_REMITTANCES, PURCHASES, SALES, STORE, SUPPLIER_REMITTANCES,
  type FinDoc, type FinLine, type ProjectRef,
} from '../project-profit/calc';
import { detectIssues, issueFingerprint } from '../project-profit/issues';

let next = 1;
const doc = (o: Partial<FinDoc> & Pick<FinDoc, 'sosource'>): FinDoc => {
  const net = o.net ?? 0;
  return {
    findoc: o.findoc ?? next++, fincode: o.fincode ?? `D${next}`, date: o.date ?? '2026-05-01T00:00:00.000Z',
    series: o.series ?? '1', seriesName: o.seriesName === undefined ? 'Τιμολόγιο' : o.seriesName, kind: o.kind ?? 'invoice',
    trdr: o.trdr ?? null, traderName: o.traderName ?? null, prjc: o.prjc ?? null,
    net, vat: o.vat ?? net * 0.24, total: o.total ?? net * 1.24, cancelled: o.cancelled ?? false, sosource: o.sosource,
  };
};
const line = (o: Partial<FinLine> & Pick<FinLine, 'findoc'>): FinLine => ({
  mtrl: 1, prjc: null, qty: 1, value: 0, isService: false, sourceFindoc: null, ...o,
});
const ASOF = '2026-10-17T00:00:00.000Z';

describe('γενικά έξοδα — επίλυση ποσοστού', () => {
  const rates = [
    { validFrom: '2026-01-01', validTo: null, percent: 10, category: null },
    { validFrom: '2026-07-01', validTo: null, percent: 12, category: null },
    { validFrom: '2026-01-01', validTo: '2026-12-31', percent: 5, category: 'cost:services' },
  ];
  it('η πιο πρόσφατη γενική περίοδος κερδίζει', () => {
    expect(overheadRateFor(rates, '2026-03-10', 'cost:materials').percent).toBe(10);
    expect(overheadRateFor(rates, '2026-08-10', 'cost:materials').percent).toBe(12);
  });
  it('η παράκαμψη κατηγορίας προηγείται της γενικής', () => {
    expect(overheadRateFor(rates, '2026-08-10', 'cost:services').percent).toBe(5);
  });
  it('εκτός περιόδου ⇒ 0%, χωρίς μαντεψιά', () => {
    expect(overheadRateFor(rates, '2025-12-31', 'cost:materials').percent).toBe(0);
    expect(overheadRateFor([], null, null).percent).toBe(0);
  });
});

describe('μερίδιο παραστατικού στο έργο', () => {
  it('κεφαλή με το έργο ⇒ όλο, μείον γραμμές άλλου έργου', () => {
    const d = doc({ sosource: SALES, prjc: 7, net: 1000, total: 1240 });
    const s = projectShare(d, [line({ findoc: d.findoc, value: 700 }), line({ findoc: d.findoc, value: 300, prjc: 8 })], 7);
    expect(s.net).toBe(700);
    expect(s.partial).toBe(true);
    expect(s.gross).toBeCloseTo(868);
  });
  it('έργο μόνο σε γραμμή ⇒ μόνο η γραμμή', () => {
    const d = doc({ sosource: PURCHASES, net: 1000 });
    const s = projectShare(d, [line({ findoc: d.findoc, value: 250, prjc: 7 }), line({ findoc: d.findoc, value: 750 })], 7);
    expect(s.net).toBe(250);
    expect(s.lines).toHaveLength(1);
  });
});

describe('ενηλικίωση ανοιχτού υπολοίπου (FIFO)', () => {
  it('οι εισπράξεις εξοφλούν τα παλαιότερα πρώτα', () => {
    const b = ageOpenInvoices([
      { date: '2026-01-01', gross: 1000 },
      { date: '2026-10-01', gross: 500 },
    ], 1200, ASOF);
    expect(b.find((x) => x.label === '0–30 ημ.')!.amount).toBe(300);
    expect(b.find((x) => x.label === '> 90 ημ.')!.amount).toBe(0);
  });
});

describe('κερδοφορία έργου', () => {
  const P = 7;
  const sale = doc({ sosource: SALES, prjc: P, net: 10000, total: 12400, date: '2026-06-01T00:00:00.000Z' });
  const credit = doc({ sosource: SALES, prjc: P, kind: 'credit', net: 1000, total: 1240 });
  const order = doc({ sosource: SALES, prjc: P, kind: 'order', net: 99999 });
  const cancelled = doc({ sosource: SALES, prjc: P, net: 5000, cancelled: true });
  const purchase = doc({ sosource: PURCHASES, prjc: P, net: 4000, total: 4960, date: '2026-04-01T00:00:00.000Z' });
  const service = doc({ sosource: PURCHASES, prjc: P, net: 2000, total: 2480, date: '2026-08-01T00:00:00.000Z' });
  const receipt = doc({ sosource: CUSTOMER_REMITTANCES, prjc: P, net: 8000, total: 8000 });
  const refund = doc({ sosource: CUSTOMER_REMITTANCES, prjc: P, kind: 'credit', net: 500, total: 500 });
  const payment = doc({ sosource: SUPPLIER_REMITTANCES, prjc: P, net: 3000, total: 3000 });
  const lines: FinLine[] = [
    line({ findoc: sale.findoc, mtrl: 100, qty: 10, value: 6000 }),
    line({ findoc: sale.findoc, mtrl: 200, qty: 1, value: 4000, isService: true }),
    line({ findoc: credit.findoc, mtrl: 200, qty: 1, value: 1000, isService: true }),
    line({ findoc: purchase.findoc, mtrl: 100, qty: 6, value: 3800 }), // +200 μεταφορικά παραστατικού
    line({ findoc: service.findoc, mtrl: 300, qty: 1, value: 2000, isService: true }),
  ];
  const rates = [
    { validFrom: '2026-01-01', validTo: null, percent: 10, category: null },
    { validFrom: '2026-01-01', validTo: null, percent: 0, category: 'cost:services' },
  ];
  const ctx = buildContext({
    docs: [sale, credit, order, cancelled, purchase, service, receipt, refund, payment],
    lines, lastCost: new Map([[100, 600]]), rates, asOf: ASOF,
  });
  const r = computeProject(P, ctx, 9000);

  it('έσοδα: τιμολόγια − πιστωτικά, χωρίς παραγγελίες/ακυρωμένα', () => {
    expect(r.revenue.invoiced).toBe(10000);
    expect(r.revenue.credits).toBe(1000);
    expect(r.revenue.net).toBe(9000);
    expect(r.revenue.gross).toBe(11160);
    expect(r.revenue.docs).toHaveLength(2);
  });
  it('εισπράξεις: εμβάσματα − επιστροφές, ανοιχτό = μικτά − εισπραγμένα', () => {
    expect(r.collections.collected).toBe(7500);
    expect(r.collections.open).toBe(3660);
    expect(r.collections.ageing.reduce((s, b) => s + b.amount, 0)).toBeCloseTo(3660);
  });
  it('κόστος ανά κατηγορία + εκτίμηση αποθέματος για ό,τι πουλήθηκε χωρίς αγορά', () => {
    expect(r.costs.byCategory.materials).toBe(3800);
    expect(r.costs.byCategory.other).toBe(200);
    expect(r.costs.byCategory.services).toBe(2000);
    // πουλήθηκαν 10, αγοράστηκαν 6 στο έργο ⇒ 4 × 600 από απόθεμα (εκτίμηση)
    expect(r.costs.byCategory.stock).toBe(2400);
    expect(r.costs.stock).toEqual([{ mtrl: 100, qty: 4, unitCost: 600, value: 2400, source: 'estimate', salesUnit: 600 }]);
    expect(r.costs.total).toBe(8400);
  });
  it('γενικά έξοδα: 10% εκτός από τις υπηρεσίες (παράκαμψη 0%)', () => {
    expect(r.overhead.total).toBe(640); // 10% × (3800 + 200 + 2400)
    expect(r.overhead.lines.every((l) => l.category !== 'services')).toBe(true);
  });
  it('καθαρό κέρδος, περιθώριο, ταμειακή εικόνα, προϋπολογισμός', () => {
    expect(r.netProfit).toBe(-40); // 9000 − 8400 − 640
    expect(r.marginPct).toBeCloseTo(-0.44);
    expect(r.payments.paid).toBe(3000);
    expect(r.cash).toBe(4500);
    expect(r.budget.costVsBudget).toBe(-600);
  });
  it('εξαγωγή αποθήκης με το έργο μετρά σε τελευταίο κόστος και μειώνει την εκτίμηση', () => {
    const issue = doc({ sosource: STORE, prjc: P, net: 0, total: 0, seriesName: 'Εξαγωγή ποσότητας' });
    const c2 = buildContext({
      docs: [sale, purchase, issue], lines: [...lines.slice(0, 2), lines[3], line({ findoc: issue.findoc, mtrl: 100, qty: 4 })],
      lastCost: new Map([[100, 600]]), asOf: ASOF,
    });
    const r2 = computeProject(P, c2);
    expect(r2.costs.stock).toEqual([{ mtrl: 100, qty: 4, unitCost: 600, value: 2400, source: 'issue' }]);
  });
  it('απίθανη εκτίμηση (κόστος > 2× τιμή πώλησης) δεν μετρά — σημαδεύεται', () => {
    const c3 = buildContext({ docs: [sale], lines: [lines[0]], lastCost: new Map([[100, 2000]]), asOf: ASOF });
    const r3 = computeProject(P, c3);
    expect(r3.costs.stock[0]).toMatchObject({ suspect: true, value: 0, unitCost: 2000 });
    expect(r3.costs.total).toBe(0);
    const iss = detectIssues(c3, [{ prjc: P, code: 'P7', name: 'Χ', trdr: null, since: null }], new Map([[P, r3]]));
    expect(iss.find((i) => i.key === `stock-estimate:${P}`)!.detail).toContain('ΔΕΝ μετρήθηκε');
  });
  it('χωρίς έσοδα ⇒ περιθώριο null', () => {
    expect(computeProject(999, ctx).marginPct).toBeNull();
  });
});

describe('δεδομένα που λείπουν', () => {
  const projects: ProjectRef[] = [
    { prjc: 1, code: 'P1', name: 'Έργο Α', trdr: 50, since: '2026-03-01T00:00:00.000Z' },
    { prjc: 2, code: 'P2', name: 'Έργο Β', trdr: 60, since: null },
  ];
  const linked = doc({ sosource: SALES, prjc: 1, trdr: 50, net: 1000, date: '2026-04-01T00:00:00.000Z', series: '5061', seriesName: 'Τιμολόγιο' });
  const unlinked = doc({ sosource: SALES, trdr: 50, traderName: 'Πελάτης Α', net: 2000, date: '2026-05-01T00:00:00.000Z', series: '5061', seriesName: 'Τιμολόγιο' });
  const old = doc({ sosource: SALES, trdr: 50, net: 300, date: '2025-01-01T00:00:00.000Z', series: '5061' });
  const remit = doc({ sosource: CUSTOMER_REMITTANCES, trdr: 50, traderName: 'Πελάτης Α', net: 500, total: 500, date: '2026-05-02T00:00:00.000Z' });
  const order = doc({ sosource: PURCHASES, prjc: 2, trdr: 70, kind: 'order', net: 800 });
  const fromOrder = doc({ sosource: PURCHASES, trdr: 70, traderName: 'Προμηθευτής', net: 800 });
  const otherSupplierInv = doc({ sosource: PURCHASES, trdr: 70, traderName: 'Προμηθευτής', net: 150 });
  const unknownSeries = doc({ sosource: SALES, prjc: 2, net: 100, series: '7061', seriesName: null });
  const lines = [line({ findoc: fromOrder.findoc, sourceFindoc: order.findoc, value: 800 })];
  const ctx = buildContext({ docs: [linked, unlinked, old, remit, order, fromOrder, otherSupplierInv, unknownSeries], lines, asOf: ASOF });
  const profits = new Map(projects.map((p) => [p.prjc, computeProject(p.prjc, ctx)]));
  const issues = detectIssues(ctx, projects, profits);
  const byKey = new Map(issues.map((i) => [i.key, i]));

  it('πωλήσεις πελάτη με έργο, χωρίς έργο — μόνο από την έναρξη του έργου, ΔΕΝ μετρούν στα έσοδα', () => {
    const i = byKey.get('sales-no-project:50')!;
    expect(i.audience).toBe('accountant');
    expect(i.prjcs).toEqual([1]);
    expect(i.docs.map((d) => d.findoc)).toEqual([unlinked.findoc]);
    expect(i.detail).toContain('Έργο');
    expect(profits.get(1)!.revenue.net).toBe(1000);
  });
  it('εμβάσματα πελάτη χωρίς έργο', () => {
    expect(byKey.get('receipts-no-project:50')!.amount).toBe(500);
  });
  it('τιμολόγιο από παραγγελία έργου χωρίς έργο ⇒ ισχυρό θέμα, όχι διπλό με «αγορές χωρίς έργο»', () => {
    expect(byKey.get('from-order:2')!.docs.map((d) => d.findoc)).toEqual([fromOrder.findoc]);
    expect(byKey.get('purchases-no-project:70')!.docs.map((d) => d.findoc)).toEqual([otherSupplierInv.findoc]);
  });
  it('έσοδα χωρίς κόστος', () => {
    expect(byKey.has('no-costs:1')).toBe(true);
  });
  it('integrator: άγνωστες σειρές και «Έργο» που λείπει σε σειρές', () => {
    expect(byKey.get('unknown-series')!.audience).toBe('integrator');
    const f = byKey.get('project-field-optional')!;
    expect(f.rows!.some((r) => r.includes('5061'))).toBe(true);
    expect(f.detail).toContain('μετασχηματισμούς');
  });
  it('το αποτύπωμα αλλάζει όταν αλλάζουν τα παραστατικά', () => {
    const a = issueFingerprint({ docs: [{ findoc: 1, fincode: 'a', date: null, amount: 1 }], amount: 1 });
    const b = issueFingerprint({ docs: [{ findoc: 1, fincode: 'a', date: null, amount: 1 }, { findoc: 2, fincode: 'b', date: null, amount: 1 }], amount: 2 });
    expect(a).not.toBe(b);
    expect(issueFingerprint({ docs: [{ findoc: 1, fincode: 'x', date: null, amount: 9 }], amount: 9 })).toBe(a);
  });
});

describe('δαπάνες (ειδικές συναλλαγές) — π.χ. αεροπορικό εισιτήριο σε δύο έργα', () => {
  it('κάθε γραμμή χρεοπίστωσης μετρά στο έργο της, ως «Δαπάνες»', () => {
    // Ένα «Τιμολόγιο Δαπανών» (1253) 400 € χωρίς έργο στην κεφαλή, δύο γραμμές «Έξοδα Ταξιδίων» 50/50.
    const ticket = { findoc: 9001, fincode: 'ΤΔ-1', date: '2026-10-10T00:00:00.000Z', sosource: SUPPLIER_SPECIAL, series: '1001', seriesName: 'Τιμολόγιο Δαπανών', kind: 'invoice' as const,
      trdr: 5, traderName: 'Aegean', prjc: null, net: 400, vat: 0, total: 400, cancelled: false };
    const lines = [
      { findoc: 9001, mtrl: 57, prjc: 1, qty: 1, value: 200, isService: false, isExpense: true, sourceFindoc: null },
      { findoc: 9001, mtrl: 57, prjc: 2, qty: 1, value: 200, isService: false, isExpense: true, sourceFindoc: null },
    ];
    const ctx = buildContext({ docs: [ticket], lines, rates: [{ validFrom: '2026-01-01', validTo: null, percent: 10, category: null }], asOf: '2026-10-18T00:00:00.000Z' });
    for (const p of [1, 2]) {
      const r = computeProject(p, ctx);
      expect(r.costs.byCategory.expenses).toBe(200);
      expect(r.costs.byCategory.materials).toBe(0);
      expect(r.costs.total).toBe(200);
      expect(r.costs.docs[0]).toMatchObject({ fincode: 'ΤΔ-1', partial: true, net: 200 });
      expect(r.overhead.total).toBe(20);
    }
  });
});
