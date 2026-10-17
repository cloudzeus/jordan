/**
 * Μονάδες μέτρησης ΕΝΟΣ είδους — οι κανόνες, κοινοί για φόρμα (client) και API (server).
 *
 * Το SoftOne έχει 4 θέσεις ανά είδος. ΚΑΘΕ «σχέση με κύρια» σημαίνει «πόσες ΒΑΣΙΚΕΣ χωρούν σε ΜΙΑ
 * από αυτή τη μονάδα». Επιβεβαιωμένο ζωντανά (atelier, 2026-10-17):
 *  - αγορών: QTY1 = QTY × MU31 (2 κιβώτια × 100 = 200 τεμάχια, παραστατικά αγορών)·
 *  - Μ.Μ.2: `calculate` με MU21 = 0,5 → 10 τεμάχια βασικής = 20 m² (QTY2 = QTY1 ÷ MU21).
 * Εδώ γίνονται τα περισσότερα λάθη: ο συντελεστής γράφεται ανάποδα (0,02 αντί 50) ή μένει 1 ενώ οι
 * μονάδες διαφέρουν. Η φόρμα το διατυπώνει πάντα ως «1 <μονάδα> = <σχέση> <βασική>».
 */

export type UnitSetup = {
  unit1: string | null;
  unit2: string | null; ratio2: number; strict2: boolean;
  unitBuy: string | null; buyRatio: number; buyStrict: boolean;
  unitSell: string | null; sellRatio: number; sellStrict: boolean;
};

export const UNIT_FIELDS = ['unit1', 'unit2', 'ratio2', 'strict2', 'unitBuy', 'buyRatio', 'buyStrict', 'unitSell', 'sellRatio', 'sellStrict'] as const;

export type UnitIssue = { level: 'error' | 'warn'; field: keyof UnitSetup; message: string };

/** Τι κάνει κάθε θέση — εμφανίζεται δίπλα στο πεδίο. */
export const UNIT_SLOT_HELP = {
  unit1: 'Σε αυτή κρατιέται η ΑΠΟΘΗΚΗ, το κόστος και οι τιμές. Όλες οι άλλες μονάδες μετατρέπονται σε αυτή. Δεν αλλάζει αφού το είδος αποκτήσει κινήσεις.',
  unit2: 'Δεύτερη ποσότητα που κρατιέται ΠΑΡΑΛΛΗΛΑ (π.χ. παλέτες δίπλα στα τ.μ.). Με «αυστηρή σχέση» υπολογίζεται πάντα από τη βασική· χωρίς, διορθώνεται στο παραστατικό όταν το περιεχόμενο αλλάζει.',
  unitBuy: 'Η μονάδα που προτείνεται στα παραστατικά ΑΓΟΡΩΝ (π.χ. container). Η ποσότητα μετατρέπεται σε βασική για την αποθήκη.',
  unitSell: 'Η μονάδα που προτείνεται στα παραστατικά ΠΩΛΗΣΗΣ και στην τιμολόγηση προς τον πελάτη.',
} as const;

const RATIO_OF = { unit2: 'ratio2', unitBuy: 'buyRatio', unitSell: 'sellRatio' } as const;
const SLOT_LABEL = { unit2: 'Μ.Μ.2', unitBuy: 'μονάδα αγορών', unitSell: 'μονάδα πώλησης' } as const;

/**
 * Έλεγχος ρύθμισης. `name(id)` δίνει την ονομασία για τα μηνύματα. Τα «error» μπλοκάρουν την
 * αποθήκευση· τα «warn» είναι ύποπτα αλλά επιτρεπτά (π.χ. «1 κιβώτιο = 1 τεμάχιο»).
 */
