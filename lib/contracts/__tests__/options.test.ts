import { describe, expect, it } from 'vitest';
import { activeLines, chosenOf, normalizeOptions, optionGroups, roomGroup } from '../options-core';

const L = (name: string, unitPrice: number, optionGroup: string | null = null, option: 'A' | 'B' | null = null) => ({ name, qty: 1, unitPrice, discount: 0, optionGroup, option });
const g = roomGroup('r1');
const lines = [L('Μάρμαρο', 100, g, 'A'), L('Εργασία', 40, g, 'A'), L('Γρανίτης', 150, g, 'B'), L('Κόλλα', 10)];

describe('εναλλακτικές επιλογές', () => {
  it('χωρίς επιλογή ισχύει η A· οι απλές γραμμές μετρούν πάντα', () => {
    expect(chosenOf({}, g)).toBe('A');
    expect(activeLines(lines, {}).map((l) => l.name)).toEqual(['Μάρμαρο', 'Εργασία', 'Κόλλα']);
    expect(activeLines(lines, { [g]: 'B' }).map((l) => l.name)).toEqual(['Γρανίτης', 'Κόλλα']);
  });
  it('ομάδα: καθαρή αξία ανά επιλογή', () => {
    expect(optionGroups(lines, { [g]: 'B' })).toEqual([expect.objectContaining({ key: g, chosen: 'B', netA: 140, netB: 150 })]);
  });
  it('«μισή» ομάδα γίνεται απλές γραμμές και η επιλογή της πετιέται', () => {
    const r = normalizeOptions([L('Μόνο A', 10, 'line:x', 'A'), ...lines], { 'line:x': 'B', [g]: 'B', 'room:ghost': 'B' });
    expect(r.choices).toEqual({ [g]: 'B' });
    expect(r.lines[0]).toMatchObject({ optionGroup: null, option: null, inactive: false });
    expect(r.lines.filter((l) => l.inactive).map((l) => l.name)).toEqual(['Μάρμαρο', 'Εργασία']);
  });
});
