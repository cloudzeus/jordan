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
