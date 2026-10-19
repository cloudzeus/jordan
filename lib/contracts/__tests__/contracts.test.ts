import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  buildPrjcPayload, buildPrompt, canTransition, contractInput, contractRef, crewTotal, greeklish, lineNet, milestoneCoverage,
  nextProjectCode, parseContractDoc, pdfFileName, projectName, stageAfter, totals, DocParseError,
} from '../core';
import { renderContractPdf, type ContractPdfData } from '../pdf';

const art = (h: string) => ({ heading: h, paragraphs: [`Κείμενο για ${h}.`], bullets: [] });
const docJson = (o: Record<string, unknown> = {}) => JSON.stringify({
  title: 'Σύμβαση', preamble: 'Σήμερα…', scopeSummary: 'Τοποθέτηση μαρμάρου', articles: [art('Αντικείμενο'), art('Χρονοδιάγραμμα'), art('Πληρωμές')],
  installation: [{ heading: 'Μάρμαρο δαπέδου', steps: ['Καθαρισμός υποστρώματος', 'Κόλλα C2TE'], warnings: ['Όχι κάτω από 5°C'], checks: ['Επιπεδότητα 2 mm/2 m'] }],
  closing: 'Σε πίστωση…', ...o,
});

describe('σύνολα', () => {
  it('γραμμή με έκπτωση και στρογγυλοποίηση', () => {
    expect(lineNet({ qty: 3, unitPrice: 10.335, discount: 10 })).toBe(27.9);
    expect(lineNet({ qty: 2, unitPrice: 5, discount: 150 })).toBe(0); // έκπτωση > 100% κόβεται
  });
  it('καθαρή αξία, ΦΠΑ, σύνολο', () => {
    expect(totals([{ qty: 10, unitPrice: 20 }, { qty: 1, unitPrice: 50, discount: 20 }], 24)).toEqual({ net: 240, vat: 57.6, gross: 297.6 });
  });
  it('αμοιβή συνεργείου μόνο από τις δικές του γραμμές', () => {
    const lines = [{ qty: 1, unitPrice: 0, partyId: 'a', crewFee: 300 }, { qty: 1, unitPrice: 0, partyId: 'b', crewFee: 100 }, { qty: 1, unitPrice: 0, partyId: 'a', crewFee: 50.5 }];
    expect(crewTotal(lines, 'a')).toBe(350.5);
  });
  it('κάλυψη milestones', () => {
    expect(milestoneCoverage([100, 200], 300)).toEqual({ sum: 300, diff: 0, ok: true });
    expect(milestoneCoverage([100], 300).ok).toBe(false);
  });
});

describe('μεταβάσεις', () => {
  it('επιτρεπτές καταστάσεις', () => {
    expect(canTransition('DRAFT', 'accept')).toBe(true);
    expect(canTransition('DRAFT', 'activate')).toBe(false);
    expect(canTransition('ACCEPTED', 'activate')).toBe(true);
    expect(canTransition('COMPLETED', 'cancel')).toBe(false);
  });
  it('η αποδοχή κάνει την προσφορά σύμβαση· το reopen τη γυρίζει μόνο αν δεν ενεργοποιήθηκε', () => {
    expect(stageAfter('accept', 'OFFER', false)).toBe('CONTRACT');
    expect(stageAfter('reopen', 'CONTRACT', false)).toBe('OFFER');
    expect(stageAfter('reopen', 'CONTRACT', true)).toBe('CONTRACT');
  });
});

describe('validation', () => {
  const base = { title: 'Μπάνιο', kind: 'SUBCONTRACT', trdr: 12, lines: [], parties: [], milestones: [] };
  it('δέχεται πλήρη σύμβαση', () => {
    const r = contractInput.safeParse({
      ...base,
      parties: [{ key: 'p1', kind: 'PARTNER', partnerId: 'x', name: 'Συνεργείο', email: '' }],
      lines: [{ kind: 'SERVICE', name: 'Τοποθέτηση', qty: 20, unitPrice: 15, partyKey: 'p1', crewFee: 200 }],
      milestones: [{ title: 'Παράδοση', partyKey: 'p1', amount: 200, dueDate: '2026-11-01' }],
    });
    expect(r.success).toBe(true);
  });
  it('απορρίπτει γραμμή σε συνεργείο που δεν υπάρχει', () => {
    const r = contractInput.safeParse({ ...base, lines: [{ kind: 'SERVICE', name: 'Χ', partyKey: 'zz' }] });
    expect(r.success).toBe(false);
  });
  it('«Μόνο προϊόν» δεν έχει συνεργεία', () => {
    const r = contractInput.safeParse({ ...base, kind: 'PRODUCT', parties: [{ key: 'p1', kind: 'PARTNER', partnerId: 'x', name: 'Σ' }] });
    expect(r.success).toBe(false);
  });
  it('χρειάζεται πελάτη και λήξη μετά την έναρξη', () => {
    expect(contractInput.safeParse({ ...base, trdr: null }).success).toBe(false);
    expect(contractInput.safeParse({ ...base, startDate: '2026-11-10', endDate: '2026-11-01' }).success).toBe(false);
  });
});

