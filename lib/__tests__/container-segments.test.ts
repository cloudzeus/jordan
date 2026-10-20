import { describe, expect, it } from 'vitest';
import { segmentRanges } from '@/components/admin/container-scene';

describe('segmentRanges — παλέτες ανά προϊόν στο κοινό container', () => {
  it('μοιράζει τις γεμάτες θέσεις με τη σειρά των τμημάτων', () => {
    expect(segmentRanges(6, [2, 3, 1])).toEqual([[0, 2], [2, 5], [5, 6]]);
  });

  it('μισές παλέτες: η μισή «συμπληρώνεται» με την επόμενη, σύνολο = ⌊γεμάτες⌋', () => {
    expect(segmentRanges(3, [1.5, 1.5, 0.5])).toEqual([[0, 1], [1, 3], [3, 3]]);
    expect(segmentRanges(0, [0.5])).toEqual([[0, 0]]);
  });

  it('προϊόν χωρίς παλέτες = κενό τμήμα· ποτέ πέρα από τις διαθέσιμες θέσεις', () => {
    expect(segmentRanges(4, [0, 2, 5])).toEqual([[0, 0], [0, 2], [2, 4]]);
    expect(segmentRanges(4, [-1, 1])).toEqual([[0, 0], [0, 1]]);
  });
});
