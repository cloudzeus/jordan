import { describe, expect, it } from 'vitest';
import {
  changeLevel, level2Options, level3Options, selectionFromLeaf, selectionFromSoftone, selectionLabel, softoneValues,
  type ClassRow,
} from '@/lib/trader-class-select';

// Μικρό δέντρο προμηθευτών: 1 εσωτερικού, 2 ΕΕ · 10 υλικά (υπό 1) · 100 πλακάκια, 101 πέτρα (υπό 10)
// · 11 μεταφορές (υπό 1) · 110 μεταφορές.
const rows: ClassRow[] = [
  { id: 1, key: 'S1_DOMESTIC', level: 1, code: 'ΠΕΣ', name: 'Προμηθευτές εσωτερικού', parentId: null, softoneId: 1 },
  { id: 2, key: 'S1_EU', level: 1, code: 'ΠΕΕ', name: 'Προμηθευτές ΕΕ', parentId: null, softoneId: 2 },
  { id: 10, key: 'S2_MATERIALS', level: 2, code: 'ΥΛΙ', name: 'Δομικά υλικά', parentId: 1, softoneId: 5 },
  { id: 11, key: 'S2_LOGISTICS', level: 2, code: 'ΜΕΤ', name: 'Μεταφορές', parentId: 1, softoneId: null },
  { id: 100, key: 'S3_TILES', level: 3, code: 'ΠΛΑ', name: 'Πλακάκια', parentId: 10, softoneId: 7 },
  { id: 101, key: 'S3_STONE', level: 3, code: 'ΠΕΤ', name: 'Πέτρα', parentId: 10, softoneId: null },
  { id: 110, key: 'S3_TRANSPORT', level: 3, code: 'ΜΕΤ', name: 'Μεταφορές', parentId: 11, softoneId: null },
];
const ids = (r: ClassRow[]) => r.map((x) => x.id);

describe('επιλογές ανά επίπεδο', () => {
  it('επ.2 = παιδιά του επ.1· ξένο επ.1 βλέπει και τους κλάδους του εσωτερικού', () => {
    expect(ids(level2Options(rows, 1))).toEqual([10, 11]);
    expect(ids(level2Options(rows, 2))).toEqual([10, 11]);
    expect(level2Options(rows, null)).toEqual([]);
  });
  it('επ.3 = παιδιά του επ.2', () => {
    expect(ids(level3Options(rows, 10))).toEqual([100, 101]);
    expect(level3Options(rows, null)).toEqual([]);
  });
});

describe('changeLevel', () => {
  it('αλλαγή κλάδου καθαρίζει ομάδα που δεν ανήκει', () => {
    expect(changeLevel(rows, { l1: 1, l2: 10, l3: 100 }, 2, 11)).toEqual({ l1: 1, l2: 11, l3: null });
  });
  it('αλλαγή λογ. κατηγορίας εσωτερικού → ΕΕ κρατά κλάδο και ομάδα', () => {
    expect(changeLevel(rows, { l1: 1, l2: 10, l3: 100 }, 1, 2)).toEqual({ l1: 2, l2: 10, l3: 100 });
  });
  it('καθάρισμα επ.1 καθαρίζει τα πάντα', () => {
    expect(changeLevel(rows, { l1: 1, l2: 10, l3: 100 }, 1, null)).toEqual({ l1: null, l2: null, l3: null });
  });
});

describe('selectionFromLeaf', () => {
  it('από φύλλο συμπληρώνει γονείς', () => {
    expect(selectionFromLeaf(rows, 101)).toEqual({ l1: 1, l2: 10, l3: 101 });
  });
  it('κρατά συμβατή λογ. κατηγορία (ξένος → ΕΕ)', () => {
    expect(selectionFromLeaf(rows, 101, 2)).toEqual({ l1: 2, l2: 10, l3: 101 });
  });
  it('άγνωστο φύλλο ⇒ κενό (ή μόνο το επ.1)', () => {
    expect(selectionFromLeaf(rows, 999)).toEqual({ l1: null, l2: null, l3: null });
    expect(selectionFromLeaf(rows, null, 2)).toEqual({ l1: 2, l2: null, l3: null });
  });
});

describe('selectionFromSoftone', () => {
  it('αντιστοιχίζει τα κλειδιά SoftOne στους κόμβους', () => {
    expect(selectionFromSoftone(rows, { trdCategory: '2', trdBusiness: '5', trdGroup: '7' })).toEqual({ l1: 2, l2: 10, l3: 100 });
    expect(selectionFromSoftone(rows, { trdCategory: '1', trdBusiness: '', trdGroup: null })).toEqual({ l1: 1, l2: null, l3: null });
  });
});

describe('softoneValues', () => {
  it('γράφει μόνο ό,τι υπάρχει στο SoftOne· τα υπόλοιπα εκκρεμούν', () => {
    expect(softoneValues(rows, { l1: 2, l2: 10, l3: 100 })).toEqual({ values: { trdCategory: '2', trdBusiness: '5', trdGroup: '7' }, pending: [] });
    const r = softoneValues(rows, { l1: 1, l2: 11, l3: 110 });
    expect(r.values).toEqual({ trdCategory: '1' });
    expect(ids(r.pending)).toEqual([11, 110]);
  });
  it('ετικέτα διαδρομής', () => {
    expect(selectionLabel(rows, { l1: 1, l2: 10, l3: 101 })).toBe('Προμηθευτές εσωτερικού › Δομικά υλικά › Πέτρα');
  });
});
