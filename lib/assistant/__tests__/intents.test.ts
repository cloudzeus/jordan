import { describe, expect, it } from 'vitest';
import { analyze, clarifyChoices, followups, type IntentKey } from '../intents';

const NOW = new Date('2026-10-19T09:00:00Z'); // Δευτέρα 19/10/2026, 12:00 Αθήνας
const a = (s: string) => analyze(s, NOW);

// Ερωτήματα όπως τα λένε πραγματικοί (μη προχωρημένοι) χρήστες — με συνώνυμα, greeklish, λάθη, φωνή.
const CASES: [string, IntentKey][] = [
  // η μέρα μου
  ['Τι έχω σήμερα;', 'today'],
  ['καλημέρα, τι έχουμε για σήμερα', 'today'],
  ['ti exo simera?', 'today'],
  ['δείξε μου το πρόγραμμα της ημέρας', 'today'],
  ['ατζέντα', 'today'],
  // ραντεβού
  ['τι ραντεβού έχω αύριο', 'appointments'],
  ['έχω καμία συνάντηση την Πέμπτη;', 'appointments'],
  ['δείξε μου το ημερολόγιο της εβδομάδας', 'appointments'],
  ['Κλείσε μου ένα ραντεβού στις 4 το απόγευμα της Δευτέρας με τον πελάτη Κουνά', 'book_appointment'],
  ['βάλε μου μια συνάντηση με τον Τυροβολά αύριο', 'book_appointment'],
  ['kleise radevou me ton kouna', 'book_appointment'],
  // εργασίες
  ['ποιες εργασίες έχουν καθυστερήσει;', 'tasks'],
  ['τι εργασίες έχω αυτή την εβδομάδα', 'tasks'],
  // υπόλοιπα
  ['πόσα μας χρωστάει ο Κουνάς;', 'trader_balance'],
  ['Ποιο είναι το υπόλοιπο στον προμηθευτή Χατζηλιάδη;', 'trader_balance'],
  ['ποσα χρωσταμε στον xatziliadi', 'trader_balance'],
  ['οφειλή πελάτη 0123', 'trader_balance'],
  ['ipoloipo pelati porcelanosa', 'trader_balance'],
  // κατάσταση λογαριασμού
  ['στείλε κατάσταση λογαριασμού στον πελάτη Κουνά', 'statement'],
  ['θέλω την καρτέλα του πελάτη σε pdf', 'statement'],
  // στοιχεία
  ['τι τηλέφωνο έχει ο Τυροβολάς;', 'trader_info'],
  ['το email του πελάτη STUDIO PORTOKALI', 'trader_info'],
  ['πού βρίσκεται ο πελάτης Μπάνας', 'trader_info'],
  // έργα
  ['πώς πάει το έργο Κουνάς Πάρος;', 'project_status'],
  ['σε τι φάση είναι το έργο 40', 'project_status'],
  ['πόσο κέρδος έχει το έργο της Πάρου', 'project_profit'],
  ['βγάζει λεφτά το έργο Μπάνας;', 'project_profit'],
  ['ποια έργα έχουν ζημιά;', 'project_profit'],
  ['ποιο είναι το υπόλοιπο του πελάτη στο έργο Κουνάς', 'project_balance'],
  ['πόσα χρωστάει ο πελάτης για το έργο 18', 'project_balance'],
  ['τι υλικά πήγαν στο έργο Βαρδινογιάννη', 'project_materials'],
  ['ποια είδη μπήκαν στο έργο της Τήνου', 'project_materials'],
  // τζίρος / αγορές
  ['τι τζίρο έκανα αυτό τον μήνα', 'turnover'],
  ['πόσα πουλήσαμε πέρσι', 'turnover'],
  ['τζίρος Q3', 'turnover'],
  ['ti tziro kaname fetos', 'turnover'],
  ['πόσα αγοράσαμε από τον Τυροβολά φέτος;', 'purchases'],
  ['αγορές του μήνα', 'purchases'],
  // υλικά
  ['τι απόθεμα έχουμε από τα πλακάκια wow roots', 'item_info'],
  ['πόσο αγοράσαμε τελευταία φορά τον σοβά επισκευής', 'item_info'],
  ['ti apothema exoume apo to tadelakt', 'item_info'],
  ['τελευταία τιμή αγοράς για το 0000378', 'item_info'],
  // παραστατικά
  ['δείξε μου το τιμολόγιο ΤΙΜΚ000009', 'document'],
  ['τι έχει μέσα το παραστατικό ΤΙΜΔΑ00225', 'document'],
  // εκκρεμότητες
  ['τι εκκρεμεί;', 'pending_work'],
  ['υπάρχουν έγγραφα OCR για έλεγχο;', 'pending_work'],
  ['έχουμε νέα αιτήματα παραγγελίας;', 'pending_work'],
  ['ανοιχτά ερωτήματα λογιστή', 'pending_work'],
  // βοήθεια
  ['πώς στέλνω κατάσταση λογαριασμού σε πελάτη;', 'how_to'],
  ['πώς κλείνω ραντεβού από το ημερολόγιο', 'how_to'],
  ['πού βρίσκω τις μονάδες μέτρησης', 'how_to'],
  ['τι σημαίνει μικτά και καθαρά;', 'explain_term'],
  ['τι είναι το ΜΑΡΚ;', 'explain_term'],
];

