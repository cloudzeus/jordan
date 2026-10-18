// lib/item-groups.ts — ΚΑΘΑΡΟ. ΠΡΟΤΑΣΗ ομάδων για είδη (MTRL 51) και υπηρεσίες (MTRL 52), από το ΟΝΟΜΑ του
// είδους/υπηρεσίας (όπως στα τιμολόγια) και, ως εφεδρεία, από τον προμηθευτή που το πουλά.
//
// Πού: SoftOne «Ομάδες» (MTRGROUP), με «Κωδικό ιεραρχίας» (SOHCODE) όπως οι εμπορικές κατηγορίες
// συναλλασσομένων. ΟΧΙ η «Εμπορική κατηγορία» ειδών (MTRCATEGORY): κουβαλά λογαριασμό, λογιστική
// κατηγορία και ΦΠΑ (Εμπορεύματα / Προϊόντα / Προϊόντα τρίτων…) — λογιστική, δεν την αγγίζουμε.
// Μόνο πρόταση: τίποτα εδώ δεν γράφει στο SoftOne.

export type ItemKind = 'item' | 'service';

export interface ItemGroupNode {
  key: string;
  kind: ItemKind;
  /** Κωδικός ιεραρχίας (SOHCODE). */
  soh: string;
  /** Σύντμηση (CODE ≤ 10). */
  code: string;
  /** Σύντομο όνομα (NAME). */
  name: string;
  description?: string;
  /** Υπάρχουσα ομάδα του SoftOne που ήδη σημαίνει αυτό (κλειδί MTRGROUP) — να ξαναχρησιμοποιηθεί. */
  reuse?: number;
}

const I = (soh: string, key: string, code: string, name: string, description?: string, reuse?: number): ItemGroupNode =>
  ({ key, kind: 'item', soh, code, name, description, reuse });
const V = (soh: string, key: string, code: string, name: string, description?: string): ItemGroupNode =>
  ({ key, kind: 'service', soh, code, name, description });

export const ITEM_GROUPS: ItemGroupNode[] = [
  I('1', 'G_SURF', 'ΕΠΕΝ', 'Επενδύσεις δαπέδων & τοίχων'),
  I('1.01', 'G_TILES', 'ΠΛΑΚ', 'Πλακάκια & ψηφίδες', 'Zellige, cotto, πορσελανάτα, ψηφίδες, κλώστρα, terrazzo.', 2),
  I('1.02', 'G_STONE', 'ΠΕΤΡ', 'Φυσική πέτρα & μάρμαρα', 'Πέτρινα δάπεδα, travertino, μάρμαρα, σκαλοπάτια.', 3),
  I('1.03', 'G_WOODFLOOR', 'ΞΥΛΔ', 'Ξύλινα δάπεδα', 'Δρυς, πάρκετα.'),
  I('2', 'G_FINISH', 'ΚΟΝ', 'Χρώματα & κονιάματα'),
  I('2.01', 'G_LIME', 'ΑΣΒ', 'Ασβεστοχρώματα & επιχρίσματα', 'Ασβεστόχρωμα, ασβεστοκονία, tadelakt, άργιλος, χρωστικές.'),
  I('2.02', 'G_CEMENT', 'ΤΣΙΜ', 'Τσιμεντοκονίες & μικροτσιμέντο', 'Πατητή τσιμεντοκονία, microcement, Microdur/Microduo.'),
  I('2.03', 'G_PAINT', 'ΧΡΩΜ', 'Χρώματα, αστάρια & βερνίκια'),
  I('2.04', 'G_CHEM', 'ΚΟΛΛ', 'Κόλλες, μονωτικά & χημικά', 'Κόλλες πλακιδίων, στεγανωτικά, σιλικόνες, εποξειδικά, πλέγματα.'),
  I('2.05', 'G_AGGR', 'ΑΔΡ', 'Αδρανή & άμμοι', 'Χαλαζιακή άμμος, άμμος τριβείου.'),
  I('3', 'G_MADE', 'ΚΑΤΣΚ', 'Κατασκευές & έπιπλα'),
  I('3.01', 'G_SINKS', 'ΝΙΠ', 'Νιπτήρες & πάγκοι', 'Νιπτήρες και πάγκοι από σκυρόδεμα, GFRC, πέτρα.'),
  I('3.02', 'G_FURN', 'ΕΠΙΠ', 'Έπιπλα & σκελετοί', 'Καναπέδες, κρεβάτια, ντουλάπες, κουζίνες, πάγκοι.'),
  I('4', 'G_BUILD', 'ΔΟΜ', 'Δομικά & εγκαταστάσεις'),
  I('4.01', 'G_BUILDMAT', 'ΔΟΜΥ', 'Δομικά υλικά', 'Σίδερα, κεραμίδια, ξυλεία, MDF, γυψοσανίδες.'),
  I('4.02', 'G_PLUMB', 'ΥΓΙ', 'Είδη υγιεινής & υδραυλικά', 'Μπαταρίες, βαλβίδες, σιφώνια.'),
  I('4.03', 'G_ELEC', 'ΗΛΕ', 'Ηλεκτρολογικά & φωτισμός'),
  I('5', 'G_SUPPLY', 'ΑΝΑ', 'Εργαλεία & αναλώσιμα'),
  I('5.01', 'G_TOOLS', 'ΕΡΓ', 'Εργαλεία & πινέλα', 'Πινέλα, ρολά, δίσκοι, ψεκαστήρες, κουβάδες.'),
  I('5.02', 'G_CONSUM', 'ΑΝΑΛ', 'Αναλώσιμα εργοταξίου', 'Γάντια, μάσκες, σφουγγάρια, ταινίες, χαρτόνια.'),
  I('5.03', 'G_OFFICE', 'ΓΡΑΦ', 'Γραφική ύλη & εκτυπώσεις'),
  I('6', 'G_CHARGE', 'ΧΡΕ', 'Εργασίες & χρεώσεις', 'Μεταφορικά, συσκευασία, παλέτες και εργασίες που έχουν καταχωρηθεί ως είδος.'),
  I('9', 'G_OTHER', 'ΛΟΙ', 'Λοιπά είδη'),

  V('1', 'V_APPLY', 'ΕΦΑΡ', 'Εφαρμογή & επίβλεψη', 'Επίβλεψη εφαρμογής, τοποθέτηση, συντονισμός.'),
  V('2', 'V_TRANSPORT', 'ΜΕΤΦ', 'Μεταφορές'),
  V('3', 'V_SAMPLE', 'ΔΕΙΓ', 'Δείγματα & μελέτες'),
  V('9', 'V_OTHER', 'ΛΟΙ', 'Λοιπές υπηρεσίες'),
];
export const ITEM_GROUP_BY_KEY = new Map(ITEM_GROUPS.map((n) => [n.key, n]));

