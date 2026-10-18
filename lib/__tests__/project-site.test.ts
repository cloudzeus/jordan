import { describe, expect, it } from 'vitest';
import { parseCandidates, parseFeature, precisionOf, siteLine } from '../project-site-core';

// Σχήμα απάντησης MapTiler (επαληθευμένο ζωντανά, 2026-10-18).
const address = {
  center: [23.742352, 37.997487] as [number, number], place_type: ['address'], text: 'Πεστών', address: '13',
  place_name: 'Πεστών 13, 113 62 Αθήνα, Ελλάς',
  context: [
    { id: 'postal_code.1', text: '113 62' }, { id: 'place.2', text: 'Νέα Κυψέλη' },
    { id: 'neighbourhood.3', text: 'Συνοικία Νέας Κυψέλης' }, { id: 'municipality.4', text: 'Δήμος Αθηναίων' },
  ],
};
const street = { center: [23.74, 37.99] as [number, number], place_type: ['street'], text: 'Πεστών', place_name: 'Πεστών, 113 62 Αθήνα, Ελλάς', context: [{ id: 'postal_code.1', text: '113 62' }] };
const area = { center: [23.134, 37.259] as [number, number], place_type: ['county'], text: 'Σπέτσες', place_name: 'Σπέτσες, Ελλάς', context: [{ id: 'subregion.9', text: 'Περιφέρεια Αττικής' }] };

describe('τοποθεσία έργου — ανάλυση geocoder', () => {
  it('ακρίβεια από το place_type', () => {
    expect(precisionOf(['address'])).toBe('exact');
    expect(precisionOf(['street'])).toBe('street');
    expect(precisionOf(['postal_code'])).toBe('area');
    expect(precisionOf(undefined)).toBe('area');
  });
  it('διεύθυνση: οδός+αριθμός, Τ.Κ. χωρίς κενό, πόλη από το «Τ.Κ. Πόλη», συνοικία ως περιοχή', () => {
    expect(parseFeature(address)).toEqual({
      lat: 37.997487, lng: 23.742352, formatted: 'Πεστών 13, 113 62 Αθήνα, Ελλάς',
      address: 'Πεστών 13', zip: '11362', district: 'Νέα Κυψέλη', city: 'Αθήνα', precision: 'exact',
    });
  });
  it('«address» χωρίς αριθμό οδού = μόνο η οδός', () => {
    expect(parseFeature({ ...address, address: undefined })).toMatchObject({ precision: 'street', address: 'Πεστών' });
  });
  it('περιοχή χωρίς διεύθυνση: πόλη = το όνομά της, χωρίς οδό', () => {
    expect(parseFeature(area)).toMatchObject({ address: null, zip: null, city: 'Σπέτσες', precision: 'area', district: null });
  });
  it('άκυρο σημείο (0,0 ή χωρίς center) απορρίπτεται', () => {
    expect(parseFeature({ ...address, center: [0, 0] })).toBeNull();
    expect(parseFeature({ ...address, center: undefined })).toBeNull();
  });
  it('οι ακριβέστερες πρώτα, με όριο', () => {
    const r = parseCandidates({ features: [area, street, address] });
    expect(r.map((c) => c.precision)).toEqual(['exact', 'street', 'area']);
    expect(parseCandidates({ features: [area, street, address] }, 1)).toHaveLength(1);
    expect(parseCandidates(null)).toEqual([]);
  });
  it('γραμμή εμφάνισης', () => {
    expect(siteLine({ address: 'Πεστών 13', zip: '11362', city: 'Αθήνα' })).toBe('Πεστών 13, 11362 Αθήνα');
    expect(siteLine({ formatted: 'Σπέτσες, Ελλάς' })).toBe('Σπέτσες, Ελλάς');
  });
});
