import { describe, expect, it } from 'vitest';
import { layoutLabels, markerScale, type LabelInput } from '../labels';

const room = (id: string, cx: number, cy: number, fitW: number, fitH: number, prio: number, pinned = false): LabelInput => ({
  id, kind: 'room', cx, cy, fitW, fitH, prio, pinned, full: { w: 60, h: 26 }, area: { w: 36, h: 13 },
});

describe('ετικέτες κάτοψης', () => {
  it('βαθμίδες ανά μέγεθος χώρου στην οθόνη', () => {
    const m = layoutLabels([room('big', 100, 100, 200, 120, 3), room('mid', 400, 100, 45, 20, 2), room('tiny', 700, 100, 20, 10, 1)]);
    expect(Object.fromEntries(m)).toEqual({ big: 'full', mid: 'area', tiny: 'hidden' });
  });

  it('δεν επικαλύπτονται: κερδίζει ο μεγαλύτερος, ο άλλος πέφτει σε m² ή κρύβεται', () => {
    const m = layoutLabels([room('a', 100, 100, 200, 120, 1), room('b', 110, 105, 200, 120, 5)]);
    expect(m.get('b')).toBe('full');
    expect(m.get('a')).toBe('hidden');
    const m2 = layoutLabels([room('a', 100, 100, 200, 120, 5), room('b', 100, 125, 200, 120, 1)]);
    expect(m2.get('b')).toBe('area');
  });

  it('ο επιλεγμένος χώρος φαίνεται πάντα, έστω μόνο με m²', () => {
    const m = layoutLabels([room('big', 100, 100, 300, 200, 9), room('sel', 100, 100, 10, 5, 0, true)]);
    expect(m.get('sel')).toBe('area');
  });

  it('διάσταση: μόνο όταν η ένδειξη χωρά στη γραμμή', () => {
    const d = (fitW: number): LabelInput => ({ id: 'd', kind: 'dim', cx: 0, cy: 0, fitW, fitH: 0, prio: 0, full: { w: 40, h: 14 } });
    expect(layoutLabels([d(30)]).get('d')).toBe('hidden');
    expect(layoutLabels([d(80)]).get('d')).toBe('full');
  });

  it('κλίμακα σημαδιών', () => {
    expect(markerScale(0.1)).toBe(0.7);
    expect(markerScale(2)).toBe(1);
  });
});
