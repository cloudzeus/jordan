// lib/trader-classes.ts — ΚΑΘΑΡΟ. Ιεραρχία κατηγοριών συναλλασσομένων (πελάτες & προμηθευτές),
// 3 επίπεδα από το γενικό στο ειδικό, και αυτόματη ανάθεση από τον ΚΥΡΙΟ ΚΑΔ της ΑΑΔΕ.
//
//   Επίπεδο 1 → TRDCATEGORY «Λογ. κατηγορία»   ανά SODTYPE · ΥΠΑΡΧΕΙ ήδη (λογαριασμοί λογιστικής) — δεν
//                                               δημιουργείται· βγαίνει από τη ΧΩΡΑ (εσωτερικού/ΕΕ/τρίτες).
//   Επίπεδο 2 → TRDBUSINESS «Εμπορ. κατηγορία» ανά SODTYPE (ξεχωριστή λίστα πελατών / προμηθευτών).
//   Επίπεδο 3 → TRDGROUP    «Όμιλος»           ΚΟΙΝΗ λίστα για όλους τους συναλλασσόμενους (χωρίς SODTYPE).
//
// Το επίπεδο 3 είναι το σημείο ΣΥΣΧΕΤΙΣΗΣ: η ίδια δραστηριότητα (π.χ. Η/Μ εγκαταστάσεις) είναι ΜΙΑ
// ομάδα TRDGROUP είτε ο συναλλασσόμενος είναι πελάτης (εργολάβος που αγοράζει) είτε προμηθευτής
// (υπεργολάβος). Γι' αυτό τα φύλλα «SH_*» είναι κοινά στα δύο δέντρα.
//
// Το SoftOne κρατά τα τρία πεδία ΑΝΕΞΑΡΤΗΤΑ· το δέντρο (γονέας → παιδί) ζει στη βάση μας (`TraderClass`).
// Τα επίπεδα 2→3 είναι αυστηρό δέντρο. Το επίπεδο 1 είναι η λογιστική κατηγορία: οι κλάδοι κρέμονται από
// το «εσωτερικού», και για ξένο συναλλασσόμενο αλλάζει ΜΟΝΟ το επίπεδο 1 (ΕΕ/τρίτες) — ο κλάδος μένει.
//
// ΚΑΔ: NACE Rev. 2.1 (kad2025/2026) όπως τους δίνει η ΑΑΔΕ. ΠΡΟΣΟΧΗ: ίδιος κωδικός ≠ ίδια σημασία με
// τους παλιούς (π.χ. 46.73 ήταν δομικά υλικά, τώρα μοτοσυκλέτες) — οι κανόνες είναι μόνο σε νέους ΚΑΔ.
// Σειρά: κανόνες ΠΕΡΙΓΡΑΦΗΣ (για όσα η ΑΑΔΕ κατατάσσει αλλού) → «μακρύτερο πρόθεμα κερδίζει».

export type Side = 'customer' | 'supplier';
export const SODTYPE: Record<Side, 12 | 13> = { customer: 13, supplier: 12 };
export type ClassLevel = 1 | 2 | 3;

export interface ClassNode {
  /** Σταθερό κλειδί της εφαρμογής. «C*» πελάτες, «S*» προμηθευτές, «SH_*» κοινά φύλλα επιπέδου 3. */
  key: string;
  level: ClassLevel;
  /** Σύντμηση για το SoftOne (CODE). Στο επίπεδο 3 μοναδική σε ΟΛΟ το TRDGROUP. */
  code: string;
  name: string;
  /** Γονέας ανά πλευρά (τα κοινά φύλλα έχουν διαφορετικό γονέα σε πελάτες και προμηθευτές). */
  parent: Partial<Record<Side, string>>;
  sides: Side[];
  description?: string;
  /** Μόνο επίπεδο 1: το υπάρχον κλειδί TRDCATEGORY του SoftOne. */
  softoneId?: number;
  /** Μόνο επίπεδο 3: προθέματα ΚΑΔ (ψηφία) ανά πλευρά. */
  kad?: Partial<Record<Side, string[]>>;
}

const both: Side[] = ['customer', 'supplier'];
const C: Side[] = ['customer'];
const S: Side[] = ['supplier'];
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i).padStart(2, '0'));

