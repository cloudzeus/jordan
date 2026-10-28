// lib/contracts/budget-sync.ts — μεταφορά BOM / προϋπολογισμού μιας σύμβασης στο έργο (ProjectBudgetLine).
// Γίνεται με την ενεργοποίηση και χειροκίνητα· αντικαθιστά ΜΟΝΟ τις γραμμές που είχαν έρθει από την ίδια σύμβαση,
// ώστε οι χειροκίνητες γραμμές του έργου να μένουν. Δεν γράφει τίποτα στο SoftOne (μόνο διαβάζει τιμές αγοράς).
import 'server-only';
import { prisma } from '@/lib/db';
import { lastPurchasePrices } from '@/lib/last-purchase-price';
import { getFloorPlan } from '@/lib/floorplan/plans';
import { planRooms } from '@/lib/floorplan/saved';
import { budgetDrafts } from './bom-core';
import { contractRef } from './core';

export type BudgetSyncResult = { created: number; replaced: number; skipped: string[] };

export async function syncProjectBudget(id: string, userId: string): Promise<BudgetSyncResult | null> {
  const c = await prisma.contract.findUnique({ where: { id }, include: { lines: { where: { inactive: false }, orderBy: { sortOrder: 'asc' } } } });
  if (!c?.prjc || c.stage === 'OFFER') return null;
  const plan = c.floorPlanId ? await getFloorPlan(c.floorPlanId).catch(() => null) : null;
  const rooms = plan ? planRooms(plan.data) : [];
  const mtrls = [...new Set(c.lines.filter((l) => l.kind === 'MATERIAL' && l.mtrl != null).map((l) => l.mtrl as number))];
  const last = await lastPurchasePrices(mtrls).catch((e) => { console.error('[contracts] budget prices', e); return new Map(); });
  const lastCost = new Map([...last.values()].map((p) => [p.mtrl, p.unitCost]));
  const { drafts, skipped } = budgetDrafts(
    c.lines.map((l) => ({ ...l, kind: l.kind === 'SERVICE' ? 'SERVICE' : 'MATERIAL' })),
    rooms, lastCost, `Από ${contractRef(c.number)}`,
  );
  // Η αλήθεια για υπηρεσία/είδος είναι το μητρώο (μια γραμμή μπορεί να έχει μπει με λάθος τύπο).
  const items = await prisma.softoneItem.findMany({ where: { mtrl: { in: drafts.map((d) => d.mtrl) } }, select: { mtrl: true, isService: true } });
  const svc = new Map(items.map((i) => [i.mtrl, i.isService]));
  const prjc = c.prjc;
  const [del] = await prisma.$transaction([
    prisma.projectBudgetLine.deleteMany({ where: { sourceContractId: id } }),
    prisma.projectBudgetLine.createMany({
      data: drafts.map((d) => ({ ...d, isService: svc.get(d.mtrl) ?? d.isService, prjc, sourceContractId: id, createdById: userId })),
    }),
  ]);
  return { created: drafts.length, replaced: del.count, skipped };
}

/** Πόσες γραμμές του προϋπολογισμού του έργου ήρθαν από τη σύμβαση (για την ένδειξη στη σελίδα). */
export async function budgetSyncState(id: string) {
  const agg = await prisma.projectBudgetLine.aggregate({ where: { sourceContractId: id }, _count: true, _max: { updatedAt: true } });
  return { lines: agg._count, at: agg._max.updatedAt?.toISOString() ?? null };
}
