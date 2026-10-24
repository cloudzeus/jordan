// lib/contracts/core.ts — ΚΑΘΑΡΟ. Συμβάσεις & Προσφορές έργων: ετικέτες, σύνολα, validation, το prompt
// προς το AI και η ανάγνωση της απάντησής του. Χωρίς βάση/δίκτυο — δοκιμάζεται με vitest.
import { z } from 'zod';
import { roomMaterial } from '@/lib/floorplan/saved';

export const CONTRACT_KINDS = ['PRODUCT', 'PRODUCT_INSTALL', 'SUBCONTRACT'] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];
export const KIND_LABEL: Record<ContractKind, string> = {
  PRODUCT: 'Μόνο προϊόν',
  PRODUCT_INSTALL: 'Προϊόν + τοποθέτηση',
  SUBCONTRACT: 'Τοποθέτηση από συνεργεία',
};
export const KIND_HINT: Record<ContractKind, string> = {
  PRODUCT: 'Πώληση υλικών (πέτρα, πλακάκια κ.λπ.) χωρίς εργασίες',
  PRODUCT_INSTALL: 'Υλικά και τοποθέτηση από εμάς ή από συνεργείο μας',
  SUBCONTRACT: 'Τεχνικές εταιρίες / συνεργεία / μάστοροι τοποθετούν για λογαριασμό μας',
};
/** Ο τύπος επιτρέπει ανάθεση εργασιών σε συνεργεία; */
export const allowsCrews = (k: string) => k === 'PRODUCT_INSTALL' || k === 'SUBCONTRACT';

export const STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type ContractStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<ContractStatus, string> = {
  DRAFT: 'Πρόχειρο', SENT: 'Στάλθηκε', ACCEPTED: 'Αποδεκτή', ACTIVE: 'Σε εξέλιξη', COMPLETED: 'Ολοκληρώθηκε', CANCELLED: 'Ακυρώθηκε',
};
export const STAGE_LABEL: Record<string, string> = { OFFER: 'Προσφορά', CONTRACT: 'Σύμβαση' };
export const MILESTONE_STATUS_LABEL: Record<string, string> = { PENDING: 'Εκκρεμεί', DONE: 'Παραδόθηκε', PAID: 'Εξοφλήθηκε' };

export const contractRef = (n: number) => `ΣΥΜ-${String(n).padStart(6, '0')}`;
export const docTitle = (stage: string, audience: string) =>
  audience === 'PARTY' ? 'Σύμβαση ανάθεσης εργασιών' : stage === 'CONTRACT' ? 'Σύμβαση πώλησης & εκτέλεσης' : 'Προσφορά';

// ── Επιτρεπτές μεταβάσεις ───────────────────────────────────────────────────────────────────────
export type ContractAction = 'send' | 'accept' | 'activate' | 'complete' | 'cancel' | 'reopen';
const NEXT: Record<ContractAction, { from: ContractStatus[]; to: ContractStatus }> = {
  send: { from: ['DRAFT'], to: 'SENT' },
  accept: { from: ['DRAFT', 'SENT'], to: 'ACCEPTED' },
  activate: { from: ['ACCEPTED'], to: 'ACTIVE' },
  complete: { from: ['ACTIVE'], to: 'COMPLETED' },
  cancel: { from: ['DRAFT', 'SENT', 'ACCEPTED', 'ACTIVE'], to: 'CANCELLED' },
  reopen: { from: ['CANCELLED', 'COMPLETED'], to: 'DRAFT' },
};
export function canTransition(status: string, action: ContractAction): boolean {
  return NEXT[action].from.includes(status as ContractStatus);
}
export const transitionTo = (action: ContractAction): ContractStatus => NEXT[action].to;
/** Η αποδοχή κάνει την προσφορά σύμβαση· το άνοιγμα ξανά τη γυρίζει σε προσφορά μόνο αν δεν ενεργοποιήθηκε ποτέ. */
export function stageAfter(action: ContractAction, stage: string, everActivated: boolean): string {
  if (action === 'accept') return 'CONTRACT';
  if (action === 'reopen' && !everActivated) return 'OFFER';
  return stage;
}