const parentSoh = (soh: string) => (soh.includes('.') ? soh.slice(0, soh.lastIndexOf('.')) : null);
export const itemGroupParent = (n: ItemGroupNode) =>
  ITEM_GROUPS.find((x) => x.kind === n.kind && x.soh === parentSoh(n.soh)) ?? null;
export const isItemGroupLeaf = (n: ItemGroupNode) => !ITEM_GROUPS.some((x) => x.kind === n.kind && parentSoh(x.soh) === n.soh);

export const plain = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/**
 * Κανόνες ονόματος — Η ΣΕΙΡΑ ΜΕΤΡΑ: το πιο ειδικό πρώτο («ΚΟΛΛΑ ΠΛΑΚΙΔΙΩΝ» είναι κόλλα, όχι πλακάκι·
 * «ΧΡΩΣΤΙΚΗ ΑΣΒΕΣΤΟΧΡΩΜΑΤΟΣ» ασβεστόχρωμα· «ΜΠΑΤΑΡΙΑ ΝΙΠΤΗΡΟΣ» υδραυλικό· «ΠΛΑΚΑΚΙ ΣΑΝ ΠΕΤΡΑ» πλακάκι).
 */
export const ITEM_NAME_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Χρεώσεις μέσα σε κωδικό είδους
  [/ΜΕΤΑΦΟΡΙΚ|ΜΕΤΑΦΟΡΑ|ΣΥΣΚΕΥΑΣΙΑ ΕΜΠΟΡ|ΚΟΣΤΟΣ ΣΥΣΚΕ|ΠΑΛ+ΕΤ|PALLET|ΚΙΒΩΤ/, 'G_CHARGE'],
  // Υδραυλικά / ηλεκτρολογικά πριν από νιπτήρες & πλακάκια
  [/ΜΠΑΤΑΡΙ|ΒΑΛΒΙΔ|ΣΙΦΩΝ|ΣΙΦΟΝ|ΥΔΡΑΥΛ|ΚΡΟΥΝΟ|ΝΤΟΥΖ|ΜΙΚΤ|ΣΠΙΡΑΛ|ΠΑΡΟΧΗ ΝΕΡΟΥ|CHROME/, 'G_PLUMB'],
  [/ΗΛΕΚΤΡΟΛΟΓ|ΚΑΛΩΔ|ΦΩΤΙΣΤ|ΛΑΜΠΤΗΡ|\bLED\b|ΠΡΙΖ|ΔΙΑΚΟΠΤ/, 'G_ELEC'],
  // Κόλλες / χημικά πριν από πλακάκια (ΚΟΛΛΑ ΠΛΑΚΙΔΙΩΝ)
  [/ΚΟΛΛΑ|GRANITIVA|ISOMAT|SIKA|MAPE|ΜΟΝΩΤ|REVINEX|ΣΙΛΙΚΟΝ|IDRO|HYDROREP|ΥΑΛΟΠΛΕΓΜ|ΠΛΕΓΜΑ|STOCO|ΣΤΟΚΟΣ|ΣΤΕΓΑΝΩΤ|ΕΠΟΞΕΙΔ|EPOX|ΕΜΠΟΤΙΣ|ΑΔΙΑΒΡΟΧ|ΥΔΡΟΦΟΒ|FILA|ΚΑΘΑΡΙΣΤ|CLEANER|ΡΗΤΙΝ|ΑΓΚΥΡΩΣ|ΚΟΡΔΟΝΙ ΑΡΜ/, 'G_CHEM'],
  // Ασβέστης / φυσικά επιχρίσματα / χρωστικές πριν από τα γενικά χρώματα
  [/ΑΣΒΕΣΤΟ|ΑΣΒΕΣΤΟΥΧ|CALCE|TADELAKT|ΧΡΩΣΤΙΚ|TONER POWDER|ΓΗ ΡΩΜΑΤΑ|ΕΠΙΧΡΙΣ|ARGILLA|ΑΡΓΙΛ|ΠΗΛΟΣ|\bCLAY\b|NOVAFINA|ΣΟΒΑΣ|SAHARA DECOR|ΣΚΟΝΗ ΑΓΙΟΓΡΑΦ|ΤΙΤΑΝΙΟΥ/, 'G_LIME'],
  [/ΤΣΙΜΕΝΤΟΚΟΝ|MICROCEMENT|MICRODU|MICROLEVEL|BETOSTUC|ΠΑΤΗΤΗ|ΚΟΝΙΑΜ/, 'G_CEMENT'],
  [/ΧΡΩΜΑ|ΑΣΤΑΡ|ASTARI|PRIMER|PRIMEX|VARNISH|ΒΕΡΝΙΚ|AQUA ?MAX|NEODUR|SILICATI|ΥΔΡΥΑΛ|ΡΕΠΟΥΛ|SATIN|COLOUR CHART|ΣΠΑΤΟΥΛΑΡΙΣΜ|ISOQUAR|ISOLANTE|LASURE|\bCOLOR\b/, 'G_PAINT'],
  [/ΑΜΜΟΣ|ΧΑΛΑΖΙ|SILGRIT|ΑΔΡΑΝ|ΓΑΡΜΠΙΛ|ΧΑΛΙΚ/, 'G_AGGR'],
  // Νιπτήρες / πάγκοι / έπιπλα πριν από πέτρα (ΝΙΠΤΗΡΑΣ TRAVERTINO)
  [/ΝΙΠΤΗΡ|\bSINK\b|ΠΑΓΚΟΣ|ΠΑΓΚΟΥ|GFRC|ΝΗΣΙΔΑ/, 'G_SINKS'],
  [/SOFA|\bBEDS?\b|CLOSET|KITCHEN|KICHEN|ΚΟΥΖΙΝ|FRAME|BENCH|\bBBQ\b|ΚΑΝΑΠΕ|ΝΤΟΥΛΑΠ|ΕΠΙΠΛ|ΤΡΑΠΕΖ|ΚΑΡΕΚΛ/, 'G_FURN'],
  // Πλακάκια πριν από πέτρα (ΠΛΑΚΑΚΙ ΣΑΝ ΠΕΤΡΑ)
  [/ΠΛΑΚΑΚ|PLAKAK|ΠΛΑΚΙΔ|ZELLIG|\bZEL\b|COTTO|ΨΗΦΙΔ|MOSAIC|ΜΩΣΑ[ΙΪ]Κ|PORCEL|GRES|TILE|\bTLE\b|TERRAZZO|ΚΛΩΣΤΡΑ|GEOLITH|ESTILKER|DECORADO|FIORANESE|BRICKLANE|FAYENZA|CIFRE|ΒΟΤΣΑΛΟ|ΖΕΟΛΙΘ/, 'G_TILES'],
  [/ΠΕΤΡ|STONE|TRAVERTIN|ΤΡΑΒΕΡΤΙΝ|ΜΑΡΜΑΡ|MARBLE|OPUS|BASTIDE|HOREB|CARDO|MONASTERO|CEPPO|ΣΚΑΛΟΠΑΤ|STAIRWAY|STRAIRWAY|VENICE|LIMESTONE|ΓΡΑΝΙΤ/, 'G_STONE'],
  [/ΔΡΥΣ|\bOAK\b|PARQ|ΠΑΡΚΕ|ΗΜΙΜΑΣΙΦ|ΜΑΣΙΦ|ΞΥΛΙΝΟ ΔΑΠΕΔ/, 'G_WOODFLOOR'],
  [/ΣΙΔΕΡΑ|ΣΙΔΗΡΟΥ|ΚΕΡΑΜΙΔ|ΚΟΡΦΙΑ|ΤΟΥΒΛ|\bMDF\b|ΚΟΝΤΡΑ ?ΠΛΑΚΕ|ΚΟΥΝΕΛΟΣΥΡΜ|ΓΥΨΟΣΑΝΙΔ|ΥΑΛΟΣΑΝΙΔ|ΚΑΜΙΝΑΔ|ΞΥΛΕΙ|ΔΟΚΑΡ|ΑΚΜΕΣ|ΣΤΡΑΝΤΖΑΡ|ΜΕΤΑΛΛΙΚΕΣ ΣΤΗΡΙΞ|ΑΛΟΥΜ|ΓΩΝΙΟΚΡΑΝ|ΝΕΡΟΧΥΤ|ΓΡΙΛΙΕΣ|ΤΣΙΜΕΝΤΟ$/, 'G_BUILDMAT'],
  [/ΠΙΝΕΛ|ΡΟΛ+Ο(?![Α-Ω])|\bROL\b|ΒΟΥΡΤΣ|ΔΙΣΚΟΣ|ΨΕΚΑΣΤ|ΣΠΑΤΟΥΛ|ΜΥΣΤΡΙ|ΤΡΟΧΟΣ|ΚΟΥΒΑΣ|ΚΟΝΤΑΡ|ΚΑΤ-|ΕΡΓΑΛΕΙ|ΔΡΑΠΑΝ|ΣΚΑΦΑΚΙ/, 'G_TOOLS'],
  [/ΓΑΝΤΙ|ΜΑΣΚΑ|ΣΦΟΥΓΓ|ΑΝΑΛΩΣΙΜ|ΧΑΡΤΟΝΙ|ΧΑΡΤΟΤΑΙΝ|ΤΑΙΝΙΑ|ΝΑΥΛΟΝ|ΣΑΚΟΥΛ|ΣΑΚΟΙ|ΠΑΝΙ|ΚΑΔΟΣ|ΥΠΟΔΗΜΑΤ|ΜΟΛΥΒΙ/, 'G_CONSUM'],
  [/ΤΟΝΕΡ|ΕΚΤΥΠΩΣ|ΧΑΡΤΙ Α4|ΜΕΛΑΝ/, 'G_OFFICE'],
  // Εργασίες καταχωρημένες ως είδος — ΜΕΤΑ από τα υλικά («Προμήθεια και εφαρμογή τσιμεντοκονίας» μένει υλικό)
  [/ΕΡΓΑΣΙΕΣ|^WORKS|ΠΡΟΕΤΟΙΜΑΣΙΑ|^ΚΑΤΑΣΚΕΥΗ$|^ΥΠΗΡΕΣΙ|ΕΠΙΒΛΕΨ|ΤΟΠΟΘΕΤΗΣ/, 'G_CHARGE'],
];

