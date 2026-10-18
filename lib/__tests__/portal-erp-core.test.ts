import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { customerDocKind, customerTotals, orderState, projectState, s1Date, toCustomerDoc } from '../portal-erp-core';

const series = (s: number, code: string) => ({ '1351:7021': 'Παραγγελία', '1351:5062': 'Τιμολόγιο - Δελτίο Αποστολής', '1351:5165': 'Πιστωτικό Τιμολόγιο', '1351:5041': 'Δελτίο Αποστολής', '1351:5001': 'Προσφορά', '1413:1003': 'Έμβασμα από πελάτη' } as Record<string, string>)[`${s}:${code}`] ?? null;
const raw = (o: Record<string, string>) => ({ FINDOC: '1', FINCODE: 'X1', TRNDATE: '2026-02-02 00:00:00', SERIES: '7021', SOSOURCE: '1351', PRJC: '25', NETAMNT: '100', VATAMNT: '24', SUMAMNT: '124', ISCANCEL: '0', FULLYTRANSF: '0', ...o });

describe('παραστατικά πελάτη στο portal', () => {
  it('τύπος από την ονομασία σειράς', () => {
    expect(customerDocKind(1351, 'Παραγγελία')).toBe('order');
    expect(customerDocKind(1351, 'Τιμολόγιο - Δελτίο Αποστολής')).toBe('invoice');
    expect(customerDocKind(1351, 'Αποδειξη Επιστροφης Λιανικής')).toBe('credit');
    expect(customerDocKind(1351, 'Δελτίο Αποστολής')).toBe('delivery');
    expect(customerDocKind(1351, null)).toBe('delivery');
    expect(customerDocKind(1413, 'Έμβασμα από πελάτη')).toBe('payment');
  });

  it('κατάσταση παραγγελίας από FULLYTRANSF', () => {
    expect(orderState('0', false)).toBe('open');
    expect(orderState('2', false)).toBe('partial');
    expect(orderState('1', false)).toBe('done');
    expect(orderState('1', true)).toBe('cancelled');
  });

  it('ΠΟΤΕ αγορές ή πληρωμές προμηθευτών (1251/1412)', () => {
    expect(toCustomerDoc(raw({ SOSOURCE: '1251', SERIES: '8021' }), series)).toBeNull();
    expect(toCustomerDoc(raw({ SOSOURCE: '1412', SERIES: '2002' }), series)).toBeNull();
  });

  it('λευκή λίστα πεδίων: κανένα TRDR/κόστος δεν περνά', () => {
    const d = toCustomerDoc(raw({ TRDR: '11', COST: '50' } as Record<string, string>), series)!;
    expect(Object.keys(d).sort()).toEqual(['cancelled', 'date', 'fincode', 'findoc', 'kind', 'kindLabel', 'net', 'prjc', 'seriesName', 'state', 'stateLabel', 'total', 'vat'].sort());
    expect(d).toMatchObject({ kind: 'order', state: 'open', date: '2026-02-02', prjc: 25, total: 124 });
  });

  it('σύνολα: τιμολόγια − πιστωτικά, πληρωμές, ανοιχτές παραγγελίες· τα ακυρωμένα δεν μετράνε', () => {
    const docs = [
      raw({ FINDOC: '1', SERIES: '5062', SUMAMNT: '1000' }),
      raw({ FINDOC: '2', SERIES: '5165', SUMAMNT: '100' }),
      raw({ FINDOC: '3', SERIES: '5062', SUMAMNT: '999', ISCANCEL: '1' }),
      raw({ FINDOC: '4', SOSOURCE: '1413', SERIES: '1003', SUMAMNT: '600' }),
      raw({ FINDOC: '5', SERIES: '7021', FULLYTRANSF: '0' }),
      raw({ FINDOC: '6', SERIES: '7021', FULLYTRANSF: '1' }),
    ].map((r) => toCustomerDoc(r, series)!);
    expect(customerTotals(docs)).toEqual({ invoiced: 900, paid: 600, openOrders: 1 });
  });

  it('ημερομηνίες & κατάσταση έργου', () => {
    expect(s1Date('2026-02-02 00:00:00')).toBe('2026-02-02');
    expect(s1Date('')).toBeNull();
    expect(projectState({ isActive: true, closeDate: null })).toBe('active');
    expect(projectState({ isActive: true, closeDate: '2026-05-01' })).toBe('completed');
    expect(projectState({ isActive: false, closeDate: null })).toBe('inactive');
  });

  it('το portal πελάτη ΔΕΝ αγγίζει κερδοφορία/κόστος/γενικά έξοδα', () => {
    const roots = ['app/dashboard', 'app/api/portal', 'lib/portal-erp.ts', 'lib/portal-erp-core.ts', 'lib/order-requests.ts'];
    const banned = /project-profit|overheads|last-purchase-price|ProjectFinancials|projectFinancials|OverheadRate|overheadRate|fetchProjectActivity/;
    const offenders: string[] = [];
    const check = (f: string) => { if (/\.tsx?$/.test(f) && banned.test(fs.readFileSync(f, 'utf8'))) offenders.push(f); };
    const walk = (d: string) => {
      if (!fs.statSync(d).isDirectory()) return check(d);
      for (const e of fs.readdirSync(d)) walk(path.join(d, e));
    };
    for (const r of roots) if (fs.existsSync(r)) walk(r);
    expect(offenders).toEqual([]);
  });
});
