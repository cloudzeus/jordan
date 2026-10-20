import { describe, expect, it } from 'vitest';
import { lineCostPerSqm, lineQtyWithWaste, parseDecimal, recipeCost, recipeForArea, recipeToOfferLines, wasteFactor } from '../install-recipes-core';

const recipe = {
  mtrlName: 'Πλακάκι 60x60',
  materialPrice: 20,
  wastePct: 10,
  laborCostPerSqm: 12,
  lines: [
    { name: 'Κόλλα', unit: 'kg', qtyPerSqm: 5, wastePct: 5, unitPrice: 0.4 },
    { name: 'Αρμόστοκος', unit: 'kg', qtyPerSqm: 0.5, wastePct: 0, unitPrice: 2 },
  ],
};

describe('συνταγές τοποθέτησης', () => {
  it('φύρα ως πολλαπλασιαστής', () => {
    expect(wasteFactor(10)).toBeCloseTo(1.1);
    expect(wasteFactor(0)).toBe(1);
    expect(wasteFactor(NaN)).toBe(1);
  });

  it('γραμμή ανά m² με φύρα', () => {
    expect(lineQtyWithWaste({ qtyPerSqm: 5, wastePct: 5 })).toBeCloseTo(5.25);
    expect(lineCostPerSqm({ qtyPerSqm: 5, wastePct: 5, unitPrice: 0.4 })).toBeCloseTo(2.1);
  });

  it('κόστος ανά m²: υλικό + βοηθητικά + εργατικά', () => {
    const c = recipeCost(recipe);
    expect(c.material).toBeCloseTo(22);
    expect(c.accessories).toBeCloseTo(3.1);
    expect(c.labor).toBe(12);
    expect(c.total).toBeCloseTo(37.1);
  });

  it('ποσότητες για εμβαδόν', () => {
    const r = recipeForArea(recipe, 100);
    expect(r.rows[0]).toMatchObject({ name: 'Πλακάκι 60x60', unit: 'm²', qty: 110, cost: 2200 });
    expect(r.rows[1]).toMatchObject({ name: 'Κόλλα', qty: 525, cost: 210 });
    expect(r.rows[2]).toMatchObject({ qty: 50, cost: 100 });
    expect(r.labor).toBe(1200);
    expect(r.total).toBeCloseTo(3710);
    expect(recipeForArea(recipe, -3).total).toBe(0);
  });

  it('ελληνικοί δεκαδικοί', () => {
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal('2.5')).toBe(2.5);
    expect(Number.isNaN(parseDecimal(''))).toBe(true);
  });
});

describe('συνταγή → γραμμές προσφοράς', () => {
  const r = {
    name: 'Δάπεδο 60x60', kind: 'TILE' as const, mtrl: 10, mtrlCode: 'P1', mtrlName: 'Πλακάκι 60x60',
    materialPrice: 20, wastePct: 10, laborCostPerSqm: 12, labor: null,
    lines: [{ mtrl: 11, code: 'K1', name: 'Κόλλα', unit: 'kg', qtyPerSqm: 5, wastePct: 5, unitPrice: 0.4 }],
  };

  it('αναλυτικά: υλικά με φύρα + εργασία, με περιθώριο', () => {
    const l = recipeToOfferLines(r, 100, { markupPct: 25, mode: 'detailed' });
    expect(l).toHaveLength(3);
    expect(l[0]).toMatchObject({ kind: 'MATERIAL', mtrl: 10, unit: 'm²', qty: 110, unitPrice: 25, notes: null });
    expect(l[1]).toMatchObject({ kind: 'MATERIAL', mtrl: 11, unit: 'kg', qty: 525, unitPrice: 0.5 });
    expect(l[2]).toMatchObject({ kind: 'SERVICE', mtrl: null, name: 'Εργασία τοποθέτησης — Πλακάκι 60x60', qty: 100, unitPrice: 15 });
  });

  it('μία γραμμή ανά m²', () => {
    const [l] = recipeToOfferLines(r, 50, { markupPct: 0, mode: 'bundled' });
    expect(l).toMatchObject({ kind: 'SERVICE', unit: 'm²', qty: 50, unitPrice: 36.1, notes: 'Περιλαμβάνει: Πλακάκι 60x60, Κόλλα, εργασία τοποθέτησης' });
  });

  it('χωρίς τετραγωνικά → καμία γραμμή', () => {
    expect(recipeToOfferLines(r, 0, { markupPct: 0, mode: 'detailed' })).toEqual([]);
  });
});