export const SERVICE_NAME_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/ΔΕΙΓΜΑ|ΜΕΛΕΤ|ΣΧΕΔΙΑΣ|ΣΥΝΘΕΣΗ/, 'V_SAMPLE'],
  [/ΕΠΙΒΛΕΨ|ΕΦΑΡΜΟΓ|ΤΟΠΟΘΕΤ|ΣΥΝΤΟΝΙΣΜ|ΕΡΓΑΣΙ/, 'V_APPLY'],
  [/ΜΕΤΑΦΟΡ|COURIER|FEDEX|DHL/, 'V_TRANSPORT'],
];

/** Είδος με όνομα υπηρεσίας (π.χ. «ΕΠΙΒΛΕΨΗ ΕΦΑΡΜΟΓΗΣ» καταχωρημένο ως είδος) — μόνο ένδειξη, δεν αλλάζει τύπο. */
const LOOKS_LIKE_SERVICE = /^ΥΠΗΡΕΣΙΑ$|ΕΠΙΒΛΕΨ|^ΤΟΠΟΘΕΤΗΣ|ΣΥΝΤΟΝΙΣΜ|ΠΡΟΜΗΘΕΙΑ ΚΑΙ ΕΦΑΡΜΟΓ|ΠΡΟΜΗΘΕΙΑ ΚΑΙ ΕΠΙΒΛΕΨ/;

