/**
 * ΚΕΡΔΟΦΟΡΙΑ ΕΡΓΟΥ — ο υπολογισμός, ΚΑΘΑΡΟΣ (χωρίς βάση και SoftOne) ώστε να δοκιμάζεται.
 *
 * Πηγές (επιβεβαιωμένο ζωντανά, atelier 2026-10-17): το έργο (PRJC) το φέρουν οι κεφαλές FINDOC και
 * οι γραμμές MTRLINES των ενοτήτων
 *   1351 Πωλήσεις · 1251 Αγορές · 1413 Εμβάσματα πελατών · 1412 Εμβάσματα προμηθευτών · 1151 Αποθήκη.
 * Η εγκατάσταση ΔΕΝ χρησιμοποιεί εισπράξεις (1381), πληρωμές (1281) ή παραστατικά εξόδων (1261) —
 * οι εισπράξεις είναι τα εμβάσματα πελατών, οι πληρωμές τα εμβάσματα προμηθευτών.
 *
 * Κανόνες:
 *  - Μετρούν μόνο τιμολόγια/αποδείξεις (+) και πιστωτικά (−) (lib/purchase-kinds) — όχι παραγγελίες,
 *    προσφορές, δελτία. Ακυρωμένα (ISCANCEL) ποτέ.
 *  - Κεφαλή με το έργο ⇒ μετρά όλο το παραστατικό, ΜΕΙΟΝ γραμμές χρεωμένες ρητά σε άλλο έργο.
 *    Έργο μόνο σε γραμμές ⇒ μετρά το άθροισμα αυτών των γραμμών (μερικό).
 *  - Έσοδα/κόστος: ΚΑΘΑΡΑ (χωρίς ΦΠΑ). Εισπράξεις/ανοιχτό υπόλοιπο: ΜΙΚΤΑ — όπως πληρώνει ο πελάτης.
 *  - Υλικά που τιμολογήθηκαν στον πελάτη ΧΩΡΙΣ αγορά ή εξαγωγή αποθήκης στο έργο: κόστος ΕΚΤΙΜΗΣΗΣ με
 *    την τελευταία τιμή αγοράς, χωριστή γραμμή «από απόθεμα (εκτίμηση)» — ποτέ σιωπηλά.
 *  - Γενικά έξοδα: % επί του άμεσου κόστους, ανά ημερομηνία παραστατικού και κατηγορία κόστους
 *    (lib/overheads-resolve).
 */
import { overheadRateFor, type OverheadRateInput } from '@/lib/overheads-resolve';

export const SALES = 1351;
export const PURCHASES = 1251;
export const CUSTOMER_REMITTANCES = 1413;
export const SUPPLIER_REMITTANCES = 1412;
export const STORE = 1151;

/** Ίδιο σύνολο τύπων με το `PurchaseKind` (lib/purchase-kinds) — εδώ χωρίς import του server κώδικα. */
export type DocKind = 'invoice' | 'credit' | 'order' | 'quote' | 'movement';

export type FinDoc = {
  findoc: number;
  fincode: string;
  /** ISO ημερομηνία ή null. */
  date: string | null;
  sosource: number;
  series: string;
  /** Ονομασία σειράς από τα μητρώα — null ⇒ η σειρά δεν είναι γνωστή στην εφαρμογή. */
  seriesName: string | null;
  /** Εμβάσματα: invoice = κανονικό, credit = επιστροφή. Αποθήκη: invoice = εξαγωγή, credit = εισαγωγή. */
  kind: DocKind;
  trdr: number | null;
  traderName: string | null;
  prjc: number | null;
  net: number;
  vat: number;
  total: number;
  cancelled: boolean;
  /** myDATA (πίνακας MYDATAHEADER) + συνημμένα (XTRDOCDATA) — ό,τι βρέθηκε, αλλιώς null/0. */
  mydata?: MyDataInfo;
};

export type MyDataInfo = {
  mark: string | null;
  /** QR URL της ΑΑΔΕ (σελίδα επαλήθευσης myDATA) — όχι PDF. */
  qrUrl: string | null;
  /** INVOICEURL «QR Url Παρόχου» — το επίσημο παραστατικό του παρόχου ηλεκτρονικής τιμολόγησης. */
  providerUrl: string | null;
  /** Πλήθος συνημμένων αρχείων στο SoftOne. */
  attachments: number;
};