// ── Σύνολα ──────────────────────────────────────────────────────────────────────────────────────
export type LineLike = { qty: number; unitPrice: number; discount?: number | null; partyId?: string | null; crewFee?: number | null };
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const lineNet = (l: LineLike) => round2(l.qty * l.unitPrice * (1 - Math.min(100, Math.max(0, l.discount ?? 0)) / 100));

export function totals(lines: LineLike[], vatRate: number) {
  const net = round2(lines.reduce((t, l) => t + lineNet(l), 0));
  const vat = round2(net * vatRate / 100);
  return { net, vat, gross: round2(net + vat) };
}
/** Αμοιβή συνεργείου = άθροισμα `crewFee` των γραμμών που του ανατέθηκαν. */
export const crewTotal = (lines: LineLike[], partyId: string) => round2(lines.filter((l) => l.partyId === partyId).reduce((t, l) => t + (l.crewFee ?? 0), 0));

/** Milestones του πελάτη (ή ενός συνεργείου) σε σχέση με το σύνολο που πρέπει να καλύψουν. */
export function milestoneCoverage(amounts: number[], total: number) {
  const sum = round2(amounts.reduce((t, a) => t + a, 0));
  return { sum, diff: round2(total - sum), ok: Math.abs(total - sum) < 0.01 };
}

const EUR = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
export const eur = (n: number) => EUR.format(n);
export const qtyEl = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 3 });
export function dayEl(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const s = typeof d === 'string' ? d : d.toISOString();
  const [y, m, day] = s.slice(0, 10).split('-');
  return y && m && day ? `${day}/${m}/${y}` : '—';
}

// ── Validation εισόδου (ολόκληρη η σύμβαση σε ένα PUT) ────────────────────────────────────────
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Μη έγκυρη ημερομηνία').nullish().transform((v) => v || null);
const optStr = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const num = (min = 0, max = 1e9) => z.coerce.number().min(min).max(max);

export const lineInput = z.object({
  kind: z.enum(['MATERIAL', 'SERVICE']),
  mtrl: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  code: optStr(64),
  name: z.string().trim().min(1, 'Κάθε γραμμή χρειάζεται περιγραφή').max(300),
  unit: optStr(32),
  qty: num(0, 1e7).default(1),
  unitPrice: num(0).default(0),
  discount: num(0, 100).default(0),
  notes: optStr(2000),
  /** Τοπικό κλειδί συνεργείου (`ContractPartyInput.key`). */
  partyKey: optStr(64),
  crewFee: num(0).nullish().transform((v) => v ?? null),
  /** Χώρος της κάτοψης που παρήγαγε τη γραμμή (ξαναϋπολογίζεται όταν αλλάξει το υλικό του χώρου). */
  roomId: optStr(64),
});
export const partyInput = z.object({
  key: z.string().min(1).max(64), // σταθερό στον client: id της εγγραφής ή προσωρινό
  kind: z.enum(['SUPPLIER', 'PARTNER']),
  trdr: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  partnerId: optStr(64),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email('Μη έγκυρο email συνεργείου').max(200).nullish().or(z.literal('')).transform((v) => v || null),
  phone: optStr(64),
  afm: optStr(20),
  specialty: optStr(120),
  scope: optStr(4000),
}).refine((p) => (p.kind === 'SUPPLIER' ? p.trdr != null : !!p.partnerId), { message: 'Το συνεργείο δεν έχει αναφορά σε μητρώο' });
export const milestoneInput = z.object({
  id: optStr(64),
  partyKey: optStr(64), // κενό = πληρωμή πελάτη
  title: z.string().trim().min(1, 'Κάθε milestone χρειάζεται τίτλο').max(200),
  deliverables: optStr(4000),
  dueDate: dateStr,
  amount: num(0).default(0),
  status: z.enum(['PENDING', 'DONE', 'PAID']).default('PENDING'),
});
/** Εργασία του χρονοδιαγράμματος της προσφοράς. `key` = id της εγγραφής ή προσωρινό· οι εξαρτήσεις με keys. */
export const planTaskInput = z.object({
  key: z.string().min(1).max(64),
  name: z.string().trim().min(1, 'Κάθε εργασία χρειάζεται όνομα').max(200),
  description: optStr(5000),
  durationValue: num(0.01, 10_000).default(1),
  durationUnit: z.enum(['DAYS', 'HOURS']).default('DAYS'),
  startDate: dateStr,
  dependsOn: z.array(z.string().min(1).max(64)).max(50).default([]),
  roomId: optStr(64),
  customerVisible: z.boolean().default(true),
  photoFileIds: z.array(z.string().min(1).max(64)).max(30).default([]),
});
export type PlanTaskInput = z.infer<typeof planTaskInput>;

