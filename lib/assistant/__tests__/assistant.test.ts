import { describe, expect, it } from 'vitest';
import { detectIntent, extractCodes, fold, keywords, numericRefs, phonetic, searchTextOf } from '../text';
import { rrf, toVectorLiteral } from '../vector';
import { labelTokens, pickCitations } from '../citations';
import { parseInline, parseMarkdown, safeHref } from '../markdown';
import { audioFormatOf, parseTranscript } from '../audio';
import { assistantAllowed } from '../access-rules';

describe('fold / phonetic — ελληνικά, τόνοι, greeklish', () => {
  it('αφαιρεί τόνους/διαλυτικά και ενοποιεί το σίγμα', () => {
    expect(fold('Πλακάκια ΜΠΆΝΙΟΥ, Ρολόι')).toBe('πλακακια μπανιου, ρολοι');
    expect(fold('Χατζηλιάδης')).toBe('χατζηλιαδησ');
  });

  it('ελληνικά και greeklish καταλήγουν στον ίδιο φωνητικό σκελετό', () => {
    expect(phonetic('Πλακάκια μπάνιου')).toBe(phonetic('plakakia mpaniou'));
    expect(phonetic('Χατζηλιάδης')).toBe(phonetic('xatziliadis'));
    expect(phonetic('Χατζηλιάδης')).toBe(phonetic('chatziliadis'));
    expect(phonetic('Ηλεκτρολογικό υλικό')).toBe(phonetic('ilektrologiko iliko'));
    expect(phonetic('Ντουλάπα')).toBe(phonetic('ntoulapa'));
    expect(phonetic('ψυγείο')).toBe(phonetic('psigio'));
  });

  it('το searchText περιέχει και τη folded και τη φωνητική μορφή', () => {
    const s = searchTextOf('Είδος', 'ΠΛΑΚΑΚΙ WOW');
    expect(s).toContain('ειδοσ πλακακι wow');
    expect(s).toContain('idos plakaki'); // + αγγλικά ονόματα μένουν αυτούσια στη folded μορφή
  });
});

describe('keywords / κωδικοί', () => {
  it('πετά ερωτηματικά και άρθρα', () => {
    expect(keywords('Ποιο είναι το υπόλοιπο του προμηθευτή Χατζηλιάδη;')).toEqual(['υπολοιπο', 'προμηθευτη', 'χατζηλιαδη']);
  });

  it('βρίσκει κωδικούς παραστατικών/ειδών, όχι διαστάσεις ή ημερομηνίες', () => {
    expect(extractCodes('τιμολόγιο ΤΙΜΚ000009 και είδος ΠΛΑ-0012')).toEqual(['ΤΙΜΚ000009', 'ΠΛΑ-0012']);
    expect(extractCodes('πλακάκι 60x60 στις 12/05/2026')).toEqual([]);
  });

  it('αριθμοί μετά από λέξη οντότητας → κωδικός χωρίς μηδενικά', () => {
    expect(numericRefs('έργο 40')).toEqual(['40']);
    expect(numericRefs('Πες μου για το έργο 0000040')).toEqual(['40']);
    expect(numericRefs('ειδος 380 και 2 τεμάχια')).toEqual(['380']);
    expect(numericRefs('δώσε 3 έργα')).toEqual([]);
  });
});

describe('detectIntent', () => {
  it('υπόλοιπο προμηθευτή (και σε greeklish)', () => {
    const i = detectIntent('posa xrostame ston promithefti xatziliadi?');
    expect(i.entities).toContain('trader');
    expect(i.traderSide).toBe('supplier');
    expect(i.wantsBalance).toBe(true);
  });

  it('κέρδος έργου', () => {
    const i = detectIntent('Πόσο κέρδος έχει το έργο Κουνάς στην Πάρο;');
    expect(i.entities[0]).toBe('project');
    expect(i.wantsFinancials).toBe(true);
  });

  it('απόθεμα και τιμή υλικού', () => {
    const i = detectIntent('τι απόθεμα έχουμε από τα πλακάκια και ποια η τελευταία τιμή αγοράς;');
    expect(i.entities).toContain('item');
    expect(i.wantsStock).toBe(true);
    expect(i.wantsPrice).toBe(true);
  });

  it('τηλέφωνο / τοποθεσία', () => {
    const i = detectIntent('Τι τηλέφωνο έχει ο πελάτης και πού βρίσκεται;');
    expect(i.wantsContacts).toBe(true);
    expect(i.wantsLocation).toBe(true);
    expect(i.traderSide).toBe('customer');
  });
});

