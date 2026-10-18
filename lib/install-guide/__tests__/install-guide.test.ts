import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import { guideProfile, profileLabel } from '../profile';
import { buildGuidePrompt, extractJson, GuideParseError, parseGuide, sampleImages, type InstallGuide } from '../guide';
import { renderGuidePdf, wrapText } from '../pdf';

describe('guideProfile', () => {
  it('η περιγραφή κερδίζει: κόλλα πλακιδίων = κόλλα, όχι πλακάκι', () => {
    expect(guideProfile({ name: 'GRANITIVA FLEX 25kg C2TE ΛΕΥΚΗ ΚΟΛΛΑ ΠΛΑΚΙΔΙΩΝ', group: 'Πλακάκια', isService: false }).key).toBe('adhesives');
  });
  it('πλακάκι με τόνους/κεφαλαία/λατινικά', () => {
    expect(guideProfile({ name: 'Ιταλικό porcelanato πλακάκι διαστ.120x60', isService: false }).key).toBe('tiles');
    expect(guideProfile({ name: 'ΠΛΑΚΑΚΙ WHITE', isService: false }).key).toBe('tiles');
    expect(guideProfile({ name: 'Zellige ροζ', isService: false }).key).toBe('tiles');
  });
  it('ομάδα όταν η περιγραφή δεν λέει τίποτα, μετά γενικό', () => {
    expect(guideProfile({ name: 'GEOLITH BALI 10Χ20', group: 'Πέτρες', isService: false }).key).toBe('stone');
    expect(guideProfile({ name: 'ΤΡΟΧΟΣ ΜΕ ΠΛΑΚΑ', group: 'Βασική Ομάδα', category: 'Εμπορεύματα', isService: false }).key).toBe('general');
  });
  it('υπηρεσία πάντα «Υπηρεσία»', () => {
    expect(guideProfile({ name: 'Τοποθέτηση πλακιδίων', isService: true }).key).toBe('service');
    expect(profileLabel('tiles')).toBe('Πλακάκια');
    expect(profileLabel('άγνωστο')).toBe('Γενικό');
  });
});

describe('extractJson / parseGuide', () => {
  const raw = {
    title: 'Οδηγός εγκατάστασης — Porcelanato 120x60', summary: 'Μεγάλο format.', difficulty: 'Μέτρια', duration: null, crew: '2 άτομα',
    tools: ['Οδοντωτή σπάτουλα 12 mm', '', null], materials: 'Κόλλα C2TE',
    preparation: ['Καθαρισμός'],
    steps: [
      { title: 'Διπλή επάλειψη', detail: 'Κόλλα και στην πλάκα.', images: [1, 2, 2, 9, 'x'] },
      { title: '', detail: '' },
      'όχι αντικείμενο',
    ],
    safety: [], qualityChecks: ['Αλφάδι'],
  };
  it('δέχεται JSON μέσα σε ```json και με κείμενο γύρω', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Ορίστε:\n{"a":2}\nΤέλος')).toEqual({ a: 2 });
    expect(() => extractJson('καθόλου json')).toThrow(GuideParseError);
  });
  it('κανονικοποιεί: κενά/null φεύγουν, string → λίστα, άκυρες εικόνες κόβονται', () => {
    const g = parseGuide(JSON.stringify(raw), 2);
    expect(g.tools).toEqual(['Οδοντωτή σπάτουλα 12 mm']);
    expect(g.materials).toEqual(['Κόλλα C2TE']);
    expect(g.duration).toBe('');
    expect(g.steps).toHaveLength(1);
    expect(g.steps[0].images).toEqual([1, 2]);
    expect(g.aftercare).toEqual([]);
  });
  it('χωρίς βήματα = σφάλμα', () => {
    expect(() => parseGuide(JSON.stringify({ title: 'x', steps: [] }), 0)).toThrow(/βήματα/);
  });
});

describe('sampleImages', () => {
  const photo = (n: number) => ({ kind: 'IMAGE', name: `p${n}`, url: `u${n}`, originalUrl: n === 1 ? 'orig1' : null, sampleFrames: [] });
  const video = (n: string, frames: number) => ({ kind: 'VIDEO', name: n, url: n, originalUrl: null, sampleFrames: Array.from({ length: frames }, (_, i) => `${n}-f${i + 1}`) });
  it('φωτογραφίες πρώτα (πρωτότυπο αν υπάρχει), καρέ κυκλικά, όριο', () => {
    const out = sampleImages([photo(1), video('a', 3), photo(2), video('b', 2), video('c', 0)], 6);
    expect(out.map((o) => o.url)).toEqual(['orig1', 'u2', 'a-f1', 'b-f1', 'a-f2', 'b-f2']);
    expect(out[2].label).toBe('καρέ 1/3 από βίντεο «a»');
  });
});

