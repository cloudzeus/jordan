import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { lastPurchasePrices } from '@/lib/last-purchase-price';
import { RECIPE_KINDS, recipeCost, recipeForArea, sumRecipeCosts, type RecipeCost, type RecipeKind } from '@/lib/install-recipes-core';

export class RecipeError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export type RecipeLineView = {
  id: string; mtrl: number; code: string; name: string; unit: string | null;
  qtyPerSqm: number; wastePct: number; unitPrice: number; notes: string | null;
};

export type RecipeView = {
  id: string;
  name: string;
  kind: RecipeKind;
  description: string | null;
  mtrl: number | null;
  mtrlCode: string | null;
  mtrlName: string | null;
  mtrlUnit: string | null;
  materialPrice: number;
  wastePct: number;
  laborCostPerSqm: number;
  /** Υπηρεσία με την οποία μπαίνουν τα εργατικά στον προϋπολογισμό έργου. */
  labor: { mtrl: number; code: string; name: string } | null;
  copiedFrom: { id: string; name: string } | null;
  updatedAt: string;
  lines: RecipeLineView[];
  /** Στάδια σύνθετης συνταγής (υποσυνταγές-αναφορές) στη σειρά τους· κενό = απλή συνταγή. */
  components: RecipeView[];
  cost: RecipeCost;
};

const pct = z.number().min(0, 'Η φύρα δεν μπορεί να είναι αρνητική').max(100, 'Η φύρα δεν μπορεί να ξεπερνά το 100%');
const money = z.number().min(0, 'Τα ποσά δεν μπορεί να είναι αρνητικά').max(1e7);

export const recipeInput = z.object({
  name: z.string().trim().min(1, 'Δώστε όνομα συνταγής').max(160),
  kind: z.enum(RECIPE_KINDS),
  description: z.string().trim().max(2000).nullish().transform((v) => v || null),
  mtrl: z.number().int().positive().nullish().transform((v) => v ?? null),
  materialPrice: money.default(0),
  wastePct: pct.default(0),
  laborCostPerSqm: money.default(0),
  laborMtrl: z.number().int().positive().nullish().transform((v) => v ?? null),
  lines: z.array(z.object({
    mtrl: z.number().int().positive(),
    qtyPerSqm: z.number().positive('Η ποσότητα ανά m² πρέπει να είναι μεγαλύτερη από 0').max(1e6),
    wastePct: pct.default(0),
    unitPrice: money.default(0),
    notes: z.string().trim().max(500).nullish().transform((v) => v || null),
  })).max(100, 'Έως 100 υλικά ανά συνταγή'),
  // Σύνθετη συνταγή: στάδια-αναφορές σε άλλες (απλές) συνταγές, στη σειρά 1..6.
  components: z.array(z.object({ childId: z.string().min(1) })).max(6, 'Έως 6 στάδια ανά σύνθετη συνταγή').default([]),
});
export type RecipeInput = z.infer<typeof recipeInput>;

export const recipeCopyInput = z.object({
  name: z.string().trim().min(1, 'Δώστε όνομα συνταγής').max(160),
  mtrl: z.number().int().positive().nullish().transform((v) => v ?? null),
  materialPrice: money.optional(),
});
export type RecipeCopyInput = z.infer<typeof recipeCopyInput>;

type Row = Awaited<ReturnType<typeof loadRows>>[number];

const loadRows = (where: { id?: string } = {}) => prisma.installRecipe.findMany({
  where,
  orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  include: {
    lines: { orderBy: { sortOrder: 'asc' } },
    // Τα στάδια με την πλήρη (απλή) υποσυνταγή τους — τα παιδιά είναι πάντα απλά (δεν φωλιάζουν άλλα).
    components: { orderBy: { sortOrder: 'asc' }, include: { child: { include: { lines: { orderBy: { sortOrder: 'asc' } } } } } },
  },
});

