import { describe, it, expect } from 'vitest';
import { planTraderUpdate, traderValuesFromRow, unappliedChanges, TRADER_OBJECT_BY_SODTYPE } from '@/lib/trader-update';

const live = traderValuesFromRow(
  { NAME: 'ΑΛΦΑ ΑΕ', AFM: '094014201', IRSDATA: '1104', ADDRESS: 'Οδός 1', ZIP: '10431', CITY: 'ΑΘΗΝΑ', PHONE01: '2101234567', EMAIL: '' },
  { KAD: '120', KAD1: '' },
);

describe('planTraderUpdate', () => {
  it('στέλνει ΜΟΝΟ ό,τι άλλαξε', () => {
    const p = planTraderUpdate(live, { ...live, city: 'ΠΕΙΡΑΙΑΣ', email: 'info@alfa.gr' });
    expect(p.changes.map((c) => c.key)).toEqual(['city', 'email']);
    expect(p.row).toEqual({ CITY: 'ΠΕΙΡΑΙΑΣ', EMAIL: 'info@alfa.gr' });
    expect(p.extra).toBeNull();
  });
  it('απόντα κλειδιά = «δεν αγγίζω»· κενά/διπλά κενά δεν είναι αλλαγή', () => {
    expect(planTraderUpdate(live, { name: '  ΑΛΦΑ   ΑΕ ' }).changes).toEqual([]);
    expect(planTraderUpdate(live, { zip: '10431' }).changes).toEqual([]);
  });
  it('σβήσιμο πεδίου = κενό string· η επωνυμία δεν σβήνεται', () => {
    expect(planTraderUpdate(live, { phone: '' }).row).toEqual({ PHONE01: '' });
    const p = planTraderUpdate(live, { name: '' });
    expect(p.errors).toHaveLength(1);
    expect(p.changes).toEqual([]);
  });
  it('όριο χαρακτήρων του schema', () => {
    expect(planTraderUpdate(live, { zip: '12345678901' }).errors[0]).toMatch(/Τ\.Κ\..*10/);
  });
  it('Δ.Ο.Υ./χώρα ως αριθμητικά κλειδιά· ΚΑΔ στον πίνακα EXTRA', () => {
    const p = planTraderUpdate(live, { irsData: '1159', country: '1000', kad: 777 });
    expect(p.row).toEqual({ IRSDATA: 1159, COUNTRY: 1000 });
    expect(p.extra).toEqual({ KAD: 777 });
    expect(planTraderUpdate(live, { country: 'GR' }).errors[0]).toMatch(/Χώρα/);
  });
  it('μετά την εγγραφή: ό,τι δεν κράτησε η SoftOne', () => {
    const p = planTraderUpdate(live, { city: 'ΠΕΙΡΑΙΑΣ', kad: 777 });
    expect(unappliedChanges(p, { ...live, city: 'ΠΕΙΡΑΙΑΣ', kad: 777 })).toEqual([]);
    expect(unappliedChanges(p, { ...live, city: 'ΑΘΗΝΑ', kad: 120 }).map((c) => c.key)).toEqual(['city', 'kad']);
  });
  it('object ανά τύπο — οι χρηματικοί λογαριασμοί (14) δεν τροποποιούνται', () => {
    expect(TRADER_OBJECT_BY_SODTYPE[13]).toEqual({ object: 'CUSTOMER', extra: 'CUSEXTRA' });
    expect(TRADER_OBJECT_BY_SODTYPE[14]).toBeUndefined();
  });
});

describe('γεωγραφική θέση (TRDR.LATITUDE / LONGITUDE)', () => {
  const cur = traderValuesFromRow({ NAME: 'Α', LATITUDE: '37.9754', LONGITUDE: '23.7348' });
  it('διαβάζει το ζεύγος· το (0,0) είναι άγνωστο', () => {
    expect(cur).toMatchObject({ lat: 37.9754, lng: 23.7348 });
    expect(traderValuesFromRow({ NAME: 'Α', LATITUDE: '0', LONGITUDE: '0' })).toMatchObject({ lat: null, lng: null });
  });
  it('νέα θέση ⇒ γράφει και τα δύο ως αριθμούς', () => {
    const p = planTraderUpdate(cur, { lat: 36.7213, lng: 24.4459 });
    expect(p.errors).toEqual([]);
    expect(p.row).toEqual({ LATITUDE: 36.7213, LONGITUDE: 24.4459 });
    expect(p.changes[0]).toMatchObject({ key: 'coords', from: '37.975400, 23.734800', to: '36.721300, 24.445900' });
  });
  it('ίδια θέση (εντός ~5 cm) ⇒ καμία αλλαγή', () => {
    expect(planTraderUpdate(cur, { lat: 37.97540001, lng: 23.7348 }).changes).toEqual([]);
  });
  it('μισό ζεύγος ή εκτός ορίων ⇒ σφάλμα, τίποτα δεν γράφεται', () => {
    for (const next of [{ lat: 37.9, lng: null }, { lat: 95, lng: 23 }, { lat: 0, lng: 0 }]) {
      const p = planTraderUpdate(cur, next);
      expect(p.errors.length).toBe(1);
      expect(p.row).toEqual({});
    }
  });
  it('και τα δύο κενά ⇒ σβήσιμο', () => {
    const p = planTraderUpdate(cur, { lat: null, lng: null });
    expect(p.row).toEqual({ LATITUDE: '', LONGITUDE: '' });
    expect(p.changes[0].to).toBeNull();
  });
  it('επαλήθευση μετά την εγγραφή: θέση που δεν κράτησε η SoftOne φαίνεται', () => {
    const p = planTraderUpdate(cur, { lat: 36.7213, lng: 24.4459 });
    expect(unappliedChanges(p, { ...cur, lat: 36.7213, lng: 24.4459 })).toEqual([]);
    expect(unappliedChanges(p, cur).map((c) => c.key)).toEqual(['coords']);
  });
});

describe('εμπορική κατηγορία (TRDBUSINESS)', () => {
  it('διαβάζεται από τη γραμμή TRDR· TRDCATEGORY / TRDGROUP δεν είναι πεδία της φόρμας', () => {
    const v = traderValuesFromRow({ TRDCATEGORY: '2', TRDBUSINESS: '7', TRDGROUP: '3' });
    expect(v).toMatchObject({ trdBusiness: '7' });
    expect(v).not.toHaveProperty('trdCategory');
    expect(v).not.toHaveProperty('trdGroup');
  });
  it('γράφεται ως αριθμός, μόνο αν άλλαξε', () => {
    expect(planTraderUpdate({ trdBusiness: null }, { trdBusiness: '5' }).row).toEqual({ TRDBUSINESS: 5 });
    expect(planTraderUpdate({ trdBusiness: '5' }, { trdBusiness: '5' }).changes).toHaveLength(0);
  });
  it('μη αριθμητική τιμή ⇒ σφάλμα', () => {
    expect(planTraderUpdate({}, { trdBusiness: 'ΠΛΑΚ' }).errors).toHaveLength(1);
  });
});
