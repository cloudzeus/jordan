import { describe, expect, it } from 'vitest';
import { containerLayout, stoneStack } from '@/components/admin/container-scene';

describe('containerLayout — βαρύ φορτίο σε ΜΙΑ στρώση όσο χωράει', () => {
  it('έως 8 παλέτες: 20ft, όλες στο δάπεδο', () => {
    const l = containerLayout(8);
    expect(l.size).toBe('20ft');
    expect(new Set(l.slots.map((s) => s.y)).size).toBe(1);
  });
  it('9–18 παλέτες: 40ft, μία στρώση', () => {
    const l = containerLayout(18);
    expect(l.size).toBe('40ft');
    expect(l.slots).toHaveLength(18);
    expect(new Set(l.slots.map((s) => s.y)).size).toBe(1);
  });
  it('πέρα από τη χωρητικότητα: όσες χωρούν + «κρυφές»', () => {
    const l = containerLayout(100);
    expect(l.slots.length + l.hidden).toBe(100);
    expect(l.hidden).toBeGreaterThan(0);
  });
});

describe('stoneStack', () => {
  it('πλάκες 60×40: 2×2 ανά στρώση στην παλέτα 1,2×1,0· στρώσεις για 30 τ.μ.', () => {
    const s = stoneStack({ l: 0.6, w: 0.4, t: 0.02 }, 30);
    expect(s.perLayer).toBe(4);
    expect(s.neededLayers).toBe(Math.ceil(30 / (4 * 0.24)));
  });
});