// ── Επίπεδο 1 — λογιστική κατηγορία (υπάρχουσες εγγραφές TRDCATEGORY) ────────────────────────────
const L1: ClassNode[] = [
  { key: 'C1_RETAIL', level: 1, code: 'ΛΕΣ', name: 'Λιανικής', parent: {}, sides: C, softoneId: 1, description: 'Ιδιώτες — αποδείξεις λιανικής.' },
  { key: 'C1_DOMESTIC', level: 1, code: 'ΠΕΣ', name: 'Χονδρικής Εσωτερικού', parent: {}, sides: C, softoneId: 2, description: 'Επιχειρήσεις & φορείς με ελληνικό ΑΦΜ.' },
  { key: 'C1_EU', level: 1, code: 'ΠΕΕ', name: 'Χονδρικής Ευρωπαϊκής Ένωσης', parent: {}, sides: C, softoneId: 3 },
  { key: 'C1_THIRD', level: 1, code: 'ΠΤΧ', name: 'Χονδρικής Τρίτων χωρών', parent: {}, sides: C, softoneId: 4 },
  { key: 'S1_DOMESTIC', level: 1, code: 'ΠΕΣ', name: 'Προμηθευτές εσωτερικού', parent: {}, sides: S, softoneId: 1 },
  { key: 'S1_EU', level: 1, code: 'ΠΕΕ', name: 'Προμηθευτές Ευρωπαϊκής Ένωσης', parent: {}, sides: S, softoneId: 2 },
  { key: 'S1_THIRD', level: 1, code: 'ΠΤΧ', name: 'Προμηθευτές Τρίτων χωρών', parent: {}, sides: S, softoneId: 3 },
];

// ── Επίπεδο 2 — κλάδος (TRDBUSINESS, ξεχωριστή λίστα ανά πλευρά) ─────────────────────────────────
const L2: ClassNode[] = [
  // Πελάτες
  { key: 'C2_PRIVATE', level: 2, code: 'ΙΔΙ', name: 'Ιδιώτες', parent: { customer: 'C1_RETAIL' }, sides: C },
  { key: 'C2_CONSTRUCTION', level: 2, code: 'ΚΑΤ', name: 'Κατασκευαστικές & τεχνικές εταιρίες', parent: { customer: 'C1_DOMESTIC' }, sides: C },
  { key: 'C2_DESIGN', level: 2, code: 'ΜΕΛ', name: 'Αρχιτέκτονες, μηχανικοί & designers', parent: { customer: 'C1_DOMESTIC' }, sides: C },
  { key: 'C2_REALESTATE', level: 2, code: 'ΑΚΙ', name: 'Ακίνητα & developers', parent: { customer: 'C1_DOMESTIC' }, sides: C },
  { key: 'C2_HOSPITALITY', level: 2, code: 'ΤΟΥ', name: 'Ξενοδοχεία & τουριστικά καταλύματα', parent: { customer: 'C1_DOMESTIC' }, sides: C },
  { key: 'C2_LEISURE', level: 2, code: 'ΕΣΤ', name: 'Εστίαση, ψυχαγωγία & εκδηλώσεις', parent: { customer: 'C1_DOMESTIC' }, sides: C },
  { key: 'C2_MATERIALS', level: 2, code: 'ΥΛΙ', name: 'Εμπόριο υλικών, επίπλων & διακόσμησης', parent: { customer: 'C1_DOMESTIC' }, sides: C },
  { key: 'C2_TRADE', level: 2, code: 'ΕΜΠ', name: 'Λοιπό εμπόριο & παραγωγή', parent: { customer: 'C1_DOMESTIC' }, sides: C },
  { key: 'C2_SERVICES', level: 2, code: 'ΥΠΗ', name: 'Επιχειρήσεις & επαγγελματίες υπηρεσιών', parent: { customer: 'C1_DOMESTIC' }, sides: C },
  { key: 'C2_PUBLIC', level: 2, code: 'ΔΗΜ', name: 'Δημόσιο & ΝΠΔΔ', parent: { customer: 'C1_DOMESTIC' }, sides: C },
  { key: 'C2_FOREIGN', level: 2, code: 'ΕΞΩ', name: 'Πελάτες εξωτερικού', parent: { customer: 'C1_EU' }, sides: C },
  { key: 'C2_REVIEW', level: 2, code: 'ΛΟΙ', name: 'Λοιποί — για έλεγχο', parent: { customer: 'C1_DOMESTIC' }, sides: C },
  // Προμηθευτές
  { key: 'S2_MATERIALS', level: 2, code: 'ΥΛΙ', name: 'Δομικά υλικά & επενδύσεις', parent: { supplier: 'S1_DOMESTIC' }, sides: S, description: 'Πέτρα, πλακάκια, δάπεδα, κονιάματα, χρώματα, είδη υγιεινής.' },
  { key: 'S2_FURNISHING', level: 2, code: 'ΕΠΙ', name: 'Έπιπλα, φωτισμός & διακόσμηση', parent: { supplier: 'S1_DOMESTIC' }, sides: S },
  { key: 'S2_SUBCONTRACTORS', level: 2, code: 'ΥΠΕ', name: 'Υπεργολάβοι & τεχνίτες', parent: { supplier: 'S1_DOMESTIC' }, sides: S, description: 'Κατασκευαστικά συνεργεία, Η/Μ, τελειώματα, σιδηροκατασκευές.' },
  { key: 'S2_DESIGN', level: 2, code: 'ΜΕΛ', name: 'Μελετητές & σύμβουλοι έργου', parent: { supplier: 'S1_DOMESTIC' }, sides: S },
  { key: 'S2_LOGISTICS', level: 2, code: 'ΜΕΤ', name: 'Μεταφορές & logistics', parent: { supplier: 'S1_DOMESTIC' }, sides: S },
  { key: 'S2_OPERATING', level: 2, code: 'ΛΕΙ', name: 'Λειτουργικά έξοδα & υπηρεσίες', parent: { supplier: 'S1_DOMESTIC' }, sides: S, description: 'Ενέργεια, τηλεπικοινωνίες, λογιστές, ενοίκια, IT, τράπεζες.' },
  { key: 'S2_TRADE', level: 2, code: 'ΕΜΠ', name: 'Εξοπλισμός, λοιπό εμπόριο & παραγωγή', parent: { supplier: 'S1_DOMESTIC' }, sides: S },
  { key: 'S2_PUBLIC', level: 2, code: 'ΔΗΜ', name: 'Δημόσιο & ΝΠΔΔ', parent: { supplier: 'S1_DOMESTIC' }, sides: S },
  { key: 'S2_REVIEW', level: 2, code: 'ΛΟΙ', name: 'Λοιποί — για έλεγχο', parent: { supplier: 'S1_DOMESTIC' }, sides: S },
];

