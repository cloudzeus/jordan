import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({ item: {} as Record<string, unknown>, calls: [] as { url: string; body: Record<string, unknown> }[], reply: null as null | ((b: Record<string, unknown>) => Record<string, unknown>) }));

vi.mock('@/lib/db', () => ({ prisma: { softoneUnit: { findFirst: vi.fn(async ({ where }: any) => (where.code === 202 ? { code: 202 } : null)) } } }));
vi.mock('@/lib/softone', () => ({
  loadSoftoneConfig: vi.fn(async () => ({ endpoint: 'https://x.oncloud.gr/s1services', appId: '2020' })),
  softoneGetToken: vi.fn(async () => 'cid'),
  clearCachedToken: vi.fn(async () => undefined),
  softoneFetch: vi.fn(async (url: string, body: Record<string, unknown>) => {
    state.calls.push({ url, body });
    const r = state.reply ? state.reply(body) : { success: true, dryRun: body.DRYRUN === 1 };
    if (r.success && body.DRYRUN === 0) state.item = { ...state.item, unit2: String(body.MTRUNIT2), ratio2: body.MU21, strict2: body.MU12MODE === 1 };
    return r;
  }),
}));
vi.mock('@/lib/softone-sync/item-edit', () => ({ readSoftoneItem: vi.fn(async () => ({ ...state.item })) }));

import { isUnit2LockedError, setUnit2ViaScript, unit2ScriptConfig } from '../softone-sync/unit2-script';

beforeEach(() => {
  process.env.SOFTONE_UNITS_SECRET = 'a'.repeat(32);
  delete process.env.SOFTONE_UNITS_SCRIPT;
  state.item = { code: 'TE.TRAVE/RUSTPATT', isService: false, unit1: '125', unit2: null, ratio2: 0, strict2: false };
  state.calls = [];
  state.reply = null;
});

describe('Μ.Μ.2 μέσω script (εγκεκριμένη εξαίρεση)', () => {
  it('διαδρομή skroutz.units, πρώτα dry-run μετά εγγραφή, επαλήθευση με ανάγνωση', async () => {
    const r = await setUnit2ViaScript(636, { unit2: 202, ratio2: 52, strict2: false });
    expect(state.calls.map((c) => c.url)).toEqual([
      'https://x.oncloud.gr/s1services/JS/skroutz.units/setUnit2',
      'https://x.oncloud.gr/s1services/JS/skroutz.units/setUnit2',
    ]);
    expect(state.calls.map((c) => c.body.DRYRUN)).toEqual([1, 0]);
    expect(state.calls[0].body).toMatchObject({ clientID: 'cid', MTRL: 636, MTRUNIT2: 202, MU21: 52, MU12MODE: 0, SECRET: 'a'.repeat(32) });
    expect(r.before.unit2).toBeNull();
    expect(r.after.unit2).toBe('202');
  });

  it('dryRun: καμία εγγραφή', async () => {
    const r = await setUnit2ViaScript(636, { unit2: 202, ratio2: 52, strict2: false }, { dryRun: true });
    expect(state.calls).toHaveLength(1);
    expect(r.dryRun).toBe(true);
  });

  it('χωρίς μυστικό στο .env → ανενεργό, καμία κλήση', async () => {
    process.env.SOFTONE_UNITS_SECRET = '';
    expect(unit2ScriptConfig().enabled).toBe(false);
    await expect(setUnit2ViaScript(636, { unit2: 202, ratio2: 52, strict2: false })).rejects.toThrow(/SOFTONE_UNITS_SECRET/);
    expect(state.calls).toHaveLength(0);
  });

  it('τοπικοί έλεγχοι πριν από κάθε κλήση: ίδια με βασική, άγνωστη μονάδα', async () => {
    await expect(setUnit2ViaScript(636, { unit2: 125, ratio2: 52, strict2: false })).rejects.toThrow(/βασική/);
    await expect(setUnit2ViaScript(636, { unit2: 999, ratio2: 52, strict2: false })).rejects.toThrow(/Άγνωστη/);
    expect(state.calls).toHaveLength(0);
  });

  it('άρνηση του script στο dry-run (π.χ. γραμμές με ποσότητα Μ.Μ.2) → καμία εγγραφή', async () => {
    state.reply = () => ({ success: false, code: 'qty2_in_use', error: '3 γραμμές' });
    await expect(setUnit2ViaScript(636, { unit2: 202, ratio2: 52, strict2: false })).rejects.toThrow(/ιστορικό/);
    expect(state.calls).toHaveLength(1);
  });

  it('μη αναμενόμενη απάντηση (π.χ. παλιό script χωρίς έλεγχους) → σφάλμα', async () => {
    state.reply = () => ({ foo: 1 } as never);
    await expect(setUnit2ViaScript(636, { unit2: 202, ratio2: 52, strict2: false })).rejects.toThrow(/Μη αναμενόμενη/);
  });

  it('αναγνωρίζει το μήνυμα του SoftOne', () => {
    expect(isUnit2LockedError("Δεν μπορεί να γίνει αλλαγή του πεδίου 'Μ.Μ.2'. Υπάρχουν καταχωρημένα παραστατικά.")).toBe(true);
    expect(isUnit2LockedError('Κάτι άλλο')).toBe(false);
  });
});