export const siteValue = z.object({
  address: optStr(200), zip: optStr(16), district: optStr(120), city: optStr(120), formatted: optStr(300),
  lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
  source: z.enum(['geocode', 'marker', 'manual']).default('geocode'),
  precision: z.enum(['exact', 'street', 'area']).nullish().transform((v) => v ?? null),
});

export const contractInput = z.object({
  title: z.string().trim().min(1, 'Δώστε τίτλο έργου').max(200),
  summary: z.string().trim().max(20_000).default(''),
  kind: z.enum(CONTRACT_KINDS),
  trdr: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  customerName: optStr(200),
  customerEmail: z.string().trim().email('Μη έγκυρο email πελάτη').max(200).nullish().or(z.literal('')).transform((v) => v || null),
  customerPhone: optStr(64),
  site: siteValue.nullish().transform((v) => v ?? null),
  startDate: dateStr,
  endDate: dateStr,
  validUntil: dateStr,
  vatRate: num(0, 100).default(24),
  terms: optStr(20_000),
  /** Περιγραφή του έργου για τον πελάτη (AI, διορθώσιμη) — μπαίνει στην προσφορά. */
  customerText: optStr(20_000),
  /** Χαρτογράφηση κάτοψης· `undefined` = καμία αλλαγή, `null` = αποσύνδεση. */
  floorPlanId: z.string().min(1).max(64).nullish(),
  /** Υλικό/συνταγή ανά χώρο, όπως ορίστηκε στη φόρμα — γράφεται και στη χαρτογράφηση. */
  roomMaterials: z.array(z.object({ roomId: z.string().min(1).max(64), material: roomMaterial.nullable() })).max(300).optional(),
  lines: z.array(lineInput).max(500).default([]),
  parties: z.array(partyInput).max(50).default([]),
  members: z.array(z.string().min(1).max(64)).max(50).default([]),
  milestones: z.array(milestoneInput).max(100).default([]),
  /** Χρονοδιάγραμμα (Gantt) — `undefined` = καμία αλλαγή (π.χ. παλιοί clients / δημιουργία από κάτοψη). */
  tasks: z.array(planTaskInput).max(200).optional(),
}).superRefine((c, ctx) => {
  if (!c.trdr && !c.customerName) ctx.addIssue({ code: 'custom', message: 'Επιλέξτε πελάτη', path: ['trdr'] });
  if (c.startDate && c.endDate && c.endDate < c.startDate) ctx.addIssue({ code: 'custom', message: 'Η λήξη είναι πριν από την έναρξη', path: ['endDate'] });
  const keys = new Set(c.parties.map((p) => p.key));
  if (!allowsCrews(c.kind) && c.parties.length) ctx.addIssue({ code: 'custom', message: 'Ο τύπος «Μόνο προϊόν» δεν έχει συνεργεία', path: ['parties'] });
  for (const l of c.lines) if (l.partyKey && !keys.has(l.partyKey)) ctx.addIssue({ code: 'custom', message: `Η γραμμή «${l.name}» δείχνει σε συνεργείο που αφαιρέθηκε`, path: ['lines'] });
  for (const m of c.milestones) if (m.partyKey && !keys.has(m.partyKey)) ctx.addIssue({ code: 'custom', message: `Το milestone «${m.title}» δείχνει σε συνεργείο που αφαιρέθηκε`, path: ['milestones'] });
});
export type ContractInput = z.infer<typeof contractInput>;