// ── Επίπεδο 3 — ειδική ομάδα (TRDGROUP, κοινή λίστα) ─────────────────────────────────────────────
const L3: ClassNode[] = [
  // Κοινά — ίδια δραστηριότητα και στις δύο πλευρές
  { key: 'SH_BUILDING', level: 3, code: 'ΚΤΙ', name: 'Κατασκευή κτιρίων', parent: { customer: 'C2_CONSTRUCTION', supplier: 'S2_SUBCONTRACTORS' }, sides: both, kad: { customer: ['41'], supplier: ['41'] } },
  { key: 'SH_CIVIL', level: 3, code: 'ΠΟΛ', name: 'Έργα πολιτικού μηχανικού', parent: { customer: 'C2_CONSTRUCTION', supplier: 'S2_SUBCONTRACTORS' }, sides: both, kad: { customer: ['42', '435'], supplier: ['42', '435'] } },
  { key: 'SH_MEP', level: 3, code: 'ΗΜΕ', name: 'Ηλεκτρομηχανολογικές εγκαταστάσεις', parent: { customer: 'C2_CONSTRUCTION', supplier: 'S2_SUBCONTRACTORS' }, sides: both, kad: { customer: ['432'], supplier: ['432'] } },
  { key: 'SH_FINISHING', level: 3, code: 'ΤΕΛ', name: 'Τελειώματα & εξειδικευμένες εργασίες', parent: { customer: 'C2_CONSTRUCTION', supplier: 'S2_SUBCONTRACTORS' }, sides: both, kad: { customer: ['43'], supplier: ['43'] } },
  { key: 'SH_ARCHITECTS', level: 3, code: 'ΑΡΧ', name: 'Αρχιτέκτονες', parent: { customer: 'C2_DESIGN', supplier: 'S2_DESIGN' }, sides: both, kad: { customer: ['7111'], supplier: ['7111'] } },
  { key: 'SH_ENGINEERS', level: 3, code: 'ΜΗΧ', name: 'Μηχανικοί & τεχνικοί σύμβουλοι', parent: { customer: 'C2_DESIGN', supplier: 'S2_DESIGN' }, sides: both, kad: { customer: ['711'], supplier: ['711', '712'] } },
  { key: 'SH_INTERIOR', level: 3, code: 'INT', name: 'Interior designers & διακοσμητές', parent: { customer: 'C2_DESIGN', supplier: 'S2_DESIGN' }, sides: both, kad: { customer: ['7413', '7414'], supplier: ['7413', '7414'] } },
  { key: 'SH_PROFESSIONAL', level: 3, code: 'ΝΟΜ', name: 'Λογιστικά, νομικά & σύμβουλοι', parent: { customer: 'C2_SERVICES', supplier: 'S2_OPERATING' }, sides: both, kad: { customer: ['69', '70'], supplier: ['69', '70'] } },
  { key: 'SH_CREATIVE', level: 3, code: 'ΔΗΙ', name: 'Media, διαφήμιση & δημιουργικά', parent: { customer: 'C2_SERVICES', supplier: 'S2_OPERATING' }, sides: both, kad: { customer: ['58', '59', '60', '73', '74', '90'], supplier: ['58', '59', '60', '62', '63', '73', '74', '90'] } },
  { key: 'SH_TRADE', level: 3, code: 'ΕΜΠ', name: 'Εμπόριο', parent: { customer: 'C2_TRADE', supplier: 'S2_TRADE' }, sides: both, kad: { customer: ['45', '46', '47'], supplier: ['45', '46', '47'] } },
  { key: 'SH_INDUSTRY', level: 3, code: 'ΒΙΟ', name: 'Βιομηχανία, παραγωγή & ενέργεια', parent: { customer: 'C2_TRADE', supplier: 'S2_TRADE' }, sides: both, kad: { customer: range(1, 39), supplier: [...range(1, 34), '39'] } },
  { key: 'SH_PUBLIC', level: 3, code: 'ΔΗΜ', name: 'Δημόσιο & ΝΠΔΔ', parent: { customer: 'C2_PUBLIC', supplier: 'S2_PUBLIC' }, sides: both, kad: { customer: ['84'], supplier: ['84'] } },
  { key: 'SH_REVIEW', level: 3, code: 'ΛΟΙ', name: 'Για έλεγχο', parent: { customer: 'C2_REVIEW', supplier: 'S2_REVIEW' }, sides: both },

  // Μόνο πελάτες
  { key: 'C3_PRIVATE', level: 3, code: 'ΙΔΙ', name: 'Ιδιώτες', parent: { customer: 'C2_PRIVATE' }, sides: C },
  { key: 'C3_DEVELOPERS', level: 3, code: 'DEV', name: 'Developers & αγοραπωλησία ακινήτων', parent: { customer: 'C2_REALESTATE' }, sides: C, kad: { customer: ['681'] } },
  { key: 'C3_PROPERTY', level: 3, code: 'ΔΙΑ', name: 'Εκμίσθωση & διαχείριση ακινήτων', parent: { customer: 'C2_REALESTATE' }, sides: C, kad: { customer: ['68'] } },
  { key: 'C3_HOTELS', level: 3, code: 'ΞΕΝ', name: 'Ξενοδοχεία', parent: { customer: 'C2_HOSPITALITY' }, sides: C, kad: { customer: ['551'] } },
  { key: 'C3_SHORTSTAY', level: 3, code: 'ΒΡΑ', name: 'Ενοικιαζόμενα & βραχυχρόνια μίσθωση', parent: { customer: 'C2_HOSPITALITY' }, sides: C, kad: { customer: ['552'] } },
  { key: 'C3_LODGING', level: 3, code: 'ΚΑΛ', name: 'Λοιπά καταλύματα', parent: { customer: 'C2_HOSPITALITY' }, sides: C, kad: { customer: ['55'] } },
  { key: 'C3_RESTAURANTS', level: 3, code: 'ΕΣΤ', name: 'Εστιατόρια & catering', parent: { customer: 'C2_LEISURE' }, sides: C, kad: { customer: ['561', '562', '564'] } },
  { key: 'C3_BARS', level: 3, code: 'ΚΑΦ', name: 'Καφέ & μπαρ', parent: { customer: 'C2_LEISURE' }, sides: C, kad: { customer: ['563'] } },
  { key: 'C3_VENUES', level: 3, code: 'ΕΚΔ', name: 'Ψυχαγωγία, πολιτισμός & χώροι εκδηλώσεων', parent: { customer: 'C2_LEISURE' }, sides: C, kad: { customer: ['5914', '9031', '93'] } },
  { key: 'C3_MAT_WHOLESALE', level: 3, code: 'ΧΥΛ', name: 'Χονδρικό υλικών & εξοπλισμού', parent: { customer: 'C2_MATERIALS' }, sides: C, kad: { customer: ['4613', '4615', '4644', '4647', '4649', '4683', '4684'] } },
  { key: 'C3_MAT_RETAIL', level: 3, code: 'ΛΥΛ', name: 'Λιανικό υλικών, επίπλων & διακόσμησης', parent: { customer: 'C2_MATERIALS' }, sides: C, kad: { customer: ['4752', '4753', '4755'] } },
  { key: 'C3_HEALTH', level: 3, code: 'ΥΓΕ', name: 'Υγεία & κοινωνική μέριμνα', parent: { customer: 'C2_SERVICES' }, sides: C, kad: { customer: ['86', '87', '88'] } },
  { key: 'C3_OTHER_SERVICES', level: 3, code: 'ΥΠΗ', name: 'Λοιπές υπηρεσίες', parent: { customer: 'C2_SERVICES' }, sides: C, kad: { customer: [] } },
  { key: 'C3_FOREIGN', level: 3, code: 'ΕΞΩ', name: 'Πελάτες εξωτερικού', parent: { customer: 'C2_FOREIGN' }, sides: C },

  // Μόνο προμηθευτές
  { key: 'S3_STONE', level: 3, code: 'ΠΕΤ', name: 'Φυσική πέτρα & μάρμαρα', parent: { supplier: 'S2_MATERIALS' }, sides: S, kad: { supplier: ['081', '237'] } },
  { key: 'S3_TILES', level: 3, code: 'ΠΛΑ', name: 'Πλακάκια, ψηφίδες & κεραμικά', parent: { supplier: 'S2_MATERIALS' }, sides: S, kad: { supplier: ['233', '234'] } },
  { key: 'S3_WOOD', level: 3, code: 'ΞΥΛ', name: 'Ξυλεία & ξύλινα δάπεδα', parent: { supplier: 'S2_MATERIALS' }, sides: S, kad: { supplier: ['16'] } },
  { key: 'S3_MORTARS', level: 3, code: 'ΚΟΝ', name: 'Κονιάματα, χρώματα & δομικά χημικά', parent: { supplier: 'S2_MATERIALS' }, sides: S, kad: { supplier: ['203', '2052', '235', '236'] } },
  { key: 'S3_BUILDMAT', level: 3, code: 'ΔΟΜ', name: 'Δομικά υλικά, σιδηρικά & είδη υγιεινής', parent: { supplier: 'S2_MATERIALS' }, sides: S, kad: { supplier: ['4613', '4682', '4683', '4684', '4752', '23'] } },
  { key: 'S3_FURNITURE', level: 3, code: 'ΕΠΙ', name: 'Έπιπλα & κατασκευές επίπλου', parent: { supplier: 'S2_FURNISHING' }, sides: S, kad: { supplier: ['31', '4615', '4647', '4755'] } },
  { key: 'S3_LIGHTING', level: 3, code: 'ΦΩΤ', name: 'Φωτισμός & ηλεκτρολογικό υλικό', parent: { supplier: 'S2_FURNISHING' }, sides: S, kad: { supplier: ['27', '4643', '4754'] } },
  { key: 'S3_DECOR', level: 3, code: 'ΥΦΑ', name: 'Υφάσματα, χαλιά & διακοσμητικά', parent: { supplier: 'S2_FURNISHING' }, sides: S, kad: { supplier: ['13', '4641', '4649', '4753'] } },
  { key: 'S3_TOOLS', level: 3, code: 'ΕΡΓ', name: 'Εργαλεία, μηχανήματα & εξοπλισμός', parent: { supplier: 'S2_TRADE' }, sides: S, kad: { supplier: ['4614', '4662', '4663', '4664', '4774'] } },
  { key: 'S3_METAL', level: 3, code: 'ΣΙΔ', name: 'Σιδηροκατασκευές & μεταλλικά', parent: { supplier: 'S2_SUBCONTRACTORS' }, sides: S, kad: { supplier: ['25'] } },
  { key: 'S3_TRANSPORT', level: 3, code: 'ΜΕΤ', name: 'Μεταφορές & ταχυμεταφορές', parent: { supplier: 'S2_LOGISTICS' }, sides: S, kad: { supplier: range(49, 53) } },
  { key: 'S3_UTILITIES', level: 3, code: 'ΕΝΕ', name: 'Ενέργεια, νερό & τηλεπικοινωνίες', parent: { supplier: 'S2_OPERATING' }, sides: S, kad: { supplier: ['35', '36', '37', '38', '61'] } },
  { key: 'S3_FINANCE', level: 3, code: 'ΤΡΑ', name: 'Τράπεζες & ασφάλειες', parent: { supplier: 'S2_OPERATING' }, sides: S, kad: { supplier: ['64', '65', '66'] } },
  { key: 'S3_RENTALS', level: 3, code: 'ΕΝΟ', name: 'Ενοίκια & εκμισθώσεις εξοπλισμού', parent: { supplier: 'S2_OPERATING' }, sides: S, kad: { supplier: ['68', '77'] } },
  { key: 'S3_OTHER_SERVICES', level: 3, code: 'ΛΥΠ', name: 'Λοιπές υπηρεσίες', parent: { supplier: 'S2_OPERATING' }, sides: S, kad: { supplier: [] } },
];

