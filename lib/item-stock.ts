import 'server-only';
import { prisma } from '@/lib/db';
import { softoneFetchStock } from '@/lib/softone';

export type WarehouseStock = { whouse: string; name: string; qty: number };
export type ItemStock = { mtrl: number; unit: string | null; total: number; warehouses: WarehouseStock[]; fiscPrd: number | null; syncedAt: string | null; live: boolean };

/** Οι αποθήκες της εγκατάστασης (SoftoneLookup kind WHOUSE), με τη σειρά του συγχρονισμού. */
export async function warehouses(): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.softoneLookup.findMany({ where: { kind: 'WHOUSE' }, orderBy: { order: 'asc' }, select: { code: true, name: true } });
  return rows.map((r) => ({ id: r.code, name: r.name }));
}

/** MTRL → { αποθήκη → ποσότητα } για όλη τη λίστα ειδών (ένα query). */
export async function stockByItem(): Promise<Map<number, Record<string, number>>> {
  const rows = await prisma.softoneStock.findMany({ select: { mtrl: true, whouse: true, qty: true } });
  const out = new Map<number, Record<string, number>>();
  for (const r of rows) {
    const m = out.get(r.mtrl) ?? {};
    m[r.whouse] = r.qty;
    out.set(r.mtrl, m);
  }
  return out;
}

export type StockSummary = { qty: number; unit: string | null; syncedAt: string | null };

/**
 * Σύνολο αποθέματος (όλες οι αποθήκες, καθρέφτης τελευταίου συγχρονισμού) για πολλά είδη μαζί —
 * για τις ενδείξεις «επαρκεί / λείπουν» στις γραμμές προσφοράς και στις συνταγές.
 */
export async function stockSummary(mtrls: number[]): Promise<Record<number, StockSummary>> {
  const ids = [...new Set(mtrls.filter((m) => Number.isInteger(m) && m > 0))].slice(0, 500);
  if (!ids.length) return {};
  const [rows, items] = await Promise.all([
    prisma.softoneStock.groupBy({ by: ['mtrl'], where: { mtrl: { in: ids } }, _sum: { qty: true }, _max: { syncedAt: true } }),
    prisma.softoneItem.findMany({ where: { mtrl: { in: ids } }, select: { mtrl: true, unit1: true } }),
  ]);
  const unitCodes = [...new Set(items.map((i) => i.unit1).filter((u): u is string => !!u))];
  const units = unitCodes.length
    ? new Map((await prisma.softoneLookup.findMany({ where: { kind: 'MTRUNIT', code: { in: unitCodes } }, select: { code: true, name: true } })).map((u) => [u.code, u.name]))
    : new Map<string, string>();
  const byItem = new Map(items.map((i) => [i.mtrl, i.unit1 ? units.get(i.unit1) ?? null : null]));
  const byStock = new Map(rows.map((r) => [r.mtrl, r]));
  const out: Record<number, StockSummary> = {};
  for (const id of ids) {
    const r = byStock.get(id);
    out[id] = { qty: Math.round((r?._sum.qty ?? 0) * 1e6) / 1e6, unit: byItem.get(id) ?? null, syncedAt: r?._max.syncedAt?.toISOString() ?? null };
  }
  return out;
}

/**
 * Υπόλοιπα ενός είδους. `live`: ξαναδιαβάζει από το SoftOne ΤΩΡΑ και ενημερώνει τον καθρέφτη για
 * αυτό το είδος — η λίστα δείχνει τον καθρέφτη του τελευταίου συγχρονισμού.
 */
export async function itemStock(mtrl: number, live = false): Promise<ItemStock> {
  const [whs, item] = await Promise.all([
    warehouses(),
    prisma.softoneItem.findUnique({ where: { mtrl }, select: { unit1: true } }),
  ]);
  let rows: { whouse: string; qty: number; fiscPrd: number; syncedAt: Date }[];
  if (live) {
    const fresh = await softoneFetchStock(mtrl);
    const now = new Date();
    await prisma.$transaction([
      prisma.softoneStock.deleteMany({ where: { mtrl } }),
      prisma.softoneStock.createMany({ data: fresh.map((r) => ({ ...r, syncedAt: now })) }),
    ]);
    rows = fresh.map((r) => ({ ...r, syncedAt: now }));
  } else {
    rows = await prisma.softoneStock.findMany({ where: { mtrl } });
  }
  const unit = item?.unit1
    ? (await prisma.softoneLookup.findUnique({ where: { kind_code: { kind: 'MTRUNIT', code: item.unit1 } }, select: { name: true } }))?.name ?? null
    : null;
  const byW = new Map(rows.map((r) => [r.whouse, r.qty]));
  // Όλες οι αποθήκες εμφανίζονται (και με 0) — ο χρήστης βλέπει ότι μια αποθήκη είναι άδεια.
  const list: WarehouseStock[] = whs.map((w) => ({ whouse: w.id, name: w.name, qty: byW.get(w.id) ?? 0 }));
  for (const r of rows) if (!whs.some((w) => w.id === r.whouse)) list.push({ whouse: r.whouse, name: `Αποθήκη ${r.whouse}`, qty: r.qty });
  return {
    mtrl, unit, live,
    total: Math.round(list.reduce((s, w) => s + w.qty, 0) * 1e6) / 1e6,
    warehouses: list,
    fiscPrd: rows[0]?.fiscPrd ?? null,
    syncedAt: rows[0]?.syncedAt.toISOString() ?? null,
  };
}