describe('buildGuidePrompt', () => {
  it('περιέχει κατηγορία, οδηγίες με σειρά και αριθμημένα δείγματα', () => {
    const profile = guideProfile({ name: 'ΠΛΑΚΑΚΙ', isService: false });
    const { system, user } = buildGuidePrompt({
      item: { code: '0000230', name: 'Porcelanato', isService: false, category: 'Εμπορεύματα', group: 'Πλακάκια' },
      profile, attributes: [{ name: 'Διάσταση', value: '120x60', unit: 'cm' }], notes: ['Πρώτα αστάρι.', 'Μετά κόλλα.'], samples: [{ label: 'φωτογραφία «α»' }],
    });
    expect(system).toMatch(/JSON/);
    expect(user).toContain('Ομάδα: Πλακάκια');
    expect(user).toContain('[1] Πρώτα αστάρι.');
    expect(user).toContain('[2] Μετά κόλλα.');
    expect(user).toContain('#1: φωτογραφία «α»');
    expect(user).toContain('Διάσταση: 120x60 cm');
  });
});

describe('wrapText', () => {
  const m = (s: string) => s.length; // 1 μονάδα ανά χαρακτήρα
  it('σπάει σε λέξεις, κρατά αλλαγές γραμμής, κόβει τεράστιες λέξεις', () => {
    expect(wrapText('ένα δύο τρία τέσσερα', m, 8)).toEqual(['ένα δύο', 'τρία', 'τέσσερα']);
    expect(wrapText('α\n\nβ', m, 10)).toEqual(['α', '', 'β']);
    expect(wrapText('abcdefghijkl x', m, 5)).toEqual(['abcde', 'fghij', 'kl x']);
  });
});

describe('renderGuidePdf', () => {
  it('φτιάχνει έγκυρο PDF με ελληνικό κείμενο και εικόνες', async () => {
    const jpg = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#88aacc' } }).jpeg().toBuffer();
    const guide: InstallGuide = {
      title: 'Οδηγός εγκατάστασης — Πλακάκι πορσελάνης 120×60', summary: 'Τοποθέτηση σε δάπεδο με διπλή επάλειψη.',
      difficulty: 'Μέτρια', duration: '1 ημέρα / 20 m²', crew: '2 τεχνίτες',
      tools: ['Οδοντωτή σπάτουλα 12 mm', 'Αλφάδι'], materials: ['Κόλλα C2TE', 'Σταυρουδάκια 2 mm'],
      preparation: ['Έλεγχος επιπεδότητας'],
      steps: Array.from({ length: 14 }, (_, i) => ({
        title: `Βήμα δοκιμής ${i + 1}`, detail: 'Άπλωσε την κόλλα ομοιόμορφα και πίεσε την πλάκα. '.repeat(6),
        tip: i === 0 ? 'Δούλεψε σε μικρές επιφάνειες.' : '', warning: i === 1 ? 'Μην πατάς πριν από 24 ώρες.' : '', images: i < 2 ? [i + 1] : [],
      })),
      safety: ['Γάντια'], qualityChecks: ['Κενά κάτω από την πλάκα'], commonMistakes: ['Λίγη κόλλα'], aftercare: ['Αρμολόγημα μετά από 24 ώρες'],
    };
    const pdf = await renderGuidePdf(guide, { code: '0000230', name: 'Ιταλικό porcelanato', profileLabel: 'Πλακάκια', createdAt: new Date('2026-10-18T10:00:00Z') },
      [{ data: jpg, caption: 'φωτογραφία «α»' }, { data: jpg, caption: 'καρέ 1/2' }, { data: jpg, caption: 'αχρησιμοποίητο' }]);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true });
    expect(text).toContain('Βήματα εγκατάστασης');
    expect(text).toContain('Συμβουλή');
    expect(text).toContain('Δείγματα εγκατάστασης'); // το #3 δεν μπήκε σε βήμα
    expect(text).toMatch(/Σελίδα 1 \/ \d/);
  }, 30000);
});
