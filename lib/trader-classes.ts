// lib/trader-classes.ts — ΚΑΘΑΡΟ. Εμπορικές κατηγορίες συναλλασσομένων (SoftOne TRDBUSINESS «Εμπορική
// κατηγορία») σε ιεραρχία με τον «Κωδικό ιεραρχίας» (SOHCODE), και αυτόματη πρόταση από τον ΚΥΡΙΟ ΚΑΔ.
//
//   10 Πελάτες      → 10.1 Επαγγελματίες → 10.1.01 Αρχιτέκτονες & μελετητές …
//   20 Προμηθευτές  → 20.1 Οικοδομικών Υλικών → 20.1.01 Πλακίδια & πέτρα …
//
// Το TRDBUSINESS είναι λίστα ανά (εταιρία, SODTYPE): το «10» ζει στη λίστα των πελατών (13), το «20»
// στη λίστα των προμηθευτών (12). Στην καρτέλα (TRDR.TRDBUSINESS) γράφεται ΕΝΑ φύλλο (κόμβος χωρίς παιδιά)·
// οι γονείς του φαίνονται από το SOHCODE. ΔΕΝ αγγίζουμε TRDCATEGORY (λογιστική κατηγορία, λογαριασμοί)
// ούτε TRDGROUP (όμιλοι)· το TRDPGROUP («Ομάδα») μένει για τα μελλοντικά groups.
//
// Ονόματα: σύντομα και κατανοητά, ΠΟΤΕ ο τίτλος του ΚΑΔ (ο ΚΑΔ είναι μόνο ο κανόνας από πίσω).
// Όρια SoftOne: CODE ≤ 10, NAME ≤ 50, SOHCODE ≤ 64.
//
// ΚΑΔ: NACE Rev. 2.1 (kad2025/2026) όπως τους δίνει η ΑΑΔΕ. ΠΡΟΣΟΧΗ: ίδιος κωδικός ≠ ίδια σημασία με
// τους παλιούς (π.χ. 46.73 ήταν δομικά υλικά, τώρα μοτοσυκλέτες) — οι κανόνες είναι μόνο σε νέους ΚΑΔ.
// Σειρά: κανόνες ΠΕΡΙΓΡΑΦΗΣ (για όσα η ΑΑΔΕ κατατάσσει αλλού) → «μακρύτερο πρόθεμα κερδίζει».

export type Side = 'customer' | 'supplier';
export const SODTYPE: Record<Side, 12 | 13> = { customer: 13, supplier: 12 };

export interface ClassNode {
  /** Σταθερό κλειδί της εφαρμογής («C_…» πελάτες, «S_…» προμηθευτές). */
  key: string;
  side: Side;
  /** Κωδικός ιεραρχίας (SOHCODE): «10», «10.1», «10.1.01». Το βάθος = πλήθος τμημάτων. */
  soh: string;
  /** Σύντμηση (CODE) — μοναδική στη λίστα της πλευράς. */
  code: string;
  /** Σύντομο, κατανοητό όνομα (NAME). */
  name: string;
  description?: string;
  /** Μόνο φύλλα: προθέματα ΚΑΔ (ψηφία) που οδηγούν εδώ. */
  kad?: string[];
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i).padStart(2, '0'));
const C = (soh: string, key: string, code: string, name: string, kad?: string[], description?: string): ClassNode =>
  ({ key, side: 'customer', soh, code, name, kad, description });
const S = (soh: string, key: string, code: string, name: string, kad?: string[], description?: string): ClassNode =>
  ({ key, side: 'supplier', soh, code, name, kad, description });