// ── Έγγραφο AI ─────────────────────────────────────────────────────────────────────────────────
const str = (max: number) => z.preprocess((v) => (v == null ? '' : String(v)), z.string()).transform((s) => s.trim().slice(0, max));
const list = (max: number, len = 1200) => z.preprocess(
  (v) => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : []),
  z.array(z.unknown()),
).transform((a) => a.map((x) => String(x ?? '').trim().slice(0, len)).filter(Boolean).slice(0, max));
const arr = <T extends z.ZodTypeAny>(item: T, max: number) => z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown()))
  .transform((a) => a.map((x) => item.safeParse(x)).filter((r) => r.success).map((r) => r.data as z.infer<T>).slice(0, max));

const Article = z.object({ heading: str(160), paragraphs: list(12, 2000), bullets: list(20, 600) });
const InstallSection = z.object({ heading: str(160), steps: list(30, 900), warnings: list(10, 600), checks: list(10, 600) });

export const ContractDocSchema = z.object({
  title: str(200),
  preamble: str(2500),
  scopeSummary: str(2500),
  articles: arr(Article, 30),
  installation: arr(InstallSection, 20),
  closing: str(1500),
});
export type ContractDoc = z.infer<typeof ContractDocSchema>;

export class DocParseError extends Error {}

export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* συνέχεια */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch { /* συνέχεια */ }
  }
  throw new DocParseError('Το AI δεν επέστρεψε έγκυρο JSON σύμβασης');
}

export function parseContractDoc(text: string, opts: { needsInstallation: boolean }): ContractDoc {
  const parsed = ContractDocSchema.safeParse(extractJson(text));
  if (!parsed.success) throw new DocParseError('Η σύμβαση που επέστρεψε το AI δεν έχει τη σωστή μορφή');
  const d = parsed.data;
  d.articles = d.articles.filter((a) => a.heading && (a.paragraphs.length || a.bullets.length));
  d.installation = d.installation.filter((s) => s.heading && s.steps.length);
  if (d.articles.length < 3) throw new DocParseError('Η σύμβαση βγήκε πολύ σύντομη — δοκιμάστε ξανά');
  if (opts.needsInstallation && !d.installation.length) throw new DocParseError('Λείπουν οι οδηγίες εγκατάστασης — δοκιμάστε ξανά');
  return d;
}

// ── Prompt ─────────────────────────────────────────────────────────────────────────────────────
export type PromptCompany = { name: string; legalName?: string | null; vat?: string | null; address?: string | null };
export type PromptParty = { name: string; afm?: string | null; specialty?: string | null; scope?: string | null };
export type PromptLine = { kind: string; name: string; code?: string | null; qty: number; unit?: string | null; notes?: string | null };
export type PromptMilestone = { title: string; deliverables?: string | null; dueDate?: string | null; amount: number };
/** Οδηγός εγκατάστασης είδους (από τον οδηγό που έχει ήδη φτιαχτεί στο μητρώο), σε σύντομη μορφή. */
export type PromptGuide = { item: string; summary: string; steps: string[]; safety: string[]; checks: string[] };

