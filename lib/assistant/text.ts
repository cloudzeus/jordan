// lib/assistant/text.ts — ΚΑΘΑΡΟ (χωρίς I/O). Κανονικοποίηση κειμένου για την αναζήτηση του Air Jordan.
//
// Ο χρήστης μιλά/γράφει Ελληνικά με αγγλικούς όρους, χωρίς τόνους ή σε greeklish («plakakia mpaniou»),
// με κομμάτια κωδικών («ΕΡΓ-12», «prj 0012»). Για να βρίσκονται όλα αυτά με pg_trgm:
//  - `fold`: πεζά, χωρίς τόνους/διαλυτικά, τελικό σ → σ·
//  - `phonetic`: ένας «φωνητικός σκελετός» σε λατινικά, ΙΔΙΟΣ για Ελληνικά και greeklish
//    (η/ι/υ/ει/οι → i, ω → o, μπ → b, ντ → d, χ/ch/x → h, β/v → v …)·
//  - το `searchText` κάθε εγγραφής περιέχει και τα δύο, και το ερώτημα ψάχνεται και με τα δύο.

const GREEK_TO_LATIN: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm',
  ν: 'n', ξ: 'ks', ο: 'o', π: 'p', ρ: 'r', σ: 's', τ: 't', υ: 'i', φ: 'f', χ: 'h', ψ: 'ps', ω: 'o',
};