/** Εφεδρεία: εμπορική κατηγορία του προμηθευτή (lib/trader-classes.ts) → ομάδα είδους. */
export const SUPPLIER_FALLBACK: Readonly<Record<string, string>> = {
  S_TILES: 'G_TILES', S_PAINT: 'G_PAINT', S_WOOD: 'G_BUILDMAT', S_BUILDMAT: 'G_BUILDMAT', S_MEPMAT: 'G_ELEC',
  S_FURN: 'G_FURN', S_TOOLS: 'G_TOOLS', S_TRANSPORT: 'G_CHARGE', S_MEDIA: 'G_OFFICE',
};

export interface ItemGroupInput {
  name: string;
  kind: ItemKind;
  /** Κλειδιά εμπορικής κατηγορίας των προμηθευτών του (S_…), με βάρος = αξία αγορών. */
  suppliers?: { leaf: string; value: number }[];
}

export type ItemGroupBasis = 'name' | 'supplier' | 'none';

export interface ItemGroupProposal {
  /** Φύλλο ομάδας (κλειδί) — πάντα υπάρχει (στο χειρότερο «Λοιπά»). */
  group: string;
  basis: ItemGroupBasis;
  /** Ο κανόνας που ταίριαξε. */
  rule: string | null;
  /** Θέλει ματιά από άνθρωπο. */
  review: boolean;
  /** Είδος με όνομα υπηρεσίας. */
  looksLikeService: boolean;
}

