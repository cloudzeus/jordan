import { describe, expect, it } from 'vitest';
import { textBlocks } from '@/app/dashboard/customer/_ui/customer-text';

describe('textBlocks', () => {
  it('επικεφαλίδες, λίστες, βήματα και παράγραφοι', () => {
    const b = textBlocks('Αγαπητοί συνεργάτες,\n\nΗ προσφορά περιγράφει την τοποθέτηση. Στόχος μας είναι η ποιότητα.\n\nΤι περιλαμβάνει\n• Σαλόνι: πέτρα.\n• Μπάνιο: τραβερτίνο.\n\nΠώς θα προχωρήσουμε\n1. Έγκριση.\n2. Παράδοση υλικών.');
    expect(b.map((x) => x.kind)).toEqual(['p', 'p', 'h', 'ul', 'h', 'ol']);
    expect(b[3].items).toEqual(['Σαλόνι: πέτρα.', 'Μπάνιο: τραβερτίνο.']);
    expect(b[5].items).toEqual(['Έγκριση.', 'Παράδοση υλικών.']);
  });
});