/** Κοινό χτίσιμο view από οποιαδήποτε εγγραφή συνταγής (με τις γραμμές της), με έτοιμα τα στάδια. */
function viewOf(
  r: { id: string; name: string; kind: RecipeKind; description: string | null; mtrl: number | null; mtrlCode: string | null; mtrlName: string | null; mtrlUnit: string | null; materialPrice: number; wastePct: number; laborCostPerSqm: number; laborMtrl: number | null; laborCode: string | null; laborName: string | null; copiedFromId: string | null; updatedAt: Date; lines: Row['lines'] },
  names: Map<string, string>,
  components: RecipeView[],
): RecipeView {
  const lines = r.lines.map((l) => ({
    id: l.id, mtrl: l.mtrl, code: l.code, name: l.name, unit: l.unit,
    qtyPerSqm: l.qtyPerSqm, wastePct: l.wastePct, unitPrice: l.unitPrice, notes: l.notes,
  }));
  const own = recipeCost({ materialPrice: r.materialPrice, wastePct: r.wastePct, laborCostPerSqm: r.laborCostPerSqm, lines });
  return {
    id: r.id, name: r.name, kind: r.kind, description: r.description,
    mtrl: r.mtrl, mtrlCode: r.mtrlCode, mtrlName: r.mtrlName, mtrlUnit: r.mtrlUnit,
    materialPrice: r.materialPrice, wastePct: r.wastePct, laborCostPerSqm: r.laborCostPerSqm,
    labor: r.laborMtrl ? { mtrl: r.laborMtrl, code: r.laborCode ?? '', name: r.laborName ?? '' } : null,
    copiedFrom: r.copiedFromId && names.has(r.copiedFromId) ? { id: r.copiedFromId, name: names.get(r.copiedFromId)! } : null,
    updatedAt: r.updatedAt.toISOString(),
    lines,
    components,
    // Σύνθετη: κόστος = δικό της (0 στην καθαρή σύνθεση) + άθροισμα σταδίων.
    cost: components.length ? sumRecipeCosts([own, ...components.map((c) => c.cost)]) : own,
  };
}

function toView(r: Row, names: Map<string, string>): RecipeView {
  const components = r.components.map((c) => viewOf(c.child, names, []));
  return viewOf(r, names, components);
}

export async function listRecipes(): Promise<RecipeView[]> {
  const rows = await loadRows();
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return rows.map((r) => toView(r, names));
}

export async function getRecipe(id: string): Promise<RecipeView | null> {
  const [r] = await loadRows({ id });
  if (!r) return null;
  const src = r.copiedFromId ? await prisma.installRecipe.findUnique({ where: { id: r.copiedFromId }, select: { id: true, name: true } }) : null;
  return toView(r, new Map(src ? [[src.id, src.name]] : []));
}

/**
 * Στιγμιότυπο ειδών από τον καθρέφτη: κωδικός, όνομα, μονάδα (όνομα MTRUNIT). Τα στοιχεία
 * ΔΕΝ έρχονται από τον client. Ό,τι λείπει από τον καθρέφτη απορρίπτεται.
 */
async function snapshotItems(mtrls: number[]) {
  const ids = [...new Set(mtrls)];
  if (!ids.length) return new Map<number, { code: string; name: string; unit: string | null; isService: boolean }>();
  const items = await prisma.softoneItem.findMany({ where: { mtrl: { in: ids } }, select: { mtrl: true, code: true, name: true, unit1: true, isService: true } });
  const unitCodes = [...new Set(items.map((i) => i.unit1).filter((u): u is string => !!u))];
  const units = unitCodes.length
    ? new Map((await prisma.softoneLookup.findMany({ where: { kind: 'MTRUNIT', code: { in: unitCodes } }, select: { code: true, name: true } })).map((u) => [u.code, u.name]))
    : new Map<string, string>();
  const out = new Map(items.map((i) => [i.mtrl, { code: i.code, name: i.name, unit: i.unit1 ? units.get(i.unit1) ?? null : null, isService: i.isService }]));
  const missing = ids.filter((id) => !out.has(id));
  if (missing.length) throw new RecipeError('Κάποιο είδος δεν βρέθηκε στο μητρώο — κάντε συγχρονισμό ειδών από το SoftOne');
  return out;
}

