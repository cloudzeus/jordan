// lib/assistant/intents.ts — ΚΑΘΑΡΟ. «Εννοιολογική ανάλυση» του ερωτήματος: τι θέλει ο χρήστης (πρόθεση),
// για ποιον/τι (οντότητα), πότε (περίοδος) — από ελεύθερη ελληνική/greeklish διατύπωση με συνώνυμα, λάθη
// και αναφορές στα προηγούμενα («αυτός ο πελάτης»).
//
// Χρήσεις: (1) υπόδειξη προς το μοντέλο ποιο εργαλείο ταιριάζει, (2) άμεσες επιλογές-κουμπιά όταν το
// ερώτημα είναι αόριστο («υπόλοιπο;»), (3) προτάσεις «επόμενου βήματος» μετά την απάντηση.
// Οι χρήστες ΔΕΝ είναι προχωρημένοι — προτιμάμε να ρωτήσουμε με κουμπιά παρά να μαντέψουμε.
import { extractCodes, fold, phonetic } from './text';
import { parsePeriod, type Period } from './period';

export type IntentKey =
  | 'today' | 'appointments' | 'book_appointment' | 'tasks'
  | 'trader_balance' | 'statement' | 'trader_info'
  | 'project_status' | 'project_profit' | 'project_balance' | 'project_materials'
  | 'turnover' | 'purchases'
  | 'item_info'
  | 'document'
  | 'pending_work'
  | 'how_to' | 'explain_term'
  | 'unknown';

export const INTENT_LABEL: Record<IntentKey, string> = {
  today: 'Τι έχω σήμερα',
  appointments: 'Ραντεβού',
  book_appointment: 'Νέο ραντεβού',
  tasks: 'Εργασίες έργων',
  trader_balance: 'Υπόλοιπο πελάτη/προμηθευτή',
  statement: 'Κατάσταση λογαριασμού',
  trader_info: 'Στοιχεία πελάτη/προμηθευτή',
  project_status: 'Κατάσταση έργου',
  project_profit: 'Κέρδος έργου',
  project_balance: 'Υπόλοιπο πελάτη στο έργο',
  project_materials: 'Υλικά έργου',
  turnover: 'Τζίρος περιόδου',
  purchases: 'Αγορές περιόδου',
  item_info: 'Υλικό / προϊόν',
  document: 'Παραστατικό',
  pending_work: 'Εκκρεμότητες',
  how_to: 'Πώς γίνεται στην εφαρμογή',
  explain_term: 'Τι σημαίνει',
  unknown: 'Άγνωστο',
};

/** Το εργαλείο που απαντά κάθε πρόθεση (υπόδειξη για το μοντέλο). */
export const INTENT_TOOL: Partial<Record<IntentKey, string>> = {
  today: 'get_today', appointments: 'get_appointments', book_appointment: 'propose_appointment', tasks: 'get_tasks',
  trader_balance: 'get_trader', statement: 'get_statement', trader_info: 'get_trader',
  project_status: 'get_project', project_profit: 'get_project', project_balance: 'get_customer_project_balance', project_materials: 'get_project_materials',
  turnover: 'get_turnover', purchases: 'get_turnover', item_info: 'get_item', document: 'get_document',
  pending_work: 'get_pending_work', how_to: 'how_to', explain_term: 'how_to',
};

export interface Analysis {
  intent: IntentKey;
  /** high = σαφές· low = αόριστο ⇒ ρώτα με επιλογές */
  confidence: 'high' | 'low';
  /** Άλλες πιθανές προθέσεις (για κουμπιά διευκρίνισης). */
  alternatives: IntentKey[];
  /** Αναφέρεται σε κάτι προηγούμενο («αυτός ο πελάτης», «εκεί», «το ίδιο έργο»). */
  refersToPrevious: boolean;
  /** Τύπος οντότητας που φαίνεται (αν φαίνεται). */
  entityKind: 'customer' | 'supplier' | 'trader' | 'project' | 'item' | 'document' | null;
  /** Υπολειπόμενο «όνομα» (ό,τι μένει αν αφαιρεθούν οι λέξεις πρόθεσης) — π.χ. «Κουνά». */
  nameHint: string | null;
  codes: string[];
  period: Period | null;
}