/** Πεζά, χωρίς τόνους, ενιαίο σίγμα, συμπτυγμένα κενά. */
export function fold(s: string | null | undefined): string {
  return (s ?? '')
    .toLocaleLowerCase('el')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Φωνητικός σκελετός σε λατινικά: «Πλακάκια μπάνιου» και «plakakia mpaniou» → «plakakia baniou».
 * Δεν είναι ορθή μεταγραφή — είναι κοινός παρονομαστής για σύγκριση με τρίγραμμα.
 */
export function phonetic(s: string | null | undefined): string {
  let t = fold(s);
  // Ελληνικά δίψηφα πριν τα μονά γράμματα.
  t = t
    .replace(/ου/g, 'ou').replace(/μπ/g, 'b').replace(/ντ/g, 'd').replace(/γκ|γγ/g, 'g')
    .replace(/ει|οι|υι/g, 'i').replace(/αι/g, 'e').replace(/αυ/g, 'av').replace(/ευ/g, 'ev');
  t = t.replace(/[α-ω]/g, (c) => GREEK_TO_LATIN[c] ?? c);
  // Greeklish → ίδιος σκελετός.
  t = t
    .replace(/ch/g, 'h').replace(/x/g, 'h').replace(/ph/g, 'f').replace(/ps/g, 'ps')
    .replace(/ou/g, '\u0001').replace(/mp/g, 'b').replace(/nt/g, 'd').replace(/gk|gg/g, 'g')
    .replace(/ei|oi|yi/g, 'i').replace(/ai/g, 'e').replace(/[yu]/g, 'i').replace(/w/g, 'o')
    .replace(/\u0001/g, 'ou').replace(/c/g, 'k').replace(/q/g, 'k').replace(/b/g, 'b')
    .replace(/(.)\1+/g, '$1'); // διπλά σύμφωνα (λλ, ss) → ένα
  return t.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Κείμενο αναζήτησης μιας εγγραφής: folded + φωνητικό, χωρίς διπλότυπα. */
export function searchTextOf(...parts: (string | number | null | undefined)[]): string {
  const raw = parts.filter((p) => p != null && String(p).trim() !== '').map(String).join(' ');
  const a = fold(raw);
  const b = phonetic(raw);
  return a === b ? a : `${a} ${b}`;
}

/** Οι δύο μορφές ενός ερωτήματος για pg_trgm. */
export function queryForms(q: string): { folded: string; phonetic: string } {
  return { folded: fold(q), phonetic: phonetic(q) };
}

/** Λέξεις που δεν βοηθούν την αναζήτηση οντοτήτων (ερωτηματικά, άρθρα, γενικοί όροι). */
const STOP = new Set([
  'ο', 'η', 'το', 'οι', 'τα', 'του', 'τησ', 'των', 'τον', 'την', 'στο', 'στη', 'στην', 'στον', 'στα', 'στουσ', 'σε', 'με', 'για',
  'και', 'να', 'μου', 'πεσ', 'δωσε', 'δειξε', 'ποιο', 'ποια', 'ποιοσ', 'ποιεσ', 'ποιουσ', 'τι', 'ποσο', 'ποσα', 'ποσεσ', 'ποτε', 'που', 'πωσ',
  'εχει', 'εχουμε', 'ειναι', 'απο', 'ενα', 'μια', 'ενασ', 'αυτο', 'θελω', 'μπορεισ', 'ξερεισ', 'υπαρχει', 'υπαρχουν', 'τελευταια', 'τελευταιο',
  'the', 'of', 'for', 'and', 'what', 'is', 'show', 'me',
]);

/** Οι «ουσιαστικές» λέξεις του ερωτήματος (για αναζήτηση ονομάτων). */
export function keywords(q: string): string[] {
  return fold(q).split(/[^\p{L}\p{N}.\-/]+/u).filter((w) => w.length > 1 && !STOP.has(w));
}

/**
 * Πιθανοί κωδικοί μέσα στο ερώτημα: λέξεις με ψηφία (ΕΡΓ-0012, 2026-015, ΠΑΡ0000057, 60x60 όχι).
 * Επιστρέφει κεφαλαία, χωρίς κενά — όπως γράφονται στο SoftOne.
 */
export function extractCodes(q: string): string[] {
  const out = new Set<string>();
  for (const m of q.matchAll(/[\p{L}]{0,6}[-./]?\d[\p{L}\d\-./]{1,20}/gu)) {
    const c = m[0].replace(/[.,;:]+$/, '').toLocaleUpperCase('el');
    if (/^\d+X\d+$/i.test(c) || /^\d{1,2}$/.test(c)) continue; // διαστάσεις / μικροί αριθμοί
    if (/^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$/.test(c)) continue; // ημερομηνίες
    out.add(c);
  }
  return [...out];
}

/**
 * Αριθμοί που μάλλον είναι κωδικοί, χωρίς τα μηδενικά μπροστά: «έργο 40» → «40» (κωδικός 0000040),
 * «είδος 0380» → «380». Μόνο όταν ακολουθούν λέξη οντότητας ή έχουν ≥3 ψηφία.
 */
export function numericRefs(q: string): string[] {
  const out = new Set<string>();
  const t = fold(q);
  for (const m of t.matchAll(/(?:εργ\S*|ειδ\S*|κωδ\S*|προμηθευτ\S*|πελατ\S*|υπηρεσι\S*|project|ergo|item|no|νο|#)\s*(\d{1,10})\b/gu)) out.add(m[1].replace(/^0+(?=\d)/, ''));
  for (const m of t.matchAll(/(?<![\d.,])(\d{3,10})(?![\d.,])/g)) out.add(m[1].replace(/^0+(?=\d)/, ''));
  return [...out].filter((n) => n !== '0');
}

export type EntityKind = 'project' | 'trader' | 'item' | 'partner' | 'offer' | 'appointment' | 'lead' | 'order_request' | 'help';

export interface Intent {
  /** Τύποι οντοτήτων στους οποίους μάλλον αναφέρεται (με σειρά πιθανότητας). */
  entities: EntityKind[];
  /** Πελάτης / προμηθευτής, αν φαίνεται. */
  traderSide: 'customer' | 'supplier' | null;
  wantsFinancials: boolean;
  /** Τζίρος / πωλήσεις / αγορές περιόδου. */
  wantsTurnover: boolean;
  wantsBalance: boolean;
  wantsDocuments: boolean;
  wantsStock: boolean;
  wantsPrice: boolean;
  wantsContacts: boolean;
  wantsLocation: boolean;
  codes: string[];
}

const has = (t: string, re: RegExp) => re.test(t);

/** Πρόχειρη κατανόηση του ερωτήματος — βοηθά την κατάταξη και δίνεται ως υπόδειξη στο μοντέλο. */
export function detectIntent(q: string): Intent {
  const t = `${fold(q)} ${phonetic(q)}`;
  const entities: EntityKind[] = [];
  const add = (k: EntityKind, re: RegExp) => { if (has(t, re) && !entities.includes(k)) entities.push(k); };
  add('project', /εργ[οαων]|εργοταξ|project|prjc|ergo|ergot|πελατ.*εργ|μελετ|κατασκευ|ανακαιν|meleti|kataskev/);
  add('trader', /προμηθευτ|πελατ|συναλλασσ|χρεωστ|πιστωτ|υπολοιπ|οφειλ|χρωστ|καρτελ|supplier|customer|vendor|promithef|pelat|ipolip|ofil|hrost|kartel/);
  add('item', /υλικ|ειδ[οηωα]|προιον|πλακακ|κωδικ.*ειδ|αποθεμ|στοκ|τιμ[ηεω].*αγορ|μοναδ|barcode|ean|sku|stock|material|product|ilik|proion|apothem|plakak/);
  add('partner', /συνεργατ|αρχιτεκτον|μηχανικ|ηλεκτρολογ|υδραυλ|partner|sinergat|arhitekt/);
  add('offer', /προσφορ|container|κοντειν|παλετ|δυναμικ|offer|prosfor|palet/);
  add('appointment', /ραντεβ|συναντησ|appointment|meeting|radev|sinadis/);
  add('lead', /lead|newsletter|συνδρομ|ενδιαφερομεν/);
  add('order_request', /αιτημα.*παραγγ|παραγγελι|order|paragel/);
  add('help', /πωσ (κανω|μπορω|γινεται)|οδηγ|βοηθει|wiki|help|pos kano/);
  const supplier = has(t, /προμηθευτ|supplier|vendor|promithef/);
  const customer = has(t, /πελατ|customer|pelat/);
  return {
    entities,
    traderSide: supplier && !customer ? 'supplier' : customer && !supplier ? 'customer' : null,
    wantsFinancials: has(t, /κερδ|ζημι|περιθωρ|κοστ|εσοδ|τζιρ|κερδοφορ|οικονομικ|profit|margin|revenue|cost|kerd|kost|esod/),
    wantsTurnover: has(t, /τζιρ|πωλησ|πουλησ|τιμολογησ|εσοδ|αγορεσ (του|τησ|τον|φετοσ|περσι)|turnover|sales|revenue|tzir|poulis|polis|timologis/),
    wantsBalance: has(t, /υπολοιπ|οφειλ|χρωστ|ανοιχτ|εισπραξ|πληρωμ|εξοφλ|balance|ipolip|ofil|hrost|isprak|pliromi/),
    wantsDocuments: has(t, /τιμολογ|παραστατ|δελτι|παραγγελ|πιστωτικ|αποδειξ|μαρκ|mydata|invoice|timolog|parastat|delti/),
    wantsStock: has(t, /αποθεμ|στοκ|διαθεσιμ|αποθηκ|stock|apothem|diathesim/),
    wantsPrice: has(t, /τιμ[ηεω]|κοστιζ|ποσο κανει|price|cost|timi|kostiz/),
    wantsContacts: has(t, /τηλεφων|email|mail|επαφ|κινητ|υπευθυν|phone|contact|tilefon|epaf/),
    wantsLocation: has(t, /διευθυνσ|που ειναι|που βρισκ|τοποθεσ|χαρτ|πολη|address|location|map|diefthins/),
    codes: extractCodes(q),
  };
}