export type PromptInput = {
  audience: 'CUSTOMER' | 'PARTY';
  stage: string;
  kind: ContractKind;
  company: PromptCompany;
  customer: { name: string; afm?: string | null; address?: string | null };
  party?: PromptParty | null;
  title: string;
  summary: string;
  site?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  validUntil?: string | null;
  lines: PromptLine[];
  milestones: PromptMilestone[];
  total: number;
  terms?: string | null;
  /** Εγκεκριμένο «κείμενο για τον πελάτη» — μόνο στα έγγραφα του πελάτη. */
  customerText?: string | null;
  /** Ειδικές οδηγίες από τις σημειώσεις (όσες βλέπει ο παραλήπτης του εγγράφου). */
  instructions?: string[];
  guides: PromptGuide[];
};

export const needsInstallation = (p: Pick<PromptInput, 'audience' | 'kind'>) => p.audience === 'PARTY' || p.kind === 'PRODUCT_INSTALL' || p.kind === 'SUBCONTRACT';

export function buildPrompt(p: PromptInput): { system: string; user: string } {
  const party = p.audience === 'PARTY';
  const doc = docTitle(p.stage, p.audience);
  const install = needsInstallation(p);
  const system = [
    'Είσαι έμπειρος νομικός σύμβουλος κατασκευαστικών/εμπορικών συμβάσεων στην Ελλάδα και συντάκτης τεχνικών προδιαγραφών.',
    `Συντάσσεις «${doc}» στα Ελληνικά, με επαγγελματικό, σαφή και ευγενικό ύφος, κατάλληλο για υπογραφή.`,
    'ΚΑΝΟΝΕΣ:',
    '- ΜΗΝ γράφεις ποσά, τιμές, ποσότητες, ημερομηνίες ή ΑΦΜ μέσα στο κείμενο: οι πίνακες με γραμμές, ποσά και milestones τυπώνονται αυτόματα από το σύστημα. Αναφέρσου σε αυτούς («όπως αναλύεται στον Πίνακα Εργασιών», «σύμφωνα με το Πρόγραμμα Πληρωμών»).',
    '- ΜΗΝ επινοείς στοιχεία που δεν δόθηκαν (ονόματα, διευθύνσεις, εγγυήσεις συγκεκριμένης διάρκειας). Όπου χρειάζεται κάτι που λείπει, γράψε γενική διατύπωση.',
    '- Άρθρα αριθμημένα μόνο με τίτλο (χωρίς «Άρθρο 1» στον τίτλο — μπαίνει αυτόματα).',
    party
      ? '- Αφορά ανάθεση εργασιών σε συνεργείο/τεχνική εταιρία που εκτελεί για λογαριασμό της εταιρίας μας. Πρόβλεψε: αντικείμενο, υποχρεώσεις αναδόχου, χρονοδιάγραμμα, ποιότητα & έλεγχο, παραλαβή παραδοτέων, αμοιβή & πληρωμές ανά milestone, ασφάλεια εργασίας (ΚΥΑ/ΕΣΥΜ όπου αρμόζει) και ασφάλιση προσωπικού, εμπιστευτικότητα και μη απευθείας προσέγγιση του πελάτη, καθαριότητα εργοταξίου, ευθύνη για ζημιές, καθυστερήσεις, καταγγελία, επίλυση διαφορών.'
      : p.stage === 'CONTRACT'
        ? '- Σύμβαση με τον πελάτη. Πρόβλεψε: αντικείμενο, παράδοση υλικών, (αν υπάρχει) εκτέλεση εργασιών, χρονοδιάγραμμα, τίμημα & πρόγραμμα πληρωμών, παραλαβή, εγγύηση κατά τον νόμο, ανωτέρα βία, υποχρεώσεις πελάτη (πρόσβαση, προετοιμασία χώρου), επίλυση διαφορών.'
        : '- Προσφορά προς τον πελάτη: ευχάριστη εισαγωγή, περιγραφή λύσης, τι περιλαμβάνεται/δεν περιλαμβάνεται, χρόνος παράδοσης/εκτέλεσης, όροι πληρωμής (με αναφορά στο πρόγραμμα), ισχύς προσφοράς, επόμενα βήματα. Λιγότερο νομικό ύφος, περισσότερο επαγγελματικό-εμπορικό.',
    install
      ? party
        ? '- Στο "installation" γράψε ΑΝΑΛΥΤΙΚΕΣ οδηγίες εγκατάστασης για τον τεχνίτη ανά εργασία/υλικό: προετοιμασία υποστρώματος, εργαλεία, βήματα, χρόνοι, προειδοποιήσεις, έλεγχοι ποιότητας. Χρησιμοποίησε τους οδηγούς εγκατάστασης που δίνονται (είναι πρωτογενής πηγή) και συμπλήρωσε με καλές πρακτικές.'
        : '- Στο "installation" γράψε σύντομα τι θα γίνει στην τοποθέτηση και τι χρειάζεται να προετοιμάσει ο πελάτης (όχι τεχνικές λεπτομέρειες).'
      : '- Το "installation" μένει κενός πίνακας [].',
    'Απάντησε ΜΟΝΟ με JSON της μορφής:',
    '{"title": string, "preamble": string, "scopeSummary": string, "articles": [{"heading": string, "paragraphs": string[], "bullets": string[]}], "installation": [{"heading": string, "steps": string[], "warnings": string[], "checks": string[]}], "closing": string}',
    `Γράψε ${party ? '9–14' : p.stage === 'CONTRACT' ? '9–13' : '5–8'} άρθρα.`,
  ].join('\n');

  const lines = p.lines.map((l, i) => `${i + 1}. [${l.kind === 'SERVICE' ? 'Εργασία' : 'Υλικό'}] ${l.name}${l.code ? ` (${l.code})` : ''} — ${qtyEl(l.qty)} ${l.unit ?? ''}${l.notes ? ` · ${l.notes}` : ''}`).join('\n');
  const ms = p.milestones.map((m, i) => `${i + 1}. ${m.title}${m.deliverables ? ` — παραδοτέα: ${m.deliverables}` : ''}`).join('\n');
  const guides = p.guides.map((g) => [
    `### ${g.item}`, g.summary, ...g.steps.map((s, i) => `${i + 1}. ${s}`),
    g.safety.length ? `Ασφάλεια: ${g.safety.join(' · ')}` : '', g.checks.length ? `Έλεγχοι: ${g.checks.join(' · ')}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
  const user = [
    `Έγγραφο: ${doc} · Τύπος έργου: ${KIND_LABEL[p.kind]}`,
    `Εταιρία μας: ${p.company.legalName || p.company.name}${p.company.address ? `, ${p.company.address}` : ''}`,
    party && p.party
      ? `Ανάδοχος (συνεργείο): ${p.party.name}${p.party.specialty ? ` — ${p.party.specialty}` : ''}${p.party.scope ? `\nΑντικείμενο αναδόχου: ${p.party.scope}` : ''}\nΤελικός πελάτης (μόνο για πληροφόρηση): ${p.customer.name}`
      : `Πελάτης: ${p.customer.name}`,
    `Έργο: ${p.title}`,
    p.site ? `Τοποθεσία: ${p.site}` : '',
    p.startDate || p.endDate ? `Διάρκεια: ${p.startDate ? dayEl(p.startDate) : '—'} έως ${p.endDate ? dayEl(p.endDate) : '—'} (για δική σου κατανόηση· μην τις γράψεις)` : '',
    '',
    'Περίληψη έργου (από τον χρήστη, ίσως από υπαγόρευση — διόρθωσε ορθογραφία στη διατύπωσή σου):',
    p.summary || '—',
    !party && p.customerText ? `\nΚείμενο για τον πελάτη (εγκεκριμένο από τον υπεύθυνο — βάση για το "preamble" και το "scopeSummary"· κράτα το νόημα και τις λέξεις του όσο γίνεται):\n${p.customerText}` : '',
    '',
    `${party ? 'Εργασίες/υλικά του αναδόχου' : 'Υλικά & υπηρεσίες'}:`,
    lines || '—',
    '',
    'Milestones (παραδοτέα με πληρωμή):',
    ms || '—',
    p.terms ? `\nΕιδικοί όροι που ΠΡΕΠΕΙ να ενσωματωθούν:\n${p.terms}` : '',
    p.instructions?.length ? `\nΕιδικές οδηγίες (σημειώσεις του έργου) που ΠΡΕΠΕΙ να τηρηθούν${party ? ' — βάλ’ τες και στις οδηγίες εγκατάστασης' : ''}:\n${p.instructions.map((x) => `- ${x}`).join('\n')}` : '',
    install && guides ? `\nΟδηγοί εγκατάστασης ειδών (πρωτογενής πηγή):\n${guides}` : '',
  ].filter((x) => x !== '').join('\n');
  return { system, user };
}

/** Περιγραφή τοποθεσίας σε μία γραμμή. */
/** Η θέση ορίζει μεταφορικά, επίβλεψη, έξοδα και συνεργείο: η προσφορά δεν στέλνεται στον πελάτη χωρίς αυτήν. */
export const OFFER_SITE_REQUIRED = 'Ορίστε πρώτα την τοποθεσία του έργου (τουλάχιστον πόλη ή περιοχή) — χωρίς αυτήν η προσφορά δεν στέλνεται στον πελάτη. Το προσχέδιο αποθηκεύεται κανονικά.';

export function siteText(c: { siteFormatted?: string | null; siteAddress?: string | null; siteZip?: string | null; siteCity?: string | null }): string | null {
  return c.siteFormatted || [c.siteAddress, [c.siteZip, c.siteCity].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;
}

/** Όνομα PDF: «SYM-000123-prosfora-v2.pdf» — ASCII για συμβατότητα με email/CDN. */
export function pdfFileName(number: number, stage: string, audience: string, version: number, partyName?: string | null): string {
  const kind = audience === 'PARTY' ? 'symvasi-synergeiou' : stage === 'CONTRACT' ? 'symvasi' : 'prosfora';
  const party = partyName ? `-${greeklish(partyName).slice(0, 30)}` : '';
  return `SYM-${String(number).padStart(6, '0')}-${kind}${party}-v${version}.pdf`;
}

const GL: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};
export function greeklish(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split('').map((ch) => GL[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── SoftOne PRJC (δημιουργία ΜΟΝΟ με ρητή επιβεβαίωση — εδώ μόνο το payload) ───────────────────
/** Επόμενος κωδικός έργου: οι κωδικοί του atelier είναι 7ψήφιοι αύξοντες («0000063»). */
export function nextProjectCode(codes: string[]): string {
  const nums = codes.filter((c) => /^\d+$/.test(c)).map(Number);
  const width = Math.max(7, ...codes.filter((c) => /^\d+$/.test(c)).map((c) => c.length));
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(width, '0');
}

/** Όνομα έργου όπως τα υπάρχοντα: «ΠΕΛΑΤΗΣ - ΤΙΤΛΟΣ» σε κεφαλαία χωρίς τόνους, έως 128 χαρακτήρες. */
export function projectName(customer: string | null, title: string): string {
  const t = upperNoAccents(title.trim());
  const c = customer ? upperNoAccents(customer.trim()) : '';
  return (c && !t.startsWith(c) ? `${c} - ${t}` : t).slice(0, 128);
}
const upperNoAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().normalize('NFC');

export function buildPrjcPayload(p: { code: string; name: string; trdr: number | null; fromDate: string | null; finalDate: string | null; remarks: string | null }) {
  const row: Record<string, unknown> = { CODE: p.code, NAME: p.name, PRJTYPE: 1 };
  if (p.trdr) row.TRDR = p.trdr;
  if (p.fromDate) row.FROMDATE = p.fromDate;
  if (p.finalDate) row.FINALDATE = p.finalDate;
  if (p.remarks) row.REMARKS = p.remarks.slice(0, 2000);
  return { OBJECT: 'PRJC', KEY: '', DATA: { PRJC: [row] } };
}
