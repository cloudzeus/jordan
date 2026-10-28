import { describe, expect, it } from 'vitest';
import {
  codeTaken, collateralDamage, nextRegistryId, registryInput, withNewRow, withoutRow, withPatchedRow,
} from '../product-registry-core';

const marks = [
  { COMPANY: '1000', SODTYPE: '51', MTRMARK: '1', CODE: 'CRR', NAME: 'Casteli', ISACTIVE: '1' },
  { COMPANY: '1000', SODTYPE: '51', MTRMARK: '2', CODE: 'ZELLIGE', NAME: 'Zellige', ISACTIVE: '1' },
];

describe('μητρώα-λίστα SoftOne (μάρκες / κατασκευαστές)', () => {
  it('νέα γραμμή: όλες οι υπάρχουσες μένουν αυτούσιες και παίρνει τον επόμενο αριθμό', () => {
    const { list, id } = withNewRow(marks, 'MTRMARK', { code: 'NEW', name: 'Νέα', isActive: true });
    expect(id).toBe(3);
    expect(list).toHaveLength(3);
    expect(list.slice(0, 2)).toEqual(marks);
    expect(list[2]).toMatchObject({ MTRMARK: '3', CODE: 'NEW', NAME: 'Νέα', ISACTIVE: '1', COMPANY: '1000', SODTYPE: '51' });
  });

  it('ο κατασκευαστής δεν παίρνει SODTYPE', () => {
    const rows = [{ COMPANY: '1000', MTRMANFCTR: '1', CODE: 'HAL', NAME: 'Halcon', ISACTIVE: '1' }];
    expect(withNewRow(rows, 'MTRMANFCTR', { code: 'X', name: 'Χ', isActive: true }).list[1]).not.toHaveProperty('SODTYPE');
  });

  it('αλλαγή: αγγίζει ΜΟΝΟ τη γραμμή του id', () => {
    const out = withPatchedRow(marks, 'MTRMARK', 2, { code: 'ZEL2', name: 'Αλλαγμένη', isActive: false });
    expect(out[0]).toEqual(marks[0]);
    expect(out[1]).toMatchObject({ MTRMARK: '2', CODE: 'ZEL2', NAME: 'Αλλαγμένη', ISACTIVE: '0' });
  });

  it('διαγραφή = παράλειψη της γραμμής από τη λίστα', () => {
    expect(withoutRow(marks, 'MTRMARK', 1).map((r) => r.MTRMARK)).toEqual(['2']);
  });

  it('διπλός κωδικός εντοπίζεται (χωρίς πεζά/κεφαλαία), εκτός από την ίδια γραμμή', () => {
    expect(codeTaken(marks, 'MTRMARK', 'zellige')).toBe(true);
    expect(codeTaken(marks, 'MTRMARK', 'zellige', 2)).toBe(false);
  });

  it('ανιχνεύει ζημιά: γραμμή που δεν πειράξαμε χάθηκε ή άλλαξε', () => {
    const touched = withPatchedRow(marks, 'MTRMARK', 2, { code: 'ZEL2', name: 'Ν', isActive: true });
    expect(collateralDamage(marks, touched, 'MTRMARK', 2)).toEqual([]);
    // Λείπει η γραμμή 1 — ακριβώς το σενάριο που έσβησε την «Βασική Ομάδα».
    expect(collateralDamage(marks, [marks[1]], 'MTRMARK', 2)).toEqual([marks[0]]);
    // Άλλαξε το όνομα γραμμής που δεν αγγίξαμε.
    expect(collateralDamage(marks, [{ ...marks[0], NAME: 'Αλλο' }, marks[1]], 'MTRMARK', 2)).toHaveLength(1);
  });

  it('κενή λίστα ⇒ πρώτος αριθμός 1· η φόρμα θέλει κωδικό και ονομασία', () => {
    expect(nextRegistryId([], 'MTRMARK')).toBe(1);
    expect(registryInput.safeParse({ code: '', name: 'Χ' }).success).toBe(false);
    expect(registryInput.parse({ code: ' A ', name: ' Β ' })).toEqual({ code: 'A', name: 'Β', isActive: true });
  });
});