// ── Πελάτες (TRDBUSINESS, SODTYPE 13) ────────────────────────────────────────────────────────────
const CUSTOMERS: ClassNode[] = [
  C('10', 'C_ROOT', 'ΠΕΛ', 'Πελάτες'),
  C('10.1', 'C_PRO', 'ΠΕΛ-ΕΠΑΓ', 'Επαγγελματίες', undefined, 'Επιχειρήσεις και επιτηδευματίες με ΚΑΔ.'),
  C('10.1.01', 'C_DESIGN', 'ΜΕΛ', 'Αρχιτέκτονες & μελετητές', ['711', '7413', '7414'], 'Αρχιτέκτονες, μηχανικοί, interior designers, διακοσμητές.'),
  C('10.1.02', 'C_BUILD', 'ΚΑΤ', 'Κατασκευαστικές', ['41', '42', '43'], 'Κατασκευαστικές εταιρίες, εργολάβοι, τεχνικά γραφεία.'),
  C('10.1.03', 'C_HOTEL', 'ΞΕΝ', 'Ξενοδοχεία & ενοικιάσεις', ['55'], 'Ξενοδοχεία, ενοικιαζόμενα, βραχυχρόνια μίσθωση.'),
  C('10.1.04', 'C_FOOD', 'ΕΣΤ', 'Εστίαση & αναψυχή', ['56', '5914', '9031', '93'], 'Εστιατόρια, καφέ-μπαρ, κινηματογράφοι, χώροι εκδηλώσεων.'),
  C('10.1.05', 'C_ESTATE', 'ΑΚΙ', 'Ακίνητα & developers', ['68']),
  C('10.1.06', 'C_MATTRADE', 'ΥΛΙ', 'Έμποροι υλικών & επίπλων',
    ['4613', '4615', '4644', '4647', '4649', '4683', '4684', '4752', '4753', '4755'], 'Μεταπωλητές δομικών υλικών, ειδών υγιεινής, επίπλων, διακόσμησης.'),
  C('10.1.07', 'C_TRADE', 'ΕΜΠ', 'Λοιπό εμπόριο & παραγωγή', ['45', '46', '47', ...range(1, 39)]),
  C('10.1.08', 'C_SERVICES', 'ΥΠΗ', 'Γραφεία & υπηρεσίες', [], 'Λογιστές, δικηγόροι, γιατροί, διαφήμιση, ΙΤ και κάθε άλλη υπηρεσία.'),
  C('10.2', 'C_PRIVATE', 'ΙΔΙΩΤ', 'Ιδιώτες', undefined, 'Φυσικά πρόσωπα χωρίς επιχειρηματική δραστηριότητα.'),
  C('10.3', 'C_PUBLIC', 'ΔΗΜ', 'Δημόσιο', ['84'], 'Δημόσιοι φορείς, ΟΤΑ, ΝΠΔΔ.'),
  C('10.4', 'C_FOREIGN', 'ΕΞΩ', 'Πελάτες εξωτερικού', undefined, 'Χωρίς ελληνικό ΚΑΔ.'),
];