// Προμηθευτές: τα τμήματα που έχουν δικό τους φύλλο (π.χ. 16 ξυλεία, 25 μεταλλικά) φεύγουν από τη Βιομηχανία.
{
  const ind = L3.find((n) => n.key === 'SH_INDUSTRY')!;
  const own = new Set(L3.filter((n) => n !== ind).flatMap((n) => n.kad?.supplier ?? []).filter((p) => p.length === 2));
  ind.kad!.supplier = ind.kad!.supplier!.filter((p) => !own.has(p));
}

// Τμήματα χωρίς δικό τους κανόνα → «Λοιπές υπηρεσίες» (πελάτες 49–99, προμηθευτές 35–99).
for (const [side, key, from] of [['customer', 'C3_OTHER_SERVICES', 49], ['supplier', 'S3_OTHER_SERVICES', 35]] as const) {
  const taken = new Set(L3.flatMap((n) => n.kad?.[side] ?? []).filter((p) => p.length === 2));
  const node = L3.find((n) => n.key === key)!;
  for (let d = from; d <= 99; d++) if (!taken.has(String(d))) node.kad![side]!.push(String(d));
}

export const CLASS_TREE: ClassNode[] = [...L1, ...L2, ...L3];
export const CLASS_BY_KEY = new Map(CLASS_TREE.map((n) => [n.key, n]));