type Rule = { intent: IntentKey; re: RegExp; w: number };
// Πάνω σε folded + φωνητικό κείμενο (βλ. analyze). Βάρη: ισχυρά σήματα 3, μέτρια 2, αδύναμα 1.
const R = (intent: IntentKey, re: RegExp, w = 2): Rule => ({ intent, re, w });
const RULES: Rule[] = [
  // σήμερα / ατζέντα
  R('today', /τι (εχω|εχουμε) (σημερα|για σημερα|να κανω)|ατζεντα|προγραμμα (μου|τησ ημερασ)|τι τρεχει σημερα|τι εχω για σημερα|καλημερα|ti exo simera|agenda|what.?s (on )?today/, 4),
  R('today', /σημερα/, 1),
  // ραντεβού
  R('appointments', /ραντεβ|συναντησ|meeting|radev|ημερολογ/, 2),
  R('book_appointment', /(κλεισε|κλεισ|κανονισε|βαλε|προγραμματισε|θελω να κλεισω|kleise|vale)\S*( μου)?( (ενα|μια|mia|ena))? (ραντεβ|συναντησ|radev)/, 5),
  // εργασίες
  R('tasks', /εργασι|καθυστερ|εκπρoθεσμ|gantt|καθηκοντ|tasks?\b|ergasi|delayed|overdue/, 3),
  // υπόλοιπα / καρτέλα
  R('trader_balance', /υπολοιπ|χρωστ|οφειλ|ανοιχτ\S* (ποσ|υπολοιπ)|ποσα (μασ|του|τησ)|ipolip|xrost|hrost|ofil|balance|owe/, 3),
  R('statement', /καταστασ\S* λογαριασμ|statement|αντιγραφο καρτελ|καρτελ.{0,30}pdf|στειλ\S* (την )?καρτελ|katastasi logariasm/, 5),
  R('trader_info', /τηλεφων|κινητο|email|μειλ|διευθυνσ|αφμ|επαφ|ποιοσ ειναι ο|που (ειναι|βρισκεται)|tilefon|kinito|dief?thins|afm/, 2),
  // έργα
  R('project_status', /πωσ παει|σε τι (σημειο|φαση)|προοδοσ|κατασταση (του )?εργ|status (του )?εργ|pos paei|proodos/, 3),
  R('project_profit', /κερδ|ζημι|περιθωρ|κερδοφορ|βγαζ\S* λεφτα|profit|margin|kerd|zimi/, 3),
  R('project_balance', /(υπολοιπ|χρωστ|οφειλ|ανοιχτ)\S*.{0,40}(στο|του|για το) εργ|εργ\S*.{0,40}(υπολοιπ|χρωστ|οφειλ)/, 5),
  R('project_materials', /(υλικα|ειδη|τι (πηγε|πηγαν|μπηκε|μπηκαν)).{0,30}εργ|εργ\S*.{0,30}(υλικα|ειδη)|ilika/, 4),
  R('project_status', /εργο|εργα|εργου|project|ergo/, 1),
  // τζίρος / αγορές
  R('turnover', /τζιρ|πωλησ|πουλησ|τιμολογησ|εσοδ|εισπραξαμε|turnover|sales|revenue|tzir|poulis/, 4),
  R('purchases', /(αγορ|ψωνισ|αγορασαμε|πληρωσαμε σε)\S*.{0,30}(απο|του|τησ|φετοσ|περσι|μηνα|τριμην|εβδομαδ|q[1-4])|purchases/, 4),
  // υλικά
  R('item_info', /αποθεμ|στοκ|διαθεσιμ|τιμη (αγορ|πωλησ)|ποσο (κανει|κοστιζ|το πηραμε|αγορασαμε)|τελευταια (τιμη|φορα)|κωδικ\S* ειδ|υλικ|προιον|πλακακ|apothem|stock|price|timi|ilik|plakak/, 3),
  // παραστατικά
  R('document', /τιμολογιο|παραστατικ|δελτιο|αποδειξη|πιστωτικ|παραγγελια (αρ|νο|#)|μαρκ|invoice|timologio|parastatik/, 2),
  // εκκρεμότητες
  R('pending_work', /εκκρεμ|εκκρεμοτητ|τι (εκκρεμει|μενει|λειπει)|ocr|σαρωσ|αιτηματ|κρατησ|ερωτηματα λογιστ|integrator|τι πρεπει να (κανω|γινει)|ekkrem|pending|todo/, 3),
  // οδηγίες / ορισμοί
  R('how_to', /πωσ (κανω|μπορω|γινεται|βαζω|φτιαχνω|βρισκω|στελνω|αλλαζω|προσθετω|δημιουργω)|πωσ [α-ω]+ω(?=\s|$)|που (βρισκω|ειναι η σελιδα|πατω)|βημα βημα|οδηγι|pos (kano|mporo|ginetai)|how (do|can) i/, 5),
  R('explain_term', /τι (σημαινει|ειναι (το|η|ο|τα|οι))|τι εννοεισ|εξηγησε|ti simainei|what (is|does)/, 4),
];

const CUSTOMER = /πελατ|pelat|customer|client/;
const SUPPLIER = /προμηθευτ|promithef|supplier|vendor/;
const PROJECT = /εργο|εργα|εργου|project|ergo/;
const ITEM = /υλικ|ειδο|ειδουσ|προιον|πλακακ|ilik|proion|item|product/;
const DOC = /τιμολογ|παραστατ|δελτι|αποδειξ|πιστωτικ|invoice|timolog/;
const ANAPHORA = /(?<![\p{L}])(αυτοσ|αυτη|αυτο|αυτου|αυτησ|αυτον|αυτην|ιδιοσ|ιδια|ιδιο|εκει|ayto|afto|aftos|aytos|same)(?![\p{L}])|(?<![\p{L}])(του|τησ)\s*[;?]?\s*$|(?<![\p{L}])(στειλε|δωσε|πεσ|δειξε|κλεισε|τηλεφωνησε|γραψε|steile|dose)\s+(του|τησ|tou|tis)(?![\p{L}])/u;

/** Λέξεις πρόθεσης/ερώτησης που ΔΕΝ είναι όνομα — ό,τι μένει είναι πιθανό όνομα/κωδικός. */
const NOT_NAME = new Set(('τι ποιο ποια ποιοσ ποιεσ ποιουσ ποσο ποσα ποσεσ πωσ που ποτε γιατι εχω εχουμε εχει ειναι θελω μου μασ σου '
  + 'ο η το οι τα του τησ των τον την στο στη στην στον στα σε με για απο και να θα δεν μη ενα μια ενασ αυτο αυτοσ αυτη αυτου αυτησ '
  + 'υπολοιπο υπολοιπα χρωσταει χρωσταμε χρωστανε οφειλη οφειλει πελατη πελατησ πελατεσ προμηθευτη προμηθευτησ προμηθευτεσ '
  + 'εργο εργου εργα τζιρο τζιροσ πωλησεισ αγορεσ κερδοσ κερδοσ ζημια περιθωριο υλικα υλικο ειδοσ ειδη τιμη τελευταια αποθεμα '
  + 'κλεισε ραντεβου σημερα αυριο μηνα εβδομαδα φετοσ περσι κατασταση λογαριασμου καρτελα δειξε πεσ δωσε στειλε βρεσ '
  + 'τιμολογιο παραστατικο τηλεφωνο email διευθυνση στοιχεια παρακαλω ευχαριστω κανω καναμε εκανα πηγε πηγαν παει').split(' '));

export function analyze(text: string, now = new Date()): Analysis {
  const f = fold(text);
  const t = ` ${f} ${phonetic(text)} `;
  const scores = new Map<IntentKey, number>();
  for (const r of RULES) if (r.re.test(t)) scores.set(r.intent, (scores.get(r.intent) ?? 0) + r.w);

  // Συνδυασμοί που αλλάζουν τη σημασία.
  const isProject = PROJECT.test(t);
  if (isProject && scores.has('trader_balance') && !scores.has('project_balance')) scores.set('project_balance', (scores.get('trader_balance') ?? 0) + 1);
  if (scores.has('book_appointment')) scores.delete('appointments');
  if (scores.has('statement')) scores.delete('trader_balance');
  if (scores.has('project_balance')) scores.delete('trader_balance');
  if (scores.has('turnover') && scores.has('purchases')) scores.delete('turnover');
  if (scores.has('project_profit') && !isProject && scores.has('turnover')) scores.delete('project_profit');
  // «Πώς στέλνω κατάσταση λογαριασμού;» = οδηγία, όχι αίτημα να σταλεί.
  if (scores.has('how_to') || scores.has('explain_term')) for (const k of [...scores.keys()]) if (k !== 'how_to' && k !== 'explain_term') scores.delete(k);
  if (scores.has('document') && (scores.has('turnover') || scores.has('trader_balance'))) scores.delete('document');
  if (scores.has('today') && (scores.get('today') ?? 0) <= 1 && scores.size > 1) scores.delete('today');

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const codes = extractCodes(text);
  const period = parsePeriod(text, now);
  const refersToPrevious = ANAPHORA.test(f);
  const entityKind: Analysis['entityKind'] = DOC.test(t) && (codes.length || /τιμολογιο/.test(t)) && !scores.has('turnover') ? 'document'
    : isProject ? 'project' : SUPPLIER.test(t) ? 'supplier' : CUSTOMER.test(t) ? 'customer' : ITEM.test(t) ? 'item' : null;

  const words = f.split(/[^\p{L}\p{N}\-./]+/u).filter((w) => w.length > 1 && !NOT_NAME.has(w) && !/^\d{1,2}$/.test(w));
  const nameHint = words.length ? words.join(' ') : null;

  let intent: IntentKey = ranked[0]?.[0] ?? 'unknown';
  let alternatives = ranked.slice(1, 4).map(([k]) => k);
  let confidence: Analysis['confidence'] = 'high';

  // Αόριστα: μία λέξη πρόθεσης χωρίς οντότητα/όνομα/περίοδο ⇒ ρώτα.
  const vague = !nameHint && !codes.length && !refersToPrevious;
  if (intent === 'trader_balance' && !entityKind && vague) {
    confidence = 'low';
    alternatives = ['project_balance', 'statement'];
  } else if (intent === 'turnover' && !period) {
    confidence = 'low';
  } else if (intent === 'unknown') {
    confidence = 'low';
    alternatives = ['today', 'trader_balance', 'project_status', 'how_to'];
  } else if (ranked.length > 1 && ranked[0][1] - ranked[1][1] <= 0) {
    confidence = 'low';
  } else if (['trader_balance', 'statement', 'trader_info', 'project_profit', 'project_balance', 'project_materials', 'item_info', 'document'].includes(intent) && vague && !entityKind) {
    confidence = 'low';
  }
  // Τα «trader_balance» ξέρουν τη μεριά από τη λέξη (πελάτη/προμηθευτή) — αυτό δεν είναι αοριστία.
  return { intent, confidence, alternatives: alternatives.filter((a) => a !== intent), refersToPrevious, entityKind, nameHint, codes, period };
}

// ── Κουμπιά: διευκρίνιση & επόμενα βήματα ──

export interface Choice {
  label: string;
  /** Το μήνυμα που στέλνεται αν πατηθεί (σαν να το έγραψε ο χρήστης). */
  prompt?: string;
  /** Ή: κείμενο που μπαίνει στο πεδίο για να το συμπληρώσει ο χρήστης (π.χ. «Υπόλοιπο του πελάτη »). */
  fill?: string;
  /** Ή σύνδεσμος (σελίδα / PDF). */
  href?: string;
}

/** Επιλογές για αόριστο ερώτημα — με τα λόγια του χρήστη όπου γίνεται. */
export function clarifyChoices(a: Analysis): { question: string; choices: Choice[] } | null {
  if (a.confidence !== 'low') return null;
  const all: IntentKey[] = [a.intent, ...a.alternatives].filter((k) => k !== 'unknown');
  if (a.intent === 'trader_balance' || all.includes('trader_balance')) {
    return {
      question: 'Ποιο υπόλοιπο θέλετε να δείτε;',
      choices: [
        { label: 'Υπόλοιπο πελάτη', fill: 'Πόσα μας χρωστά ο πελάτης ' },
        { label: 'Υπόλοιπο προμηθευτή', fill: 'Ποιο είναι το υπόλοιπο στον προμηθευτή ' },
        { label: 'Υπόλοιπο πελάτη σε έργο', fill: 'Ποιο είναι το υπόλοιπο του πελάτη στο έργο ' },
        { label: 'Ποιοι πελάτες χρωστούν', prompt: 'Ποια έργα έχουν το μεγαλύτερο ανοιχτό υπόλοιπο;' },
      ],
    };
  }
  if (a.intent === 'turnover') {
    return {
      question: 'Για ποια περίοδο;',
      choices: [
        { label: 'Αυτόν τον μήνα', prompt: 'Τι τζίρο έκανα αυτό τον μήνα;' },
        { label: 'Τον προηγούμενο μήνα', prompt: 'Τζίρος τον προηγούμενο μήνα' },
        { label: 'Αυτό το τρίμηνο', prompt: 'Τζίρος αυτό το τρίμηνο' },
        { label: 'Φέτος', prompt: 'Τζίρος φέτος' },
      ],
    };
  }
  if (a.intent === 'unknown') {
    return {
      question: 'Δεν είμαι σίγουρος τι χρειάζεστε. Μήπως κάτι από αυτά;',
      choices: [
        { label: 'Τι έχω σήμερα', prompt: 'Τι έχω σήμερα;' },
        { label: 'Υπόλοιπο πελάτη/προμηθευτή', prompt: 'υπόλοιπο;' },
        { label: 'Πώς πάει ένα έργο', fill: 'Πώς πάει το έργο ' },
        { label: 'Πώς κάνω κάτι στην εφαρμογή', fill: 'Πώς κάνω ' },
      ],
    };
  }
  return null;
}

export type FocusEntity = { kind: 'trader' | 'project' | 'item' | 'document'; id: string; code: string; name: string; side?: 'customer' | 'supplier' };

/** Προτάσεις «τι άλλο» μετά από απάντηση — ανάλογα με την πρόθεση και την οντότητα που απάντησε. */
export function followups(intent: IntentKey, e: FocusEntity | null): Choice[] {
  const who = e ? `${e.name} (${e.code})` : '';
  if (e?.kind === 'trader' && e.side === 'customer') {
    return [
      { label: 'Κατάσταση λογαριασμού (PDF)', href: `/api/admin/statements/${e.id}/pdf` },
      { label: 'Έργα του πελάτη', prompt: `Ποια έργα έχει ο πελάτης ${who};` },
      { label: 'Τζίρος φέτος', prompt: `Τι τζίρο κάναμε φέτος με τον πελάτη ${who};` },
      { label: 'Κλείσε ραντεβού', prompt: `Κλείσε ραντεβού με τον πελάτη ${who}` },
    ].filter((c) => !(intent === 'statement' && c.href));
  }
  if (e?.kind === 'trader') {
    return [
      { label: 'Αγορές φέτος', prompt: `Πόσα αγοράσαμε φέτος από τον προμηθευτή ${who};` },
      { label: 'Υπόλοιπο & πληρωμές', prompt: `Ποιο είναι το υπόλοιπο του προμηθευτή ${who} και πότε πληρώσαμε τελευταία;` },
      { label: 'Στοιχεία επικοινωνίας', prompt: `Τηλέφωνα και email του ${who}` },
    ].filter((c) => !(intent === 'trader_balance' && c.label.startsWith('Υπόλοιπο')));
  }
  if (e?.kind === 'project') {
    const all: [IntentKey, Choice][] = [
      ['project_materials', { label: 'Υλικά του έργου', prompt: `Τι υλικά πήγαν στο έργο ${who};` }],
      ['project_balance', { label: 'Τι χρωστά ο πελάτης', prompt: `Ποιο είναι το υπόλοιπο του πελάτη στο έργο ${who};` }],
      ['project_profit', { label: 'Κέρδος έργου', prompt: `Πόσο κέρδος έχει το έργο ${who};` }],
      ['tasks', { label: 'Εργασίες έργου', prompt: `Ποιες εργασίες εκκρεμούν στο έργο ${who};` }],
    ];
    return [...all.filter(([k]) => k !== intent).map(([, c]) => c), { label: 'Άνοιγμα έργου', href: `/admin/projects/${e.id}` }].slice(0, 4);
  }
  if (e?.kind === 'item') {
    return [
      { label: 'Από ποιους το αγοράζουμε', prompt: `Από ποιους προμηθευτές αγοράζουμε το ${who};` },
      { label: 'Σε ποια έργα μπήκε', prompt: `Σε ποια έργα χρησιμοποιήθηκε το ${who};` },
      { label: 'Απόθεμα ανά αποθήκη', prompt: `Απόθεμα ανά αποθήκη για το ${who}` },
    ];
  }
  if (e?.kind === 'document') {
    return [{ label: 'Άλλα παραστατικά του συναλλασσομένου', prompt: `Δείξε τις τελευταίες κινήσεις του συναλλασσομένου του ${e.code}` }];
  }
  switch (intent) {
    case 'today':
      return [
        { label: 'Καθυστερημένες εργασίες', prompt: 'Ποιες εργασίες έχουν καθυστερήσει;' },
        { label: 'Ραντεβού αύριο', prompt: 'Τι ραντεβού έχω αύριο;' },
        { label: 'Όλες οι εκκρεμότητες', prompt: 'Τι εκκρεμεί γενικά;' },
      ];
    case 'turnover':
    case 'purchases':
      return [
        { label: 'Σύγκριση με προηγούμενο μήνα', prompt: 'Σύγκρινε τον τζίρο αυτού του μήνα με τον προηγούμενο' },
        { label: 'Ανά πελάτη', prompt: 'Ποιοι πελάτες έφεραν τον περισσότερο τζίρο φέτος;' },
        { label: 'Αγορές ίδιας περιόδου', prompt: 'Πόσα αγοράσαμε αυτό τον μήνα;' },
      ];
    case 'appointments':
      return [{ label: 'Κλείσε νέο ραντεβού', fill: 'Κλείσε μου ραντεβού με τον πελάτη ' }, { label: 'Ημερολόγιο', href: '/admin/appointments' }];
    case 'pending_work':
      return [
        { label: 'Εκκρεμότητες OCR', prompt: 'Ποια έγγραφα OCR περιμένουν έλεγχο;' },
        { label: 'Αιτήματα παραγγελίας', prompt: 'Ποια αιτήματα παραγγελίας περιμένουν;' },
        { label: 'Ερωτήματα λογιστή', prompt: 'Τι ερωτήματα λογιστή είναι ανοιχτά;' },
      ];
    default:
      return [];
  }
}

/** Ερωτήματα-παραδείγματα για άδεια συνομιλία, ανά ενότητα. */
export const STARTERS: { group: string; items: string[] }[] = [
  { group: 'Η μέρα μου', items: ['Τι έχω σήμερα;', 'Τι ραντεβού έχω αύριο;', 'Ποιες εργασίες έχουν καθυστερήσει;', 'Τι εκκρεμεί γενικά;'] },
  { group: 'Πελάτες & προμηθευτές', items: ['Πόσα μας χρωστά ο πελάτης…', 'Ποιο είναι το υπόλοιπο στον προμηθευτή…', 'Κατάσταση λογαριασμού για τον πελάτη…', 'Κλείσε ραντεβού με τον πελάτη…'] },
  { group: 'Έργα', items: ['Πώς πάει το έργο…', 'Ποια έργα έχουν το μεγαλύτερο κέρδος;', 'Τι υλικά πήγαν στο έργο…', 'Υπόλοιπο πελάτη στο έργο…'] },
  { group: 'Πωλήσεις & υλικά', items: ['Τι τζίρο έκανα αυτό τον μήνα;', 'Πόσα αγοράσαμε τον προηγούμενο μήνα;', 'Τελευταία τιμή αγοράς και απόθεμα για…', 'Δείξε μου το τιμολόγιο…'] },
  { group: 'Βοήθεια', items: ['Πώς στέλνω κατάσταση λογαριασμού σε πελάτη;', 'Τι σημαίνει «καθαρά» και «μικτά»;', 'Πώς κλείνω ραντεβού από το ημερολόγιο;'] },
];
