import { describe, expect, it } from 'vitest';
import { parsePeriod, s1Date } from '../period';

// Σάββατο 18 Οκτωβρίου 2026, μεσημέρι Αθήνας.
const NOW = new Date('2026-10-18T09:00:00Z');
const p = (s: string) => parsePeriod(s, NOW);

describe('parsePeriod', () => {
  it('αυτό τον μήνα / προηγούμενο μήνα', () => {
    expect(p('τι τζίρο έκανα αυτό τον μήνα;')).toEqual({ from: '2026-10-01', to: '2026-11-01', label: 'Οκτώβριος 2026' });
    expect(p('ti tziro ekana ayto ton mina')).toMatchObject({ from: '2026-10-01', to: '2026-11-01' });
    expect(p('τζίρος τον προηγούμενο μήνα')).toMatchObject({ from: '2026-09-01', to: '2026-10-01', label: 'Σεπτέμβριος 2026' });
  });

  it('όνομα μήνα: ο πιο πρόσφατος, ή με ρητό έτος', () => {
    expect(p('πωλήσεις τον Μάιο')).toMatchObject({ from: '2026-05-01', to: '2026-06-01' });
    expect(p('πωλήσεις Νοεμβρίου')).toMatchObject({ from: '2025-11-01', to: '2025-12-01' }); // δεν έχει έρθει ακόμη φέτος
    expect(p('τζίρος Μάρτιος 2025')).toMatchObject({ from: '2025-03-01', to: '2025-04-01', label: 'Μάρτιος 2025' });
    expect(p('Δεκέμβριο πέρσι')).toMatchObject({ from: '2025-12-01', to: '2026-01-01' });
    expect(p('στείλε μου mail')).toBeNull();
  });

  it('φέτος / πέρσι / προπέρσι / έτος', () => {
    expect(p('τζίρος φέτος')).toEqual({ from: '2026-01-01', to: '2026-10-19', label: 'Έτος 2026 (έως σήμερα)' });
    expect(p('πόσα τιμολογήσαμε πέρσι;')).toEqual({ from: '2025-01-01', to: '2026-01-01', label: 'Έτος 2025' });
    expect(p('προπέρσι')).toMatchObject({ from: '2024-01-01', to: '2025-01-01' });
    expect(p('πωλήσεις 2024')).toMatchObject({ from: '2024-01-01', to: '2025-01-01' });
  });

  it('τρίμηνα και εξάμηνα', () => {
    expect(p('τζίρος Q3')).toEqual({ from: '2026-07-01', to: '2026-10-01', label: 'Γ΄ τρίμηνο 2026' });
    expect(p('Q1 2025')).toMatchObject({ from: '2025-01-01', to: '2025-04-01' });
    expect(p("γ' τρίμηνο")).toMatchObject({ from: '2026-07-01', to: '2026-10-01' });
    expect(p('2ο τρίμηνο πέρσι')).toMatchObject({ from: '2025-04-01', to: '2025-07-01' });
    expect(p('δεύτερο τρίμηνο')).toMatchObject({ from: '2026-04-01', to: '2026-07-01' });
    expect(p('αυτό το τρίμηνο')).toMatchObject({ from: '2026-10-01', to: '2027-01-01' });
    expect(p("α' εξάμηνο 2025")).toMatchObject({ from: '2025-01-01', to: '2025-07-01', label: 'Α΄ εξάμηνο 2025' });
  });

  it('ημέρες, εβδομάδες, διαστήματα', () => {
    expect(p('τι πουλήσαμε σήμερα')).toMatchObject({ from: '2026-10-18', to: '2026-10-19' });
    expect(p('χθες')).toMatchObject({ from: '2026-10-17', to: '2026-10-18' });
    expect(p('αυτή την εβδομάδα')).toMatchObject({ from: '2026-10-12', to: '2026-10-19' }); // από Δευτέρα
    expect(p('τις τελευταίες 30 μέρες')).toMatchObject({ from: '2026-09-19', to: '2026-10-19' });
    expect(p('από 1/3/2026 έως 15/4/2026')).toMatchObject({ from: '2026-03-01', to: '2026-04-16' });
  });

  it('χωρίς χρόνο → null', () => {
    expect(p('ποιο είναι το υπόλοιπο του προμηθευτή Χατζηλιάδη')).toBeNull();
  });

  it('μορφή για το φίλτρο TRNDATE', () => {
    expect(s1Date('2026-10-01')).toBe('20261001');
  });
});

describe('parsePeriod — εβδομάδες', () => {
  it('επόμενη εβδομάδα = Δευτέρα–Κυριακή', () => {
    expect(parsePeriod('ραντεβού την επόμενη εβδομάδα', NOW)).toMatchObject({ from: '2026-10-19', to: '2026-10-26' });
  });
});
