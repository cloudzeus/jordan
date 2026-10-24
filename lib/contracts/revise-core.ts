// lib/contracts/revise-core.ts — ΚΑΘΑΡΟ. Αναπροσαρμογή προσφοράς με AI από τα αιτήματα/ερωτήσεις του πελάτη:
// prompt, ανάγνωση της απάντησης (με αυστηρό έλεγχο ότι αναφέρεται μόνο σε υπαρκτές γραμμές/αιτήματα) και
// εφαρμογή των αλλαγών που επέλεξε ο χρήστης. Τίποτα δεν αποθηκεύεται χωρίς τον χρήστη.
import { z } from 'zod';
import { parseCustomerText } from './customer-text-core';

export type ReviseLine = { key: string; kind: 'MATERIAL' | 'SERVICE'; name: string; code: string | null; unit: string | null; qty: number; unitPrice: number; discount: number; room: string | null };
export type ReviseRequest = { id: string; kind: 'QUESTION' | 'CHANGE' | 'NOTE'; body: string; target: string | null; thread: string[] };
export type ReviseInput = {
  title: string; kindLabel: string; customerName: string | null; summary: string; customerText: string | null;
  rooms: { name: string; floorM2: number; wallsM2: number }[];
  lines: ReviseLine[]; milestones: string[]; requests: ReviseRequest[]; instruction?: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const n2 = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });
export const lineNet = (l: { qty: number; unitPrice: number; discount?: number | null }) => r2(l.qty * l.unitPrice * (1 - (l.discount ?? 0) / 100));