// ── Προμηθευτές (TRDBUSINESS, SODTYPE 12) ────────────────────────────────────────────────────────
const SUPPLIERS: ClassNode[] = [
  S('20', 'S_ROOT', 'ΠΡΟΜ', 'Προμηθευτές'),
  S('20.1', 'S_MAT', 'ΟΙΚ-ΥΛ', 'Οικοδομικών Υλικών'),
  S('20.1.01', 'S_TILES', 'ΠΛΑΚ', 'Πλακίδια & πέτρα', ['081', '233', '234', '237'], 'Πλακάκια, ψηφίδες, κεραμικά, μάρμαρα, φυσική πέτρα.'),
  S('20.1.02', 'S_PAINT', 'ΧΡΩΜ', 'Χρώματα & κονιάματα', ['203', '2052', '235', '236'], 'Χρώματα, βερνίκια, κόλλες, τσιμεντοκονίες, μονωτικά.'),
  S('20.1.03', 'S_WOOD', 'ΞΥΛ', 'Ξυλεία & κουφώματα', ['16', '2223', '2512'], 'Ξυλεία, πάρκετα, πόρτες, παράθυρα.'),
  S('20.1.04', 'S_BUILDMAT', 'ΔΟΜ', 'Δομικά & είδη υγιεινής', ['23', '4613', '4682', '4683', '4752'], 'Γενικά οικοδομικά υλικά, μέταλλα, είδη υγιεινής.'),
  S('20.1.05', 'S_MEPMAT', 'ΗΛ-ΥΔΡ', 'Ηλεκτρολογικά & υδραυλικά', ['27', '4643', '4684', '4754'], 'Ηλεκτρολογικό υλικό, καλώδια, φωτισμός, υδραυλικά, θέρμανση.'),
  S('20.1.06', 'S_FURN', 'ΕΠΙΠ', 'Έπιπλα & διακόσμηση', ['13', '31', '4615', '4641', '4647', '4649', '4753', '4755'], 'Έπιπλα, υφάσματα, χαλιά, διακοσμητικά.'),
  S('20.1.07', 'S_TOOLS', 'ΕΡΓΑΛ', 'Εργαλεία & εξοπλισμός', ['4614', '4662', '4663', '4664', '4774']),
  S('20.1.08', 'S_GOODS', 'ΕΜΠ-Λ', 'Λοιπά εμπορεύματα', ['45', '46', '47', ...range(1, 34), '39']),
  S('20.2', 'S_SERV', 'ΥΠΗΡ', 'Παροχή Υπηρεσιών'),
  S('20.2.01', 'S_TRANSPORT', 'ΜΕΤΦ', 'Μεταφορές', range(49, 53), 'Μεταφορικές, ταχυμεταφορές, εκτελωνισμοί.'),
  S('20.2.02', 'S_DESIGN', 'ΜΕΛ-Π', 'Μελετητές', ['711', '712', '7413', '7414'], 'Αρχιτέκτονες, μηχανικοί, interior designers.'),
  S('20.2.03', 'S_PROF', 'ΛΟΓ', 'Λογιστικά & νομικά', ['69', '70']),
  S('20.2.04', 'S_UTIL', 'ΕΝΕΡ', 'Ενέργεια & τηλεπικοινωνίες', ['35', '36', '37', '38', '61']),
  S('20.2.05', 'S_RENT', 'ΕΝΟΙΚ', 'Ενοίκια & μισθώσεις', ['68', '77']),
  S('20.2.06', 'S_FIN', 'ΤΡΑΠ', 'Τράπεζες & ασφάλειες', ['64', '65', '66']),
  S('20.2.07', 'S_MEDIA', 'ΔΙΑΦ', 'Διαφήμιση & πληροφορική', ['58', '59', '60', '62', '63', '73', '74', '90']),
  S('20.2.08', 'S_PUBLIC', 'ΔΗΜ-Π', 'Δημόσιοι φορείς', ['84']),
  S('20.2.09', 'S_OTHERSERV', 'ΥΠΗ-Λ', 'Λοιπές υπηρεσίες', []),
  S('20.3', 'S_WORKS', 'ΟΙΚ-ΕΡΓ', 'Οικοδομικών Εργασιών', undefined, 'Όσοι εκτελούν εργασίες στο έργο.'),
  S('20.3.01', 'S_CREW', 'ΣΥΝΕΡΓ', 'Συνεργεία & υπεργολάβοι', ['41', '42', '43', '251'], 'Εταιρίες κατασκευών, Η/Μ, τελειωμάτων, σιδηροκατασκευών.'),
  S('20.3.02', 'S_CRAFT', 'ΤΕΧΝ', 'Τεχνίτες', [], 'Μάστορες — φυσικά πρόσωπα με κατασκευαστικό ΚΑΔ.'),
];

// Τμήματα 49–99 / 35–99 χωρίς δικό τους κανόνα → «Γραφεία & υπηρεσίες» / «Λοιπές υπηρεσίες».
for (const [list, key, from] of [[CUSTOMERS, 'C_SERVICES', 49], [SUPPLIERS, 'S_OTHERSERV', 35]] as const) {
  const taken = new Set(list.flatMap((n) => n.kad ?? []).filter((p) => p.length === 2));
  const node = list.find((n) => n.key === key)!;
  for (let d = from; d <= 99; d++) if (!taken.has(String(d))) node.kad!.push(String(d));
}
// Προμηθευτές: τμήματα με δικό τους φύλλο (π.χ. 16 ξυλεία, 27 ηλεκτρολογικά) φεύγουν από τα «Λοιπά εμπορεύματα».
{
  const goods = SUPPLIERS.find((n) => n.key === 'S_GOODS')!;
  const own = new Set(SUPPLIERS.filter((n) => n !== goods).flatMap((n) => n.kad ?? []).filter((p) => p.length === 2));
  goods.kad = goods.kad!.filter((p) => !own.has(p));
}

