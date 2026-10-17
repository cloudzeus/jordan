import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';

/**
 * Ποσοστά ΓΕΝΙΚΩΝ ΕΞΟΔΩΝ (πίνακας `OverheadRate`) — CRUD. Η σύμβαση και η επίλυση ζουν στο
 * `lib/overheads-resolve.ts` (κοινά με το «Πραγματικό κόστος»).
 */
export type OverheadRateRow = {
  id: string;
  validFrom: string; // YYYY-MM-DD
  validTo: string | null;
  percent: number;
  category: string | null;
  note: string | null;
};

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ημερομηνία ΕΕΕΕ-ΜΜ-ΗΗ');
export const overheadRateInput = z.object({
  validFrom: ymd,
  validTo: ymd.nullable().optional(),
  percent: z.number().min(0, 'Το ποσοστό δεν μπορεί να είναι αρνητικό').max(500, 'Πολύ μεγάλο ποσοστό'),
  category: z.string().trim().max(60).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
}).refine((v) => !v.validTo || v.validTo >= v.validFrom, { message: 'Η λήξη είναι πριν από την έναρξη', path: ['validTo'] });
export type OverheadRateInputT = z.infer<typeof overheadRateInput>;

const day = (d: Date) => d.toISOString().slice(0, 10);
const toRow = (r: { id: string; validFrom: Date; validTo: Date | null; percent: number; category: string | null; note: string | null }): OverheadRateRow => ({
  id: r.id, validFrom: day(r.validFrom), validTo: r.validTo ? day(r.validTo) : null, percent: r.percent, category: r.category, note: r.note,
});
const data = (v: OverheadRateInputT) => ({
  validFrom: new Date(`${v.validFrom}T00:00:00Z`),
  validTo: v.validTo ? new Date(`${v.validTo}T00:00:00Z`) : null,
  percent: v.percent,
  category: v.category || null,
  note: v.note || null,
});

export async function listOverheadRates(): Promise<OverheadRateRow[]> {
  const rows = await prisma.overheadRate.findMany({ orderBy: [{ validFrom: 'desc' }, { category: 'asc' }] });
  return rows.map(toRow);
}
export async function createOverheadRate(v: OverheadRateInputT, userId: string | null) {
  return toRow(await prisma.overheadRate.create({ data: { ...data(v), createdById: userId } }));
}
export async function updateOverheadRate(id: string, v: OverheadRateInputT) {
  return toRow(await prisma.overheadRate.update({ where: { id }, data: data(v) }));
}
export async function deleteOverheadRate(id: string) {
  return toRow(await prisma.overheadRate.delete({ where: { id } }));
}