describe('AI έγγραφο', () => {
  it('διαβάζει JSON μέσα σε ```json', () => {
    const d = parseContractDoc('```json\n' + docJson() + '\n```', { needsInstallation: true });
    expect(d.articles).toHaveLength(3);
    expect(d.installation[0].steps).toHaveLength(2);
  });
  it('απαιτεί οδηγίες όταν υπάρχει εγκατάσταση', () => {
    expect(() => parseContractDoc(docJson({ installation: [] }), { needsInstallation: true })).toThrow(DocParseError);
    expect(parseContractDoc(docJson({ installation: [] }), { needsInstallation: false }).installation).toEqual([]);
  });
  it('απορρίπτει πολύ σύντομη σύμβαση', () => {
    expect(() => parseContractDoc(docJson({ articles: [art('Α')] }), { needsInstallation: false })).toThrow(DocParseError);
  });
  it('το prompt του συνεργείου ζητά οδηγίες και περιέχει τους οδηγούς ειδών, όχι τιμές', () => {
    const { system, user } = buildPrompt({
      audience: 'PARTY', stage: 'CONTRACT', kind: 'SUBCONTRACT', company: { name: 'Atelier' }, customer: { name: 'Πελάτης' },
      party: { name: 'Μάστορας', specialty: 'Μαρμαράς' }, title: 'Μπάνιο', summary: 'περίληψη', lines: [{ kind: 'SERVICE', name: 'Τοποθέτηση', qty: 20, unit: 'm²' }],
      milestones: [{ title: 'Παράδοση', amount: 500 }], total: 500, guides: [{ item: 'ΜΑΡ-1 · Μάρμαρο', summary: 'σύνοψη', steps: ['Βήμα Α'], safety: [], checks: [] }],
    });
    expect(system).toContain('ΑΝΑΛΥΤΙΚΕΣ οδηγίες εγκατάστασης');
    expect(user).toContain('Βήμα Α');
    expect(user).not.toContain('500');
  });
});

describe('SoftOne PRJC', () => {
  it('επόμενος 7ψήφιος κωδικός', () => {
    expect(nextProjectCode(['0000063', '0000009', 'ABC'])).toBe('0000064');
    expect(nextProjectCode([])).toBe('0000001');
  });
  it('όνομα όπως τα υπάρχοντα', () => {
    expect(projectName('Παπαδόπουλος Ά.', 'Μπάνιο ορόφου')).toBe('ΠΑΠΑΔΟΠΟΥΛΟΣ Α. - ΜΠΑΝΙΟ ΟΡΟΦΟΥ');
  });
  it('payload setData', () => {
    expect(buildPrjcPayload({ code: '0000064', name: 'Χ', trdr: 5, fromDate: '2026-11-01', finalDate: null, remarks: null }))
      .toEqual({ OBJECT: 'PRJC', KEY: '', DATA: { PRJC: [{ CODE: '0000064', NAME: 'Χ', PRJTYPE: 1, TRDR: 5, FROMDATE: '2026-11-01' }] } });
  });
});

describe('ονόματα', () => {
  it('ref και αρχείο PDF', () => {
    expect(contractRef(42)).toBe('ΣΥΜ-000042');
    expect(pdfFileName(42, 'OFFER', 'CUSTOMER', 2)).toBe('SYM-000042-prosfora-v2.pdf');
    expect(pdfFileName(42, 'CONTRACT', 'PARTY', 1, 'Γιώργος Μαρμαράς')).toBe('SYM-000042-symvasi-synergeiou-giorgos-marmaras-v1.pdf');
    expect(greeklish('Ψηφιδωτό 3x')).toBe('psifidoto-3x');
  });
});

describe('PDF', () => {
  it('αποδίδει σύμβαση συνεργείου με παραρτήματα σε πολλές σελίδες', async () => {
    const d: ContractPdfData = {
      ref: 'ΣΥΜ-000042', docKind: 'PARTY', version: 1, projectTitle: 'Ανακαίνιση μπάνιου — Κηφισιά', kindLabel: 'Τοποθέτηση από συνεργεία', issuedOn: new Date('2026-10-19'),
      startDate: '2026-11-01', endDate: '2026-11-20', site: 'Λεβίδου 12, 145 62 Κηφισιά',
      company: { name: 'Atelier by Damask', legalName: 'ΝΤΑΜΑΣΚ ΜΙΚΕ', vat: '123456789', address: 'Λεωφ. Βουλιαγμένης 39', phones: ['210 2162310'], email: 'sales@atelier-dm.gr' },
      counterparty: { name: 'Γ. Μαρμαράς & ΣΙΑ', afm: '987654321', specialty: 'Μαρμαράς', email: 'g@example.com' },
      lines: Array.from({ length: 18 }, (_, i) => ({ kind: 'SERVICE', code: `ΥΠ-${i}`, name: `Τοποθέτηση πλακιδίων ζώνη ${i + 1} με αρμόστοκο εποξειδικό και σιλικόνη περιμετρικά`, notes: i % 3 ? null : 'μαζί με αδιαβροχοποίηση', qty: 12.5, unit: 'm²', unitPrice: null, discount: 0, amount: 180 })),
      totals: { fee: 3240 },
      milestones: [{ title: 'Προετοιμασία υποστρώματος', deliverables: 'Επιπεδωμένο δάπεδο', dueDate: '2026-11-05', amount: 1000 }, { title: 'Παράδοση', deliverables: null, dueDate: '2026-11-20', amount: 2240 }],
      doc: parseContractDoc(docJson({ articles: Array.from({ length: 10 }, (_, i) => art(`Άρθρο θέμα ${i + 1}`)) }), { needsInstallation: true }),
      itemGuides: [{ item: 'ΜΑΡ-1', guide: { title: 'Οδηγός μαρμάρου', summary: 'Σύνοψη', difficulty: 'Μέτρια', duration: '2 ημέρες', crew: '2 άτομα', tools: ['Σπάτουλα'], materials: [], preparation: ['Καθαρισμός'], steps: [{ title: 'Κόλλα', detail: 'Απλώστε κόλλα', images: [] }], safety: ['Γάντια'], qualityChecks: ['Αρμοί'], commonMistakes: [], aftercare: [] } }],
    };
    const buf = await renderContractPdf(d);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(buf);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(4);
    expect(pdf.getTitle()).toContain('ΣΥΜ-000042');
  });
});
