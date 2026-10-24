import { describe, expect, it } from 'vitest';
import { normUnit, stockNeeds } from '../stock-core';
import { roomLines, roomNet } from '../room-lines';
import { buildCustomerTextPrompt, parseCustomerText } from '../customer-text-core';
import { planRooms, withRoomMaterials, type PlanData } from '@/lib/floorplan/saved';
import type { RecipeForOffer } from '@/lib/install-recipes-core';

const recipe: RecipeForOffer = {
  name: 'Πλακάκι δαπέδου', kind: 'TILE', mtrl: 10, mtrlCode: 'PL60', mtrlName: 'Πλακάκι 60x60',
  materialPrice: 20, wastePct: 10, laborCostPerSqm: 12, labor: { mtrl: 90, code: 'ERG', name: 'Τοποθέτηση πλακιδίων' },
  lines: [{ mtrl: 11, code: 'KL', name: 'Κόλλα', unit: 'kg', qtyPerSqm: 5, wastePct: 0, unitPrice: 0.4 }],
};

describe('stock-core', () => {
  it('ταιριάζει τις συνήθεις γραφές μονάδων', () => {
    expect(normUnit('τ.μ.')).toBe('m2');
    expect(normUnit('m²')).toBe('m2');
    expect(normUnit('Τεμ.')).toBe('pcs');
    expect(normUnit(null)).toBeNull();
  });

  it('αθροίζει ανάγκες ανά είδος και βγάζει έλλειμμα', () => {
    const needs = stockNeeds([
      { kind: 'MATERIAL', mtrl: 10, code: 'PL', name: 'Πλακάκι', unit: 'm²', qty: 8 },
      { kind: 'MATERIAL', mtrl: 10, code: 'PL', name: 'Πλακάκι', unit: 'm²', qty: 4 },
      { kind: 'MATERIAL', mtrl: 11, code: 'KL', name: 'Κόλλα', unit: 'kg', qty: 50 },
      { kind: 'MATERIAL', mtrl: 12, code: 'AR', name: 'Αρμόστοκος', unit: 'τεμ.', qty: 3 },
      { kind: 'SERVICE', mtrl: 90, code: 'ERG', name: 'Εργασία', unit: 'm²', qty: 12 },
      { kind: 'MATERIAL', mtrl: 13, code: 'X', name: 'Άλλη μονάδα', unit: 'm²', qty: 1 },
    ], {
      10: { qty: 5, unit: 'τ.μ.', syncedAt: null },
      11: { qty: 100, unit: 'kg', syncedAt: null },
      12: { qty: 0, unit: 'τεμ', syncedAt: null },
      13: { qty: 7, unit: 'κιβώτιο', syncedAt: null },
    });
    const by = new Map(needs.map((n) => [n.mtrl, n]));
    expect(by.has(90)).toBe(false);
    expect(by.get(10)).toMatchObject({ need: 12, have: 5, short: 7, status: 'short' });
    expect(by.get(11)).toMatchObject({ short: 0, status: 'ok' });
    expect(by.get(12)).toMatchObject({ short: 3, status: 'none' });
    expect(by.get(13)).toMatchObject({ comparable: false, status: 'unknown', short: 0 });
  });
});