export type FinLine = {
  findoc: number;
  mtrl: number | null;
  prjc: number | null;
  qty: number;
  /** LINEVAL — καθαρή αξία γραμμής. */
  value: number;
  isService: boolean;
  /** FINDOCS — το παραστατικό από το οποίο μετασχηματίστηκε η γραμμή (παραγγελία → τιμολόγιο). */
  sourceFindoc: number | null;
};

export type ProjectRef = {
  prjc: number;
  code: string;
  name: string;
  trdr: number | null;
  /** Νωρίτερη γνωστή ημερομηνία του έργου (δημιουργία/έναρξη) — ISO ή null. */
  since: string | null;
};

export type CostCategory = 'materials' | 'services' | 'other' | 'stock';
export const COST_CATEGORIES: CostCategory[] = ['materials', 'services', 'other', 'stock'];
export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  materials: 'Υλικά (αγορές)',
  services: 'Υπηρεσίες & υπεργολαβίες',
  other: 'Λοιπές χρεώσεις παραστατικών',
  stock: 'Υλικά από απόθεμα',
};
/** Κλειδί κατηγορίας στον πίνακα `OverheadRate`. */
export const overheadKey = (c: CostCategory) => `cost:${c}`;

export type DocRef = {
  findoc: number;
  fincode: string;
  date: string | null;
  sosource: number;
  series: string;
  seriesName: string | null;
  kind: DocKind;
  traderName: string | null;
  /** Καθαρή αξία που αναλογεί στο έργο (με πρόσημο). */
  net: number;
  /** Μικτή αξία που αναλογεί στο έργο (με πρόσημο). */
  gross: number;
  /** Μόνο μέρος του παραστατικού αφορά το έργο. */
  partial: boolean;
  mark: string | null;
  qrUrl: string | null;
  /** Υπάρχει επίσημο PDF παρόχου για λήψη. */
  providerPdf: boolean;
};

export type StockLine = {
  mtrl: number;
  qty: number;
  unitCost: number | null;
  value: number;
  source: 'issue' | 'estimate';
  /** Εκτίμηση: μέση καθαρή τιμή πώλησης μονάδας στο έργο. */
  salesUnit?: number;
  /** Εκτίμηση ΑΠΙΘΑΝΗ (κόστος > SUSPECT_RATIO × τιμή πώλησης — συνήθως λάθος μονάδας): ΔΕΝ μετρά. */
  suspect?: boolean;
};

/** Κόστος μονάδας πάνω από 2× την τιμή πώλησης = σχεδόν σίγουρα λάθος μονάδας/σχέσης, όχι ζημιά. */
export const SUSPECT_RATIO = 2;

export type AgeBucket = { label: string; amount: number };
export const AGE_BUCKETS = [
  { label: '0–30 ημ.', max: 30 },
  { label: '31–60 ημ.', max: 60 },
  { label: '61–90 ημ.', max: 90 },
  { label: '> 90 ημ.', max: Infinity },
];

