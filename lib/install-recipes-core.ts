// Συνταγές τοποθέτησης — καθαρή λογική (χωρίς βάση), κοινή για server και client.
// Όλα τα ποσά είναι ΑΝΑ ΤΕΤΡΑΓΩΝΙΚΟ· η φύρα προσαυξάνει την ποσότητα: ποσ. × (1 + φύρα/100).

export const RECIPE_KINDS = ['TILE', 'STONE', 'CEMENT_MORTAR'] as const;
export type RecipeKind = (typeof RECIPE_KINDS)[number];

export const RECIPE_KIND_META: Record<RecipeKind, { label: string; plural: string; color: string }> = {
  TILE: { label: 'Πλακάκι', plural: 'Πλακάκια', color: '#0E7490' },
  STONE: { label: 'Πέτρα', plural: 'Πέτρες', color: '#92400E' },
  CEMENT_MORTAR: { label: 'Τσιμεντοκονία', plural: 'Τσιμεντοκονίες', color: '#4B5563' },
};

export type RecipeLineCalcInput = { qtyPerSqm: number; wastePct: number; unitPrice: number };
export type RecipeCalcInput = {
  materialPrice: number;
  wastePct: number;
  laborCostPerSqm: number;
  lines: RecipeLineCalcInput[];
};

export type RecipeCost = {
  /** Κύριο υλικό ανά m² (με φύρα). */
  material: number;
  /** Βοηθητικά υλικά ανά m² (με φύρα). */
  accessories: number;
  labor: number;
  /** Σύνολο ανά m². */
  total: number;
};

const round = (n: number, d = 4) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** Πολλαπλασιαστής φύρας: 10 → 1,10. */
export const wasteFactor = (pct: number) => 1 + (Number.isFinite(pct) ? pct : 0) / 100;

/** Ποσότητα γραμμής ανά m² μαζί με τη φύρα. */
export const lineQtyWithWaste = (l: Pick<RecipeLineCalcInput, 'qtyPerSqm' | 'wastePct'>) => round(l.qtyPerSqm * wasteFactor(l.wastePct));

/** Κόστος γραμμής ανά m² (με φύρα). */
export const lineCostPerSqm = (l: RecipeLineCalcInput) => round(l.qtyPerSqm * wasteFactor(l.wastePct) * l.unitPrice);

export function recipeCost(r: RecipeCalcInput): RecipeCost {
  const material = round(r.materialPrice * wasteFactor(r.wastePct));
  const accessories = round(r.lines.reduce((s, l) => s + lineCostPerSqm(l), 0));
  const labor = round(r.laborCostPerSqm);
  return { material, accessories, labor, total: round(material + accessories + labor) };
}

export type RecipeQuantity = { key: string; name: string; unit: string | null; qty: number; cost: number };

/**
 * Ποσότητες και κόστος για συγκεκριμένα τετραγωνικά: πόσο κύριο υλικό (m², με φύρα), πόσα από
 * κάθε βοηθητικό και πόσο εργατικό. Για προσφορές και παραγγελίες υλικών.
 */
export function recipeForArea(
  r: Omit<RecipeCalcInput, 'lines'> & { mtrlName?: string | null; lines: (RecipeLineCalcInput & { name: string; unit: string | null })[] },
  sqm: number,
): { rows: RecipeQuantity[]; labor: number; total: number } {
  const area = Number.isFinite(sqm) && sqm > 0 ? sqm : 0;
  const rows: RecipeQuantity[] = [];
  const mainQty = round(area * wasteFactor(r.wastePct), 3);
  rows.push({ key: 'main', name: r.mtrlName || 'Κύριο υλικό', unit: 'm²', qty: mainQty, cost: round(mainQty * r.materialPrice, 2) });
  r.lines.forEach((l, i) => {
    const qty = round(area * l.qtyPerSqm * wasteFactor(l.wastePct), 3);
    rows.push({ key: `l${i}`, name: l.name, unit: l.unit, qty, cost: round(qty * l.unitPrice, 2) });
  });
  const labor = round(area * r.laborCostPerSqm, 2);
  return { rows, labor, total: round(rows.reduce((s, x) => s + x.cost, 0) + labor, 2) };
}

/** «1.234,5» ή «1234.5» → 1234.5 · κενό/άκυρο → NaN. */
export function parseDecimal(v: string): number {
  const s = v.trim().replace(/\s/g, '');
  if (!s) return NaN;
  const normalised = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return Number(normalised);
}