describe('room-lines', () => {
  const room = { id: 'r1', name: 'Μπάνιο', floorM2: 10, wallsM2: 20 };
  it('συνταγή → γραμμές δαπέδου και τοίχων με roomId', () => {
    const out = roomLines({ room, material: { type: 'recipe', recipeId: 'x' }, recipes: new Map([['x', recipe]]), items: new Map(), markupPct: 0, mode: 'bundled' });
    expect(out.missing).toBe(false);
    expect(out.lines).toHaveLength(2);
    expect(out.lines.every((l) => l.roomId === 'r1')).toBe(true);
    expect(out.lines.map((l) => l.qty)).toEqual([10, 20]);
  });
  it('χωρίς υλικό → καμία γραμμή· άγνωστη συνταγή → missing', () => {
    expect(roomLines({ room, material: null, recipes: new Map(), items: new Map(), markupPct: 0, mode: 'detailed' }).lines).toEqual([]);
    expect(roomLines({ room, material: { type: 'recipe', recipeId: 'nope' }, recipes: new Map(), items: new Map(), markupPct: 0, mode: 'detailed' }).missing).toBe(true);
  });
  it('κόστος χώρου = άθροισμα των γραμμών του με έκπτωση', () => {
    expect(roomNet([{ roomId: 'a', qty: 2, unitPrice: 10, discount: 10 }, { roomId: 'b', qty: 1, unitPrice: 99 }, { roomId: 'a', qty: 1, unitPrice: 5 }], 'a')).toBe(23);
  });
});

describe('planRooms / withRoomMaterials', () => {
  const data: PlanData = {
    v: 1, w: 100, h: 100, pxPerM: null, page: 1, calib: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, meters: 1 },
    autoWalls: true, thr: null, thick: null, wallCm: 15, doorCm: 100, dividers: [], drawnWalls: [], dims: [], render3dFileId: null,
    rooms: [
      { id: 'a', name: 'Κουζίνα', color: '#000', polygon: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }], areaPx: 1200, perimeterPx: 140, manual: false, walls: undefined, material: null },
      { id: 'b', name: ' ', color: '#111', polygon: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }], areaPx: 400, perimeterPx: 80, manual: false, walls: { on: true, heightM: 2, openings: [] }, material: null },
    ],
  };
  it('μετατρέπει σε μέτρα και κρατά τα id', () => {
    const rooms = planRooms(data);
    expect(rooms.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rooms[0].floorM2).toBeCloseTo(12);
    expect(rooms[1].name).toBe('Χώρος');
    expect(rooms[1].wallsM2).toBeCloseTo(16);
  });
  it('γράφει υλικά μόνο στους χώρους που δόθηκαν', () => {
    const d = withRoomMaterials(data, [{ roomId: 'b', material: { type: 'item', mtrl: 5, code: 'P', label: 'Πάρκετ' } }]);
    expect(d.rooms[0].material).toBeNull();
    expect(d.rooms[1].material).toMatchObject({ type: 'item', mtrl: 5 });
  });
});

describe('customer-text-core', () => {
  it('το prompt περιέχει χώρους και γραμμές αλλά ζητά χωρίς τιμές', () => {
    const { system, user } = buildCustomerTextPrompt({
      title: 'Μπάνιο', kindLabel: 'Προϊόν + τοποθέτηση', customerName: 'Παπαδόπουλος', site: 'Κηφισιά', startDate: null, endDate: null,
      summary: 'αλλαγη πλακακιων', rooms: [{ name: 'Μπάνιο', floorM2: 6.25, wallsM2: 18, material: 'Μάρμαρο Βόλακα' }],
      lines: [{ kind: 'SERVICE', name: 'Τοποθέτηση', qty: 6.25, unit: 'm²', room: 'Μπάνιο' }], milestones: ['Προκαταβολή'],
    });
    expect(system).toMatch(/ΜΗΝ γράφεις τιμές/);
    expect(user).toContain('Μάρμαρο Βόλακα');
    expect(user).toContain('6,25');
    expect(user).toContain('Προκαταβολή');
  });
  it('διαβάζει JSON και καθαρίζει markdown', () => {
    const t = parseCustomerText('```json\n{"text": "## Τι θα κάνουμε\\n- Νέα πλακάκια στο **μπάνιο** με προσοχή και καθαριότητα σε όλο το έργο."}\n```');
    expect(t).toBe('Τι θα κάνουμε\n• Νέα πλακάκια στο μπάνιο με προσοχή και καθαριότητα σε όλο το έργο.');
    expect(() => parseCustomerText('{"text": "λίγο"}')).toThrow();
  });
});
