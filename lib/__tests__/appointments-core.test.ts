import { describe, expect, it } from 'vitest';
import {
  computeSlots, DEFAULT_AVAILABILITY, formatSlotEl, isSlotFree, normalizeRanges, parseAvailability, staffCanMove, zonedParts, zonedToUtc,
  type Availability,
} from '../appointments-core';

const A: Availability = { ...DEFAULT_AVAILABILITY, minNoticeHours: 0, horizonDays: 60, weekly: { ...DEFAULT_AVAILABILITY.weekly, '2': [{ from: '10:00', to: '13:00' }] } };
// Τρίτη 20/10/2026 — Αθήνα σε θερινή ώρα (UTC+3)
const NOW = new Date('2026-10-19T06:00:00Z');

describe('ώρα Αθήνας', () => {
  it('μετατρέπει σωστά πριν και μετά την αλλαγή ώρας (25/10/2026)', () => {
    expect(zonedToUtc('2026-10-20', '10:00').toISOString()).toBe('2026-10-20T07:00:00.000Z'); // EEST +3
    expect(zonedToUtc('2026-10-27', '10:00').toISOString()).toBe('2026-10-27T08:00:00.000Z'); // EET +2
    expect(zonedParts(new Date('2026-10-27T08:00:00Z'))).toMatchObject({ date: '2026-10-27', time: '10:00', weekday: 2 });
  });
  it('ελληνική μορφή ημερομηνίας/ώρας', () => {
    expect(formatSlotEl('2026-10-20T07:00:00Z', '2026-10-20T08:00:00Z')).toMatch(/Τρίτη.*20.*Οκτωβρίου.*10:00–11:00/);
  });
});

describe('ελεύθερες θέσεις', () => {
  it('βήμα = διάρκεια, η τελευταία χωρά ολόκληρη', () => {
    const [d] = computeSlots({ availability: A, from: '2026-10-20', days: 1, now: NOW, busy: [], blocks: [] });
    expect(d.slots.map((s) => s.time)).toEqual(['10:00', '11:00', '12:00']);
    expect(d.slots.every((s) => s.free)).toBe(true);
    const [h] = computeSlots({ availability: { ...A, slotMinutes: 90 }, from: '2026-10-20', days: 1, now: NOW, busy: [], blocks: [] });
    expect(h.slots.map((s) => s.time)).toEqual(['10:00', '11:30']);
  });
  it('κλειστή μέρα: καμία θέση', () => {
    const [sun] = computeSlots({ availability: A, from: '2026-10-25', days: 1, now: NOW, busy: [], blocks: [] });
    expect(sun.open).toBe(false);
    expect(sun.slots).toEqual([]);
  });
  it('κλεισμένη ώρα δεν δίνεται ξανά — εκτός αν η χωρητικότητα το επιτρέπει', () => {
    const busy = [{ start: new Date('2026-10-20T08:00:00Z'), end: new Date('2026-10-20T09:00:00Z') }]; // 11:00 Αθήνας
    const [d] = computeSlots({ availability: A, from: '2026-10-20', days: 1, now: NOW, busy, blocks: [] });
    expect(d.slots.filter((s) => s.free).map((s) => s.time)).toEqual(['10:00', '12:00']);
    const [d2] = computeSlots({ availability: { ...A, capacity: 2 }, from: '2026-10-20', days: 1, now: NOW, busy, blocks: [] });
    expect(d2.slots.filter((s) => s.free)).toHaveLength(3);
  });
  it('αποκλεισμοί, ελάχιστη προειδοποίηση και ορίζοντας', () => {
    const block = [{ start: zonedToUtc('2026-10-20', '00:00'), end: zonedToUtc('2026-10-21', '00:00') }];
    expect(computeSlots({ availability: A, from: '2026-10-20', days: 1, now: NOW, busy: [], blocks: block })[0].slots.some((s) => s.free)).toBe(false);
    const late = new Date('2026-10-20T07:30:00Z'); // 10:30 Αθήνας
    const [d] = computeSlots({ availability: { ...A, minNoticeHours: 1 }, from: '2026-10-20', days: 1, now: late, busy: [], blocks: [] });
    expect(d.slots.filter((s) => s.free).map((s) => s.time)).toEqual(['12:00']);
    const [far] = computeSlots({ availability: { ...A, horizonDays: 3 }, from: '2026-11-03', days: 1, now: NOW, busy: [], blocks: [] });
    expect(far.slots.some((s) => s.free)).toBe(false);
  });
  it('isSlotFree δέχεται ΜΟΝΟ ακριβή αρχή ελεύθερης θέσης', () => {
    const base = { availability: A, now: NOW, busy: [], blocks: [] };
    expect(isSlotFree({ ...base, start: new Date('2026-10-20T07:00:00Z') })?.time).toBe('10:00');
    expect(isSlotFree({ ...base, start: new Date('2026-10-20T07:15:00Z') })).toBeNull();
    expect(isSlotFree({ ...base, start: new Date('2026-10-19T04:00:00Z') })).toBeNull(); // παρελθόν/κλειστό
  });
});

describe('ρυθμίσεις', () => {
  it('ενοποιεί και ελέγχει διαστήματα', () => {
    expect(normalizeRanges([{ from: '15:00', to: '18:00' }, { from: '10:00', to: '13:00' }]).ranges[0].from).toBe('10:00');
    expect(normalizeRanges([{ from: '10:00', to: '13:00' }, { from: '12:00', to: '14:00' }]).problem).toMatch(/επικαλύπτονται/);
    expect(normalizeRanges([{ from: '13:00', to: '10:00' }]).problem).toMatch(/πριν αρχίσει/);
    expect(normalizeRanges([{ from: '9', to: '10:00' }]).problem).toMatch(/ΩΩ:ΛΛ/);
  });
  it('κενή/χαλασμένη ρύθμιση → προεπιλογές με όρια', () => {
    expect(parseAvailability(null)).toEqual(DEFAULT_AVAILABILITY);
    const p = parseAvailability({ slotMinutes: 5, capacity: 99, weekly: { 1: [{ from: '12:00', to: '10:00' }] } });
    expect(p.slotMinutes).toBe(15);
    expect(p.capacity).toBe(10);
    expect(p.weekly['1']).toEqual([]);
  });
  it('μεταβάσεις κατάστασης', () => {
    expect(staffCanMove('PENDING', 'CONFIRMED')).toBe(true);
    expect(staffCanMove('CONFIRMED', 'COMPLETED')).toBe(true);
    expect(staffCanMove('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(staffCanMove('PENDING', 'COMPLETED')).toBe(false);
  });
});