export function checkUnitSetup(s: UnitSetup, name: (id: string | null) => string = (id) => id ?? '—'): UnitIssue[] {
  const out: UnitIssue[] = [];
  if (!s.unit1) out.push({ level: 'error', field: 'unit1', message: 'Η βασική μονάδα είναι υποχρεωτική.' });

  for (const slot of ['unit2', 'unitBuy', 'unitSell'] as const) {
    const unit = s[slot];
    const ratioKey = RATIO_OF[slot];
    const ratio = s[ratioKey];
    if (!unit) {
      if (slot !== 'unit2') out.push({ level: 'warn', field: slot, message: `Χωρίς ${SLOT_LABEL[slot]}: τα παραστατικά θα προτείνουν τη βασική μονάδα.` });
      continue;
    }
    if (!Number.isFinite(ratio) || ratio <= 0) {
      out.push({ level: 'error', field: ratioKey, message: `Συμπλήρωσε πόσες ${name(s.unit1)} κάνει 1 ${name(unit)} (${SLOT_LABEL[slot]}) — πρέπει να είναι > 0.` });
      continue;
    }
    if (unit === s.unit1 && Math.abs(ratio - 1) > 1e-9) {
      out.push({ level: 'error', field: ratioKey, message: `Η ${SLOT_LABEL[slot]} είναι ίδια με τη βασική (${name(unit)}): η σχέση πρέπει να είναι 1, όχι ${ratio}.` });
    } else if (unit !== s.unit1 && Math.abs(ratio - 1) < 1e-9) {
      out.push({ level: 'warn', field: ratioKey, message: `1 ${name(unit)} = 1 ${name(s.unit1)}; Οι μονάδες διαφέρουν αλλά η σχέση είναι 1 — συνήθως σημαίνει ότι ξεχάστηκε ο συντελεστής.` });
    }
    if (slot === 'unit2' && unit === s.unit1) {
      out.push({ level: 'warn', field: 'unit2', message: 'Η Μ.Μ.2 είναι ίδια με τη βασική — δεν προσθέτει τίποτα· άφησέ την κενή.' });
    }
  }

  // Αγορά σε μεγάλη μονάδα που «χωράει» λιγότερο από μία παλέτα/Μ.Μ.2: σχεδόν πάντα αντεστραμμένος συντελεστής.
  if (s.unit2 && s.unitBuy && s.unitBuy !== s.unit1 && s.unitBuy !== s.unit2 && s.ratio2 > 0 && s.buyRatio > 0 && s.buyRatio < s.ratio2) {
    out.push({
      level: 'warn', field: 'buyRatio',
      message: `1 ${name(s.unitBuy)} (${s.buyRatio} ${name(s.unit1)}) χωράει λιγότερο από 1 ${name(s.unit2)} (${s.ratio2} ${name(s.unit1)}). Μήπως γράφτηκε ανάποδα;`,
    });
  }
  return out;
}

/** «1 Container = 1.040 τ.μ. = 20 Παλέτες» — η αλυσίδα σε ανθρώπινη μορφή. */
export function describeChain(s: UnitSetup, name: (id: string | null) => string): string[] {
  const fmt = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 4 });
  const lines: string[] = [];
  if (s.unitBuy && s.unitBuy !== s.unit1 && s.buyRatio > 0) {
    const pal = s.unit2 && s.ratio2 > 0 && s.unitBuy !== s.unit2 ? ` = ${fmt(s.buyRatio / s.ratio2)} ${name(s.unit2)}` : '';
    lines.push(`Αγορά: 2 ${name(s.unitBuy)} → μπαίνουν στην αποθήκη ${fmt(2 * s.buyRatio)} ${name(s.unit1)}${pal ? ` (1 ${name(s.unitBuy)}${pal})` : ''}.`);
  }
  if (s.unit2 && s.unit2 !== s.unit1 && s.ratio2 > 0) {
    lines.push(`Μ.Μ.2: 1 ${name(s.unit2)} = ${fmt(s.ratio2)} ${name(s.unit1)} · 100 ${name(s.unit1)} ≈ ${fmt(100 / s.ratio2)} ${name(s.unit2)}${s.strict2 ? '' : ' (μέσος όρος — διορθώνεται στο παραστατικό)'}.`);
  }
  if (s.unitSell && s.unitSell !== s.unit1 && s.sellRatio > 0) {
    lines.push(`Πώληση: 3 ${name(s.unitSell)} → φεύγουν από την αποθήκη ${fmt(3 * s.sellRatio)} ${name(s.unit1)}.`);
  } else if (s.unit1) {
    lines.push(`Πώληση και αποθήκη στην ίδια μονάδα (${name(s.unit1)}) — τιμή ανά ${name(s.unit1)}.`);
  }
  return lines;
}

/**
 * Πρότυπο «Container → Παλέτα → τ.μ.» (πέτρες, πλακάκια). Τα νούμερα τα δίνει ο χρήστης ΑΝΑ ΕΙΔΟΣ
 * — δεν εφαρμόζεται μαζικά. Ελεύθερη σχέση παλέτας (το περιεχόμενο αλλάζει από παλέτα σε παλέτα).
 */
export function containerPalletSqmPreset(ids: { sqm: string; pallet: string; container: string }, sqmPerPallet: number, palletsPerContainer: number): Partial<UnitSetup> {
  return {
    unit1: ids.sqm,
    unit2: ids.pallet, ratio2: sqmPerPallet, strict2: false,
    unitBuy: ids.container, buyRatio: Math.round(sqmPerPallet * palletsPerContainer * 10000) / 10000, buyStrict: true,
    unitSell: ids.sqm, sellRatio: 1, sellStrict: true,
  };
}
