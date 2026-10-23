// lib/contracts/customer-text-core.ts — ΚΑΘΑΡΟ. «Κείμενο για τον πελάτη»: μια απλή, ζεστή περιγραφή του
// έργου (τι θα γίνει, σε ποιους χώρους, με ποια υλικά, πώς προχωράμε) για ανθρώπους χωρίς τεχνικές
// γνώσεις. Βασίζεται στην περίληψη του χρήστη, στους χώρους της κάτοψης και στις γραμμές της προσφοράς.
// Χωρίς βάση/δίκτυο — δοκιμάζεται με vitest.

export type CustomerTextInput = {
  title: string;
  kindLabel: string;
  customerName: string | null;
  site: string | null;
  startDate: string | null;
  endDate: string | null;
  summary: string;
  rooms: { name: string; floorM2: number; wallsM2: number; material: string | null }[];
  lines: { kind: 'MATERIAL' | 'SERVICE'; name: string; qty: number; unit: string | null; room: string | null }[];
  milestones: string[];
};

const n2 = (x: number) => x.toLocaleString('el-GR', { maximumFractionDigits: 2 });

export function buildCustomerTextPrompt(p: CustomerTextInput): { system: string; user: string } {
  const system = [
    'Είσαι υπεύθυνος έργων σε εταιρία ανακαινίσεων/επενδύσεων (πέτρα, πλακάκια, μάρμαρα) στην Ελλάδα.',
    'Γράφεις στα Ελληνικά ένα σύντομο, φιλικό και καθαρό κείμενο προς τον ΠΕΛΑΤΗ, που εξηγεί το έργο σε κάποιον χωρίς τεχνικές γνώσεις.',
    'ΚΑΝΟΝΕΣ:',
    '- Απλές λέξεις, μικρές προτάσεις. Χωρίς νομικό ύφος, χωρίς τεχνική ορολογία (αν χρειαστεί κάποιος όρος, εξήγησέ τον σε 3–4 λέξεις).',
    '- ΜΗΝ γράφεις τιμές, ποσά ή ΦΠΑ — τα ποσά φαίνονται στον πίνακα της προσφοράς. Τετραγωνικά μέτρα επιτρέπονται, στρογγυλεμένα (π.χ. «περίπου 12 m²»).',
    '- ΜΗΝ επινοείς στοιχεία που δεν δόθηκαν (εγγυήσεις, προθεσμίες, ονόματα). Αν λείπει κάτι, μην το αναφέρεις.',
    '- Δομή: 1 εισαγωγική παράγραφος (τι θα γίνει και πού) · «Τι περιλαμβάνει» με κουκκίδες ανά χώρο (χώρος → τι θα γίνει, με ποιο υλικό) · «Πώς θα προχωρήσουμε» σε 3–5 απλά βήματα · μία κλείσιμο-πρόταση για απορίες.',
    '- Κουκκίδες με «• » στην αρχή της γραμμής. Επικεφαλίδες ενοτήτων σε δική τους γραμμή, χωρίς σύμβολα markdown (#, **).',
    '- 120–260 λέξεις συνολικά.',
    'Απάντησε ΜΟΝΟ με JSON: {"text": string}',
  ].join('\n');

  const rooms = p.rooms.map((r) => `• ${r.name}: δάπεδο ${n2(r.floorM2)} m²${r.wallsM2 > 0 ? ` · τοίχοι ${n2(r.wallsM2)} m²` : ''}${r.material ? ` · υλικό: ${r.material}` : ' · χωρίς υλικό ακόμη'}`).join('\n');
  const lines = p.lines.map((l) => `• [${l.kind === 'SERVICE' ? 'Εργασία' : 'Υλικό'}] ${l.name} — ${n2(l.qty)} ${l.unit ?? ''}${l.room ? ` (${l.room})` : ''}`).join('\n');
  const user = [
    `Έργο: ${p.title || '—'} · Τύπος: ${p.kindLabel}`,
    p.customerName ? `Πελάτης: ${p.customerName}` : '',
    p.site ? `Τοποθεσία: ${p.site}` : '',
    p.startDate || p.endDate ? `Διάρκεια (μόνο για κατανόηση — όχι ημερομηνίες στο κείμενο): ${p.startDate ?? '—'} έως ${p.endDate ?? '—'}` : '',
    '',
    'Περίληψη από τον υπεύθυνο (ίσως υπαγόρευση — διόρθωσε ορθογραφία, κράτα το νόημα):',
    p.summary.trim() || '—',
    '',
    `Χώροι από την κάτοψη (${p.rooms.length}):`,
    rooms || '—',
    '',
    'Υλικά & εργασίες της προσφοράς:',
    lines || '—',
    p.milestones.length ? `\nΣτάδια πληρωμής/παράδοσης: ${p.milestones.join(' → ')}` : '',
  ].filter((x) => x !== '').join('\n');
  return { system, user };
}

/** `{"text": "..."}` (ή σκέτο κείμενο) → καθαρό κείμενο χωρίς markdown. */
export function parseCustomerText(raw: string): string {
  let text = raw.trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { text?: unknown };
      if (typeof j.text === 'string') text = j.text;
    } catch { /* σκέτο κείμενο */ }
  }
  text = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length < 40) throw new Error('Το κείμενο βγήκε πολύ σύντομο');
  return text.slice(0, 20_000);
}
