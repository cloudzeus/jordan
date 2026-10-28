import { describe, it, expect } from 'vitest';
import { metersToCmField, cmLabel, wallTypeFormToRaw, type WallTypeForm } from '../wall-type-form';
import { wallTypeInput, type WallTypeInput } from '../wall-types';

const form = (over: Partial<WallTypeForm> = {}): WallTypeForm => ({
  code: 'GB125', name: 'Γυψοσανίδα διπλή', category: 'DRYWALL', thicknessCm: '12.5',
  bottomM: '0', topM: '', color: '#f97316', measureFaces: 'both', hotkey: '2', sortOrder: '20', cadHints: '', active: true,
  ...over,
});

describe('metersToCmField', () => {
  it('keeps fractional cm without rounding to integer', () => {
    expect(metersToCmField(0.125)).toBe('12.5');
    expect(metersToCmField(0.1)).toBe('10');
    expect(metersToCmField(0.02)).toBe('2');
  });
});

describe('cmLabel', () => {
  it('shows fractional cm (Greek decimal comma)', () => {
    expect(cmLabel(0.125)).toBe('12,5 cm');
    expect(cmLabel(0.1)).toBe('10 cm');
  });
});

describe('wallTypeFormToRaw', () => {
  it('round-trips a fractional thickness through cm without drift', () => {
    const raw = wallTypeFormToRaw(form({ thicknessCm: metersToCmField(0.125) }), null);
    expect(raw.thicknessM).toBeCloseTo(0.125, 6);
  });

  it('preserves fields the form does not render (pattern, recipes, attenuation)', () => {
    const initial: WallTypeInput = wallTypeInput.parse({
      code: 'IND5', name: 'Ενδεικτικό', category: 'INDICATIVE', thicknessM: 0.05,
      pattern: 'dashed', coreRecipeId: 'core1', faceRecipeId: 'face1', lengthItemMtrl: 7, attenuationDb: 42,
    });
    const raw = wallTypeFormToRaw(form({ name: 'Ενδεικτικό (νέο)' }), initial);
    expect(raw.pattern).toBe('dashed');
    expect(raw.coreRecipeId).toBe('core1');
    expect(raw.faceRecipeId).toBe('face1');
    expect(raw.lengthItemMtrl).toBe(7);
    expect(raw.attenuationDb).toBe(42);
    // and the whole thing still validates
    expect(wallTypeInput.safeParse(raw).success).toBe(true);
  });

  it('leaves un-rendered fields null for a new type', () => {
    const raw = wallTypeFormToRaw(form(), null);
    expect(raw.pattern).toBeNull();
    expect(raw.coreRecipeId).toBeNull();
    expect(raw.attenuationDb).toBeNull();
  });

  it('treats empty topM as null and parses bottomM', () => {
    const raw = wallTypeFormToRaw(form({ bottomM: '0,5', topM: '' }), null);
    expect(raw.topM).toBeNull();
    expect(raw.bottomM).toBeCloseTo(0.5, 6);
  });
});
