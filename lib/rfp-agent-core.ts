// lib/rfp-agent-core.ts — ΚΑΘΑΡΟ. AI βοηθός «Ζητήστε προσφορά» στο portal: συνομιλεί με τον πελάτη, ξέρει τι
// αναλαμβάνει η εταιρία και τι όχι, και συμπληρώνει σταδιακά ένα δομημένο RFP (αίτημα προσφοράς) που γίνεται
// πρόχειρη προσφορά για εμάς. Το AI ΔΕΝ δίνει τιμές ούτε δεσμεύεται — μόνο ρωτά, εξηγεί και καταγράφει.
import { z } from 'zod';

export const DEFAULT_CAPABILITIES = [
  'Είμαστε atelier φυσικής πέτρας, πλακιδίων και τσιμεντοκονιών (Atelier by Damask). Αναλαμβάνουμε:',
  '- Προμήθεια ΚΑΙ τοποθέτηση: φυσική πέτρα (δάπεδα, σκάλες, πάγκοι, επενδύσεις τοίχων, εξωτερικοί χώροι, βεράντες, περιμετρικά πισίνας), πλακάκια, μάρμαρα.',
  '- Τσιμεντοκονίες / μικροτσιμέντο, ασβεστοκονίες, Tadelakt, διακοσμητικά επιχρίσματα, σε δάπεδα, τοίχους, μπάνια, κουζίνες.',
  '- Στεγανώσεις μπάνιων και βεραντών που συνοδεύουν τις επενδύσεις μας, αποξήλωση παλιών επενδύσεων, εξομαλύνσεις/αυτοεπιπεδούμενα.',
  '- Μόνο προμήθεια υλικών (ο πελάτης έχει δικό του συνεργείο), δείγματα, αυτοψία και επιμέτρηση.',
  'ΔΕΝ αναλαμβάνουμε: ηλεκτρολογικά, υδραυλικά (πέρα από αποσύνδεση/επανασύνδεση ειδών υγιεινής), κουφώματα, ξυλουργικά, βαφές τοίχων,',
  'στατικά/φέρουσες κατασκευές, γενικές οικοδομικές εργασίες, άδειες. Μπορούμε να συστήσουμε συνεργάτες.',
  'Περιοχές: Αττική και, για μεγαλύτερα έργα, όλη η Ελλάδα. Τις τιμές τις δίνουμε ΜΟΝΟ με την προσφορά μας.',
].join('\n');

export const rfpDraft = z.object({
  title: z.string().max(160).default(''),
  kind: z.enum(['PRODUCT_INSTALL', 'PRODUCT', 'UNKNOWN']).default('UNKNOWN'),
  areas: z.array(z.object({ name: z.string().max(120), m2: z.number().finite().nonnegative().nullable().default(null), surfaces: z.string().max(120).nullable().default(null) })).max(30).default([]),
  material: z.string().max(500).default(''),
  current: z.string().max(500).default(''),
  site: z.string().max(300).default(''),
  timing: z.string().max(200).default(''),
  budget: z.string().max(200).default(''),
  notes: z.string().max(1500).default(''),
});
export type RfpDraft = z.infer<typeof rfpDraft>;
export const emptyDraft = (): RfpDraft => rfpDraft.parse({});

export type ScopeVerdict = 'YES' | 'PARTIAL' | 'NO' | 'UNKNOWN';
export type AgentTurn = {
  reply: string; quickReplies: string[]; draft: RfpDraft;
  scope: { verdict: ScopeVerdict; can: string[]; cannot: string[] };
  ready: boolean; missing: string[];
};
export type ChatMsg = { role: 'user' | 'assistant'; text: string };

