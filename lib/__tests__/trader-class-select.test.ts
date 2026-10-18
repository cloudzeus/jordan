import { describe, expect, it } from 'vitest';
import {
  choose, leafOf, levelOptions, pathFromSoftone, pathLabel, pathTo, samePath, softoneValue, type ClassRow,
} from '@/lib/trader-class-select';

// 20 Προμηθευτές → 20.1 Υλικά (→ 20.1.01 Πλακίδια [S1 7], 20.1.02 Χρώματα) · 20.2 Υπηρεσίες (→ 20.2.01 Μεταφορές)
// · 20.4 «Λοιποί» φύλλο στο 2ο επίπεδο [S1 9].
const rows: ClassRow[] = [
  { id: 1, key: 'S_ROOT', level: 1, code: 'ΠΡΟΜ', name: 'Προμηθευτές', parentId: null, softoneId: null },
  { id: 10, key: 'S_MAT', level: 2, code: 'ΟΙΚ-ΥΛ', name: 'Οικοδομικών Υλικών', parentId: 1, softoneId: 3 },
  { id: 11, key: 'S_SERV', level: 2, code: 'ΥΠΗΡ', name: 'Παροχή Υπηρεσιών', parentId: 1, softoneId: null },
  { id: 12, key: 'S_X', level: 2, code: 'ΛΟΙ', name: 'Λοιποί', parentId: 1, softoneId: 9 },
  { id: 100, key: 'S_TILES', level: 3, code: 'ΠΛΑΚ', name: 'Πλακίδια & πέτρα', parentId: 10, softoneId: 7 },
  { id: 101, key: 'S_PAINT', level: 3, code: 'ΧΡΩΜ', name: 'Χρώματα & κονιάματα', parentId: 10, softoneId: null },
  { id: 110, key: 'S_TRANSPORT', level: 3, code: 'ΜΕΤΦ', name: 'Μεταφορές', parentId: 11, softoneId: null },
];
const ids = (l: ClassRow[]) => l.map((r) => r.id);

describe('levelOptions', () => {
  it('χωρίς επιλογή: μόνο τα παιδιά της ρίζας', () => {
    expect(levelOptions(rows, []).map(ids)).toEqual([[10, 11, 12]]);
  });
  it('μετά από κόμβο με παιδιά: και το επόμενο επίπεδο', () => {
    expect(levelOptions(rows, [10]).map(ids)).toEqual([[10, 11, 12], [100, 101]]);
  });
  it('φύλλο στο 2ο επίπεδο: δεν ανοίγει 3ο combo', () => {
    expect(levelOptions(rows, [12]).map(ids)).toEqual([[10, 11, 12]]);
  });
  it('άκυρη διαδρομή κόβεται', () => {
    expect(levelOptions(rows, [999, 100]).map(ids)).toEqual([[10, 11, 12]]);
  });
});

describe('choose / pathTo / leafOf', () => {
  it('αλλαγή στο επίπεδο 0 καθαρίζει τα από κάτω', () => {
    expect(choose([10, 100], 0, 11)).toEqual([11]);
    expect(choose([10, 100], 1, 101)).toEqual([10, 101]);
    expect(choose([10, 100], 0, null)).toEqual([]);
  });
  it('διαδρομή μέχρι κόμβο (χωρίς τη ρίζα)', () => {
    expect(pathTo(rows, 100)).toEqual([10, 100]);
    expect(pathTo(rows, 12)).toEqual([12]);
    expect(pathTo(rows, 999)).toEqual([]);
  });
  it('φύλλο μόνο όταν η διαδρομή φτάσει σε κόμβο χωρίς παιδιά', () => {
    expect(leafOf(rows, [10])).toBeNull();
    expect(leafOf(rows, [10, 100])).toBe(100);
    expect(leafOf(rows, [12])).toBe(12);
  });
});

describe('SoftOne', () => {
  it('διαδρομή από TRDR.TRDBUSINESS', () => {
    expect(pathFromSoftone(rows, '7')).toEqual([10, 100]);
    expect(pathFromSoftone(rows, '')).toEqual([]);
    expect(pathFromSoftone(rows, 55)).toEqual([]);
  });
  it('γράφεται μόνο φύλλο που υπάρχει στο SoftOne· αλλιώς εκκρεμεί', () => {
    expect(softoneValue(rows, [10, 100])).toEqual({ values: { trdBusiness: '7' }, pending: null });
    expect(softoneValue(rows, [10, 101]).pending?.id).toBe(101);
    expect(softoneValue(rows, [10])).toEqual({ values: {}, pending: null }); // όχι φύλλο — ούτε ο γονέας με softoneId
  });
  it('ετικέτα και σύγκριση', () => {
    expect(pathLabel(rows, [10, 100])).toBe('Οικοδομικών Υλικών › Πλακίδια & πέτρα');
    expect(samePath([10, 100], [10, 100])).toBe(true);
    expect(samePath([10], [10, 100])).toBe(false);
  });
});
