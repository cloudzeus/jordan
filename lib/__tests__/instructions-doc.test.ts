import { describe, expect, it } from 'vitest';
// jszip: εξάρτηση του docx — υπάρχει πάντα μαζί του.
import JSZip from 'jszip';
import { buildInstructionsDocx, groupInstructions, docxDisposition } from '../instructions-doc';
import { issuesToInstructions, recipientFor, splitDetail, PROJECT_RECIPIENTS } from '../project-profit/instructions';
import { safeUrl } from '../project-profit/url';
import { buildContext, computeProject, PURCHASES, SALES, type FinDoc } from '../project-profit/calc';
import { detectIssues, type DataIssue } from '../project-profit/issues';

const issue = (o: Partial<DataIssue>): DataIssue => ({
  key: 'sales-no-project:50', audience: 'accountant', severity: 'high', prjcs: [1], title: 'Πωλήσεις χωρίς έργο · Πελάτης',
  detail: '2 παραστατικά δεν έχουν έργο. Ενέργεια: στο SoftOne → Πωλήσεις συμπλήρωσε το «Έργο». Παραστατικά: ΤΙΜ1 (1/5/2026, 100,00 €).',
  amount: 100, docs: [{ findoc: 9, fincode: 'ΤΙΜ1', date: '2026-05-01T00:00:00.000Z', amount: 100 }], ...o,
});

describe('κατευθύνσεις έργων → έγγραφο', () => {
  it('χωρίζει «τι είναι λάθος» / «τι να γίνει» και βγάζει τη λίστα όταν υπάρχει πίνακας', () => {
    const r = splitDetail(issue({}).detail, true);
    expect(r.problem).toBe('2 παραστατικά δεν έχουν έργο.');
    expect(r.action).toBe('Στο SoftOne → Πωλήσεις συμπλήρωσε το «Έργο».');
    expect(splitDetail('Κάτι. Ενέργεια integrator: ρύθμισε.', false).action).toBe('Ρύθμισε.');
    expect(splitDetail('Χ. Ενέργεια: απάντησε εδώ ποια.', false).action).toContain('«Ερωτήματα λογιστή»');
  });
  it('κάθε θέμα σε μία ομάδα — σε αυτούς που διορθώνουν', () => {
    expect(recipientFor({ key: 'sales-no-project:1', audience: 'accountant' })).toBe('issuers');
    expect(recipientFor({ key: 'receipts-no-project:1', audience: 'accountant' })).toBe('issuers');
    expect(recipientFor({ key: 'purchases-no-project:1', audience: 'accountant' })).toBe('purchasing');
    expect(recipientFor({ key: 'from-order:1', audience: 'accountant' })).toBe('purchasing');
    expect(recipientFor({ key: 'no-costs:1', audience: 'accountant' })).toBe('accountant');
    expect(recipientFor({ key: 'project-field-optional', audience: 'integrator' })).toBe('integrator');
  });
  it('καρτέλα πελάτη, έργο και κατάσταση απάντησης', () => {
    const [it0] = issuesToInstructions([issue({})], {
      projects: new Map([[1, { code: 'P1', name: 'Έργο Α' }]]),
      traders: new Map([[50, { code: '0065', name: 'ΔΟΜΗ ΑΤΕ' }]]),
    });
    expect(it0).toMatchObject({ recipient: 'issuers', account: 'Καρτέλα πελάτη 0065 «ΔΟΜΗ ΑΤΕ»', context: 'Έργο P1 «Έργο Α»', status: 'Αναπάντητο στα «Ερωτήματα λογιστή»' });
    expect(it0.docs).toEqual([{ code: 'ΤΙΜ1', date: '2026-05-01T00:00:00.000Z', amount: 100 }]);
  });
  it('παράγει έγκυρο .docx με τις ενότητες και τους κωδικούς παραστατικών', async () => {
    const items = issuesToInstructions([issue({}), issue({ key: 'project-field-optional', audience: 'integrator', prjcs: [], docs: [], rows: ['Πωλήσεις · Τιμολόγιο (5061): 22 από 56 χωρίς έργο'], detail: 'Λείπει. Ενέργεια integrator: υποχρεωτικό.' })],
      { projects: new Map(), traders: new Map() });
    const buf = await buildInstructionsDocx({ title: 'Κατευθύνσεις', companyName: 'ATELIER', generatedAt: new Date('2026-10-17T10:00:00Z'), recipients: PROJECT_RECIPIENTS, items });
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    for (const t of ['Τιμολόγηση &amp; εισπράξεις', 'Integrator SoftOne', 'ΤΙΜ1', 'Τι να γίνει', '5061']) expect(xml).toContain(t);
    expect(xml).not.toContain('Αγορές &amp; παραλαβές'); // ομάδα χωρίς θέματα δεν εμφανίζεται
    expect(groupInstructions({ recipients: PROJECT_RECIPIENTS, items }).map((g) => g.recipient.key)).toEqual(['issuers', 'integrator']);
  });
  it('όνομα αρχείου με ελληνικά στο Content-Disposition', () => {
    expect(docxDisposition('Κατευθύνσεις έργου.docx')).toContain("filename*=UTF-8''%CE%9A");
  });
});

describe('PDF παρόχου / ΜΑΡΚ', () => {
  it('δέχεται μόνο https προς δημόσιο host', () => {
    expect(safeUrl('https://provider.gr/inv/1.pdf')).toBe('https://provider.gr/inv/1.pdf');
    for (const bad of ['http://provider.gr/x', 'https://localhost/x', 'https://10.0.0.5/x', 'https://192.168.1.2/x', 'https://[::1]/x', 'javascript:alert(1)', '', null]) expect(safeUrl(bad)).toBeNull();
  });
  it('θέμα integrator όταν δεν υπάρχει URL παρόχου ούτε συνημμένο', () => {
    const d = (o: Partial<FinDoc> & Pick<FinDoc, 'findoc' | 'sosource'>): FinDoc => ({
      fincode: `D${o.findoc}`, date: '2026-05-01T00:00:00.000Z', series: '1', seriesName: 'Τιμολόγιο', kind: 'invoice', trdr: null, traderName: null,
      prjc: 1, net: 100, vat: 24, total: 124, cancelled: false, ...o,
    });
    const docs = [
      d({ findoc: 1, sosource: SALES, mydata: { mark: '4000', qrUrl: 'https://mydatapi.aade.gr/x', providerUrl: null, attachments: 0 } }),
      d({ findoc: 2, sosource: PURCHASES, mydata: { mark: null, qrUrl: null, providerUrl: null, attachments: 0 } }),
    ];
    const ctx = buildContext({ docs, lines: [] });
    const p = { prjc: 1, code: 'P1', name: 'Α', trdr: null, since: null };
    const iss = detectIssues(ctx, [p], new Map([[1, computeProject(1, ctx)]]));
    const i = iss.find((x) => x.key === 'provider-pdf-missing')!;
    expect(i.audience).toBe('integrator');
    expect(i.detail).toContain('INVOICEURL');
    expect(computeProject(1, ctx).revenue.docs[0]).toMatchObject({ mark: '4000', providerPdf: false });
    const ok = buildContext({ docs: [d({ findoc: 1, sosource: SALES, mydata: { mark: '4000', qrUrl: null, providerUrl: 'https://p.gr/1.pdf', attachments: 0 } })], lines: [] });
    expect(detectIssues(ok, [p], new Map([[1, computeProject(1, ok)]])).some((x) => x.key === 'provider-pdf-missing')).toBe(false);
  });
});
