/**
 * Κοινό container — η λογική τιμής (καθαρή, για client, server και το μελλοντικό B2B).
 *
 * Ένα προϊόν, ένα container που γεμίζει με κρατήσεις ΠΟΛΛΩΝ πελατών (ελάχιστο ½ παλέτα, βήμα ½).
 * Κλιμάκια σε ΠΑΛΕΤΕΣ: από `fromPallets` και πάνω ισχύει η τιμή του κλιμακίου (PRICEW0{level} στο
 * SoftOne). PRICEW01 = η ΜΕΓΑΛΥΤΕΡΗ τιμή (από την ελάχιστη παραγγελία), κάθε επόμενη φθηνότερη. Η τιμή ισχύει για ΟΛΟΥΣ τους συμμετέχοντες: όσο γεμίζει, πέφτει για όλους.
 */

export const PALLET_STEP = 0.5;
export const MAX_TIERS = 5;

export type Tier = { level: number; fromPallets: number; price: number };
export type TierIssue = { level: 'error' | 'warn'; tier?: number; message: string };

const EPS = 1e-9;
export const isStep = (n: number, step = PALLET_STEP) => Math.abs(n / step - Math.round(n / step)) < 1e-6;
export const roundStep = (n: number, step = PALLET_STEP) => Math.round(n / step) * step;

/** Παλέτες που χωρούν: τ.μ. container ÷ τ.μ. παλέτας (προς τα κάτω, σε βήματα ½). */
export function capacityPallets(sqmPerContainer: number, sqmPerPallet: number): number {
  if (!(sqmPerContainer > 0) || !(sqmPerPallet > 0)) return 0;
  return Math.floor((sqmPerContainer / sqmPerPallet) / PALLET_STEP + EPS) * PALLET_STEP;
}

/** Τα κλιμάκια ταξινομημένα κατά «από παλέτες». */
export const sortTiers = (tiers: Tier[]) => [...tiers].sort((a, b) => a.fromPallets - b.fromPallets);

/**
 * Έλεγχος κλιμακίων. Το 1ο ξεκινά από την ελάχιστη παραγγελία· τα επόμενα σε αύξουσα σειρά, σε
 * βήματα ½ και μέσα στη χωρητικότητα· η τιμή ΠΕΦΤΕΙ από κλιμάκιο σε κλιμάκιο.
 */
export function checkTiers(tiers: Tier[], capacity: number, minOrder = PALLET_STEP): TierIssue[] {
  const out: TierIssue[] = [];
  if (tiers.length === 0) return [{ level: 'error', message: 'Χρειάζεται τουλάχιστον ένα κλιμάκιο τιμής.' }];
  if (tiers.length > MAX_TIERS) out.push({ level: 'error', message: `Έως ${MAX_TIERS} κλιμάκια (PRICEW01…PRICEW05).` });
  const t = sortTiers(tiers);
  t.forEach((x, i) => {
    if (!(x.price > 0)) out.push({ level: 'error', tier: x.level, message: `Κλιμάκιο ${x.level}: η τιμή πρέπει να είναι > 0.` });
    if (!isStep(x.fromPallets)) out.push({ level: 'error', tier: x.level, message: `Κλιμάκιο ${x.level}: οι παλέτες πάνε ανά ½ (π.χ. 3 ή 3,5).` });
    if (x.fromPallets > capacity + EPS) out.push({ level: 'error', tier: x.level, message: `Κλιμάκιο ${x.level}: ξεκινά από ${x.fromPallets} παλέτες αλλά το container χωρά ${capacity}.` });
    if (i > 0 && x.fromPallets <= t[i - 1].fromPallets + EPS) out.push({ level: 'error', tier: x.level, message: `Κλιμάκιο ${x.level}: πρέπει να ξεκινά μετά το προηγούμενο (${t[i - 1].fromPallets} παλέτες).` });
    // PRICEW01 είναι η ΜΕΓΑΛΥΤΕΡΗ τιμή· κάθε επόμενο κλιμάκιο ΦΘΗΝΟΤΕΡΟ.
    if (i > 0 && x.price >= t[i - 1].price - EPS) out.push({ level: 'error', tier: x.level, message: `PRICEW0${x.level}: πρέπει να είναι φθηνότερη από την PRICEW0${t[i - 1].level} (${t[i - 1].price}).` });
    if (x.level !== i + 1) out.push({ level: 'error', tier: x.level, message: `Τα κλιμάκια πάνε με τη σειρά: το ${i + 1}ο (από ${x.fromPallets} παλέτες) είναι η PRICEW0${i + 1}.` });
  });
  if (Math.abs(t[0].fromPallets - minOrder) > EPS) {
    out.push({ level: 'error', tier: t[0].level, message: `Το 1ο κλιμάκιο ξεκινά από την ελάχιστη παραγγελία (${minOrder} παλέτα).` });
  }
  const levels = t.map((x) => x.level);
  if (new Set(levels).size !== levels.length || levels.some((l) => l < 1 || l > MAX_TIERS)) {
    out.push({ level: 'error', message: 'Κάθε κλιμάκιο αντιστοιχεί σε μία από τις PRICEW01…PRICEW05.' });
  }
  return out;
}

/** Το κλιμάκιο που ισχύει με `filled` παλέτες (πριν από την 1η κράτηση: το 1ο). */
export function tierAt(tiers: Tier[], filled: number): Tier | null {
  const t = sortTiers(tiers);
  let cur: Tier | null = t[0] ?? null;
  for (const x of t) if (filled + EPS >= x.fromPallets) cur = x;
  return cur;
}

/** Το επόμενο κλιμάκιο και πόσες παλέτες λείπουν για να πέσει η τιμή. */
export function nextTier(tiers: Tier[], filled: number): { tier: Tier; missing: number } | null {
  // Μετά το ΤΡΕΧΟΝ κλιμάκιο: πριν από την 1η κράτηση ισχύει ήδη η PRICEW01 — «επόμενη» είναι η 02.
  const t = sortTiers(tiers);
  const floor = Math.max(filled, t[0]?.fromPallets ?? 0);
  const next = t.find((x) => x.fromPallets > floor + EPS);
  return next ? { tier: next, missing: roundStep(next.fromPallets - filled) } : null;
}

/** Τι ισχύει τώρα: γέμισμα, ελεύθερες θέσεις, τρέχουσα/επόμενη τιμή, όφελος από την αρχική. */
export function offerState(o: { tiers: Tier[]; sqmPerContainer: number; sqmPerPallet: number }, filled: number) {
  const capacity = capacityPallets(o.sqmPerContainer, o.sqmPerPallet);
  const current = tierAt(o.tiers, filled);
  const next = nextTier(o.tiers, filled);
  const first = sortTiers(o.tiers)[0] ?? null;
  return {
    capacity,
    filled,
    free: Math.max(0, roundStep(capacity - filled)),
    percent: capacity > 0 ? Math.min(100, (filled / capacity) * 100) : 0,
    full: capacity > 0 && filled + EPS >= capacity,
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