export function buildAgentPrompt(p: { capabilities: string; catalog: string[]; company: string; history: ChatMsg[]; draft: RfpDraft; photos: number; customerName: string | null }) {
  const system = [
    `Είσαι ο ψηφιακός βοηθός του ${p.company} για αιτήματα προσφοράς. Μιλάς Ελληνικά, ζεστά και απλά, σε μη τεχνικούς ιδιοκτήτες σπιτιών.`,
    'ΣΤΟΧΟΣ: να καταλάβεις τι χρειάζεται ο πελάτης και να συμπληρώσεις ένα πλήρες αίτημα προσφοράς (RFP) για την εταιρία.',
    'ΚΑΝΟΝΕΣ:',
    '- Ο χαιρετισμός έχει ήδη γίνει — ΜΗΝ ξαναχαιρετάς. ΜΙΑ ερώτηση τη φορά, σύντομη (1–3 προτάσεις). Δώσε 2–4 έτοιμες απαντήσεις (quickReplies) όπου βοηθά.',
    '- Σειρά: τι θέλει & σε ποιους χώρους → περίπου τετραγωνικά (ή διαστάσεις) → υλικό/στυλ/χρώμα → τι υπάρχει σήμερα → υλικά μόνο ή και τοποθέτηση → περιοχή → πότε → (προαιρετικά) προϋπολογισμός.',
    '- Αν δεν ξέρει τετραγωνικά, ζήτα διαστάσεις ή φωτογραφία/κάτοψη (μπορεί να ανεβάσει με το κουμπί). Μην πιέζεις.',
    '- ΠΟΤΕ τιμές, εκπτώσεις, χρόνους παράδοσης ή δεσμεύσεις. Αν ρωτήσει τιμή: «θα τη δείτε στην προσφορά μας».',
    '- Έλεγχε ΣΥΝΕΧΩΣ αν το ζητούμενο είναι μέσα σε όσα αναλαμβάνουμε (παρακάτω). Αν κάτι δεν το κάνουμε, πες το ευγενικά και ξεκάθαρα,',
    '  πρότεινε τι μπορούμε να κάνουμε εμείς, και σημείωσέ το στο scope.cannot. verdict: YES (όλα), PARTIAL (μέρος), NO (τίποτα), UNKNOWN (δεν ξέρουμε ακόμη).',
    '- ready=true όταν υπάρχουν: τι & πού (χώροι), μέγεθος ή φωτογραφία, υλικό/στυλ, υλικά ή και τοποθέτηση, περιοχή. Τότε κάνε μια σύντομη',
    '  περίληψη και ρώτα αν θέλει να το στείλει ή να προσθέσει κάτι. missing: τι λείπει ακόμη (λίστα με απλές λέξεις).',
    '- Κράτα και ενημέρωσε ΟΛΟ το draft σε κάθε απάντηση (όχι μόνο τις αλλαγές). Ο τίτλος: σύντομος, π.χ. «Πέτρινο δάπεδο βεράντας 25 m²».',
    '',
    'ΤΙ ΑΝΑΛΑΜΒΑΝΟΥΜΕ / ΤΙ ΟΧΙ:', p.capabilities,
    p.catalog.length ? `\nΠαραδείγματα εργασιών που κάνουμε συχνά: ${p.catalog.join(' · ')}` : '',
    '',
    'Απάντησε ΜΟΝΟ με JSON:',
    '{"reply":"…","quickReplies":["…"],"draft":{"title":"","kind":"PRODUCT_INSTALL|PRODUCT|UNKNOWN","areas":[{"name":"","m2":null,"surfaces":"δάπεδο|τοίχοι|…"}],"material":"","current":"","site":"","timing":"","budget":"","notes":""},',
    '"scope":{"verdict":"YES|PARTIAL|NO|UNKNOWN","can":["…"],"cannot":["…"]},"ready":false,"missing":["…"]}',
  ].filter((x) => x !== '').join('\n');
  const user = [
    p.customerName ? `Πελάτης: ${p.customerName}` : '',
    `Τρέχον draft: ${JSON.stringify(p.draft)}`,
    `Φωτογραφίες/κατόψεις που ανέβασε: ${p.photos}`,
    'Συνομιλία:',
    ...p.history.slice(-20).map((m) => `${m.role === 'user' ? 'ΠΕΛΑΤΗΣ' : 'ΒΟΗΘΟΣ'}: ${m.text}`),
  ].filter(Boolean).join('\n');
  return { system, user };
}