export const CLASS_TREE: ClassNode[] = [...CUSTOMERS, ...SUPPLIERS];
export const CLASS_BY_KEY = new Map(CLASS_TREE.map((n) => [n.key, n]));

/** Ο γονέας ενός κόμβου (από το SOHCODE). */
export function parentOf(n: ClassNode): ClassNode | null {
  const i = n.soh.lastIndexOf('.');
  if (i < 0) return null;
  const soh = n.soh.slice(0, i);
  return CLASS_TREE.find((x) => x.side === n.side && x.soh === soh) ?? null;
}
export const childrenOf = (n: ClassNode) => CLASS_TREE.filter((x) => parentOf(x)?.key === n.key);
export const isLeaf = (n: ClassNode) => childrenOf(n).length === 0;
export const treeFor = (side: Side) => CLASS_TREE.filter((n) => n.side === side);

/** Η αλυσίδα από τη ρίζα μέχρι τον κόμβο (γενικό → ειδικό). */
export function classPath(key: string): ClassNode[] {
  const out: ClassNode[] = [];
  for (let n: ClassNode | null = CLASS_BY_KEY.get(key) ?? null; n; n = parentOf(n)) out.unshift(n);
  if (!out.length) throw new Error(`Άγνωστη κατηγορία: ${key}`);
  return out;
}

/** Κανόνες ΚΑΔ μιας πλευράς (πρόθεμα → φύλλο). */
export function kadRules(side: Side): Array<readonly [string, string]> {
  return treeFor(side).flatMap((n) => (n.kad ?? []).map((p) => [p, n.key] as const));
}
const RULES: Record<Side, Array<readonly [string, string]>> = { customer: kadRules('customer'), supplier: kadRules('supplier') };

/** Κανόνες ΠΕΡΙΓΡΑΦΗΣ ΚΑΔ: εφαρμόζονται πριν από τα προθέματα. */
export const DESCR_RULES: Record<Side, ReadonlyArray<readonly [RegExp, string]>> = {
  customer: [
    [/ΔΙΑΚΟΣΜΗΤ|ΔΙΑΚΟΣΜΗΣΗΣ\s+ΕΣΩΤΕΡΙΚ|ΣΧΕΔΙΑΣΜΟΥ\s+ΕΣΩΤΕΡΙΚ/, 'C_DESIGN'],
    [/ΚΤΗΜΑΤΟΣ.*ΕΚΔΗΛΩΣ|ΔΙΟΡΓΑΝΩΣΗΣ.*ΕΚΔΗΛΩΣ/, 'C_FOOD'],
  ],
  supplier: [
    [/ΔΙΑΚΟΣΜΗΤ|ΔΙΑΚΟΣΜΗΣΗΣ\s+ΕΣΩΤΕΡΙΚ|ΣΧΕΔΙΑΣΜΟΥ\s+ΕΣΩΤΕΡΙΚ/, 'S_DESIGN'],
    [/ΜΑΡΜΑΡ|ΓΡΑΝΙΤ|ΦΥΣΙΚΩΝ\s+ΛΙΘ|ΔΙΑΚΟΣΜΗΤΙΚΩΝ\s+ΛΙΘ|ΠΛΑΚΑΚ|ΠΛΑΚΙΔ|ΚΕΡΑΜΙΚ/, 'S_TILES'],
    [/ΕΠΙΠΛ/, 'S_FURN'],
    [/ΦΩΤΙΣΤ|ΚΑΛΩΔΙ|ΗΛΕΚΤΡΟΛΟΓΙΚ|ΥΔΡΑΥΛΙΚ/, 'S_MEPMAT'],
    [/ΧΡΩΜΑΤ(?!ΙΣΜ)|ΒΕΡΝΙΚ|ΚΟΝΙΑΜ/, 'S_PAINT'],
    [/ΞΥΛΕΙ|ΞΥΛΙΝ|ΠΑΡΚΕ|ΚΟΥΦΩΜ/, 'S_WOOD'],
  ],
};

/** Ψηφία ΚΑΔ, χωρίς τα μηδενικά της ουράς (π.χ. «46.83.00.00» → «4683»). */
export function kadDigits(code: unknown): string {
  return String(code ?? '').replace(/\D/g, '').replace(/0+$/, '');
}

