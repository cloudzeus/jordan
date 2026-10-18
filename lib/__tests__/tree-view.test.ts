import { describe, expect, it } from 'vitest';
import { allIds, buildTree, filterTree, type FlatNode } from '@/lib/tree-view';

const c = (applied: number, proposed: number, review = 0) => ({ applied, proposed, review });
// 1 Υλικά → 2 Πλακάκια (μέλη), 3 Χρώματα · 4 Υπηρεσίες (φύλλο)
const flat: FlatNode[] = [
  { id: 1, parentId: null, code: 'ΟΙΚ-ΥΛ', name: 'Οικοδομικών Υλικών', counts: c(0, 0) },
  { id: 2, parentId: 1, code: 'ΠΛΑΚ', name: 'Πλακίδια & πέτρα', counts: c(3, 2, 1), members: [{ code: '0001', name: 'ZELLIGE GREEN' }, { code: '0002', name: 'Roman Opus' }] },
  { id: 3, parentId: 1, code: 'ΧΡΩΜ', name: 'Χρώματα & κονιάματα', counts: c(1, 4) },
  { id: 4, parentId: null, code: 'ΥΠΗΡ', name: 'Παροχή Υπηρεσιών', counts: c(0, 1) },
];

describe('buildTree', () => {
  const t = buildTree(flat);
  it('ρίζες και παιδιά με τη σειρά εισόδου, βάθος', () => {
    expect(t.map((n) => n.id)).toEqual([1, 4]);
    expect(t[0].children.map((n) => n.id)).toEqual([2, 3]);
    expect(t[0].children[0].depth).toBe(1);
  });
  it('σύνολα υποδέντρου', () => {
    expect(t[0].total).toEqual({ applied: 4, proposed: 6, review: 1 });
    expect(t[1].total).toEqual({ applied: 0, proposed: 1, review: 0 });
  });
  it('γονέας που λείπει ⇒ ρίζα', () => {
    expect(buildTree([{ id: 9, parentId: 77, code: 'X', name: 'X', counts: c(0, 0) }]).map((n) => n.id)).toEqual([9]);
  });
  it('allIds', () => expect(allIds(t)).toEqual([1, 2, 3, 4]));
});

describe('filterTree', () => {
  const t = buildTree(flat);
  it('κενή αναζήτηση ⇒ όλο το δέντρο', () => expect(filterTree(t, '  ')).toBe(t));
  it('ταίριασμα κόμβου κρατά προγόνους (χωρίς τόνους)', () => {
    const r = filterTree(t, 'χρωματα');
    expect(r.map((n) => n.id)).toEqual([1]);
    expect(r[0].children.map((n) => n.id)).toEqual([3]);
  });
  it('ταίριασμα μέλους κρατά μόνο αυτό το μέλος', () => {
    const r = filterTree(t, 'zellige');
    expect(r[0].children[0].members).toEqual([{ code: '0001', name: 'ZELLIGE GREEN' }]);
  });
  it('ταίριασμα κόμβου κρατά όλα τα παιδιά του', () => {
    expect(filterTree(t, 'ΟΙΚ-ΥΛ')[0].children).toHaveLength(2);
  });
  it('κανένα ταίριασμα ⇒ κενό', () => expect(filterTree(t, 'xyz')).toEqual([]));
});