export type ProjectProfit = {
  prjc: number;
  asOf: string;
  revenue: { invoiced: number; credits: number; net: number; gross: number; docs: DocRef[] };
  collections: { received: number; refunds: number; collected: number; open: number; ageing: AgeBucket[]; docs: DocRef[] };
  costs: { byCategory: Record<CostCategory, number>; total: number; docs: DocRef[]; stock: StockLine[] };
  payments: { paid: number; docs: DocRef[] };
  overhead: { total: number; lines: { category: CostCategory; percent: number; base: number; amount: number }[]; ratesDefined: boolean };
  netProfit: number;
  marginPct: number | null;
  /** Ταμειακή εικόνα: εισπράξεις − πληρωμές προμηθευτών. */
  cash: number;
  budget: { total: number; costVsBudget: number | null };
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const counts = (d: FinDoc) => !d.cancelled && (d.kind === 'invoice' || d.kind === 'credit');
const signOf = (d: FinDoc) => (d.kind === 'credit' ? -1 : 1);

export type ProfitContext = {
  docs: Map<number, FinDoc>;
  linesByDoc: Map<number, FinLine[]>;
  /** έργο → παραστατικά που το αφορούν (κεφαλή ή γραμμή). */
  docsByProject: Map<number, Set<number>>;
  /** Τελευταίο καθαρό κόστος μονάδας ανά είδος (lib/last-purchase-price). */
  lastCost: Map<number, number>;
  rates: OverheadRateInput[];
  asOf: string;
};

export function buildContext(input: { docs: FinDoc[]; lines: FinLine[]; lastCost?: Map<number, number>; rates?: OverheadRateInput[]; asOf?: string }): ProfitContext {
  const docs = new Map(input.docs.map((d) => [d.findoc, d]));
  const linesByDoc = new Map<number, FinLine[]>();
  for (const l of input.lines) {
    const arr = linesByDoc.get(l.findoc) ?? [];
    arr.push(l);
    linesByDoc.set(l.findoc, arr);
  }
  const docsByProject = new Map<number, Set<number>>();
  const add = (p: number | null, f: number) => {
    if (p == null) return;
    const s = docsByProject.get(p) ?? new Set<number>();
    s.add(f);
    docsByProject.set(p, s);
  };
  for (const d of input.docs) add(d.prjc, d.findoc);
  for (const l of input.lines) if (docs.has(l.findoc)) add(l.prjc, l.findoc);
  return { docs, linesByDoc, docsByProject, lastCost: input.lastCost ?? new Map(), rates: input.rates ?? [], asOf: input.asOf ?? new Date().toISOString() };
}

/** Το μέρος ενός παραστατικού που αφορά το έργο: καθαρή αξία, γραμμές, μερικό ή όχι. */
export function projectShare(doc: FinDoc, lines: FinLine[], prjc: number): { net: number; gross: number; lines: FinLine[]; partial: boolean } {
  let net: number;
  let own: FinLine[];
  let partial: boolean;
  if (doc.prjc === prjc) {
    const other = lines.filter((l) => l.prjc != null && l.prjc !== prjc);
    own = lines.filter((l) => l.prjc == null || l.prjc === prjc);
    net = doc.net - other.reduce((s, l) => s + l.value, 0);
    partial = other.length > 0;
  } else {
    own = lines.filter((l) => l.prjc === prjc);
    net = own.reduce((s, l) => s + l.value, 0);
    partial = true;
  }
  const ratio = doc.net !== 0 ? doc.total / doc.net : 1;
  const gross = !partial ? doc.total : net * ratio;
  return { net, gross, lines: own, partial };
}

const ref = (d: FinDoc, net: number, gross: number, partial: boolean): DocRef => ({
  findoc: d.findoc, fincode: d.fincode, date: d.date, sosource: d.sosource, series: d.series, seriesName: d.seriesName,
  kind: d.kind, traderName: d.traderName, net: round2(net), gross: round2(gross), partial,
  mark: d.mydata?.mark ?? null, qrUrl: d.mydata?.qrUrl ?? null, providerPdf: !!d.mydata?.providerUrl,
});

const daysBetween = (fromIso: string, toIso: string) => Math.floor((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / 86_400_000);

/**
 * Ενηλικίωση ανοιχτού υπολοίπου: οι εισπράξεις (και τα πιστωτικά) εξοφλούν τα ΠΑΛΑΙΟΤΕΡΑ τιμολόγια πρώτα
 * (FIFO) — το SoftOne της εγκατάστασης δεν κρατά αντιστοίχιση είσπραξης-τιμολογίου που να διαβάζεται.
 */
export function ageOpenInvoices(invoices: { date: string | null; gross: number }[], paidPool: number, asOf: string): AgeBucket[] {
  const out = AGE_BUCKETS.map((b) => ({ label: b.label, amount: 0 }));
  let pool = paidPool;
  const sorted = [...invoices].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  for (const inv of sorted) {
    const take = Math.min(Math.max(pool, 0), inv.gross);
    pool -= take;
    const open = inv.gross - take;
    if (open <= 0.005) continue;
    const days = inv.date ? daysBetween(inv.date, asOf) : 0;
    const i = AGE_BUCKETS.findIndex((b) => days <= b.max);
    out[i].amount += open;
  }
  return out.map((b) => ({ ...b, amount: round2(b.amount) }));
}

const isStoreIssue = (d: FinDoc) => d.sosource === STORE && !d.cancelled && (d.kind === 'invoice' || d.kind === 'credit');

export function computeProject(prjc: number, ctx: ProfitContext, budgetTotal = 0): ProjectProfit {
  const ids = [...(ctx.docsByProject.get(prjc) ?? [])];
  const docs = ids.map((id) => ctx.docs.get(id)!).filter(Boolean)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.findoc - a.findoc);

  const revenue = { invoiced: 0, credits: 0, net: 0, gross: 0, docs: [] as DocRef[] };
  const saleInvoices: { date: string | null; gross: number }[] = [];
  let creditGross = 0;
  const collections = { received: 0, refunds: 0, collected: 0, open: 0, ageing: [] as AgeBucket[], docs: [] as DocRef[] };
  const byCategory: Record<CostCategory, number> = { materials: 0, services: 0, other: 0, stock: 0 };
  const costDocs: DocRef[] = [];
  const payments = { paid: 0, docs: [] as DocRef[] };
  /** Βάση γενικών εξόδων: (ημερομηνία, κατηγορία, ποσό). */
  const costEntries: { date: string | null; category: CostCategory; amount: number }[] = [];
  const soldQty = new Map<number, number>();
  const soldValue = new Map<number, number>();
  const boughtQty = new Map<number, number>();
  const stock: StockLine[] = [];

  for (const d of docs) {
    const lines = ctx.linesByDoc.get(d.findoc) ?? [];
    if (d.sosource === SALES && counts(d)) {
      const s = projectShare(d, lines, prjc);
      const sign = signOf(d);
      if (sign > 0) { revenue.invoiced += s.net; saleInvoices.push({ date: d.date, gross: s.gross }); } else { revenue.credits += s.net; creditGross += s.gross; }
      revenue.gross += sign * s.gross;
      revenue.docs.push(ref(d, sign * s.net, sign * s.gross, s.partial));
      for (const l of s.lines) {
        if (l.mtrl == null || l.isService) continue;
        soldQty.set(l.mtrl, (soldQty.get(l.mtrl) ?? 0) + sign * l.qty);
        soldValue.set(l.mtrl, (soldValue.get(l.mtrl) ?? 0) + sign * l.value);
      }
    } else if (d.sosource === PURCHASES && counts(d)) {
      const s = projectShare(d, lines, prjc);
      const sign = signOf(d);
      const mat = s.lines.filter((l) => !l.isService).reduce((a, l) => a + l.value, 0);
      const srv = s.lines.filter((l) => l.isService).reduce((a, l) => a + l.value, 0);
      // Το υπόλοιπο της καθαρής αξίας πέρα από τις γραμμές = χρεώσεις του παραστατικού (μεταφορικά κ.λπ.).
      const other = s.partial && d.prjc !== prjc ? 0 : s.net - mat - srv;
      for (const [category, amount] of [['materials', mat], ['services', srv], ['other', other]] as const) {
        if (Math.abs(amount) < 0.005) continue;
        byCategory[category] += sign * amount;
        costEntries.push({ date: d.date, category, amount: sign * amount });
      }
      costDocs.push(ref(d, sign * s.net, sign * s.gross, s.partial));
      for (const l of s.lines) if (l.mtrl != null && !l.isService) boughtQty.set(l.mtrl, (boughtQty.get(l.mtrl) ?? 0) + sign * l.qty);
    } else if (d.sosource === CUSTOMER_REMITTANCES && !d.cancelled && d.prjc === prjc) {
      const sign = signOf(d);
      if (sign > 0) collections.received += d.total; else collections.refunds += d.total;
      collections.docs.push(ref(d, sign * d.total, sign * d.total, false));
    } else if (d.sosource === SUPPLIER_REMITTANCES && !d.cancelled && d.prjc === prjc) {
      const sign = signOf(d);
      payments.paid += sign * d.total;
      payments.docs.push(ref(d, sign * d.total, sign * d.total, false));
    } else if (isStoreIssue(d)) {
      // Εξαγωγή αποθήκης προς το έργο (+) / επιστροφή στην αποθήκη (−), σε τελευταίο κόστος αγοράς.
      const s = projectShare(d, lines, prjc);
      const sign = signOf(d);
      let value = 0;
      for (const l of s.lines) {
        if (l.mtrl == null) continue;
        const unit = ctx.lastCost.get(l.mtrl) ?? null;
        const v = unit != null ? sign * l.qty * unit : 0;
        value += v;
        stock.push({ mtrl: l.mtrl, qty: sign * l.qty, unitCost: unit, value: round2(v), source: 'issue' });
        if (!l.isService) boughtQty.set(l.mtrl, (boughtQty.get(l.mtrl) ?? 0) + sign * l.qty);
      }
      if (value !== 0) { byCategory.stock += value; costEntries.push({ date: d.date, category: 'stock', amount: value }); }
      costDocs.push(ref(d, value, value, s.partial));
    }
  }

  // Υλικά που πουλήθηκαν χωρίς αγορά/εξαγωγή στο έργο ⇒ εκτίμηση κόστους από απόθεμα.
  for (const [mtrl, sold] of soldQty) {
    const missing = sold - (boughtQty.get(mtrl) ?? 0);
    if (missing <= 0.0001) continue;
    const unit = ctx.lastCost.get(mtrl) ?? null;
    const salesUnit = sold > 0 ? (soldValue.get(mtrl) ?? 0) / sold : 0;
    const suspect = unit != null && salesUnit > 0 && unit > SUSPECT_RATIO * salesUnit;
    const value = unit != null && !suspect ? missing * unit : 0;
    stock.push({ mtrl, qty: missing, unitCost: unit, value: round2(value), source: 'estimate', salesUnit: round2(salesUnit), ...(suspect ? { suspect } : {}) });
    if (value) { byCategory.stock += value; costEntries.push({ date: ctx.asOf, category: 'stock', amount: value }); }
  }

  revenue.net = revenue.invoiced - revenue.credits;
  collections.collected = collections.received - collections.refunds;
  collections.open = revenue.gross - collections.collected;
  collections.ageing = ageOpenInvoices(saleInvoices, collections.collected + creditGross, ctx.asOf);

  const total = COST_CATEGORIES.reduce((s, c) => s + byCategory[c], 0);

  // Γενικά έξοδα ανά (κατηγορία, ποσοστό).
  const oh = new Map<string, { category: CostCategory; percent: number; base: number; amount: number }>();
  for (const e of costEntries) {
    const { percent } = overheadRateFor(ctx.rates, e.date, overheadKey(e.category));
    if (!percent) continue;
    const k = `${e.category}:${percent}`;
    const row = oh.get(k) ?? { category: e.category, percent, base: 0, amount: 0 };
    row.base += e.amount;
    row.amount += (e.amount * percent) / 100;
    oh.set(k, row);
  }
  const ohLines = [...oh.values()].map((r) => ({ ...r, base: round2(r.base), amount: round2(r.amount) }))
    .sort((a, b) => COST_CATEGORIES.indexOf(a.category) - COST_CATEGORIES.indexOf(b.category) || a.percent - b.percent);
  const overheadTotal = ohLines.reduce((s, r) => s + r.amount, 0);

  const netProfit = revenue.net - total - overheadTotal;
  return {
    prjc,
    asOf: ctx.asOf,
    revenue: { invoiced: round2(revenue.invoiced), credits: round2(revenue.credits), net: round2(revenue.net), gross: round2(revenue.gross), docs: revenue.docs },
    collections: {
      received: round2(collections.received), refunds: round2(collections.refunds), collected: round2(collections.collected),
      open: round2(collections.open), ageing: collections.ageing, docs: collections.docs,
    },
    costs: {
      byCategory: Object.fromEntries(COST_CATEGORIES.map((c) => [c, round2(byCategory[c])])) as Record<CostCategory, number>,
      total: round2(total), docs: costDocs, stock,
    },
    payments: { paid: round2(payments.paid), docs: payments.docs },
    overhead: { total: round2(overheadTotal), lines: ohLines, ratesDefined: ctx.rates.length > 0 },
    netProfit: round2(netProfit),
    marginPct: revenue.net > 0 ? round2((netProfit / revenue.net) * 100) : null,
    cash: round2(collections.collected - payments.paid),
    budget: { total: round2(budgetTotal), costVsBudget: budgetTotal > 0 ? round2(total - budgetTotal) : null },
  };
}