/** Οι κόμβοι μιας πλευράς. */
export const treeFor = (side: Side) => CLASS_TREE.filter((n) => n.sides.includes(side));

/** Η αλυσίδα από το γενικό στο ειδικό για ένα φύλλο επιπέδου 3, στη δοσμένη πλευρά. */
export function classPath(side: Side, leafKey: string): [ClassNode, ClassNode, ClassNode] {
  const l3 = CLASS_BY_KEY.get(leafKey);
  if (!l3 || l3.level !== 3 || !l3.parent[side]) throw new Error(`Άγνωστο φύλλο ${leafKey} για ${side}`);
  const l2 = CLASS_BY_KEY.get(l3.parent[side]!)!;
  const l1 = CLASS_BY_KEY.get(l2.parent[side]!)!;
  return [l1, l2, l3];
}

/** Κανόνες ΚΑΔ μιας πλευράς (πρόθεμα → φύλλο). */
export function kadRules(side: Side): Array<readonly [string, string]> {
  return L3.flatMap((n) => (n.kad?.[side] ?? []).map((p) => [p, n.key] as const));
}
const RULES: Record<Side, Array<readonly [string, string]>> = { customer: kadRules('customer'), supplier: kadRules('supplier') };

/** Κανόνες ΠΕΡΙΓΡΑΦΗΣ ΚΑΔ: εφαρμόζονται πριν από τα προθέματα. */
export const DESCR_RULES: Record<Side, ReadonlyArray<readonly [RegExp, string]>> = {
  customer: [
    [/ΔΙΑΚΟΣΜΗΤ|ΔΙΑΚΟΣΜΗΣΗΣ\s+ΕΣΩΤΕΡΙΚ|ΣΧΕΔΙΑΣΜΟΥ\s+ΕΣΩΤΕΡΙΚ/, 'SH_INTERIOR'],
    [/ΚΤΗΜΑΤΟΣ.*ΕΚΔΗΛΩΣ|ΔΙΟΡΓΑΝΩΣΗΣ.*ΕΚΔΗΛΩΣ/, 'C3_VENUES'],
  ],
  supplier: [
    [/ΔΙΑΚΟΣΜΗΤ|ΔΙΑΚΟΣΜΗΣΗΣ\s+ΕΣΩΤΕΡΙΚ|ΣΧΕΔΙΑΣΜΟΥ\s+ΕΣΩΤΕΡΙΚ/, 'SH_INTERIOR'],
    [/ΜΑΡΜΑΡ|ΓΡΑΝΙΤ|ΦΥΣΙΚΩΝ\s+ΛΙΘ|ΔΙΑΚΟΣΜΗΤΙΚΩΝ\s+ΛΙΘ/, 'S3_STONE'],
    [/ΠΛΑΚΑΚ|ΠΛΑΚΙΔ|ΚΕΡΑΜΙΚ/, 'S3_TILES'],
    [/ΕΠΙΠΛ/, 'S3_FURNITURE'],
    [/ΦΩΤΙΣΤ|ΚΑΛΩΔΙ|ΗΛΕΚΤΡΟΛΟΓΙΚ/, 'S3_LIGHTING'],
    [/ΧΡΩΜΑΤ(?!ΙΣΜ)|ΒΕΡΝΙΚ|ΚΟΝΙΑΜ/, 'S3_MORTARS'],
    [/ΞΥΛΕΙ|ΞΥΛΙΝ|ΠΑΡΚΕ/, 'S3_WOOD'],
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

// ── Συμπέρασμα από τα είδη που αγοράζουμε (για προμηθευτές χωρίς ΚΑΔ, π.χ. ξένους) ─────────────────
export const ITEM_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/ZELLIGE|ΠΛΑΚΑΚ|ΠΛΑΚΙΔ|TILE|COTTO|ΨΗΦΙΔ|MOSAIC|TERRAZZO|ΚΕΡΑΜΙΚ|GEOLITH/, 'S3_TILES'],
  [/ΠΕΤΡ|STONE|TRAVERTIN|ΜΑΡΜΑΡ|MARBLE|OPUS|BASTIDE|LIMESTONE|ΓΡΑΝΙΤ/, 'S3_STONE'],
  [/ΔΡΥΣ|\bOAK\b|PARQ|ΠΑΡΚΕ|ΞΥΛΕΙ|ΞΥΛΙΝ|WOOD/, 'S3_WOOD'],
  [/ΚΟΝΙ|ΤΣΙΜΕΝΤ|ISOMAT|ΚΟΛΛΑ|ΜΟΝΩΤ|ΑΣΤΑΡ|VARNISH|ΒΕΡΝΙΚ|MICROCEMENT|CALCE|ARGILLA|ΧΡΩΜΑ|PRIMER|NEOTEX|REVINEX|ΧΑΛΑΖΙ|SIKA|MAPE/, 'S3_MORTARS'],
  [/SOFA|\bBEDS?\b|ΕΠΙΠΛ|CLOSET|KITCHEN|KICHEN|ΚΟΥΖΙΝ|ΝΙΠΤΗΡ|ΠΑΓΚΟΣ|ΤΡΑΠΕΖ|ΚΑΡΕΚΛ|BENCH/, 'S3_FURNITURE'],
  [/ΦΩΤΙΣΤ|LIGHT|LAMP|ΛΑΜΠ|ΗΛΕΚΤΡΟΛΟΓ/, 'S3_LIGHTING'],
  [/ΥΦΑΣΜ|ΚΟΥΡΤΙΝ|ΧΑΛΙ|FABRIC|TEXTILE/, 'S3_DECOR'],
  [/ΜΕΤΑΦΟΡ|TRANSPORT|COURIER|ΑΠΟΣΤΟΛ/, 'S3_TRANSPORT'],
  [/ΤΡΟΧΟΣ|ΕΡΓΑΛΕΙ|ΔΡΑΠΑΝ|ΤΟΝΕΡ|TONER/, 'S3_TOOLS'],
  [/ΣΙΔΗΡΟΚΑΤ|ΣΥΔΕΡΟΚΑΤ|ΜΕΤΑΛΛΙΚ/, 'S3_METAL'],
];

