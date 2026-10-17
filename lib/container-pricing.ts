/**
 * Κοινό container — η λογική τιμής (καθαρή, για client, server και το μελλοντικό B2B).
 *
 * Ένα container με ΕΝΑ ή ΠΕΡΙΣΣΟΤΕΡΑ προϊόντα, που γεμίζει με κρατήσεις πολλών πελατών (ελάχιστο ½
 * παλέτα, βήμα ½). Τα σημεία πτώσης (κλιμάκια) είναι ΚΟΙΝΑ: από `fromPallets` παλέτες ΣΥΝΟΛΙΚΟΥ
 * γεμίσματος ισχύει το κλιμάκιο `level` (PRICEW0{level} στο SoftOne). Κάθε προϊόν έχει τη δική του
 * τιμή ανά κλιμάκιο — PRICEW01 η ΜΕΓΑΛΥΤΕΡΗ, κάθε επόμενη φθηνότερη. Μια κράτηση σε οποιοδήποτε
 * προϊόν ρίχνει την τιμή ΟΛΩΝ των προϊόντων, για όλους τους συμμετέχοντες.
 */

export const PALLET_STEP = 0.5;
export const MAX_TIERS = 8;

/** Κοινό σημείο πτώσης. */
export type Level = { level: number; fromPallets: number };
/** Κλιμάκιο ενός προϊόντος: σημείο + η τιμή του προϊόντος εκεί. */
export type Tier = Level & { price: number };
export type TierIssue = { level: 'error' | 'warn'; tier?: number; message: string };

const EPS = 1e-9;
export const isStep = (n: number, step = PALLET_STEP) => Math.abs(n / step - Math.round(n / step)) < 1e-6;
export const roundStep = (n: number, step = PALLET_STEP) => Math.round(n / step) * step;
/** «PRICEW01» … «PRICEW08». */
export const priceField = (level: number) => `PRICEW${String(level).padStart(2, '0')}`;

/** Παλέτες που χωρούν: τ.μ. container ÷ τ.μ. παλέτας (προς τα κάτω, σε βήματα ½). */
export function capacityPallets(sqmPerContainer: number, sqmPerPallet: number): number {
  if (!(sqmPerContainer > 0) || !(sqmPerPallet > 0)) return 0;
  return Math.floor((sqmPerContainer / sqmPerPallet) / PALLET_STEP + EPS) * PALLET_STEP;
}

/** Ταξινόμηση κατά «από παλέτες». */
export const sortTiers = <T extends Level>(tiers: T[]) => [...tiers].sort((a, b) => a.fromPallets - b.fromPallets);

/** Τα κλιμάκια ενός προϊόντος από τα κοινά σημεία και τις τιμές του (prices[level-1]). */
export function itemTiers(levels: Level[], prices: number[]): Tier[] {
  return sortTiers(levels).map((l) => ({ level: l.level, fromPallets: l.fromPallets, price: prices[l.level - 1] ?? NaN }));
}

/**
 * Έλεγχος κοινών σημείων: 1 έως 8, το 1ο από την ελάχιστη παραγγελία, τα επόμενα σε αύξουσα σειρά,
 * σε βήματα ½ και μέσα στη χωρητικότητα, αριθμημένα PRICEW01, 02, … με τη σειρά.
 */
export function checkLevels(levels: Level[], capacity: number, minOrder = PALLET_STEP): TierIssue[] {
  const out: TierIssue[] = [];
  if (levels.length === 0) return [{ level: 'error', message: 'Χρειάζεται τουλάχιστον ένα κλιμάκιο τιμής.' }];
  if (levels.length > MAX_TIERS) out.push({ level: 'error', message: `Έως ${MAX_TIERS} κλιμάκια (PRICEW01…${priceField(MAX_TIERS)}).` });
  const t = sortTiers(levels);
  t.forEach((x, i) => {
    if (!Number.isFinite(x.fromPallets) || !isStep(x.fromPallets)) out.push({ level: 'error', tier: x.level, message: `Κλιμάκιο ${x.level}: οι παλέτες πάνε ανά ½ (π.χ. 3 ή 3,5).` });
    if (x.fromPallets > capacity + EPS) out.push({ level: 'error', tier: x.level, message: `Κλιμάκιο ${x.level}: ξεκινά από ${x.fromPallets} παλέτες αλλά το container χωρά ${capacity}.` });
    if (i > 0 && x.fromPallets <= t[i - 1].fromPallets + EPS) out.push({ level: 'error', tier: x.level, message: `Κλιμάκιο ${x.level}: πρέπει να ξεκινά μετά το προηγούμενο (${t[i - 1].fromPallets} παλέτες).` });
    if (x.level !== i + 1) out.push({ level: 'error', tier: x.level, message: `Τα κλιμάκια πάνε με τη σειρά: το ${i + 1}ο (από ${x.fromPallets} παλέτες) είναι η ${priceField(i + 1)}.` });
  });
  if (Math.abs(t[0].fromPallets - minOrder) > EPS) {
    out.push({ level: 'error', tier: t[0].level, message: `Το 1ο κλιμάκιο ξεκινά από την ελάχιστη παραγγελία (${minOrder} παλέτα).` });
  }
  const lv = t.map((x) => x.level);
  if (new Set(lv).size !== lv.length || lv.some((l) => l < 1 || l > MAX_TIERS)) {
    out.push({ level: 'error', message: `Κάθε κλιμάκιο αντιστοιχεί σε μία από τις PRICEW01…${priceField(MAX_TIERS)}.` });
  }
  return out;
}