async function buildData(input: RecipeInput) {
  const items = await snapshotItems([
    ...(input.mtrl ? [input.mtrl] : []), ...(input.laborMtrl ? [input.laborMtrl] : []), ...input.lines.map((l) => l.mtrl),
  ]);
  const main = input.mtrl ? items.get(input.mtrl)! : null;
  if (main?.isService) throw new RecipeError('Το κύριο υλικό πρέπει να είναι είδος, όχι υπηρεσία');
  const labor = input.laborMtrl ? items.get(input.laborMtrl)! : null;
  if (labor && !labor.isService) throw new RecipeError('Τα εργατικά συνδέονται με υπηρεσία, όχι με είδος');
  return {
    head: {
      name: input.name, kind: input.kind, description: input.description,
      mtrl: input.mtrl, mtrlCode: main?.code ?? null, mtrlName: main?.name ?? null, mtrlUnit: main?.unit ?? null,
      materialPrice: input.materialPrice, wastePct: input.wastePct, laborCostPerSqm: input.laborCostPerSqm,
      laborMtrl: input.laborMtrl, laborCode: labor?.code ?? null, laborName: labor?.name ?? null,
    },
    lines: input.lines.map((l, i) => {
      const it = items.get(l.mtrl)!;
      return { mtrl: l.mtrl, code: it.code, name: it.name, unit: it.unit, qtyPerSqm: l.qtyPerSqm, wastePct: l.wastePct, unitPrice: l.unitPrice, notes: l.notes, sortOrder: i };
    }),
  };
}

/**
 * Έλεγχος και σειρά των σταδίων σύνθετης συνταγής. Τα στάδια είναι ΑΝΑΦΟΡΕΣ σε ΑΠΛΕΣ συνταγές:
 * όχι διπλά, όχι ο εαυτός της, όχι άλλη σύνθετη (κρατάμε τη λίστα επίπεδη 1..6).
 */
async function buildComponents(specs: { childId: string }[], selfId: string | null): Promise<{ childId: string; sortOrder: number }[]> {
  if (!specs.length) return [];
  const ids = specs.map((s) => s.childId);
  const uniq = new Set(ids);
  if (uniq.size !== ids.length) throw new RecipeError('Μια υποσυνταγή μπήκε δύο φορές στα στάδια');
  if (selfId && uniq.has(selfId)) throw new RecipeError('Η συνταγή δεν μπορεί να περιέχει τον εαυτό της');
  const children = await prisma.installRecipe.findMany({ where: { id: { in: [...uniq] } }, select: { id: true, _count: { select: { components: true } } } });
  const byId = new Map(children.map((c) => [c.id, c]));
  for (const id of uniq) {
    const c = byId.get(id);
    if (!c) throw new RecipeError('Μια υποσυνταγή (στάδιο) δεν βρέθηκε — ανανεώστε τη λίστα');
    if (c._count.components > 0) throw new RecipeError('Ως στάδιο μπαίνει μόνο ΑΠΛΗ συνταγή — όχι άλλη σύνθετη');
  }
  return specs.map((s, i) => ({ childId: s.childId, sortOrder: i }));
}

export async function createRecipe(input: RecipeInput, userId: string | null) {
  const { head, lines } = await buildData(input);
  const comps = await buildComponents(input.components, null);
  return prisma.$transaction(async (tx) => {
    const r = await tx.installRecipe.create({ data: { ...head, createdById: userId, lines: { create: lines } }, select: { id: true, name: true } });
    if (comps.length) await tx.installRecipeComponent.createMany({ data: comps.map((c) => ({ parentId: r.id, childId: c.childId, sortOrder: c.sortOrder })) });
    return r;
  });
}

/** Πλήρης αντικατάσταση: κεφαλή + όλες οι γραμμές + στάδια (η φόρμα στέλνει πάντα ολόκληρη τη συνταγή). */
export async function updateRecipe(id: string, input: RecipeInput) {
  if (!(await prisma.installRecipe.findUnique({ where: { id }, select: { id: true } }))) throw new RecipeError('Η συνταγή δεν βρέθηκε', 404);
  const { head, lines } = await buildData(input);
  const comps = await buildComponents(input.components, id);
  return prisma.$transaction(async (tx) => {
    await tx.installRecipeLine.deleteMany({ where: { recipeId: id } });
    await tx.installRecipeComponent.deleteMany({ where: { parentId: id } });
    const r = await tx.installRecipe.update({ where: { id }, data: { ...head, lines: { create: lines } }, select: { id: true, name: true } });
    if (comps.length) await tx.installRecipeComponent.createMany({ data: comps.map((c) => ({ parentId: id, childId: c.childId, sortOrder: c.sortOrder })) });
    return r;
  });
}