export interface PurchasedItem { name: string; value: number }

/**
 * Φύλλο προμηθευτή από τα είδη των τιμολογίων αγοράς: ψηφοφορία σταθμισμένη με την αξία. Τα γενικά
 * είδη («ΥΠΗΡΕΣΙΕΣ», «ΕΡΓΑΣΙΕΣ») δεν ψηφίζουν. `share` = μερίδιο της αξίας που ψήφισε το νικητή.
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
const EU = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'XI']);

export interface ClassifyInput {
  side: Side;
  afmKind: 'greek' | 'foreign' | 'invalid' | 'none';
  /** ISO-2 της χώρας (για ξένους). */
  countryIso?: string | null;
  /** Βρέθηκε στην ΑΑΔΕ; true / false (δεν υπάρχει) / undefined (δεν ρωτήθηκε ή σφάλμα). */
  aadeFound?: boolean;
  legalForm?: string | null;
  /** firm_flag_descr: «ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ» / «ΜΗ ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ» / «ΠΡΩΗΝ ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ». */
  firmFlag?: string | null;
  primaryKad?: string | null;
  primaryKadDescr?: string | null;
  /** Μόνο προμηθευτές: τι αγοράζουμε από αυτόν. */
  purchases?: PurchasedItem[];
}

export type ClassifyBasis =
  | 'kad' | 'legal_form' | 'purchases' | 'foreign' | 'kad_unmatched' | 'no_activity' | 'former_business'
  | 'no_afm' | 'invalid_afm' | 'aade_not_found' | 'unverified';