describe('analyze — πρόθεση (σετ πραγματικών διατυπώσεων)', () => {
  it.each(CASES)('«%s» → %s', (q, intent) => {
    expect(a(q).intent).toBe(intent);
  });
  it(`καλύπτει ${CASES.length} διατυπώσεις`, () => expect(CASES.length).toBeGreaterThanOrEqual(50));
});

describe('analyze — οντότητα, όνομα, περίοδος, αναφορές', () => {
  it('μεριά συναλλασσομένου και όνομα', () => {
    expect(a('πόσα μας χρωστάει ο πελάτης Κουνάς;')).toMatchObject({ entityKind: 'customer', nameHint: 'κουνασ' });
    expect(a('υπόλοιπο στον προμηθευτή Χατζηλιάδη')).toMatchObject({ entityKind: 'supplier', nameHint: 'χατζηλιαδη' });
  });
  it('έργο και κωδικός παραστατικού', () => {
    expect(a('πώς πάει το έργο Κουνάς Πάρος;').entityKind).toBe('project');
    expect(a('δείξε μου το τιμολόγιο ΤΙΜΚ000009')).toMatchObject({ entityKind: 'document', codes: ['ΤΙΜΚ000009'] });
  });
  it('περίοδος από τη φράση', () => {
    expect(a('τι τζίρο έκανα αυτό τον μήνα').period).toMatchObject({ from: '2026-10-01', to: '2026-11-01' });
  });
  it('αναφορά στα προηγούμενα («αυτός ο πελάτης», «του;»)', () => {
    expect(a('και πόσα χρωστάει αυτός ο πελάτης;').refersToPrevious).toBe(true);
    expect(a('τι τηλέφωνο έχει αυτός;').refersToPrevious).toBe(true);
    expect(a('και το υπόλοιπο του;').refersToPrevious).toBe(true);
    expect(a('στείλε του κατάσταση λογαριασμού').refersToPrevious).toBe(true);
    expect(a('υπόλοιπο πελάτη Κουνά').refersToPrevious).toBe(false);
  });
});

describe('αοριστία ⇒ επιλογές-κουμπιά', () => {
  it('σκέτο «υπόλοιπο;» ⇒ ποιο υπόλοιπο', () => {
    const r = a('υπόλοιπο;');
    expect(r.confidence).toBe('low');
    const c = clarifyChoices(r)!;
    expect(c.choices.map((x) => x.label)).toContain('Υπόλοιπο προμηθευτή');
  });
  it('τζίρος χωρίς περίοδο ⇒ για ποια περίοδο', () => {
    const r = a('τζίρος');
    expect(r.confidence).toBe('low');
    expect(clarifyChoices(r)!.question).toMatch(/περίοδο/);
  });
  it('ακατανόητο ⇒ γενικές επιλογές', () => {
    const r = a('ξξξ');
    expect(r.intent).toBe('unknown');
    expect(clarifyChoices(r)!.choices.length).toBeGreaterThanOrEqual(3);
  });
  it('σαφές ⇒ καμία διευκρίνιση', () => {
    expect(clarifyChoices(a('πόσα μας χρωστάει ο πελάτης Κουνάς;'))).toBeNull();
    expect(clarifyChoices(a('τι τζίρο έκανα αυτό τον μήνα'))).toBeNull();
  });
});

describe('επόμενα βήματα', () => {
  it('μετά από πελάτη: PDF κατάστασης + έργα + ραντεβού', () => {
    const f = followups('trader_balance', { kind: 'trader', id: '104', code: '0123', name: 'ΚΟΥΝΑΣ', side: 'customer' });
    expect(f.find((c) => c.href)?.href).toBe('/api/admin/statements/104/pdf');
    expect(f.map((c) => c.label)).toContain('Κλείσε ραντεβού');
  });
  it('μετά από έργο: δεν ξαναπροτείνει το ίδιο', () => {
    const f = followups('project_materials', { kind: 'project', id: '18', code: '0000018', name: 'ΚΟΥΝΑΣ - ΠΑΡΟΣ' });
    expect(f.map((c) => c.label)).not.toContain('Υλικά του έργου');
    expect(f.some((c) => c.href === '/admin/projects/18')).toBe(true);
  });
  it('μετά από «τι έχω σήμερα»', () => {
    expect(followups('today', null).length).toBeGreaterThan(0);
  });
});
