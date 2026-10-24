import { describe, expect, it } from 'vitest';
import { careGuides, materialsByRoom } from '../dossier-core';

describe('dossier-core', () => {
  it('οδηγοί φροντίδας από τα ονόματα των υλικών', () => {
    expect(careGuides(['ΒΥΖΑΝΤΙΝΟ ΤΡΑΒΕΡΤΙΝΟ ΓΑΙΑ', 'Τσιμεντοκονία μικροτσιμέντου (σετ)', 'Στεγανωτικό σύστημα μπάνιου']).map((g) => g.key)).toEqual(['stone', 'microcement', 'waterproof']);
    expect(careGuides(['Πλακάκι 60x60', 'Κόλλα']).map((g) => g.key)).toEqual(['tile']);
    expect(careGuides(['Κόλλα πλακιδίων C2']).map((g) => g.key)).toEqual(['tile']);
    expect(careGuides([])).toEqual([]);
  });

  it('υλικά ανά χώρο: σειρά κάτοψης, ένωση ίδιου είδους, «Γενικά» στο τέλος', () => {
    const out = materialsByRoom([
      { code: 'K', name: 'Κόλλα', qty: 10, unit: 'kg', room: null },
      { code: 'P', name: 'Πέτρα', qty: 5, unit: 'm²', room: 'Μπάνιο' },
      { code: 'P', name: 'Πέτρα', qty: 2.5, unit: 'm²', room: 'Μπάνιο' },
      { code: 'P', name: 'Πέτρα', qty: 20, unit: 'm²', room: 'Σαλόνι' },
    ], ['Σαλόνι', 'Μπάνιο']);
    expect(out.map((g) => g.room)).toEqual(['Σαλόνι', 'Μπάνιο', 'Γενικά']);
    expect(out[1].items).toEqual([{ code: 'P', name: 'Πέτρα', qty: 7.5, unit: 'm²', room: 'Μπάνιο' }]);
  });
});
