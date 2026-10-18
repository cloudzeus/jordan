// lib/softone-mirror/__tests__/core.test.ts — η καθαρή λογική του καθρέφτη SoftOne: watermark, φίλτρο
// «άλλαξε από τότε», μετατροπές γραμμών (μονόδρομα και πίσω), σχέδιο συμφωνίας, φρεσκάδα.
import { describe, it, expect } from 'vitest';
import {
  s1Stamp, s1DateTime, stampOf, maxStamp, sinceOf, changedSinceFilter, nextWatermark, chunk,
  mapFindoc, findocRow, mapMtrLine, mtrLineRow, mapMyData, myDataRow, mapTrdLine, trdLineRow, mapBalance,
  planReconcile, mirrorUsable, onlyChanged, reconcileDue, sameData, planWrites, STALE_MS,
} from '../core';

describe('watermark', () => {
  it('κανονικοποιεί τις μορφές ημερομηνίας του SoftOne', () => {
    expect(s1Stamp('2026-10-16 09:31:54')).toBe('2026-10-16 09:31:54');
    expect(s1Stamp('2026-10-16T09:31')).toBe('2026-10-16 09:31:00');
    expect(s1Stamp('2026-10-16')).toBe('2026-10-16 00:00:00');
    expect(s1Stamp('')).toBeNull();
    expect(s1Stamp(null)).toBeNull();
    expect(s1Stamp('16/10/2026')).toBeNull();
  });

  it('η ώρα SoftOne διατηρεί τα ψηφία της σε UTC — και γυρίζει πίσω ίδια', () => {
    const d = s1DateTime('2026-10-16 09:31:54')!;
    expect(d.toISOString()).toBe('2026-10-16T09:31:54.000Z');
    expect(stampOf(d)).toBe('2026-10-16 09:31:54');
    expect(stampOf(null)).toBe('');
  });

  it('το μεγαλύτερο watermark κερδίζει, το null δεν «μηδενίζει»', () => {
    expect(maxStamp('2026-10-16 09:00:00', '2026-10-16 10:00:00')).toBe('2026-10-16 10:00:00');
    expect(maxStamp('2026-10-17 00:00:00', '2026-10-16 23:59:59')).toBe('2026-10-17 00:00:00');
    expect(maxStamp(null, '2026-10-16 10:00:00')).toBe('2026-10-16 10:00:00');
    expect(maxStamp('2026-10-16 10:00:00', '')).toBe('2026-10-16 10:00:00');
    expect(maxStamp(null, null)).toBeNull();
  });

  it('ρωτάμε από watermark − overlap, σε ISO για CONVERT(…,126)', () => {
    expect(sinceOf('2026-10-16 09:31:54')).toBe('2026-10-16T08:31:54');
    expect(sinceOf('2026-10-16 00:10:00', 30)).toBe('2026-10-15T23:40:00');
    expect(sinceOf(null)).toBeNull();
  });

  it('το φίλτρο πιάνει UPDDATE ή INSDATE και αρνείται ό,τι δεν είναι ISO', () => {
    expect(changedSinceFilter('2026-10-16T08:31:54')).toBe(
      "(UPDDATE >= CONVERT(datetime,'2026-10-16T08:31:54',126) OR INSDATE >= CONVERT(datetime,'2026-10-16T08:31:54',126))",
    );
    expect(changedSinceFilter('2026-10-16T08:31:54', false)).toBe("UPDDATE >= CONVERT(datetime,'2026-10-16T08:31:54',126)");
    expect(() => changedSinceFilter("2026-10-16'; DROP TABLE x--")).toThrow();
  });

  it('το νέο watermark είναι το μέγιστο UPDDATE που γύρισε — ή μένει το παλιό', () => {
    expect(nextWatermark('2026-10-16 09:00:00', [{ UPDDATE: '2026-10-16 08:59:00' }, { UPDDATE: '2026-10-16 09:45:00' }, { UPDDATE: '' }]))
      .toBe('2026-10-16 09:45:00');
    expect(nextWatermark('2026-10-16 09:00:00', [])).toBe('2026-10-16 09:00:00');
    // Η επικάλυψη ξαναφέρνει παλαιότερα — το watermark ΔΕΝ πάει πίσω.
    expect(nextWatermark('2026-10-16 09:00:00', [{ UPDDATE: '2026-10-16 08:30:00' }])).toBe('2026-10-16 09:00:00');
  });

  it('chunk', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('μετατροπές γραμμών', () => {
  const head = {
    FINDOC: '1703', FINCODE: 'ΤΔΑ0042', TRNDATE: '2026-10-16 00:00:00', SERIES: '7061', SOSOURCE: '1351', TRDR: '142', PRJC: '',
    NETAMNT: '100.5', VATAMNT: '24.12', SUMAMNT: '124.62', DISC1PRC: '0', DISC1VAL: '-2', ISCANCEL: '0',
    COMMENTS: ' σχόλιο ', COMMENTS1: '', REMARKS: '', INSDATE: '2026-10-16 12:00:37', UPDDATE: '2026-10-16 09:31:54',
  };

  it('κεφαλή: κενό PRJC = null, ποσά αριθμοί, ημερομηνία σε 00:00 UTC', () => {
    const d = mapFindoc(head)!;
    expect(d).toMatchObject({ findoc: 1703, trdr: 142, prjc: null, net: 100.5, total: 124.62, disc1Val: -2, isCancel: 0, comments: 'σχόλιο', updRaw: '2026-10-16 09:31:54' });
    expect(d.trnDate!.toISOString()).toBe('2026-10-16T00:00:00.000Z');
    expect(d.insDate!.toISOString()).toBe('2026-10-16T12:00:37.000Z');
  });

  it('κεφαλή: ο καθρέφτης ξαναδίνει τα ΙΔΙΑ ψηφία που θα έδινε το GetTable', () => {
    const back = findocRow(mapFindoc(head)!);
    expect(back).toMatchObject({ FINDOC: '1703', TRDR: '142', PRJC: '', NETAMNT: '100.5', TRNDATE: '2026-10-16 00:00:00', INSDATE: '2026-10-16 12:00:37', UPDDATE: '2026-10-16 09:31:54', COMMENTS: 'σχόλιο' });
  });

  it('γραμμή χωρίς κλειδί απορρίπτεται, αλλιώς πάει-έρχεται', () => {
    expect(mapFindoc({ FINDOC: '' })).toBeNull();
    expect(mapMtrLine({ FINDOC: '5', MTRLINES: '' })).toBeNull();
    const l = mapMtrLine({ FINDOC: '5', MTRLINES: '2', LINENUM: '2', MTRL: '377', QTY1: '3', LINEVAL: '30', VAT: '1410', PRJC: '18', SODTYPE: '51', FINDOCS: '' })!;
    expect(l).toMatchObject({ findoc: 5, mtrlines: 2, mtrl: 377, qty1: 3, lineVal: 30, vat: '1410', prjc: 18, sodtype: 51, findocs: null });
    expect(mtrLineRow(l)).toMatchObject({ FINDOC: '5', MTRL: '377', QTY1: '3', LINEVAL: '30', PRJC: '18', FINDOCS: '' });
  });

  it('myDATA, εμβάσματα, υπόλοιπα', () => {
    const m = mapMyData({ MYDATAHEADER: '1336', SOID: '438', SOSOURCE: '1351', MARK: '400010116761139', ISCANCEL: '0', UPDDATE: '2025-07-10 10:43:45' })!;
    expect(myDataRow(m)).toMatchObject({ SOID: '438', MARK: '400010116761139', ISCANCEL: '0' });
    const t = mapTrdLine({ FINDOC: '127', TRDTLINES: '1', TRDR: '92', LINEVAL: '1255.5', PRJC: '' })!;
    expect(trdLineRow(t)).toMatchObject({ FINDOC: '127', TRDR: '92', LINEVAL: '1255.5', PRJC: '' });
    expect(mapBalance({ TRDR: '1', FISCPRD: '2019', PERIOD: '3', LDEBIT: '10', LCREDIT: '0' })).toEqual({ trdr: 1, fiscPrd: 2019, period: 3, debit: 10, credit: 0 });
  });
});

describe('αυξητικό: μόνο ό,τι άλλαξε', () => {
  it('νέα και αλλαγμένα περνούν, τα ίδια (επικάλυψη) όχι', () => {
    const local = new Map<number, string | null>([[1, '2026-10-16 09:00:00'], [2, '2026-10-16 09:10:00']]);
    const rows = [
      { id: 1, updRaw: '2026-10-16 09:00:00' }, // ίδιο — ήρθε λόγω overlap
      { id: 2, updRaw: '2026-10-16 09:20:00' }, // άλλαξε (π.χ. ακύρωση)
      { id: 3, updRaw: '2026-10-16 09:30:00' }, // νέο
    ];
    expect(onlyChanged(rows, local, (r) => r.id).map((r) => r.id)).toEqual([2, 3]);
  });

  it('upsert: νέα → create, διαφορετικά → update, ίδια → τίποτα (και οι ημερομηνίες συγκρίνονται σωστά)', () => {
    const local = new Map<number, Record<string, unknown>>([
      [1, { name: 'Α', fromDate: new Date('2026-01-01T00:00:00Z'), extra: 'x' }],
      [2, { name: 'Β', fromDate: null }],
    ]);
    const w = planWrites([
      { key: 1, data: { name: 'Α', fromDate: new Date('2026-01-01T00:00:00Z') } },
      { key: 2, data: { name: 'Β2', fromDate: null } },
      { key: 3, data: { name: 'Γ', fromDate: null } },
    ], local);
    expect(w.same).toBe(1);
    expect(w.update.map((x) => x.key)).toEqual([2]);
    expect(w.create.map((x) => x.key)).toEqual([3]);
    expect(sameData(undefined, { a: 1 })).toBe(false);
    expect(sameData({ a: null }, { a: undefined })).toBe(true);
  });
});

describe('νυχτερινή συμφωνία', () => {
  const ids = (n: number, upd = '2026-01-01 00:00:00') => Array.from({ length: n }, (_, i) => ({ id: i + 1, upd }));

  it('σβήνει ό,τι χάθηκε, ξαναφέρνει νέα/αλλαγμένα', () => {
    const local = ids(30);
    const remote = ids(30).filter((r) => r.id !== 7).map((r) => (r.id === 3 ? { ...r, upd: '2026-02-01 00:00:00' } : r));
    remote.push({ id: 31, upd: '2026-02-02 00:00:00' });
    expect(planReconcile(remote, local)).toEqual({ toDelete: [7], toFetch: [3, 31], abort: null });
  });

  it('άδεια απάντηση δεν αδειάζει τον καθρέφτη', () => {
    const p = planReconcile([], ids(5));
    expect(p.abort).toMatch(/καμία εγγραφή/);
    expect(p.toDelete).toEqual([]);
  });

  it('πάνω από 20% διαγραφές = ύποπτο, ακύρωση', () => {
    const p = planReconcile(ids(100).slice(0, 70), ids(100));
    expect(p.abort).toMatch(/όριο ασφαλείας/);
    expect(p.toDelete).toEqual([]);
  });

  it('πρώτη φόρτωση: όλα προς λήψη', () => {
    expect(planReconcile(ids(3), [])).toEqual({ toDelete: [], toFetch: [1, 2, 3], abort: null });
  });

  it('τρέχει τη νύχτα (Αθήνα 02–05) ή όταν λείπει πάνω από 36 ώρες', () => {
    expect(reconcileDue(null)).toBe(true);
    const at = (iso: string) => new Date(iso);
    // 03:30 Αθήνας (θερινή, UTC+3) = 00:30 UTC
    expect(reconcileDue(at('2026-10-17T23:00:00Z'), at('2026-10-19T00:30:00Z'))).toBe(true);
    // 15:00 Αθήνας, 24 ώρες μετά — περιμένει τη νύχτα
    expect(reconcileDue(at('2026-10-18T12:00:00Z'), at('2026-10-19T12:00:00Z'))).toBe(false);
    // 37 ώρες — γίνεται ό,τι ώρα κι αν είναι
    expect(reconcileDue(at('2026-10-17T23:00:00Z'), at('2026-10-19T12:00:00Z'))).toBe(true);
    // ήδη έγινε απόψε
    expect(reconcileDue(at('2026-10-19T00:00:00Z'), at('2026-10-19T00:30:00Z'))).toBe(false);
  });
});

describe('φρεσκάδα', () => {
  const now = Date.parse('2026-10-19T10:00:00Z');
  const st = (minAgo: number, extra: Partial<{ tenantKey: string; rows: number }> = {}) => ({
    tenantKey: 'T', rows: 10, watermark: null, lastOkAt: new Date(now - minAgo * 60_000), ...extra,
  });
  it('φρέσκος / παλιός / κενός / άλλης εγκατάστασης', () => {
    expect(mirrorUsable(st(5), 'T', now)).toBe('fresh');
    expect(mirrorUsable(st(STALE_MS / 60_000 + 1), 'T', now)).toBe('stale');
    expect(mirrorUsable(st(5, { rows: 0 }), 'T', now)).toBe('none');
    expect(mirrorUsable(st(5, { tenantKey: 'ΑΛΛΟΣ' }), 'T', now)).toBe('none');
    expect(mirrorUsable(null, 'T', now)).toBe('none');
    expect(mirrorUsable({ ...st(5), lastOkAt: null }, 'T', now)).toBe('none');
  });
});
