import { describe, it, expect } from 'vitest';
import { lastMonths, monthlySeries, monthToDate, totalAgeing, projectsAtRisk, financeTotals, type ProfitLite } from '../finance';

const doc = (date: string, net: number, gross = net) => ({ date: `${date}T00:00:00.000Z`, net, gross });

describe('μήνες', () => {
  it('οι 12 τελευταίοι, με αλλαγή χρονιάς', () => {
    const m = lastMonths('2026-02-15', 4);
    expect(m).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('μηνιαία σειρά', () => {
  const p: ProfitLite[] = [
    { prjc: 1, revenue: { docs: [doc('2026-10-02', 1000), doc('2026-09-30', 500), doc('2024-01-01', 99)] }, costs: { docs: [doc('2026-10-05', 300)] }, collections: { docs: [doc('2026-10-07', 1000, 1240)], ageing: [] } },
    { prjc: 2, revenue: { docs: [doc('2026-10-20', -200)] }, costs: { docs: [] }, collections: { docs: [], ageing: [] } },
  ];
  const s = monthlySeries(p, '2026-10-18', 12);

  it('αθροίζει ανά μήνα, πιστωτικά αρνητικά, εκτός παραθύρου αγνοούνται', () => {
    expect(s).toHaveLength(12);
    expect(s.at(-1)).toMatchObject({ month: '2026-10', label: 'Οκτ 26', revenue: 800, costs: 300, collected: 1240 });
    expect(s.at(-2)).toMatchObject({ month: '2026-09', revenue: 500 });
    expect(s.reduce((a, x) => a + x.revenue, 0)).toBe(1300);
  });

  it('έργο χωρίς docs (παλιό στιγμιότυπο) δεν σκάει', () => {
    expect(() => monthlySeries([{ prjc: 3 } as unknown as ProfitLite], '2026-10-18')).not.toThrow();
  });
});

describe('ενηλικίωση & σύνολα', () => {
  it('αθροίζει τους κάδους όλων των έργων', () => {
    const a = totalAgeing([
      { prjc: 1, revenue: { docs: [] }, costs: { docs: [] }, collections: { docs: [], ageing: [{ label: '0–30 ημ.', amount: 10 }, { label: '> 90 ημ.', amount: 5 }] } },
      { prjc: 2, revenue: { docs: [] }, costs: { docs: [] }, collections: { docs: [], ageing: [{ label: '0–30 ημ.', amount: 2.5 }] } },
    ]);
    expect(a).toEqual([{ label: '0–30 ημ.', amount: 12.5 }, { label: '> 90 ημ.', amount: 5 }]);
  });

  it('περιθώριο = καθαρό / έσοδα, null χωρίς έσοδα', () => {
    expect(financeTotals([{ revenue: 1000, collected: 0, openAmount: 0, costs: 0, overhead: 0, netProfit: 150 }]).marginPct).toBe(15);
    expect(financeTotals([]).marginPct).toBeNull();
  });
});

describe('έργα σε κίνδυνο', () => {
  const names = new Map([[1, { code: 'Ε1', name: 'Α' }], [2, { code: 'Ε2', name: 'Β' }], [3, { code: 'Ε3', name: 'Γ' }], [4, { code: 'Ε4', name: 'Δ' }]]);
  const rows = [
    { prjc: 1, revenue: 1000, costs: 1200, netProfit: -200, marginPct: -20, issues: 0 },
    { prjc: 2, revenue: 1000, costs: 950, netProfit: 50, marginPct: 5, issues: 2 },
    { prjc: 3, revenue: 1000, costs: 500, netProfit: 500, marginPct: 50, issues: 0 },
    { prjc: 4, revenue: 0, costs: 300, netProfit: -300, marginPct: null, issues: 0 },
    { prjc: 9, revenue: 0, costs: 9, netProfit: -9, marginPct: null, issues: 0 }, // ανενεργό/άγνωστο έργο
  ];

  it('ζημιά, χαμηλό περιθώριο, ελλείψεις — τα υγιή και τα άγνωστα έξω', () => {
    const r = projectsAtRisk(rows, names);
    expect(r.map((x) => x.prjc)).toEqual([4, 1, 2]);
    expect(r[0].reasons).toEqual(['no-revenue']);
    expect(r[2].reasons).toEqual(['low-margin', 'issues']);
  });
});

describe('μήνας μέχρι σήμερα', () => {
  it('συγκρίνει με το ίδιο διάστημα του προηγούμενου μήνα', () => {
    const p: ProfitLite[] = [{ prjc: 1, revenue: { docs: [doc('2026-10-05', 100), doc('2026-09-10', 40), doc('2026-09-25', 999)] }, costs: { docs: [] }, collections: { docs: [doc('2026-10-18', 10, 12)], ageing: [] } }];
    expect(monthToDate(p, '2026-10-18')).toEqual({ cur: { revenue: 100, collected: 12 }, prev: { revenue: 40, collected: 0 } });
  });

  it('προκαταβολές χωριστά από το ανοιχτό υπόλοιπο', () => {
    const t = financeTotals([
      { revenue: 0, collected: 0, openAmount: 500, costs: 0, overhead: 0, netProfit: 0 },
      { revenue: 0, collected: 0, openAmount: -200, costs: 0, overhead: 0, netProfit: 0 },
    ]);
    expect([t.open, t.advances]).toEqual([500, 200]);
  });
});
