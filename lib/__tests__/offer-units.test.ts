import { describe, expect, it, vi } from 'vitest';
import { applyUnits, isUnit2Locked, unitsPatch } from '../offer-units';

const ids = { pallet: '20', container: '21' };
const LOCKED = "Δεν μπορεί να γίνει αλλαγή του πεδίου 'Μ.Μ.2'. Υπάρχουν καταχωρημένα παραστατικά.";

describe('unitsPatch — τι στέλνουμε στο SoftOne', () => {
  it('χωρίς παραστατικά: Μ.Μ.2 = Παλέτα + μονάδα αγορών = Container', () => {
    expect(unitsPatch({ ids, perPallet: 52, capacity: 20, hasMovements: false })).toEqual({ unit2: '20', ratio2: 52, strict2: false, unitBuy: '21', buyRatio: 1040 });
  });
  it('με παραστατικά: ΜΟΝΟ μονάδα αγορών (ποτέ unit2/ratio2/strict2)', () => {
    const p = unitsPatch({ ids, perPallet: 26.94, capacity: 20, hasMovements: true });
    expect(p).toEqual({ unitBuy: '21', buyRatio: 538.8 });
    expect('unit2' in p || 'ratio2' in p || 'strict2' in p).toBe(false);
  });
  it('Μ.Μ.2 ήδη Παλέτα με ίδια σχέση: δεν ξαναστέλνεται', () => {
    expect(unitsPatch({ ids, perPallet: 52, capacity: 20, hasMovements: null, current: { unit2: '20', ratio2: 52 } })).toEqual({ unitBuy: '21', buyRatio: 1040 });
  });
  it('αναγνωρίζει το μήνυμα/κωδικό κλειδωμένης Μ.Μ.2', () => {
    expect(isUnit2Locked(LOCKED)).toBe(true);
    expect(isUnit2Locked('άλλο σφάλμα')).toBe(false);
    expect(isUnit2Locked(null, 'unit2_locked')).toBe(true);
  });
});

describe('applyUnits — ποτέ δεν πετά, πάντα αποτέλεσμα', () => {
  it('κλειδωμένη Μ.Μ.2 ⇒ ξαναδοκιμάζει μόνο με μονάδα αγορών', async () => {
    const put = vi.fn().mockResolvedValueOnce({ ok: false, message: LOCKED, code: 'softone_error' }).mockResolvedValueOnce({ ok: true });
    const r = await applyUnits('0000405', unitsPatch({ ids, perPallet: 26.94, capacity: 20, hasMovements: null }), put);
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1][0]).toEqual({ unitBuy: '21', buyRatio: 538.8 });
    expect(r).toMatchObject({ ok: true, partial: true });
  });
  it('απόρριψη και της μονάδας αγορών ⇒ αποτυχία με το μήνυμα, χωρίς exception', async () => {
    const put = vi.fn().mockResolvedValue({ ok: false, message: 'Μ.Μ.Αγορών κλειδωμένη' });
    const r = await applyUnits('X', { unitBuy: '21', buyRatio: 10 }, put);
    expect(r).toEqual({ code: 'X', ok: false, partial: false, message: 'Μ.Μ.Αγορών κλειδωμένη' });
  });
  it('σφάλμα δικτύου ⇒ αποτυχία, όχι throw', async () => {
    const r = await applyUnits('X', { unitBuy: '21', buyRatio: 10 }, async () => { throw new Error('offline'); });
    expect(r).toMatchObject({ ok: false, message: 'offline' });
  });
});