export function buildRevisePrompt(p: ReviseInput): { system: string; user: string } {
  const system = [
    'Είσαι έμπειρος τεχνικός-εμπορικός υπάλληλος εταιρίας πέτρας, πλακιδίων και τσιμεντοκονιών. Αναπροσαρμόζεις μια προσφορά',
    'σύμφωνα με τα αιτήματα και τις ερωτήσεις του πελάτη και συντάσσεις ευγενικές απαντήσεις στα Ελληνικά.',
    'ΚΑΝΟΝΕΣ:',
    '- Αλλάζεις ΜΟΝΟ ό,τι ζητά ο πελάτης. Κάθε αλλαγή αναφέρει το αίτημα (request) που την προκάλεσε.',
    '- Αναφέρεσαι σε υπάρχουσες γραμμές ΜΟΝΟ με το κλειδί τους (L1, L2…). Δεν εφευρίσκεις κωδικούς ειδών.',
    '- Δεν αλλάζεις τιμή μονάδας εκτός αν το αίτημα αφορά ρητά την τιμή· τότε προτιμάς έκπτωση (discount %) έως 15%.',
    '- ΠΟΤΕ δεν μειώνεις τιμή μονάδας για να «αντισταθμίσεις» μια αλλαγή — αλλάζεις ποσότητες ή αφαιρείς γραμμές.',
    '- Αν αυτό που ζητά ο πελάτης ήδη ισχύει στην προσφορά (π.χ. ζητά μόνο δάπεδο και δεν υπάρχουν γραμμές τοίχων στον χώρο), ΔΕΝ αλλάζεις τίποτα· το εξηγείς στην απάντηση.',
    '- Για αλλαγή εμβαδού/ποσότητας αλλάζεις και τις γραμμές που εξαρτώνται από αυτήν (κόλλα, αρμόστοκος, εργασία του ίδιου χώρου) αναλογικά.',
    '- Νέα γραμμή (op "add") μόνο αν το αίτημα ζητά κάτι που δεν υπάρχει· βάζεις λογική τιμή και το σημειώνεις στο reason ως «προς έλεγχο τιμής».',
    '- Στις ερωτήσεις που δεν απαιτούν αλλαγή, δίνεις μόνο απάντηση. Μην υπόσχεσαι κάτι που δεν φαίνεται στις αλλαγές.',
    '- Κάθε απάντηση: 1–4 προτάσεις, ευγενικό ύφος, χωρίς τεχνική ορολογία, χωρίς τιμές εκτός αν άλλαξαν. Αν αλλάζει η προσφορά, αναφέρεις ότι θα λάβει νέα έκδοση.',
    '- ΚΕΙΜΕΝΟ ΓΙΑ ΤΟΝ ΠΕΛΑΤΗ: σύγκρινέ το με τις γραμμές ΟΠΩΣ ΘΑ ΕΙΝΑΙ μετά τις αλλαγές σου (χώροι, υλικά, δάπεδο/τοίχοι, εμβαδά, εργασίες).',
    '  Αν κάτι διαφωνεί (π.χ. γράφει «δάπεδο και τοίχους» ενώ οι γραμμές είναι μόνο δαπέδου), δώσε στο "customerText" ΟΛΟΚΛΗΡΟ το διορθωμένο κείμενο:',
    '  ίδιο ύφος, ίδια δομή και επικεφαλίδες, αλλάζεις ΜΟΝΟ ό,τι διαφωνεί, χωρίς τιμές. Στο "reason" γράφεις σύντομα τι διόρθωσες.',
    '  Αν συμφωνεί, ή αν δεν υπάρχει κείμενο, βάζεις "customerText": null.',
    'Απάντησε ΜΟΝΟ με JSON:',
    '{"summary":"σύντομη περίληψη για τον χρήστη","changes":[{"op":"update","line":"L3","qty":12,"unitPrice":null,"discount":null,"name":null,"reason":"…","request":"<id>"},',
    '{"op":"remove","line":"L5","reason":"…","request":"<id>"},{"op":"add","kind":"MATERIAL","name":"…","unit":"m²","qty":3,"unitPrice":20,"room":"όνομα χώρου ή null","reason":"…","request":"<id>"}],',
    '"replies":[{"request":"<id>","text":"…"}],"customerText":{"text":"…ολόκληρο το διορθωμένο κείμενο…","reason":"…"} ή null}',
  ].join('\n');
  const lines = p.lines.map((l) => `${l.key} | ${l.kind === 'SERVICE' ? 'Εργασία' : 'Υλικό'} | ${l.name}${l.code ? ` (${l.code})` : ''} | ${n2(l.qty)} ${l.unit ?? ''} × ${n2(l.unitPrice)} €${l.discount ? ` −${n2(l.discount)}%` : ''} | ${l.room ?? 'γενικά'}`);
  const user = [
    `Προσφορά: ${p.title} (${p.kindLabel})${p.customerName ? ` · πελάτης ${p.customerName}` : ''}`,
    p.summary ? `Περίληψη: ${p.summary.slice(0, 2000)}` : '',
    p.customerText ? `Κείμενο για τον πελάτη (τρέχον):\n<<<\n${p.customerText.slice(0, 8000)}\n>>>` : 'Κείμενο για τον πελάτη: (δεν υπάρχει)',
    p.rooms.length ? `Χώροι: ${p.rooms.map((r) => `${r.name} δάπεδο ${n2(r.floorM2)} m²${r.wallsM2 ? `, τοίχοι ${n2(r.wallsM2)} m²` : ''}`).join(' · ')}` : '',
    'Γραμμές (κλειδί | τύπος | περιγραφή | ποσότητα × τιμή | χώρος):', ...lines,
    p.milestones.length ? `Πληρωμές: ${p.milestones.join(' · ')}` : '',
    'Αιτήματα / ερωτήσεις του πελάτη:',
    ...p.requests.map((r) => `- [${r.id}] ${r.kind === 'CHANGE' ? 'ΑΙΤΗΜΑ ΑΛΛΑΓΗΣ' : r.kind === 'QUESTION' ? 'ΕΡΩΤΗΣΗ' : 'ΣΗΜΕΙΩΣΗ'}${r.target ? ` (για: ${r.target})` : ''}: ${r.body}${r.thread.length ? `\n  Προηγούμενα στη συζήτηση: ${r.thread.join(' / ')}` : ''}`),
    p.instruction ? `Οδηγία του χρήστη μας: ${p.instruction}` : '',
  ].filter(Boolean).join('\n');
  return { system, user };
}

