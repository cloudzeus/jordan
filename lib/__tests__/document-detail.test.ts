import { describe, expect, it } from 'vitest';
import { lineTotals, parseLines, vatPercent } from '../document-detail-core';

// Γραμμή όπως την επιστρέφει ζωντανά το GetTable MTRLINES (ΤΙΜΚ000018, 2026-10-18).
const raw = {
  MTRLINES: '1', LINENUM: '1', MTRL: '224', QTY1: '1000', QTY: '1000', MTRUNIT: '125', PRICE: '3.5',
  DISC1PRC: '4.5714286', DISC2PRC: '0', DISC1VAL: '160', LINEVAL: '3340', NETLINEVAL: '3460',
  VAT: '1410', VATAMNT: '830.4', COMMENTS: '', COMMENTS1: '', PRJC: '13', SODTYPE: '51', FINDOCS: '447',
};
const lookups = {
  items: new Map([[224, { code: '0000117', name: 'ΕΓΧΡΩΜΟ ΑΣΒΕΣΤΟΧΡΩΜΑ', isService: false }]]),
  units: new Map([['125', 'Τετραγωνικά μέτρα']]),
  vatRates: new Map<string, number | null>(),
};

describe('γραμμές παραστατικού', () => {
  it('είδος, μονάδα, τιμή, έκπτωση, καθαρή αξία, ΦΠΑ, έργο, προέλευση', () => {
    const [l] = parseLines([raw], lookups);
    expect(l).toMatchObject({
      lineNo: 1, mtrl: 224, code: '0000117', name: 'ΕΓΧΡΩΜΟ ΑΣΒΕΣΤΟΧΡΩΜΑ', isService: false, qty: 1000, unit: 'Τετραγωνικά μέτρα',
      price: 3.5, discPct: 4.57, value: 3340, net: 3460, vatPct: 24, vatAmount: 830.4, prjc: 13, sourceFindoc: 447,
    });
  });
  it('ΦΠΑ από το μητρώο όταν ο κωδικός είναι γνωστός, αλλιώς από τα ποσά', () => {
    expect(vatPercent('1410', 830.4, 3460, new Map([['1410', 24]]))).toBe(24);
    expect(vatPercent('1', 13, 100, new Map())).toBe(13);
    expect(vatPercent(undefined, 0, 0, new Map())).toBeNull();
  });
  it('άγνωστο είδος / υπηρεσία από SODTYPE, ταξινόμηση κατά γραμμή, σύνολα', () => {
    const lines = parseLines([
      { ...raw, LINENUM: '2', MTRL: '999', SODTYPE: '52', NETLINEVAL: '100', VATAMNT: '24', COMMENTS1: 'εργασία' },
      raw,
    ], lookups);
    expect(lines.map((l) => l.lineNo)).toEqual([1, 2]);
    expect(lines[1]).toMatchObject({ name: 'Είδος #999', isService: true, comments: 'εργασία' });
    expect(lineTotals(lines)).toEqual({ net: 3560, vat: 854.4 });
  });
});