/** Αριθμός σε ελληνική μορφή για πεδίο φόρμας (χωρίς διαχωριστικό χιλιάδων). */
export const toInput = (n: number, digits = 4) => (Number.isFinite(n) && n !== 0 ? n.toLocaleString('el-GR', { maximumFractionDigits: digits, useGrouping: false }) : '');

export type OfferLineMode = 'detailed' | 'bundled';
export type RecipeForOffer = Omit<RecipeCalcInput, 'lines'> & {
  name: string;
  kind: RecipeKind;
  mtrl: number | null;
  mtrlCode: string | null;
  mtrlName: string | null;
  labor: { mtrl: number; code: string; name: string } | null;
  lines: (RecipeLineCalcInput & { mtrl: number; code: string; name: string; unit: string | null })[];
};
export type OfferLine = {
  kind: 'MATERIAL' | 'SERVICE'; mtrl: number | null; code: string | null; name: string; unit: string | null;
  qty: number; unitPrice: number; notes: string | null;
};

/**
 * Συνταγή → γραμμές προσφοράς/σύμβασης για Χ m². Οι τιμές της συνταγής είναι ΚΟΣΤΟΣ, οπότε
 * προσαυξάνονται με το περιθώριο (%) για τον πελάτη.
 *  • detailed: κύριο υλικό (m² με φύρα), κάθε βοηθητικό υλικό, εργασία (m²) ως υπηρεσία.
 *  • bundled:  μία γραμμή «Προμήθεια & τοποθέτηση» σε m² με το συνολικό κόστος/m².
 */
export function recipeToOfferLines(r: RecipeForOffer, sqm: number, opts: { markupPct: number; mode: OfferLineMode }): OfferLine[] {
  if (!(Number.isFinite(sqm) && sqm > 0)) return [];
  const k = wasteFactor(Number.isFinite(opts.markupPct) && opts.markupPct > 0 ? opts.markupPct : 0);
  const price = (p: number) => round(p * k, 2);
  const area = round(sqm, 3);

  if (opts.mode === 'bundled') {
    const perSqm = recipeCost(r).total;
    if (perSqm <= 0) return [];
    // Η σημείωση τυπώνεται στο έγγραφο του πελάτη: τι περιλαμβάνει η τιμή/m² (χωρίς εσωτερικά ονόματα συνταγών).
    const parts = [r.mtrl || r.materialPrice > 0 ? r.mtrlName || RECIPE_KIND_META[r.kind].label.toLowerCase() : null, ...r.lines.map((l) => l.name), r.laborCostPerSqm > 0 ? 'εργασία τοποθέτησης' : null];
    const notes = `Περιλαμβάνει: ${parts.filter(Boolean).join(', ')}`;
    return [{ kind: 'SERVICE', mtrl: null, code: null, name: `Προμήθεια & τοποθέτηση — ${r.mtrlName || r.name}`, unit: 'm²', qty: area, unitPrice: price(perSqm), notes }];
  }

  const calc = recipeForArea(r, sqm);
  const out: OfferLine[] = [];
  if (r.mtrl || r.materialPrice > 0) {
    out.push({
      kind: 'MATERIAL', mtrl: r.mtrl, code: r.mtrlCode, name: r.mtrlName || `${RECIPE_KIND_META[r.kind].label} (κύριο υλικό)`,
      unit: 'm²', qty: calc.rows[0].qty, unitPrice: price(r.materialPrice), notes: null,
    });
  }
  r.lines.forEach((l, i) => {
    out.push({ kind: 'MATERIAL', mtrl: l.mtrl, code: l.code, name: l.name, unit: l.unit, qty: calc.rows[i + 1].qty, unitPrice: price(l.unitPrice), notes: null });
  });
  if (r.laborCostPerSqm > 0) {
    out.push({
      kind: 'SERVICE', mtrl: r.labor?.mtrl ?? null, code: r.labor?.code ?? null, name: r.labor?.name || `Εργασία τοποθέτησης — ${r.mtrlName || RECIPE_KIND_META[r.kind].label.toLowerCase()}`,
      unit: 'm²', qty: area, unitPrice: price(r.laborCostPerSqm), notes: null,
    });
  }
  return out.filter((l) => l.qty > 0);
}
