import { describe, expect, it } from 'vitest';
import {
  EntityFileError, buildBasePath, buildFileKey, cleanSubfolder, contentDisposition, extOf, matchesSignature,
  renameKeepingExt, slugPart, subfolderPrefix, validateUpload,
} from '../core';

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
const zipWith = (entry: string) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from(`[Content_Types].xml${entry}document.xml`)]);
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n');
const DXF = Buffer.from('  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1015\n  0\nENDSEC\n  0\nEOF\n');
const DWG = Buffer.concat([Buffer.from('AC1032'), Buffer.alloc(20)]);

describe('διαδρομές φακέλων', () => {
  it('ελληνικά → αναγνώσιμο λατινικό slug', () => {
    expect(slugPart('Παπαδόπουλος Α.Ε.')).toBe('papadopoulos-a-e');
    expect(slugPart('  ')).toBe('');
  });
  it('πελάτης/προμηθευτής: traders/<TRDR>-<κωδικός>-<επωνυμία>', () => {
    expect(buildBasePath('TRADER', 256, '30.0012', 'Παπαδόπουλος Α.Ε.')).toBe('traders/256-30-0012-papadopoulos-a-e');
  });
  it('έργο: projects/<PRJC>-<κωδικός>-<όνομα>', () => {
    expect(buildBasePath('PROJECT', 25, 'PRJ-25', 'Οικία Κηφισιά')).toBe('projects/25-prj-25-oikia-kifisia');
  });
  it('χωρίς κωδικό/όνομα μένει μόνο το id (πάντα μοναδικό)', () => {
    expect(buildBasePath('PROJECT', 7, '', '')).toBe('projects/7');
  });
  it('πολύ μεγάλο όνομα κόβεται χωρίς παύλα στο τέλος', () => {
    const p = buildBasePath('TRADER', 1, 'X', 'α'.repeat(100));
    expect(p.length).toBeLessThanOrEqual('traders/1-x-'.length + 40);
    expect(p.endsWith('-')).toBe(false);
  });
  it('κλειδί αρχείου μέσα στον υποφάκελο, με τυχαίο κομμάτι και την κατάληξη', () => {
    expect(buildFileKey('projects/25-x', 'Σχέδια', 'Κάτοψη ισογείου.DWG', 'dwg', 'abc12345')).toBe('projects/25-x/schedia/katopsi-isogeiou-abc12345.dwg');
    expect(buildFileKey('projects/25-x', '', 'a.pdf', 'pdf', 'u')).toBe('projects/25-x/a-u.pdf');
    expect(subfolderPrefix('traders/1', 'Προσφορές')).toBe('traders/1/prosfores/');
  });
  it('υποφάκελος: χωρίς / και χαρακτήρες ελέγχου, όριο 60', () => {
    expect(cleanSubfolder('  Σχέδια / Αρχιτεκτονικά ')).toBe('Σχέδια Αρχιτεκτονικά');
    expect(() => cleanSubfolder('..')).toThrow(EntityFileError);
    expect(() => cleanSubfolder('x'.repeat(61))).toThrow(/60/);
  });
});

describe('τύποι αρχείων', () => {
  it('κατάληξη', () => {
    expect(extOf('Σχέδιο.DXF')).toBe('dxf');
    expect(extOf('noext')).toBe('');
  });
  it('δέχεται κάθε επιτρεπτό τύπο με σωστή υπογραφή', () => {
    expect(validateUpload('a.pdf', PDF).ext).toBe('pdf');
    expect(validateUpload('a.dxf', DXF).family).toBe('cad');
    expect(validateUpload('a.dwg', DWG).mime).toBe('image/vnd.dwg');
    expect(validateUpload('a.dwf', Buffer.from('(DWF V06.00)PK')).ext).toBe('dwf');
    expect(validateUpload('a.xls', OLE).family).toBe('excel');
    expect(validateUpload('a.doc', OLE).family).toBe('word');
    expect(validateUpload('a.xlsx', zipWith('xl/')).ext).toBe('xlsx');
    expect(validateUpload('a.docx', zipWith('word/')).ext).toBe('docx');
    expect(validateUpload('a.csv', Buffer.from('κωδικός;ποσότητα\n1;2\n')).ext).toBe('csv');
  });
  it('DXF με σχόλιο 999 στην αρχή και CRLF', () => {
    expect(matchesSignature('dxf', Buffer.from('999\r\ndxfrw 0.6\r\n  0\r\nSECTION\r\n'))).toBe(true);
    expect(matchesSignature('dxf', Buffer.from('AutoCAD Binary DXF\r\n\x1a\x00'))).toBe(true);
  });
  it('απορρίπτει μη επιτρεπτή κατάληξη με ελληνικό μήνυμα', () => {
    expect(() => validateUpload('virus.exe', Buffer.from('MZ'))).toThrow(/δεν επιτρέπεται/);
    expect(() => validateUpload('photo.jpg', Buffer.from([0xff, 0xd8]))).toThrow(EntityFileError);
  });
  it('απορρίπτει αλλαγμένη κατάληξη (περιεχόμενο ≠ τύπος)', () => {
    expect(() => validateUpload('fake.pdf', Buffer.from('MZ\x90\x00'))).toThrow(/δεν είναι έγκυρο PDF/);
    expect(() => validateUpload('fake.docx', zipWith('xl/'))).toThrow(/Word/);
    expect(() => validateUpload('fake.dwg', PDF)).toThrow(/DWG/);
    expect(() => validateUpload('bin.csv', Buffer.from([1, 0, 2, 0]))).toThrow(EntityFileError);
    expect(() => validateUpload('bin.dxf', Buffer.from([0, 0, 0]))).toThrow(EntityFileError);
  });
  it('κενό ή πολύ μεγάλο αρχείο', () => {
    expect(() => validateUpload('a.pdf', Buffer.alloc(0))).toThrow(/κενό/);
    try { validateUpload('a.pdf', PDF, 4); } catch (e) { expect((e as EntityFileError).status).toBe(413); }
  });
});

describe('μετονομασία & λήψη', () => {
  it('κρατά πάντα την κατάληξη', () => {
    expect(renameKeepingExt('Νέα κάτοψη', 'dwg')).toBe('Νέα κάτοψη.dwg');
    expect(renameKeepingExt('Νέα κάτοψη.DWG', 'dwg')).toBe('Νέα κάτοψη.dwg');
    expect(renameKeepingExt('a/b', 'pdf')).toBe('a b.pdf');
    expect(() => renameKeepingExt('  ', 'pdf')).toThrow(/όνομα/);
  });
  it('Content-Disposition με ελληνικό όνομα και χωρίς σπάσιμο κεφαλίδας', () => {
    const h = contentDisposition('attachment', 'Σύμβαση "τελική"\r\n.pdf');
    expect(h).toMatch(/^attachment; filename="[\x20-\x7E]+"; filename\*=UTF-8''%CE%A3/);
    expect(h).not.toMatch(/[\r\n]/);
  });
});