/** Τιμές ενός προϊόντος: μία ανά κλιμάκιο, > 0, και ΦΘΗΝΟΤΕΡΗ από κλιμάκιο σε κλιμάκιο (01 η μεγαλύτερη). */
export function checkPrices(prices: number[], levels: number, label = ''): TierIssue[] {
  const out: TierIssue[] = [];
  const who = label ? `${label}: ` : '';
  if (prices.length !== levels) out.push({ level: 'error', message: `${who}χρειάζεται μία τιμή για κάθε κλιμάκιο (${levels}).` });
  for (let i = 0; i < Math.min(prices.length, levels); i++) {
    const p = prices[i];
    if (!(p > 0)) out.push({ level: 'error', tier: i + 1, message: `${who}${priceField(i + 1)}: η τιμή πρέπει να είναι > 0.` });
    else if (i > 0 && prices[i - 1] > 0 && p >= prices[i - 1] - EPS) {
      out.push({ level: 'error', tier: i + 1, message: `${who}${priceField(i + 1)}: πρέπει να είναι φθηνότερη από την ${priceField(i)} (${prices[i - 1]}).` });
    }
  }
  return out;
}

/** Συνδυαστικός έλεγχος για ένα προϊόν (κλιμάκια με τιμές). */
export function checkTiers(tiers: Tier[], capacity: number, minOrder = PALLET_STEP): TierIssue[] {
  const t = sortTiers(tiers);
  const lv = checkLevels(t, capacity, minOrder);
  if (!t.length) return lv;
  return [...lv, ...checkPrices(t.map((x) => x.price), t.length)];
}

/** Το κλιμάκιο που ισχύει με `filled` παλέτες (πριν από την 1η κράτηση: το 1ο). */
export function tierAt<T extends Level>(tiers: T[], filled: number): T | null {
  const t = sortTiers(tiers);
  let cur: T | null = t[0] ?? null;
  for (const x of t) if (filled + EPS >= x.fromPallets) cur = x;
  return cur;
}

/** Το επόμενο κλιμάκιο και πόσες παλέτες λείπουν για να πέσει η τιμή. */
export function nextTier<T extends Level>(tiers: T[], filled: number): { tier: T; missing: number } | null {
  // Μετά το ΤΡΕΧΟΝ κλιμάκιο: πριν από την 1η κράτηση ισχύει ήδη η PRICEW01 — «επόμενη» είναι η 02.
  const t = sortTiers(tiers);
  const floor = Math.max(filled, t[0]?.fromPallets ?? 0);
  const next = t.find((x) => x.fromPallets > floor + EPS);
  return next ? { tier: next, missing: roundStep(next.fromPallets - filled) } : null;
}

/** Γέμισμα του container: ελεύθερες θέσεις, ποσοστό, αν γέμισε. */
export function fillState(capacity: number, filled: number) {
  return {
    capacity,
    filled,
    free: Math.max(0, roundStep(capacity - filled)),
    percent: capacity > 0 ? Math.min(100, (filled / capacity) * 100) : 0,
    full: capacity > 0 && filled + EPS >= capacity,
  };
}

/** Τι ισχύει τώρα για ένα προϊόν: γέμισμα, τρέχουσα/επόμενη τιμή, όφελος από την αρχική. */
export function offerState(o: { tiers: Tier[]; capacity: number }, filled: number) {
  const current = tierAt(o.tiers, filled);
  const next = nextTier(o.tiers, filled);
  const first = sortTiers(o.tiers)[0] ?? null;
  return {
    ...fillState(o.capacity, filled),
    current,
    next,
    savingPerUnit: first && current ? Math.max(0, first.price - current.price) : 0,
  };
}

/** Έλεγχος ποσότητας κράτησης: ≥ ελάχιστη, βήμα ½, χωράει στις ελεύθερες θέσεις. */
export function checkReservation(pallets: number, free: number, minOrder = PALLET_STEP): string | null {
  if (!(pallets > 0) || !isStep(pallets)) return 'Η ποσότητα δίνεται σε παλέτες ανά ½ (π.χ. 0,5 · 1 · 1,5).';
  if (pallets + EPS < minOrder) return `Ελάχιστη παραγγελία: ${minOrder} παλέτα.`;
  if (pallets > free + EPS) return `Χωρούν ακόμη ${free} παλέτες στο container.`;
  return null;
}