export interface ClassifyResult {
  /** Φύλλο επιπέδου 3. */
  leaf: string;
  /** [επίπεδο 1, 2, 3] — κλειδιά. Το επίπεδο 1 έρχεται από τη χώρα. */
  path: [string, string, string];
  basis: ClassifyBasis;
  /** Ο κανόνας που ταίριαξε (πρόθεμα ΚΑΔ, περιγραφή, ή μερίδιο αγορών). */
  rule: string | null;
  /** Χρειάζεται ματιά από άνθρωπο πριν την ανάθεση. */
  review: boolean;
}

/** Επίπεδο 1 από τη χώρα: εσωτερικού / ΕΕ / τρίτες χώρες (ιδιώτες πελάτες → λιανικής). */
function level1(c: ClassifyInput, leaf: string): string {
  if (c.afmKind === 'foreign') {
    const iso = (c.countryIso ?? '').toUpperCase();
    const third = !!iso && !EU.has(iso);
    return c.side === 'customer' ? (third ? 'C1_THIRD' : 'C1_EU') : (third ? 'S1_THIRD' : 'S1_EU');
  }
  return classPath(c.side, leaf)[0].key;
}

function result(c: ClassifyInput, leaf: string, basis: ClassifyBasis, rule: string | null, review: boolean): ClassifyResult {
  const [, l2, l3] = classPath(c.side, leaf);
  return { leaf, path: [level1(c, leaf), l2.key, l3.key], basis, rule, review };
}