export const plainUpper = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Φύλλο από ΚΑΔ (+ την περιγραφή του) — `null` όταν ο ΚΑΔ είναι κενός ή εκτός κανόνων. */
export function leafForKad(side: Side, code: unknown, descr?: string | null): { key: string; rule: string } | null {
  const d = String(code ?? '').replace(/\D/g, '');
  if (d.length < 2) return null;
  const text = plainUpper(descr);
  if (text) for (const [re, key] of DESCR_RULES[side]) if (re.test(text)) return { key, rule: `περιγραφή «${re.source.split('|')[0].replace(/\\s\+/g, ' ')}»` };
  let best: { key: string; rule: string } | null = null;
  for (const [prefix, key] of RULES[side]) {
    if (d.startsWith(prefix) && (!best || prefix.length > best.rule.length)) best = { key, rule: prefix };
  }
  return best;
}

// ── Ειδικότητα τεχνίτη (για πίνακα χρήστη UTBL στο TRDEXTRA — πρόταση, δεν γράφεται ακόμα) ─────────
export const CRAFT_SPECIALTIES: ReadonlyArray<readonly [string, string]> = [
  ['4321', 'Ηλεκτρολόγος'], ['4322', 'Υδραυλικός'], ['4329', 'Μονώσεις & λοιπές εγκαταστάσεις'],
  ['4331', 'Σοβατζής'], ['4332', 'Ξυλουργός'], ['4333', 'Πλακάς'], ['4334', 'Ελαιοχρωματιστής'],
  ['4339', 'Τελειώματα'], ['4341', 'Στεγάσεις'], ['4342', 'Μονώσεις'], ['4311', 'Κατεδαφίσεις'], ['4312', 'Χωματουργικά'],
  ['41', 'Οικοδόμος'], ['42', 'Τεχνικά έργα'], ['43', 'Οικοδομικές εργασίες'], ['251', 'Σιδεράς'],
];
/** Ειδικότητα από ΚΑΔ (μακρύτερο πρόθεμα). */
export function craftSpecialty(code: unknown): string | null {
  const d = String(code ?? '').replace(/\D/g, '');
  let best: readonly [string, string] | null = null;
  for (const r of CRAFT_SPECIALTIES) if (d.startsWith(r[0]) && (!best || r[0].length > best[0].length)) best = r;
  return best?.[1] ?? null;
}

// ── Συμπέρασμα από τα είδη που αγοράζουμε (προμηθευτές χωρίς ΚΑΔ ή με γενικό ΚΑΔ) ─────────────────
export const ITEM_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/ZELLIGE|ΠΛΑΚΑΚ|ΠΛΑΚΙΔ|TILE|COTTO|ΨΗΦΙΔ|MOSAIC|TERRAZZO|ΚΕΡΑΜΙΚ|GEOLITH|ΠΕΤΡ|STONE|TRAVERTIN|ΜΑΡΜΑΡ|MARBLE|OPUS|BASTIDE|LIMESTONE|ΓΡΑΝΙΤ/, 'S_TILES'],
  [/ΔΡΥΣ|\bOAK\b|PARQ|ΠΑΡΚΕ|ΞΥΛΕΙ|ΞΥΛΙΝ|WOOD|\bMDF\b|ΚΟΥΦΩΜ/, 'S_WOOD'],
  [/ΚΟΝΙ|ΤΣΙΜΕΝΤ|ISOMAT|ΚΟΛΛΑ|ΜΟΝΩΤ|ΑΣΤΑΡ|VARNISH|ΒΕΡΝΙΚ|MICROCEMENT|CALCE|ARGILLA|ΧΡΩΜΑ|PRIMER|NEOTEX|REVINEX|ΧΑΛΑΖΙ|SIKA|MAPE|ΣΙΛΙΚΟΝ/, 'S_PAINT'],
  [/SOFA|\bBEDS?\b|ΕΠΙΠΛ|CLOSET|KITCHEN|KICHEN|ΚΟΥΖΙΝ|ΝΙΠΤΗΡ|ΠΑΓΚΟΣ|ΤΡΑΠΕΖ|ΚΑΡΕΚΛ|BENCH|ΥΦΑΣΜ|ΚΟΥΡΤΙΝ|ΧΑΛΙ|FABRIC|TEXTILE/, 'S_FURN'],
  [/ΦΩΤΙΣΤ|LIGHT|LAMP|ΛΑΜΠ|ΗΛΕΚΤΡΟΛΟΓ|ΚΑΛΩΔ|ΥΔΡΑΥΛ/, 'S_MEPMAT'],
  [/ΜΕΤΑΦΟΡ|TRANSPORT|COURIER|ΑΠΟΣΤΟΛ/, 'S_TRANSPORT'],
  [/ΤΡΟΧΟΣ|ΕΡΓΑΛΕΙ|ΔΡΑΠΑΝ|ΤΟΝΕΡ|TONER/, 'S_TOOLS'],
  [/ΣΙΔΗΡΟΚΑΤ|ΣΥΔΕΡΟΚΑΤ|ΜΕΤΑΛΛΙΚ|\bWORKS?\b|ΕΡΓΑΣΙΕΣ\s+\S/, 'S_CREW'],
];