export async function deleteRecipe(id: string) {
  const r = await prisma.installRecipe.findUnique({ where: { id }, select: { id: true, _count: { select: { usedIn: true } } } });
  if (!r) throw new RecipeError('Η συνταγή δεν βρέθηκε', 404);
  // RESTRICT στο childId: μια συνταγή-στάδιο δεν σβήνεται όσο μια σύνθετη τη χρησιμοποιεί.
  if (r._count.usedIn > 0) throw new RecipeError('Η συνταγή χρησιμοποιείται ως στάδιο σε σύνθετη συνταγή — αφαιρέστε τη από εκεί πρώτα');
  await prisma.installRecipe.delete({ where: { id } });
}

/**
 * Αντιγραφή για ομοειδές υλικό: ίδια κατηγορία, ίδια βοηθητικά υλικά, φύρες και εργατικά —
 * αλλάζει το όνομα και (προαιρετικά) το κύριο υλικό και η τιμή του.
 */
export async function copyRecipe(id: string, input: RecipeCopyInput, userId: string | null) {
  const src = await prisma.installRecipe.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: 'asc' } }, components: { orderBy: { sortOrder: 'asc' }, select: { childId: true } } },
  });
  if (!src) throw new RecipeError('Η συνταγή-πηγή δεν βρέθηκε', 404);
  const sameMaterial = input.mtrl == null || input.mtrl === src.mtrl;
  const { head, lines } = await buildData({
    name: input.name,
    kind: src.kind,
    description: src.description,
    mtrl: input.mtrl ?? src.mtrl,
    materialPrice: input.materialPrice ?? (sameMaterial ? src.materialPrice : 0),
    wastePct: src.wastePct,
    laborCostPerSqm: src.laborCostPerSqm,
    laborMtrl: src.laborMtrl,
    lines: src.lines.map((l) => ({ mtrl: l.mtrl, qtyPerSqm: l.qtyPerSqm, wastePct: l.wastePct, unitPrice: l.unitPrice, notes: l.notes })),
    components: [],
  });
  // Σύνθετη πηγή → το αντίγραφο κρατά τα ίδια στάδια (ίδιες αναφορές, ίδια σειρά).
  const comps = src.components.map((c, i) => ({ childId: c.childId, sortOrder: i }));
  return prisma.$transaction(async (tx) => {
    const r = await tx.installRecipe.create({ data: { ...head, copiedFromId: src.id, createdById: userId, lines: { create: lines } }, select: { id: true, name: true } });
    if (comps.length) await tx.installRecipeComponent.createMany({ data: comps.map((c) => ({ parentId: r.id, childId: c.childId, sortOrder: c.sortOrder })) });
    return r;
  });
}

export type RecipeItemInfo = { unit: string | null; lastPurchase: { unitCost: number; date: string; fincode: string } | null };

/** Μονάδα (MTRUNIT) και τελευταία τιμή αγοράς ανά είδος — για την προσυμπλήρωση της φόρμας. */
export async function recipeItemInfo(mtrls: number[]): Promise<Record<number, RecipeItemInfo>> {
  const items = await snapshotItems(mtrls).catch(() => new Map<number, { unit: string | null }>());
  const lp = await lastPurchasePrices([...items.keys()]).catch(() => new Map());
  const out: Record<number, RecipeItemInfo> = {};
  for (const [mtrl, it] of items) {
    const l = lp.get(mtrl);
    out[mtrl] = { unit: it.unit, lastPurchase: l ? { unitCost: l.unitCost, date: l.date, fincode: l.fincode } : null };
  }
  return out;
}

