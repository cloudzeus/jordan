// lib/text-assist/core.ts — ΚΑΘΑΡΟ. Βοηθός κειμένου στα πεδία της διαχείρισης (φωνή + AI μορφοποίηση).
//
// Ο κανόνας πρόσβασης, το σχήμα του αιτήματος και το prompt ζουν εδώ ώστε να δοκιμάζονται χωρίς
// βάση/πάροχο. Το AI ΔΕΝ προσθέτει στοιχεία: διορθώνει, δομεί και προσαρμόζει το ύφος στο πεδίο.
import { z } from 'zod';

/** Μόνο διαχειριστές — ο ρόλος ελέγχεται πάντα στον server, όχι μόνο στο UI. */
export const TEXT_ASSIST_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

export function textAssistAllowed(roleKey: string | null | undefined): boolean {
  return !!roleKey && TEXT_ASSIST_ROLES.has(roleKey);
}

export const MAX_TEXT = 12_000;

const short = (n: number) => z.string().trim().max(n).optional().transform((v) => v || undefined);

export const formatRequest = z.object({
  text: z.string().max(MAX_TEXT, 'Το κείμενο είναι πολύ μεγάλο'),
  /** Μορφοποίηση μόνο τμήματος: το υπόλοιπο κείμενο του πεδίου ως πλαίσιο. */
  surrounding: short(MAX_TEXT),
  field: z.object({
    label: short(200),
    placeholder: short(300),
    name: short(120),
    section: short(200),
    page: short(200),
    path: short(300),
    hint: short(600),
    /** Τιμές γειτονικών πεδίων της ίδιας φόρμας (π.χ. «Τίτλος: Ανακαίνιση μπάνιου»). */
    siblings: z.array(z.object({ label: z.string().trim().max(120), value: z.string().trim().max(300) })).max(12).optional(),
  }).prefault({}),
});
export type FormatRequest = z.infer<typeof formatRequest>;

/** Περιγραφή του πεδίου για το prompt — μόνο ό,τι υπάρχει. */
export function describeField(f: Partial<FormatRequest['field']>): string {
  const lines: string[] = [];
  if (f.page) lines.push(`Σελίδα: ${f.page}${f.path ? ` (${f.path})` : ''}`);
  else if (f.path) lines.push(`Διαδρομή: ${f.path}`);
  if (f.section) lines.push(`Ενότητα/παράθυρο: ${f.section}`);
  if (f.label) lines.push(`Πεδίο: ${f.label}`);
  if (f.name && f.name !== f.label) lines.push(`Τεχνικό όνομα πεδίου: ${f.name}`);
  if (f.placeholder) lines.push(`Υπόδειξη πεδίου: ${f.placeholder}`);
  if (f.hint) lines.push(`Οδηγία για το πεδίο: ${f.hint}`);
  const sib = (f.siblings ?? []).filter((s) => s.label && s.value);
  if (sib.length) lines.push(`Άλλα πεδία της φόρμας (μόνο για πλαίσιο, ΜΗΝ τα αντιγράψεις):\n${sib.map((s) => `  - ${s.label}: ${s.value}`).join('\n')}`);
  return lines.join('\n') || 'Δεν υπάρχουν πληροφορίες για το πεδίο.';
}

export function buildFormatPrompt(req: FormatRequest): { system: string; user: string } {
  const system = [
    'Είσαι επιμελητής κειμένου σε εφαρμογή διαχείρισης ελληνικής εταιρείας (έργα, προσφορές/συμβάσεις, πελάτες, προμηθευτές, υλικά, εργασίες).',
    'Ο χρήστης γράφει ή υπαγορεύει (φωνή → κείμενο) σε ένα πεδίο φόρμας. Ξαναγράψε το κείμενο ώστε να αποτυπώνεται σωστά και επαγγελματικά ΓΙΑ ΑΥΤΟ ΤΟ ΠΕΔΙΟ.',
    '',
    'Κανόνες:',
    '1. Κράτα ΟΛΟ το νόημα και ΟΛΑ τα στοιχεία: αριθμούς, ποσά, ποσότητες, μονάδες, ημερομηνίες, ονόματα, κωδικούς, τηλέφωνα, email, διευθύνσεις. ΠΟΤΕ μην προσθέτεις στοιχεία, υποσχέσεις ή όρους που δεν υπάρχουν.',
    '2. Διόρθωσε ορθογραφία, τόνους, στίξη, κεφαλαία και σύνταξη. Η υπαγόρευση συχνά δεν έχει στίξη, έχει επαναλήψεις και λέξεις όπως «εεε», «τελεία», «κόμμα», «νέα γραμμή» — μετέτρεψέ τες στα αντίστοιχα σημεία και αφαίρεσε τα παράσιτα.',
    '3. Προσάρμοσε ύφος και δομή στο πεδίο: σημειώσεις/παρατηρήσεις → σύντομες, σαφείς προτάσεις· περιγραφή είδους/εργασίας → τεχνική, περιεκτική περιγραφή· όροι/προϋποθέσεις → αριθμημένη λίστα· μήνυμα/email προς πελάτη → ευγενικό, επαγγελματικό κείμενο· βήματα/οδηγίες → λίστα με παύλες. Αν το πεδίο είναι μικρό (π.χ. τίτλος), μία γραμμή.',
    '4. Γλώσσα: ίδια με του κειμένου (συνήθως Ελληνικά). Αγγλικοί τεχνικοί όροι, μάρκες και κωδικοί μένουν με λατινικούς χαρακτήρες. Μονάδες όπως m², τ.μ., τεμ. γράφονται σωστά.',
    '5. Μην εξηγείς, μην βάζεις εισαγωγικά, επικεφαλίδες ή Markdown (όχι **, όχι #). Επιτρέπονται μόνο αλλαγές γραμμής, λίστες με «- » ή «1. ».',
    '6. Αν το κείμενο είναι ήδη σωστό, επέστρεψέ το σχεδόν αυτούσιο.',
    '',
    'Απάντησε ΜΟΝΟ με το τελικό κείμενο του πεδίου.',
  ].join('\n');
  const user = [
    describeField(req.field),
    ...(req.surrounding ? ['', 'Το υπόλοιπο περιεχόμενο του πεδίου (ΔΕΝ το επιστρέφεις — μόνο για συνέπεια ύφους):', req.surrounding] : []),
    '',
    req.surrounding ? 'Τμήμα προς μορφοποίηση:' : 'Κείμενο προς μορφοποίηση:',
    '<<<',
    req.text,
    '>>>',
  ].join('\n');
  return { system, user };
}

/** Καθαρίζει ό,τι «ξεφεύγει» από το μοντέλο: code fences, οριοθέτες, εισαγωγικά, Markdown έντονα. */
export function cleanFormatted(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^```[a-z]*\s*\n?|\n?\s*```$/gi, '').trim();
  t = t.replace(/^<<<\s*\n?|\n?\s*>>>$/g, '').trim();
  if (/^(["«“])[\s\S]*(["»”])$/.test(t) && !/["«“»”]/.test(t.slice(1, -1))) t = t.slice(1, -1).trim();
  t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '');
  return t.replace(/\n{3,}/g, '\n\n');
}
