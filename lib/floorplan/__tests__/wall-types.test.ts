import { describe, it, expect } from 'vitest';
import { wallTypeInput, WALL_TYPE_SEED, WALL_TYPE_CATEGORIES, WALL_TYPE_CATEGORY_LABEL } from '../wall-types';

describe('wallTypeInput', () => {
  const base = { code: 'GB10', name: 'Γυψοσανίδα μονή 10 cm', category: 'DRYWALL', thicknessM: 0.1 };

  it('parses a minimal valid type with defaults', () => {
    const t = wallTypeInput.parse(base);
    expect(t.measureFaces).toBe('both');
    expect(t.active).toBe(true);
    expect(t.bottomM).toBe(0);
    expect(t.topM).toBeNull();
    expect(t.cadLayerHints).toEqual([]);
  });

  it('rejects non-positive or oversized thickness', () => {
    expect(wallTypeInput.safeParse({ ...base, thicknessM: 0 }).success).toBe(false);
    expect(wallTypeInput.safeParse({ ...base, thicknessM: 3 }).success).toBe(false);
  });

  it('rejects topM at or below bottomM', () => {
    expect(wallTypeInput.safeParse({ ...base, bottomM: 1, topM: 1 }).success).toBe(false);
    expect(wallTypeInput.safeParse({ ...base, bottomM: 1, topM: 0.5 }).success).toBe(false);
    expect(wallTypeInput.safeParse({ ...base, bottomM: 0, topM: 2.6 }).success).toBe(true);
  });

  it('accepts only null or a single digit 1-9 as hotkey', () => {
    expect(wallTypeInput.safeParse({ ...base, hotkey: '5' }).success).toBe(true);
    expect(wallTypeInput.safeParse({ ...base, hotkey: '0' }).success).toBe(false);
    expect(wallTypeInput.safeParse({ ...base, hotkey: 'A' }).success).toBe(false);
  });
});

describe('WALL_TYPE_SEED', () => {
  it('every entry is valid', () => {
    for (const s of WALL_TYPE_SEED) expect(wallTypeInput.safeParse(s).success).toBe(true);
  });

  it('codes are unique', () => {
    const codes = WALL_TYPE_SEED.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('covers every category label', () => {
    for (const c of WALL_TYPE_CATEGORIES) expect(WALL_TYPE_CATEGORY_LABEL[c]).toBeTruthy();
  });
});
