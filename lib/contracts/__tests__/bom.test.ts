import { describe, expect, it } from 'vitest';
import { bomCsv, budgetDrafts, buildBom, type BomLine } from '../bom-core';

const rooms = [{ id: 'k', name: 'Κουζίνα' }, { id: 'b', name: 'Μπάνιο' }];
const lines: BomLine[] = [
  { kind: 'MATERIAL', mtrl: 10, code: 'PL', name: 'Πλακάκι', unit: 'm²', qty: 12, unitPrice: 20, roomId: 'k' },
  { kind: 'MATERIAL', mtrl: 10, code: 'PL', name: 'Πλακάκι', unit: 'm²', qty: 8, unitPrice: 20, discount: 10, roomId: 'b' },
  { kind: 'MATERIAL', mtrl: 11, code: 'KL', name: 'Κόλλα', unit: 'kg', qty: 50, unitPrice: 0.5, roomId: null },
  { kind: 'MATERIAL', mtrl: null, code: null, name: 'Αναλώσιμα', unit: null, qty: 1, unitPrice: 30 },
  { kind: 'SERVICE', mtrl: 90, code: 'ERG', name: 'Τοποθέτηση', unit: 'm²', qty: 20, unitPrice: 15, roomId: 'k', partyId: 'p1', crewFee: 200 },
];

describe('buildBom', () => {
  const bom = buildBom(lines, rooms, { 10: { qty: 5, unit: 'τ.μ.', syncedAt: null }, 11: { qty: 100, unit: 'kg', syncedAt: null } });
  it('ανά είδος: ανάγκη ανά χώρο, απόθεμα, παραγγελία και αξία', () => {
    const pl = bom.items.find((i) => i.mtrl === 10)!;
    expect(pl.perRoom).toEqual({ k: 12, b: 8 });
    expect(pl).toMatchObject({ need: 20, have: 5, short: 15, status: 'short' });
    expect(pl.value).toBe(240 + 144);
    expect(bom.items.find((i) => i.mtrl === 11)!.perRoom).toEqual({ '': 50 });
    expect(bom.totals.toOrder).toBe(1);
  });
  it('ανά χώρο: με τη σειρά της κάτοψης και «Γενικά» στο τέλος', () => {
    expect(bom.rooms.map((r) => r.name)).toEqual(['Κουζίνα', 'Μπάνιο', 'Γενικά (εκτός χώρου)']);
    expect(bom.rooms[0]).toMatchObject({ materials: 240, services: 300 });
  });
  it('υλικά χωρίς είδος μητρώου ξεχωρίζουν', () => {
    expect(bom.unlinked).toEqual([{ name: 'Αναλώσιμα', qty: 1, unit: null }]);
  });
  it('CSV με στήλη ανά χώρο και ελληνικούς δεκαδικούς', () => {
    const csv = bomCsv(bom, rooms);
    expect(csv.startsWith('﻿')).toBe(true);
    const rows = csv.slice(1).split('\r\n');
    expect(rows[0]).toBe('Κωδικός;Είδος;Μονάδα;Κουζίνα;Μπάνιο;Γενικά;Σύνολο;Απόθεμα;Μονάδα αποθήκης;Προς παραγγελία;Αξία');
    expect(rows.find((r) => r.startsWith('KL;'))).toBe('KL;Κόλλα;kg;0;0;50;50;100;kg;0;25');
    expect(rows.at(-1)).toContain('Αναλώσιμα (χωρίς είδος μητρώου)');
  });
});

describe('budgetDrafts', () => {
  it('κόστος: τελευταία αγορά για υλικά, αμοιβή συνεργείου για εργασίες· ένωση ανά είδος και χώρο', () => {
    const { drafts, skipped } = budgetDrafts([...lines, { ...lines[0], qty: 3 }], rooms, new Map([[10, 12.5]]), 'Από ΣΥΜ-000001');
    expect(skipped).toEqual(['Αναλώσιμα']);
    const kitchenTile = drafts.find((d) => d.mtrl === 10 && d.notes.endsWith('Κουζίνα'))!;
    expect(kitchenTile).toMatchObject({ qty: 15, unitPrice: 12.5, isService: false });
    expect(drafts.find((d) => d.mtrl === 11)).toMatchObject({ unitPrice: 0.5, notes: 'Από ΣΥΜ-000001' });
    expect(drafts.find((d) => d.mtrl === 90)).toMatchObject({ isService: true, qty: 20, unitPrice: 10 });
    expect(drafts).toHaveLength(4);
  });
});