export const applyRecipeInput = z.object({
  recipeId: z.string().min(1, 'Διαλέξτε συνταγή'),
  sqm: z.number().positive('Τα τετραγωνικά πρέπει να είναι περισσότερα από 0').max(1e6),
  /** Υπηρεσία για τα εργατικά — αν λείπει, χρησιμοποιείται της συνταγής· null = χωρίς εργατικά. */
  laborMtrl: z.number().int().positive().nullish(),
});
export type ApplyRecipeInput = z.infer<typeof applyRecipeInput>;

/**
 * Συνταγή → γραμμές προϋπολογισμού έργου για Χ m²: κύριο υλικό (m² με φύρα), βοηθητικά υλικά
 * (ποσότητα/m² × m² με φύρα) και εργατικά ως υπηρεσία (m² × εργατικά/m²). Όλες οι γραμμές
 * γράφονται μαζί (ή καμία) και η σημείωση δείχνει από ποια συνταγή ήρθαν.
 */
export async function applyRecipeToBudget(prjc: number, input: ApplyRecipeInput, userId: string | null) {
  const project = await prisma.softoneProject.findUnique({ where: { prjc }, select: { prjc: true } });
  if (!project) throw new RecipeError('Το έργο δεν υπάρχει', 404);
  const parent = await prisma.installRecipe.findUnique({
    where: { id: input.recipeId },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      components: { orderBy: { sortOrder: 'asc' }, include: { child: { include: { lines: { orderBy: { sortOrder: 'asc' } } } } } },
    },
  });
  if (!parent) throw new RecipeError('Η συνταγή δεν βρέθηκε', 404);

  const isComposite = parent.components.length > 0;
  // Στόχοι: σύνθετη → κάθε στάδιο (απλή υποσυνταγή) στα ίδια m². Το override υπηρεσίας εργατικών
  // αφορά μόνο απλή συνταγή· κάθε στάδιο κρατά τη δική του υπηρεσία.
  const targets = isComposite
    ? parent.components.map((c) => ({ r: c.child, laborMtrl: c.child.laborMtrl }))
    : [{ r: parent, laborMtrl: input.laborMtrl === undefined ? parent.laborMtrl : input.laborMtrl }];

  const items = await snapshotItems(targets.flatMap((t) => [...(t.r.mtrl ? [t.r.mtrl] : []), ...(t.laborMtrl ? [t.laborMtrl] : []), ...t.r.lines.map((l) => l.mtrl)]));
  for (const t of targets) {
    if (t.laborMtrl && !items.get(t.laborMtrl)!.isService) throw new RecipeError('Τα εργατικά μπαίνουν στον προϋπολογισμό ως υπηρεσία — διαλέξτε υπηρεσία');
  }

  const sqmStr = input.sqm.toLocaleString('el-GR', { maximumFractionDigits: 2 });
  const row = (mtrl: number, qty: number, unitPrice: number, notes: string) => {
    const it = items.get(mtrl)!;
    return { prjc, mtrl, code: it.code, name: it.name, isService: it.isService, unit: it.unit, qty, unitPrice, notes, createdById: userId };
  };
  const data = targets.flatMap((t) => {
    const calc = recipeForArea({ ...t.r, lines: t.r.lines }, input.sqm);
    const note = isComposite ? `Συνταγή «${parent.name}» · στάδιο «${t.r.name}» · ${sqmStr} m²` : `Συνταγή «${parent.name}» · ${sqmStr} m²`;
    return [
      ...(t.r.mtrl ? [row(t.r.mtrl, calc.rows[0].qty, t.r.materialPrice, note)] : []),
      ...t.r.lines.map((l, i) => row(l.mtrl, calc.rows[i + 1].qty, l.unitPrice, note)),
      ...(t.laborMtrl && t.r.laborCostPerSqm > 0 ? [row(t.laborMtrl, input.sqm, t.r.laborCostPerSqm, note)] : []),
    ];
  }).filter((d) => d.qty > 0);
  if (!data.length) throw new RecipeError('Η συνταγή δεν έχει υλικά ή εργατικά για να μπουν στον προϋπολογισμό');

  await prisma.projectBudgetLine.createMany({ data });
  return { recipe: { id: parent.id, name: parent.name }, lines: data.length, value: data.reduce((s, d) => s + d.qty * d.unitPrice, 0) };
}