export interface PurchasedItem { name: string; value: number }

/**
 * Φύλλο προμηθευτή από τα είδη των τιμολογίων αγοράς: ψηφοφορία σταθμισμένη με την αξία. Τα γενικά
 * είδη («ΥΠΗΡΕΣΙΕΣ», «ΑΝΑΛΩΣΙΜΑ») δεν ψηφίζουν. `share` = μερίδιο της αξίας που ψήφισε το νικητή.
 */
export function leafFromPurchases(items: PurchasedItem[]): { key: string; share: number } | null {
  const votes = new Map<string, number>();
  let total = 0;
  for (const it of items) {
    const v = Math.abs(it.value) || 0;
    total += v;
    const text = plainUpper(it.name);
    const hit = ITEM_RULES.find(([re]) => re.test(text));
    if (hit) votes.set(hit[1], (votes.get(hit[1]) ?? 0) + v);
  }
  const best = [...votes].sort((a, b) => b[1] - a[1])[0];
  if (!best || total <= 0) return null;
  return { key: best[0], share: Math.round((best[1] / total) * 100) / 100 };
}

// ── Αυτόματη ανάθεση ─────────────────────────────────────────────────────────────────────────────
const PUBLIC_FORM = /Ν\.?\s*Π\.?\s*Δ\.?\s*Δ|ΝΠΔΔ|ΔΗΜΟΣΙ|Ο\.?Τ\.?Α|ΔΗΜΟΣ\b|ΠΕΡΙΦΕΡΕΙ|ΚΡΑΤ/;

/** Φύλλα που ο ΚΑΔ δίνει χωρίς να λέει ΤΙ ακριβώς πουλά ο προμηθευτής — εκεί υπερισχύουν οι αγορές. */
export const GENERIC_LEAVES = new Set(['S_BUILDMAT', 'S_GOODS']);

export interface ClassifyInput {
  side: Side;
  afmKind: 'greek' | 'foreign' | 'invalid' | 'none';
  /** Βρέθηκε στην ΑΑΔΕ; true / false (δεν υπάρχει) / undefined (δεν ρωτήθηκε ή σφάλμα). */
  aadeFound?: boolean;
  legalForm?: string | null;
  /** firm_flag_descr: «ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ» / «ΜΗ ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ» / «ΠΡΩΗΝ ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ». */
  firmFlag?: string | null;
  /** Φυσικό πρόσωπο (ΑΑΔΕ i_ni_flag_descr = «ΦΠ»). Χωρίζει τεχνίτες από συνεργεία. */
  naturalPerson?: boolean | null;
  primaryKad?: string | null;
  primaryKadDescr?: string | null;
  /** Μόνο προμηθευτές: τι αγοράζουμε από αυτόν. */
  purchases?: PurchasedItem[];
}

export type ClassifyBasis =
  | 'kad' | 'legal_form' | 'purchases' | 'foreign' | 'kad_unmatched' | 'no_activity' | 'former_business'
  | 'no_afm' | 'invalid_afm' | 'aade_not_found' | 'unverified';