const num = z.number().finite().nullish().transform((v) => (v == null ? null : v));
const change = z.discriminatedUnion('op', [
  z.object({ op: z.literal('update'), line: z.string(), qty: num, unitPrice: num, discount: num, name: z.string().max(300).nullish(), reason: z.string().max(500).default(''), request: z.string().nullish() }),
  z.object({ op: z.literal('remove'), line: z.string(), reason: z.string().max(500).default(''), request: z.string().nullish() }),
  z.object({
    op: z.literal('add'), kind: z.enum(['MATERIAL', 'SERVICE']).default('MATERIAL'), name: z.string().min(1).max(300), unit: z.string().max(32).nullish(),
    qty: z.number().finite().positive(), unitPrice: z.number().finite().min(0), room: z.string().max(120).nullish(), reason: z.string().max(500).default(''), request: z.string().nullish(),
  }),
]);
const reviseOut = z.object({
  summary: z.string().max(2000).default(''),
  changes: z.array(z.unknown()).max(200).default([]),
  replies: z.array(z.object({ request: z.string(), text: z.string().min(1).max(3000) })).max(100).default([]),
  customerText: z.object({ text: z.string().max(20_000), reason: z.string().max(1000).default('') }).nullish(),
});
export type ReviseChange = z.infer<typeof change>;
/** `customerText`: διορθωμένο «κείμενο για τον πελάτη» όταν το τρέχον δεν συμφωνεί με τις γραμμές (αλλιώς null). */
export type Revision = { summary: string; changes: ReviseChange[]; replies: { request: string; text: string }[]; customerText: { text: string; reason: string } | null; dropped: number };

export class ReviseParseError extends Error {}

/**
 * Διαβάζει την απάντηση: κρατά μόνο αλλαγές σε υπαρκτές γραμμές και απαντήσεις σε υπαρκτά αιτήματα. Το
 * διορθωμένο κείμενο κρατιέται μόνο αν υπάρχει τρέχον κείμενο και το νέο διαφέρει ουσιαστικά.
 */
export function parseRevision(text: string, lineKeys: Set<string>, requestIds: Set<string>, currentText: string | null = null): Revision {
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { throw new ReviseParseError('Η απάντηση του AI δεν ήταν έγκυρο JSON'); }
  const out = reviseOut.safeParse(raw);
  if (!out.success) throw new ReviseParseError('Η απάντηση του AI δεν είχε τη σωστή μορφή');
  let dropped = 0;
  const changes: ReviseChange[] = [];
  const touched = new Set<string>();
  for (const c of out.data.changes) {
    const v = change.safeParse(c);
    if (!v.success) { dropped++; continue; }
    const ch = v.data;
    if (ch.request && !requestIds.has(ch.request)) ch.request = null;
    if (ch.op !== 'add') {
      if (!lineKeys.has(ch.line) || touched.has(ch.line)) { dropped++; continue; }
      touched.add(ch.line);
    }
    if (ch.op === 'update') {
      if (ch.qty != null && !(ch.qty > 0)) ch.qty = null;
      if (ch.unitPrice != null && ch.unitPrice < 0) ch.unitPrice = null;
      if (ch.discount != null) ch.discount = Math.min(100, Math.max(0, ch.discount));
      if (ch.qty == null && ch.unitPrice == null && ch.discount == null && !ch.name) { dropped++; continue; }
    }
    changes.push(ch);
  }
  const replies = out.data.replies.filter((r) => requestIds.has(r.request));
  let customerText: Revision['customerText'] = null;
  const ct = out.data.customerText;
  if (ct && currentText?.trim()) {
    try {
      const clean = parseCustomerText(JSON.stringify({ text: ct.text }));
      const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
      if (norm(clean) !== norm(currentText)) customerText = { text: clean, reason: ct.reason.trim() };
    } catch { /* πολύ σύντομο / άκυρο — αγνοείται */ }
  }
  if (!changes.length && !replies.length && !customerText) throw new ReviseParseError('Το AI δεν πρότεινε αλλαγές ούτε απαντήσεις');
  return { summary: out.data.summary, changes, replies, customerText, dropped };
}