describe('rrf / pgvector', () => {
  it('συγχωνεύει κατατάξεις — ό,τι είναι ψηλά σε πολλές λίστες κερδίζει', () => {
    const out = rrf([
      [{ id: 'a', score: 0.9 }, { id: 'b', score: 0.8 }],
      [{ id: 'b', score: 0.7 }, { id: 'c', score: 0.6 }],
    ]);
    expect(out[0].id).toBe('b');
    expect(out.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('τα βάρη δίνουν προτεραιότητα στον ακριβή κωδικό', () => {
    const out = rrf([[{ id: 'semantic', score: 1 }], [{ id: 'code', score: 1 }]], { weights: [1, 2] });
    expect(out[0].id).toBe('code');
  });

  it('literal διανύσματος και απόρριψη NaN', () => {
    expect(toVectorLiteral([0.1, -2, 3])).toBe('[0.1,-2,3]');
    expect(() => toVectorLiteral([1, Number.NaN])).toThrow();
    expect(() => toVectorLiteral([])).toThrow();
  });
});

describe('παραπομπές', () => {
  const proj = { refKey: 'project:18', label: 'Έργο 0000018 · ΚΟΥΝΑΣ - ΠΑΡΟΣ', url: '/admin/projects/18' };
  const sup = { refKey: 'trader:62', label: 'Προμηθευτής 0062 · ΧΑΤΖΗΛΙΑΔΗΣ ΕΥΘΥΜΙΟΣ ΣΙΑ Ε Ε', url: null };
  const cust = { refKey: 'trader:99', label: 'Πελάτης 0062 · Μουνδρέας Νικόλαος', url: null };

  it('ετικέτα → κωδικός και όνομα', () => {
    expect(labelTokens(proj.label)).toEqual(['0000018', 'κουνασ - παροσ']);
  });

  it('δείχνει πρώτα όσες αναφέρονται στην απάντηση', () => {
    expect(pickCitations('Το έργο 0000018 έχει ζημιά.', [sup, proj])).toEqual([proj]);
  });

  it('υπόδειξη με ίδιο κωδικό αλλά άλλο όνομα ΔΕΝ μετρά', () => {
    expect(pickCitations('Του χρωστάμε 657,45 € (κωδ. 0062).', [sup], [cust])).toEqual([sup]);
  });

  it('χωρίς αναφορές: οι πηγές των εργαλείων', () => {
    expect(pickCitations('Δεν βρέθηκε κάτι σχετικό.', [proj], [cust])).toEqual([proj]);
  });
});

describe('markdown (ασφαλές)', () => {
  it('λίστες, έντονα, πίνακες', () => {
    const b = parseMarkdown('**Έργο**\n\n- α\n- **β**\n\n| Κωδ | Ποσό |\n|---|---|\n| 1 | 2 € |');
    expect(b.map((x) => x.t)).toEqual(['p', 'ul', 'table']);
    const t = b[2];
    expect(t.t === 'table' && t.rows.length).toBe(1);
  });

  it('μόνο εσωτερικοί ή https σύνδεσμοι', () => {
    expect(safeHref('/admin/projects/18')).toBe('/admin/projects/18');
    expect(safeHref('https://maps.google.com/?q=1,2')).toBe('https://maps.google.com/?q=1,2');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('//evil.com')).toBeNull();
    expect(parseInline('[x](javascript:alert(1))').some((n) => n.t === 'link')).toBe(false);
  });
});

describe('φωνή', () => {
  it('μορφή ήχου από MIME του browser', () => {
    expect(audioFormatOf('audio/webm;codecs=opus')).toBe('webm');
    expect(audioFormatOf('audio/mp4')).toBe('mp4');
    expect(audioFormatOf('audio/ogg;codecs=opus')).toBe('ogg');
    expect(audioFormatOf('video/x-foo')).toBeNull();
  });

  it('κενό όταν δεν ακούστηκε ομιλία', () => {
    expect(parseTranscript('{"speech": false, "text": "Χατζηλιάδης"}')).toBe('');
    expect(parseTranscript('```json\n{"speech": true, "text": " Υπόλοιπο Porcelanosa "}\n```')).toBe('Υπόλοιπο Porcelanosa');
    expect(parseTranscript('«σκέτο κείμενο»')).toBe('σκέτο κείμενο');
  });
});

describe('πρόσβαση — μόνο ADMIN / SUPER_ADMIN', () => {
  const perms = new Set(['assistant.use']);
  it('SUPER_ADMIN πάντα, ADMIN με το δικαίωμα', () => {
    expect(assistantAllowed('SUPER_ADMIN', new Set(), 'assistant.use')).toBe(true);
    expect(assistantAllowed('ADMIN', perms, 'assistant.use')).toBe(true);
    expect(assistantAllowed('ADMIN', new Set(), 'assistant.use')).toBe(false);
  });
  it('κανένας άλλος ρόλος, ακόμη κι αν του δοθεί το δικαίωμα', () => {
    for (const r of ['EMPLOYEE', 'COLLABORATOR', 'SUPPLIER', 'CUSTOMER', null]) expect(assistantAllowed(r, perms, 'assistant.use')).toBe(false);
  });
});
