import { describe, expect, it } from 'vitest';
import { contractLinesFromRooms, materialNeeds, orderArea, roomInput, roomLine, skirtingLength, type RoomView } from '../project-rooms-core';

const room = (p: Partial<RoomView>): RoomView => ({
  id: 'x', prjc: 1, name: 'Χώρος', areaM2: 10, perimeterM: 13, finish: null, mtrl: null, itemCode: null, itemName: null, itemUnit: null,
  wastePct: 10, skirting: false, pattern: null, notes: null, source: 'manual', sortOrder: 0, updatedAt: '', ...p,
});

describe('project rooms', () => {
  it('ποσότητα με φύρα και σοβατεπί', () => {
    expect(orderArea(room({ areaM2: 20.5, wastePct: 10 }))).toBe(22.55);
    expect(skirtingLength(room({ perimeterM: 18.64, skirting: true }))).toBe(18.64);
    expect(skirtingLength(room({ perimeterM: 18.64, skirting: false }))).toBe(0);
  });

  it('συγκέντρωση ανά MTRL, χώροι χωρίς υλικό μένουν έξω', () => {
    const rs = [
      room({ name: 'Σαλόνι', areaM2: 20, finish: 'TILE', mtrl: 7, itemName: 'Πορσελανάτο 60×60', skirting: true, perimeterM: 18 }),
      room({ name: 'Κουζίνα', areaM2: 10, finish: 'TILE', mtrl: 7, itemName: 'Πορσελανάτο 60×60', wastePct: 5 }),
      room({ name: 'Μπάνιο', areaM2: 5, finish: 'SCREED', itemName: 'Μικροτσιμέντο' }),
      room({ name: 'Αποθήκη', areaM2: 3 }),
    ];
    const n = materialNeeds(rs);
    expect(n).toHaveLength(2);
    expect(n[0]).toMatchObject({ mtrl: 7, netM2: 30, orderM2: 32.5, skirtingM: 18, rooms: ['Σαλόνι', 'Κουζίνα'] });
    expect(n[1]).toMatchObject({ finish: 'SCREED', netM2: 5, orderM2: 5.5 });
    const lines = contractLinesFromRooms(rs);
    expect(lines.map((l) => [l.name, l.unit, l.qty])).toEqual([
      ['Πορσελανάτο 60×60', 'm²', 32.5], ['Σοβατεπί — Πορσελανάτο 60×60', 'm', 18], ['Μικροτσιμέντο', 'm²', 5.5],
    ]);
  });

  it('προειδοποίηση μονάδας όταν το είδος δεν μετριέται σε m²', () => {
    const [l] = contractLinesFromRooms([room({ finish: 'SCREED', mtrl: 9, itemName: 'Τσιμεντοκονία', itemUnit: 'kg' })]);
    expect(l.notes).toContain('μονάδα είδους: kg');
  });

  it('roomLine και validation', () => {
    expect(roomLine(room({ name: 'Σαλόνι', areaM2: 20.5, finish: 'STONE', itemName: 'Travertino', pattern: 'ρωμαϊκό' })))
      .toBe('Σαλόνι — 20,50 m² · Πέτρα: Travertino · ρωμαϊκό · φύρα 10% → 22,55 m²');
    expect(roomInput.safeParse({ name: '', areaM2: 1 }).success).toBe(false);
    expect(roomInput.parse({ name: 'Α', areaM2: 1 })).toMatchObject({ wastePct: 10, skirting: false, source: 'manual' });
  });
});

describe('χώροι σε σύμβαση & Word', () => {
  const rs = [
    room({ name: 'Σαλόνι', areaM2: 20, finish: 'TILE', mtrl: 7, itemCode: 'P-60', itemName: 'Πορσελανάτο 60×60', pattern: 'ευθεία, αρμός 2 mm', skirting: true, perimeterM: 18 }),
    room({ name: 'Μπάνιο', areaM2: 5, finish: 'SCREED', itemName: 'Μικροτσιμέντο', notes: 'ρύσεις προς σιφώνι' }),
  ];

  it('το prompt περιέχει τους χώρους και οδηγία για το installation του συνεργείου', async () => {
    const { buildPrompt } = await import('../contracts/core');
    const base = {
      stage: 'OFFER', kind: 'PRODUCT_INSTALL' as const, company: { name: 'Εταιρία' }, customer: { name: 'Πελάτης' }, title: 'Έργο', summary: '',
      lines: [], milestones: [], total: 0, guides: [], rooms: rs.map(roomLine),
    };
    const party = buildPrompt({ ...base, audience: 'PARTY', party: { name: 'Συνεργείο' } });
    expect(party.user).toContain('Χώροι & τελικά δάπεδα:');
    expect(party.user).toContain('1. Σαλόνι — 20,00 m² · Πλακάκι: P-60 · Πορσελανάτο 60×60');
    expect(party.system).toContain('ΑΝΑ ΧΩΡΟ');
    const none = buildPrompt({ ...base, audience: 'CUSTOMER', rooms: [] });
    expect(none.user).not.toContain('Χώροι & τελικά δάπεδα');
  });

  it('Word προδιαγραφών και εργολάβου παράγονται', async () => {
    const { buildRoomsDocx } = await import('../project-rooms-doc');
    for (const kind of ['spec', 'contractor'] as const) {
      const buf = await buildRoomsDocx({
        kind, companyName: 'Εταιρία', project: { code: 'PRJ-1', name: 'Κατοικία' }, rooms: rs, date: new Date(2026, 9, 20),
        attributes: { 7: [{ name: 'Διαστάσεις', value: '60×60', unit: 'cm' }] },
        guides: { 7: { summary: 'Τοποθέτηση με κόλλα C2TE.', tools: ['οδοντωτή σπάτουλα'], preparation: ['Καθαρό υπόστρωμα'], steps: [{ title: 'Κόλλα', detail: 'Διπλή επάλειψη' }], qualityChecks: ['Επιπεδότητα ±2 mm/2 m'], commonMistakes: [], aftercare: [] } },
      });
      expect(buf.subarray(0, 2).toString()).toBe('PK');
      expect(buf.length).toBeGreaterThan(3000);
    }
  });
});