export type ApplyLine = { kind: 'MATERIAL' | 'SERVICE'; mtrl: number | null; code: string | null; name: string; unit: string | null; qty: number; unitPrice: number; discount: number; notes: string | null; partyKey: string | null; crewFee: number | null; roomId: string | null };

/** Περιγραφή μιας αλλαγής για την προεπισκόπηση: πριν → μετά και διαφορά αξίας. */
export function describeChange(ch: ReviseChange, lines: Map<string, ApplyLine>): { title: string; before: string | null; after: string | null; delta: number } {
  const fmt = (l: { qty: number; unit: string | null; unitPrice: number; discount?: number | null }) => `${n2(l.qty)} ${l.unit ?? ''} × ${n2(l.unitPrice)} €${l.discount ? ` −${n2(l.discount)}%` : ''}`;
  if (ch.op === 'add') return { title: `Νέα γραμμή: ${ch.name}`, before: null, after: fmt({ qty: ch.qty, unit: ch.unit ?? null, unitPrice: ch.unitPrice }), delta: lineNet(ch) };
  const l = lines.get(ch.line)!;
  if (ch.op === 'remove') return { title: `Αφαίρεση: ${l.name}`, before: fmt(l), after: null, delta: -lineNet(l) };
  const next = { ...l, qty: ch.qty ?? l.qty, unitPrice: ch.unitPrice ?? l.unitPrice, discount: ch.discount ?? l.discount };
  return { title: ch.name && ch.name !== l.name ? `${l.name} → ${ch.name}` : l.name, before: fmt(l), after: fmt(next), delta: r2(lineNet(next) - lineNet(l)) };
}

/** Εφαρμόζει τις επιλεγμένες αλλαγές στις γραμμές (κλειδιά L1… = θέση στη λίστα). */
export function applyRevision<T extends ApplyLine>(lines: T[], changes: ReviseChange[], rooms: { id: string; name: string }[], make: (l: ApplyLine) => T): T[] {
  const idx = (k: string) => Number(k.slice(1)) - 1;
  const removed = new Set<number>();
  const out = lines.map((l) => ({ ...l }));
  const added: T[] = [];
  for (const ch of changes) {
    if (ch.op === 'remove') { removed.add(idx(ch.line)); continue; }
    if (ch.op === 'update') {
      const i = idx(ch.line);
      if (!out[i]) continue;
      out[i] = { ...out[i], qty: ch.qty ?? out[i].qty, unitPrice: ch.unitPrice ?? out[i].unitPrice, discount: ch.discount ?? out[i].discount, name: ch.name || out[i].name };
      continue;
    }
    const room = ch.room ? rooms.find((r) => r.name.trim().toLowerCase() === ch.room!.trim().toLowerCase()) : null;
    added.push(make({
      kind: ch.kind, mtrl: null, code: null, name: ch.name, unit: ch.unit ?? null, qty: ch.qty, unitPrice: ch.unitPrice, discount: 0,
      notes: 'Από αίτημα πελάτη — ελέγξτε είδος και τιμή', partyKey: null, crewFee: null, roomId: room?.id ?? null,
    }));
  }
  return [...out.filter((_, i) => !removed.has(i)), ...added];
}

/** Ποιες παράγραφοι του κειμένου φεύγουν και ποιες μπαίνουν (για την προεπισκόπηση της διόρθωσης). */
export function paragraphDiff(before: string, after: string): { removed: string[]; added: string[] } {
  const split = (t: string) => t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const norm = (x: string) => x.replace(/\s+/g, ' ').toLowerCase();
  const a = split(before), b = split(after);
  const inA = new Set(a.map(norm)), inB = new Set(b.map(norm));
  return { removed: a.filter((x) => !inB.has(norm(x))), added: b.filter((x) => !inA.has(norm(x))) };
}
