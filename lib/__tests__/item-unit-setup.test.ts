import { describe, expect, it } from 'vitest';
import { checkUnitSetup, containerPalletSqmPreset, describeChain, type UnitSetup } from '../item-unit-setup';

const NAMES: Record<string, string> = { '125': 'Μετ²', '202': 'ΠΑΛ', '203': 'CONT', '101': 'Τεμ.', '107': 'Κιβ.' };
const name = (id: string | null) => (id ? NAMES[id] ?? id : '—');
const base: UnitSetup = {
  unit1: '125', unit2: null, ratio2: 0, strict2: false,
  unitBuy: '125', buyRatio: 1, buyStrict: true, unitSell: '125', sellRatio: 1, sellStrict: true,
};
const errors = (s: UnitSetup) => checkUnitSetup(s, name).filter((i) => i.level === 'error');
const warns = (s: UnitSetup) => checkUnitSetup(s, name).filter((i) => i.level === 'warn');

describe('checkUnitSetup', () => {
  it('μία μονάδα παντού με σχέση 1 ⇒ καθαρό', () => {
    expect(checkUnitSetup(base, name)).toEqual([]);
  });

  it('ίδια μονάδα με τη βασική αλλά σχέση ≠ 1 ⇒ σφάλμα', () => {
    expect(errors({ ...base, sellRatio: 52 })[0].message).toMatch(/σχέση πρέπει να είναι 1/);
  });

  it('διαφορετική μονάδα χωρίς σχέση ⇒ σφάλμα· με σχέση 1 ⇒ προειδοποίηση «ξεχάστηκε ο συντελεστής»', () => {
    expect(errors({ ...base, unitBuy: '203', buyRatio: 0 })[0].field).toBe('buyRatio');
    expect(warns({ ...base, unitBuy: '203', buyRatio: 1 })[0].message).toMatch(/ξεχάστηκε ο συντελεστής/);
  });

  it('container που «χωράει» λιγότερο από μία παλέτα ⇒ προειδοποίηση για ανάποδο συντελεστή', () => {
    const s = { ...base, unit2: '202', ratio2: 52, unitBuy: '203', buyRatio: 0.05 };
    expect(warns(s).some((w) => /ανάποδα/.test(w.message))).toBe(true);
  });

  it('χωρίς βασική ⇒ σφάλμα', () => {
    expect(errors({ ...base, unit1: null })[0].field).toBe('unit1');
  });
});

describe('Container → Παλέτα → τ.μ.', () => {
  const ids = { sqm: '125', pallet: '202', container: '203' };

  it('το πρότυπο: βασική/πώληση τ.μ., Μ.Μ.2 παλέτα (ελεύθερη), αγορές container = παλέτες × τ.μ.', () => {
    const p = containerPalletSqmPreset(ids, 52, 20);
    expect(p).toMatchObject({
      unit1: '125', unit2: '202', ratio2: 52, strict2: false, unitBuy: '203', buyRatio: 1040, unitSell: '125', sellRatio: 1,
    });
    expect(checkUnitSetup({ ...base, ...p } as UnitSetup, name).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('η περιγραφή λέει τι μπαίνει στην αποθήκη', () => {
    const s = { ...base, ...containerPalletSqmPreset(ids, 52, 20) } as UnitSetup;
    const lines = describeChain(s, name);
    expect(lines[0]).toBe('Αγορά: 2 CONT → μπαίνουν στην αποθήκη 2.080 Μετ² (1 CONT = 20 ΠΑΛ).');
    expect(lines[1]).toMatch(/1 ΠΑΛ = 52 Μετ²/);
    expect(lines[1]).toMatch(/μέσος όρος/);
  });
});
