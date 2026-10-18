import { describe, expect, it } from 'vitest';
import { addressLine, classify, hasCoords, isoCountry, needsRegistryAddress, registryTarget } from '../geo-batch-core';

const hit = (o: Partial<Parameters<typeof classify>[1] & object> = {}) => ({ found: true, lat: 37.96, lng: 23.74, zip: '11636', city: 'Αθήνα', countryCode: 'GR', formatted: 'Λεωφόρος Βουλιαγμένης 39, 116 36 Αθήνα', ...o });

describe('μαζική γεωκωδικοποίηση', () => {
  it('χώρα: EL → GR', () => {
    expect(isoCountry('EL')).toBe('GR');
    expect(isoCountry('cy')).toBe('CY');
    expect(isoCountry('')).toBeNull();
    expect(isoCountry('Ελλάδα')).toBeNull();
  });

  it('γραμμή διεύθυνσης: μόνο ό,τι υπάρχει, ΤΚ 5 ψηφία, χωρίς διπλή περιοχή', () => {
    expect(addressLine({ address: ' Βουλιαγμένης  39 ', zip: '116 36', city: 'Αθήνα', district: 'Μετς' })).toBe('Βουλιαγμένης 39, 11636 Αθήνα, Μετς');
    expect(addressLine({ city: 'Πάτρα' })).toBe('Πάτρα');
    expect(addressLine({ city: 'Αθήνα', district: 'ΑΘΗΝΑ' })).toBe('Αθήνα');
    expect(addressLine({})).toBeNull();
  });

  it('κατάταξη', () => {
    const full = { address: 'Βουλιαγμένης 39', zip: '11636', city: 'Αθήνα' };
    expect(classify({}, hit())).toBe('no_address');
    expect(classify(full, null)).toBe('not_found');
    expect(classify(full, hit({ found: false }))).toBe('not_found');
    expect(classify(full, hit({ lat: null }))).toBe('not_found');
    expect(classify(full, hit())).toBe('match');
    expect(classify(full, hit({ zip: '54622' }))).toBe('ambiguous');
    // ίδια οδός, διπλανός ΤΚ (ίδια περιοχή 116xx) → match
    expect(classify(full, hit({ zip: '11637' }))).toBe('match');
    expect(classify({ ...full, address: 'Άγνωστη 1' }, hit({ zip: '11637' }))).toBe('ambiguous');
    expect(classify(full, hit({ countryCode: 'IT' }))).toBe('ambiguous');
    expect(classify({ city: 'Αθήνα' }, hit())).toBe('ambiguous');
    expect(classify({ address: 'Οδός 1', city: 'Πάτρα' }, hit({ zip: null, city: 'Αθήνα' }))).toBe('ambiguous');
    expect(classify({ address: 'Βουλιαγμένης 1', city: 'ΑΘΗΝΑ' }, hit({ zip: null, city: 'Αθήνα' }))).toBe('match');
    // μόνο ΤΚ/οικισμός, όχι η οδός → «approximate»
    expect(classify({ address: 'Νικολάου Γκύζη 8', zip: '84200', city: 'Τήνος' }, hit({ zip: '84200', city: null, formatted: '842 00, Ελλάδα' }))).toBe('approximate');
    expect(classify({ address: 'ΠΕΡΑ ΤΡΙΟΒΑΣΑΛΟΣ', zip: '84800' }, hit({ zip: '84800', formatted: 'Πέρα Τριοβασάλου-Παρασπόρου, 848 00 Δήμος Μήλου, Ελλάδα' }))).toBe('match');
  });

  it('υπάρχουσα θέση', () => {
    expect(hasCoords('37.9', '23.7')).toBe(true);
    expect(hasCoords('0', '0')).toBe(false);
    expect(hasCoords('', '')).toBe(false);
    expect(hasCoords('91', '23')).toBe(false);
  });

  it('ΑΑΔΕ/VIES όταν λείπει διεύθυνση', () => {
    expect(needsRegistryAddress({ address: '', city: 'Αθήνα' })).toBe(true);
    expect(needsRegistryAddress({ address: 'Οδός 1' })).toBe(true);
    expect(needsRegistryAddress({ address: 'Οδός 1', zip: '11636' })).toBe(false);
    expect(registryTarget('801771250', 'GR')).toEqual({ kind: 'aade', afm: '801771250' });
    expect(registryTarget('EL801771250', null)).toEqual({ kind: 'aade', afm: '801771250' });
    expect(registryTarget('12345', 'GR')).toBeNull();
    expect(registryTarget('000000000', 'GR')).toBeNull();
    expect(registryTarget('01808880270', 'IT')).toEqual({ kind: 'vies', vat: 'IT01808880270' });
    expect(registryTarget('IT01808880270', 'IT')).toEqual({ kind: 'vies', vat: 'IT01808880270' });
    expect(registryTarget('', 'IT')).toBeNull();
  });
});