export interface ClassifyResult {
  /** Το φύλλο που προτείνεται — `null` = καμία πρόταση (θέλει απόφαση από άνθρωπο). */
  leaf: string | null;
  /** Τα κλειδιά από τη ρίζα μέχρι το φύλλο. */
  path: string[];
  basis: ClassifyBasis;
  /** Ο κανόνας που ταίριαξε (πρόθεμα ΚΑΔ, περιγραφή, ή μερίδιο αγορών). */
  rule: string | null;
  /** Χρειάζεται ματιά από άνθρωπο πριν την ανάθεση. */
  review: boolean;
  /** Μόνο συνεργεία/τεχνίτες: προτεινόμενη ειδικότητα από τον ΚΑΔ. */
  specialty?: string | null;
}

function result(leaf: string | null, basis: ClassifyBasis, rule: string | null, review: boolean): ClassifyResult {
  return { leaf, path: leaf ? classPath(leaf).map((n) => n.key) : [], basis, rule, review };
}

/** Συνεργείο ή τεχνίτης: φυσικό πρόσωπο με κατασκευαστικό ΚΑΔ = τεχνίτης. */
function worksLeaf(c: ClassifyInput, r: ClassifyResult): ClassifyResult {
  if (r.leaf !== 'S_CREW') return r;
  const out = c.naturalPerson ? result('S_CRAFT', r.basis, r.rule, r.review) : r;
  return { ...out, specialty: craftSpecialty(c.primaryKad) };
}

/** Αυτόματη πρόταση για έναν συναλλασσόμενο. Η σειρά των ελέγχων είναι ο κανόνας. */
export function classifyTrader(c: ClassifyInput): ClassifyResult {
  const pub = c.side === 'customer' ? 'C_PUBLIC' : 'S_PUBLIC';
  if (c.legalForm && PUBLIC_FORM.test(plainUpper(c.legalForm))) return result(pub, 'legal_form', null, false);
  if (c.primaryKad) {
    const hit = leafForKad(c.side, c.primaryKad, c.primaryKadDescr);
    if (hit && c.side === 'supplier' && GENERIC_LEAVES.has(hit.key) && c.purchases?.length) {
      const p = leafFromPurchases(c.purchases);
      if (p && p.share >= 0.5 && p.key !== hit.key) {
        return worksLeaf(c, result(p.key, 'purchases', `ΚΑΔ ${hit.rule} (γενικός) · ${Math.round(p.share * 100)}% της αξίας αγορών`, false));
      }
    }
    if (hit) return worksLeaf(c, result(hit.key, 'kad', hit.rule, false));
  }
  if (c.side === 'supplier' && c.purchases?.length) {
    const p = leafFromPurchases(c.purchases);
    if (p) return worksLeaf(c, result(p.key, 'purchases', `${Math.round(p.share * 100)}% της αξίας αγορών`, p.share < 0.5));
  }
  if (c.primaryKad) return result(null, 'kad_unmatched', null, true);
  if (c.afmKind === 'foreign') return c.side === 'customer' ? result('C_FOREIGN', 'foreign', null, false) : result(null, 'foreign', null, true);
  if (c.side === 'supplier') {
    const basis: ClassifyBasis = c.afmKind === 'none' ? 'no_afm' : c.afmKind === 'invalid' ? 'invalid_afm'
      : c.aadeFound === false ? 'aade_not_found' : c.aadeFound ? 'no_activity' : 'unverified';
    return result(null, basis, null, true);
  }
  if (c.afmKind === 'none') return result('C_PRIVATE', 'no_afm', null, false);
  if (c.afmKind === 'invalid') return result('C_PRIVATE', 'invalid_afm', null, true);
  if (c.aadeFound === false) return result('C_PRIVATE', 'aade_not_found', null, true);
  if (c.aadeFound) {
    const flag = plainUpper(c.firmFlag);
    if (/ΠΡΩΗΝ/.test(flag)) return result('C_PRIVATE', 'former_business', null, false);
    if (/^ΕΠΙΤΗΔ/.test(flag)) return result(null, 'no_activity', null, true);
    return result('C_PRIVATE', 'no_activity', null, false);
  }
  return result(null, 'unverified', null, true);
}