/** Πρόταση ομάδας για ένα είδος/υπηρεσία. */
export function proposeItemGroup(input: ItemGroupInput): ItemGroupProposal {
  const text = plain(input.name);
  const looksLikeService = input.kind === 'item' && LOOKS_LIKE_SERVICE.test(text);
  const rules = input.kind === 'service' ? SERVICE_NAME_RULES : ITEM_NAME_RULES;
  for (const [re, group] of rules) {
    if (re.test(text)) return { group, basis: 'name', rule: re.source.split('|')[0], review: false, looksLikeService };
  }
  if (input.kind === 'item' && input.suppliers?.length) {
    const votes = new Map<string, number>();
    for (const s of input.suppliers) {
      const g = SUPPLIER_FALLBACK[s.leaf];
      if (g) votes.set(g, (votes.get(g) ?? 0) + (Math.abs(s.value) || 0.01));
    }
    const best = [...votes].sort((a, b) => b[1] - a[1])[0];
    if (best) return { group: best[0], basis: 'supplier', rule: 'προμηθευτής', review: true, looksLikeService };
  }
  return { group: input.kind === 'service' ? 'V_OTHER' : 'G_OTHER', basis: 'none', rule: null, review: true, looksLikeService };
}

/** Χρώμα (hex) ανά κορυφαία ομάδα — όλες οι υπο-ομάδες ενός κλάδου παίρνουν το χρώμα του. */
export const ITEM_GROUP_COLORS: Readonly<Record<string, string>> = {
  G_SURF: '#B45309', G_FINISH: '#0E7490', G_MADE: '#7C3AED', G_BUILD: '#475569', G_SUPPLY: '#047857',
  G_CHARGE: '#BE123C', G_OTHER: '#6B7280',
  V_APPLY: '#1D4ED8', V_TRANSPORT: '#BE123C', V_SAMPLE: '#7C3AED', V_OTHER: '#6B7280',
};

/** Το χρώμα μιας ομάδας = το χρώμα της κορυφαίας της. */
export function itemGroupColor(key: string | null | undefined): string {
  let n = key ? ITEM_GROUP_BY_KEY.get(key) : undefined;
  while (n && itemGroupParent(n)) n = itemGroupParent(n)!;
  return (n && ITEM_GROUP_COLORS[n.key]) ?? '#6B7280';
}
