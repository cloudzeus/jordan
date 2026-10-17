import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { lastPurchasePrices } from '@/lib/last-purchase-price';

/** Γραμμή προϋπολογισμού έργου όπως τη βλέπει το UI. */
export type BudgetLine = {
  id: string;
  mtrl: number;
  code: string;
  name: string;
  isService: boolean;
  unit: string | null;
  qty: number;
  unitPrice: number;
  value: number;
  notes: string | null;
  createdAt: string;
  /** Τελευταία τιμή αγοράς από τα παραστατικά αγορών του SoftOne (null αν δεν αγοράστηκε ποτέ). */
  lastPurchase: { unitCost: number; date: string; fincode: string } | null;
};

export const budgetLineInput = z.object({
  mtrl: z.number().int().positive(),
  qty: z.number().positive('Η ποσότητα πρέπει να είναι μεγαλύτερη από 0').max(1e9),
  unitPrice: z.number().min(0, 'Η τιμή δεν μπορεί να είναι αρνητική').max(1e9).default(0),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type BudgetLineInput = z.infer<typeof budgetLineInput>;

export class BudgetError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const toLine = (r: {
  id: string; mtrl: number; code: string; name: string; isService: boolean; unit: string | null;
  qty: number; unitPrice: number; notes: string | null; createdAt: Date;
}): BudgetLine => ({
  id: r.id, mtrl: r.mtrl, code: r.code, name: r.name, isService: r.isService, unit: r.unit,
  qty: r.qty, unitPrice: r.unitPrice, value: r.qty * r.unitPrice, notes: r.notes,
  createdAt: r.createdAt.toISOString(), lastPurchase: null,
});

export async function listBudget(prjc: number): Promise<BudgetLine[]> {
  const rows = await prisma.projectBudgetLine.findMany({ where: { prjc }, orderBy: { createdAt: 'asc' } });
  const lp = await lastPurchasePrices(rows.map((r) => r.mtrl)).catch(() => new Map());
  return rows.map((r) => {
    const l = lp.get(r.mtrl);
    return { ...toLine(r), lastPurchase: l ? { unitCost: l.unitCost, date: l.date, fincode: l.fincode } : null };
  });
}

/**
 * Νέα γραμμή προϋπολογισμού. Το είδος ΠΡΕΠΕΙ να υπάρχει στον καθρέφτη ειδών (`SoftoneItem`):
 * κωδικός, όνομα, τύπος και μονάδα παίρνονται από εκεί ως στιγμιότυπο — όχι από τον client.
 */
export async function addBudgetLine(prjc: number, input: BudgetLineInput, userId: string | null): Promise<BudgetLine> {
  const project = await prisma.softoneProject.findUnique({ where: { prjc }, select: { prjc: true } });
  if (!project) throw new BudgetError('Το έργο δεν υπάρχει', 404);

  const item = await prisma.softoneItem.findUnique({
    where: { mtrl: input.mtrl },
    select: { mtrl: true, code: true, name: true, isService: true, unit1: true },
  });
  if (!item) throw new BudgetError('Το είδος δεν βρέθηκε στο μητρώο — κάνε συγχρονισμό ειδών από το SoftOne');

  const unit = item.unit1
    ? (await prisma.softoneLookup.findUnique({ where: { kind_code: { kind: 'MTRUNIT', code: item.unit1 } }, select: { name: true } }))?.name ?? null
    : null;

  const row = await prisma.projectBudgetLine.create({
    data: {
      prjc, mtrl: item.mtrl, code: item.code, name: item.name, isService: item.isService, unit,
      qty: input.qty, unitPrice: input.unitPrice, notes: input.notes || null, createdById: userId,
    },
  });
  return toLine(row);
}

export async function deleteBudgetLine(prjc: number, id: string): Promise<BudgetLine> {
  const row = await prisma.projectBudgetLine.findUnique({ where: { id } });
  if (!row || row.prjc !== prjc) throw new BudgetError('Η γραμμή δεν βρέθηκε', 404);
  await prisma.projectBudgetLine.delete({ where: { id } });
  return toLine(row);
}
