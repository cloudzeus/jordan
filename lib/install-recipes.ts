import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { lastPurchasePrices } from '@/lib/last-purchase-price';
import { RECIPE_KINDS, recipeCost, type RecipeCost, type RecipeKind } from '@/lib/install-recipes-core';

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
  copiedFrom: { id: string; name: string } | null;
  updatedAt: string;
  lines: RecipeLineView[];
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
  lines: z.array(z.object({
    mtrl: z.number().int().positive(),
    qtyPerSqm: z.number().positive('Η ποσότητα ανά m² πρέπει να είναι μεγαλύτερη από 0').max(1e6),
    wastePct: pct.default(0),
    unitPrice: money.default(0),
    notes: z.string().trim().max(500).nullish().transform((v) => v || null),
  })).max(100, 'Έως 100 υλικά ανά συνταγή'),
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
  include: { lines: { orderBy: { sortOrder: 'asc' } } },
});

function toView(r: Row, names: Map<string, string>): RecipeView {
  const lines = r.lines.map((l) => ({
    id: l.id, mtrl: l.mtrl, code: l.code, name: l.name, unit: l.unit,
    qtyPerSqm: l.qtyPerSqm, wastePct: l.wastePct, unitPrice: l.unitPrice, notes: l.notes,
  }));
  return {
    id: r.id, name: r.name, kind: r.kind, description: r.description,
    mtrl: r.mtrl, mtrlCode: r.mtrlCode, mtrlName: r.mtrlName, mtrlUnit: r.mtrlUnit,
    materialPrice: r.materialPrice, wastePct: r.wastePct, laborCostPerSqm: r.laborCostPerSqm,
    copiedFrom: r.copiedFromId && names.has(r.copiedFromId) ? { id: r.copiedFromId, name: names.get(r.copiedFromId)! } : null,
    updatedAt: r.updatedAt.toISOString(),
    lines,
    cost: recipeCost({ materialPrice: r.materialPrice, wastePct: r.wastePct, laborCostPerSqm: r.laborCostPerSqm, lines }),
  };
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
  const items = await snapshotItems([...(input.mtrl ? [input.mtrl] : []), ...input.lines.map((l) => l.mtrl)]);
  const main = input.mtrl ? items.get(input.mtrl)! : null;
  if (main?.isService) throw new RecipeError('Το κύριο υλικό πρέπει να είναι είδος, όχι υπηρεσία');
  return {
    head: {
      name: input.name, kind: input.kind, description: input.description,
      mtrl: input.mtrl, mtrlCode: main?.code ?? null, mtrlName: main?.name ?? null, mtrlUnit: main?.unit ?? null,
      materialPrice: input.materialPrice, wastePct: input.wastePct, laborCostPerSqm: input.laborCostPerSqm,
    },
    lines: input.lines.map((l, i) => {
      const it = items.get(l.mtrl)!;
      return { mtrl: l.mtrl, code: it.code, name: it.name, unit: it.unit, qtyPerSqm: l.qtyPerSqm, wastePct: l.wastePct, unitPrice: l.unitPrice, notes: l.notes, sortOrder: i };
    }),
  };
}

export async function createRecipe(input: RecipeInput, userId: string | null) {
  const { head, lines } = await buildData(input);
  return prisma.installRecipe.create({ data: { ...head, createdById: userId, lines: { create: lines } }, select: { id: true, name: true } });
}

/** Πλήρης αντικατάσταση: κεφαλή + όλες οι γραμμές (η φόρμα στέλνει πάντα ολόκληρη τη συνταγή). */
export async function updateRecipe(id: string, input: RecipeInput) {
  if (!(await prisma.installRecipe.findUnique({ where: { id }, select: { id: true } }))) throw new RecipeError('Η συνταγή δεν βρέθηκε', 404);
  const { head, lines } = await buildData(input);
  return prisma.$transaction(async (tx) => {
    await tx.installRecipeLine.deleteMany({ where: { recipeId: id } });
    return tx.installRecipe.update({ where: { id }, data: { ...head, lines: { create: lines } }, select: { id: true, name: true } });
  });
}

export async function deleteRecipe(id: string) {
  if (!(await prisma.installRecipe.findUnique({ where: { id }, select: { id: true } }))) throw new RecipeError('Η συνταγή δεν βρέθηκε', 404);
  await prisma.installRecipe.delete({ where: { id } });
}

/**
 * Αντιγραφή για ομοειδές υλικό: ίδια κατηγορία, ίδια βοηθητικά υλικά, φύρες και εργατικά —
 * αλλάζει το όνομα και (προαιρετικά) το κύριο υλικό και η τιμή του.
 */
export async function copyRecipe(id: string, input: RecipeCopyInput, userId: string | null) {
  const src = await prisma.installRecipe.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
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
    lines: src.lines.map((l) => ({ mtrl: l.mtrl, qtyPerSqm: l.qtyPerSqm, wastePct: l.wastePct, unitPrice: l.unitPrice, notes: l.notes })),
  });
  return prisma.installRecipe.create({ data: { ...head, copiedFromId: src.id, createdById: userId, lines: { create: lines } }, select: { id: true, name: true } });
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