const turn = z.object({
  reply: z.string().min(1).max(2000),
  quickReplies: z.array(z.string().max(80)).max(6).default([]),
  draft: z.unknown().optional(),
  scope: z.object({ verdict: z.enum(['YES', 'PARTIAL', 'NO', 'UNKNOWN']).default('UNKNOWN'), can: z.array(z.string().max(200)).max(10).default([]), cannot: z.array(z.string().max(200)).max(10).default([]) }).default({ verdict: 'UNKNOWN', can: [], cannot: [] }),
  ready: z.boolean().default(false),
  missing: z.array(z.string().max(80)).max(10).default([]),
});

export class AgentParseError extends Error {}

/** Διαβάζει την απάντηση του AI. Ένα άκυρο draft δεν χαλά το προηγούμενο — κρατιέται ό,τι ήταν σωστό. */
export function parseAgentTurn(text: string, prev: RfpDraft): AgentTurn {
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { throw new AgentParseError('Μη έγκυρο JSON'); }
  const t = turn.safeParse(raw);
  if (!t.success) throw new AgentParseError('Λάθος μορφή απάντησης');
  const d = rfpDraft.safeParse(t.data.draft ?? {});
  const draft = d.success ? mergeDraft(prev, d.data) : prev;
  return { reply: t.data.reply.trim(), quickReplies: t.data.quickReplies, draft, scope: t.data.scope, ready: t.data.ready, missing: t.data.missing };
}

/** Ό,τι έδωσε το AI κερδίζει· κενά πεδία δεν σβήνουν ό,τι υπήρχε. */
export function mergeDraft(prev: RfpDraft, next: RfpDraft): RfpDraft {
  const pick = <K extends keyof RfpDraft>(k: K) => {
    const v = next[k];
    if (Array.isArray(v)) return (v.length ? v : prev[k]) as RfpDraft[K];
    if (k === 'kind') return (v === 'UNKNOWN' ? prev.kind : v) as RfpDraft[K];
    return ((typeof v === 'string' && v.trim()) ? v : prev[k]) as RfpDraft[K];
  };
  return Object.fromEntries((Object.keys(prev) as (keyof RfpDraft)[]).map((k) => [k, pick(k)])) as RfpDraft;
}

const KIND_TEXT = { PRODUCT_INSTALL: 'Υλικά & τοποθέτηση', PRODUCT: 'Μόνο υλικά', UNKNOWN: '—' };
const VERDICT_TEXT: Record<ScopeVerdict, string> = { YES: 'Το αναλαμβάνουμε', PARTIAL: 'Το αναλαμβάνουμε εν μέρει', NO: 'Εκτός αντικειμένου', UNKNOWN: 'Προς έλεγχο' };

/** Το RFP ως ευανάγνωστο κείμενο (περίληψη προσφοράς + email προς εμάς). */
export function rfpText(d: RfpDraft, scope?: AgentTurn['scope']): string {
  const area = d.areas.map((a) => `• ${a.name}${a.m2 != null ? ` — ${a.m2.toLocaleString('el-GR')} m²` : ''}${a.surfaces ? ` (${a.surfaces})` : ''}`);
  return [
    `Τι: ${d.title || '—'} · ${KIND_TEXT[d.kind]}`,
    area.length ? `Χώροι:\n${area.join('\n')}` : '',
    d.material ? `Υλικό / στυλ: ${d.material}` : '',
    d.current ? `Σήμερα υπάρχει: ${d.current}` : '',
    d.site ? `Περιοχή: ${d.site}` : '',
    d.timing ? `Πότε: ${d.timing}` : '',
    d.budget ? `Προϋπολογισμός: ${d.budget}` : '',
    d.notes ? `Σημειώσεις: ${d.notes}` : '',
    scope ? `Εκτίμηση βοηθού: ${VERDICT_TEXT[scope.verdict]}${scope.cannot.length ? ` — εκτός: ${scope.cannot.join(', ')}` : ''}` : '',
  ].filter(Boolean).join('\n');
}
export const verdictText = (v: ScopeVerdict) => VERDICT_TEXT[v];
