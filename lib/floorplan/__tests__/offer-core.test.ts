import { describe, expect, it } from 'vitest';
import { floorPlanOffer, floorPlanSummary, type FloorPlanRoom } from '../offer-core';
import type { RecipeForOffer } from '@/lib/install-recipes-core';

const recipe: RecipeForOffer = {
  name: 'Πλακάκι δαπέδου', kind: 'TILE', mtrl: 10, mtrlCode: 'PL60', mtrlName: 'Πλακάκι 60x60',
  materialPrice: 20, wastePct: 10, laborCostPerSqm: 12, labor: { mtrl: 90, code: 'ERG', name: 'Τοποθέτηση πλακιδίων' },
  lines: [{ mtrl: 11, code: 'KL', name: 'Κόλλα', unit: 'kg', qtyPerSqm: 5, wastePct: 0, unitPrice: 0.4 }],
};
const recipes = new Map([['r1', recipe]]);
const items = new Map([[50, { mtrl: 50, code: 'PAR', name: 'Πάρκετ δρυς', price: 35 }]]);

const rooms: FloorPlanRoom[] = [
  { name: 'Σαλόνι', areaM2: 24.5, perimeterM: 20, material: { type: 'recipe', recipeId: 'r1' } },
  { name: 'Υπνοδωμάτιο', areaM2: 12, perimeterM: 14, material: { type: 'item', mtrl: 50 } },
  { name: 'Αποθήκη', areaM2: 3, perimeterM: null, material: null },
];

describe('κάτοψη → προσφορά', () => {
  it('συνταγή αναλυτικά + σκέτο είδος, ανά χώρο με σημείωση', () => {
    const out = floorPlanOffer({ rooms, recipes, items, markupPct: 0, mode: 'detailed' });
    expect(out.kind).toBe('PRODUCT_INSTALL');
    expect(out.missing).toEqual([]);
    expect(out.lines.map((l) => l.name)).toEqual(['Πλακάκι 60x60', 'Κόλλα', 'Τοποθέτηση πλακιδίων', 'Πάρκετ δρυς']);
    expect(out.lines[0]).toMatchObject({ qty: 26.95, unitPrice: 20, notes: 'Χώρος: Σαλόνι · 24,50 m²' });
    expect(out.lines[2]).toMatchObject({ kind: 'SERVICE', mtrl: 90, qty: 24.5, unitPrice: 12 });
    // Σκέτο είδος: τιμή λιανικής × m², χωρίς περιθώριο
    expect(out.lines[3]).toMatchObject({ kind: 'MATERIAL', mtrl: 50, unit: 'm²', qty: 12, unitPrice: 35, notes: 'Χώρος: Υπνοδωμάτιο · 12,00 m²' });
  });

  it('μία γραμμή ανά m² με περιθώριο — η σημείωση κρατά και το «Περιλαμβάνει»', () => {
    const out = floorPlanOffer({ rooms, recipes, items, markupPct: 10, mode: 'bundled' });
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0].notes).toMatch(/^Χώρος: Σαλόνι · 24,50 m² — Περιλαμβάνει: /);
    // κόστος/m² = 22 + 2 + 12 = 36 → +10% = 39,6
    expect(out.lines[0].unitPrice).toBeCloseTo(39.6);
    expect(out.lines[1].unitPrice).toBe(35);
  });

  it('χωρίς εργασία = μόνο προϊόν· άγνωστη συνταγή αναφέρεται', () => {
    const out = floorPlanOffer({ rooms: [rooms[1], { ...rooms[0], material: { type: 'recipe', recipeId: 'xx' } }], recipes, items, markupPct: 0, mode: 'detailed' });
    expect(out.kind).toBe('PRODUCT');
    expect(out.missing).toEqual(['Σαλόνι']);
  });

  it('περίληψη με όλους τους χώρους και σύνολο', () => {
    const s = floorPlanSummary({ rooms, materialLabel: (r) => (r.material ? 'υλικό' : null), source: 'katopsi.pdf', wallLenM: null });
    expect(s).toContain('• Αποθήκη: 3,00 m² · χωρίς υλικό');
    expect(s).toContain('• Σαλόνι: 24,50 m² · περίμετρος 20,00 m · υλικό');
    expect(s).toContain('Σύνολο: 39,50 m²');
  });
});