/**
 * Γενικά φύλλα: ο ΚΑΔ λέει «εμπόριο/δομικά υλικά/βιομηχανία» χωρίς να λέει ΤΙ. Για προμηθευτή, αν οι
 * αγορές δείχνουν ξεκάθαρα (≥ 50% της αξίας) ειδικότερο φύλλο, υπερισχύουν.
 */
export const GENERIC_LEAVES = new Set(['S3_BUILDMAT', 'SH_TRADE', 'SH_INDUSTRY']);

/** Αυτόματη ανάθεση για έναν συναλλασσόμενο. Η σειρά των ελέγχων είναι ο κανόνας. */
export function classifyTrader(c: ClassifyInput): ClassifyResult {
  const review = 'SH_REVIEW';
  if (c.legalForm && PUBLIC_FORM.test(plainUpper(c.legalForm))) return result(c, 'SH_PUBLIC', 'legal_form', null, false);
  if (c.primaryKad) {
    const hit = leafForKad(c.side, c.primaryKad, c.primaryKadDescr);
    if (hit && c.side === 'supplier' && GENERIC_LEAVES.has(hit.key) && c.purchases?.length) {
      const p = leafFromPurchases(c.purchases);
      if (p && p.share >= 0.5 && p.key !== hit.key) {
        return result(c, p.key, 'purchases', `ΚΑΔ ${hit.rule} (γενικός) · ${Math.round(p.share * 100)}% της αξίας αγορών`, false);
      }
    }
    if (hit) return result(c, hit.key, 'kad', hit.rule, false);
  }
  // Προμηθευτής χωρίς (αξιοποιήσιμο) ΚΑΔ: τι αγοράζουμε από αυτόν.
  if (c.side === 'supplier' && c.purchases?.length) {
    const p = leafFromPurchases(c.purchases);
    if (p) return result(c, p.key, 'purchases', `${Math.round(p.share * 100)}% της αξίας αγορών`, p.share < 0.5);
  }
  if (c.primaryKad) return result(c, review, 'kad_unmatched', null, true);
  if (c.afmKind === 'foreign') {
    return c.side === 'customer'
      ? result(c, 'C3_FOREIGN', 'foreign', null, !c.countryIso)
      : result(c, review, 'foreign', null, true);
  }
  if (c.side === 'supplier') {
    // Προμηθευτής χωρίς ΚΑΔ και χωρίς αγορές ειδών: πάντα για έλεγχο.
    const basis: ClassifyBasis = c.afmKind === 'none' ? 'no_afm' : c.afmKind === 'invalid' ? 'invalid_afm'
      : c.aadeFound === false ? 'aade_not_found' : c.aadeFound ? 'no_activity' : 'unverified';
    return result(c, review, basis, null, true);
  }
  if (c.afmKind === 'none') return result(c, 'C3_PRIVATE', 'no_afm', null, false);
  if (c.afmKind === 'invalid') return result(c, 'C3_PRIVATE', 'invalid_afm', null, true);
  if (c.aadeFound === false) return result(c, 'C3_PRIVATE', 'aade_not_found', null, true);
  if (c.aadeFound) {
    const flag = plainUpper(c.firmFlag);
    if (/ΠΡΩΗΝ/.test(flag)) return result(c, 'C3_PRIVATE', 'former_business', null, false);
    if (/^ΕΠΙΤΗΔ/.test(flag)) return result(c, review, 'no_activity', null, true);
    return result(c, 'C3_PRIVATE', 'no_activity', null, false);
  }
  return result(c, review, 'unverified', null, true);
}
