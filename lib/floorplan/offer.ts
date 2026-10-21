import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getRecipe, type RecipeView } from '@/lib/install-recipes';
import { getProjectSite } from '@/lib/project-site';
import { ContractError, createContract, itemDefaults } from '@/lib/contracts/service';
import { CONTRACT_KINDS, contractInput } from '@/lib/contracts/core';
import { floorPlanOffer, floorPlanSummary, type FloorPlanItem } from './offer-core';

export const floorPlanOfferInput = z.object({
  rooms: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    areaM2: z.number().finite().min(0).max(1e6),
    perimeterM: z.number().finite().min(0).max(1e6).nullable(),
    material: z.discriminatedUnion('type', [
      z.object({ type: z.literal('recipe'), recipeId: z.string().min(1).max(64) }),
      z.object({ type: z.literal('item'), mtrl: z.number().int().positive() }),
    ]).nullable(),
  })).min(1).max(200),
  markupPct: z.number().finite().min(0).max(1000).default(0),
  mode: z.enum(['detailed', 'bundled']).default('detailed'),
  source: z.string().trim().max(300).nullish().transform((v) => v || null),
  wallLenM: z.number().finite().min(0).nullish().transform((v) => v ?? null),
  // Στοιχεία από το modal «Δημιουργία προσφοράς» (κενά ⇒ προεπιλογές του έργου).
  title: z.string().trim().max(200).nullish().transform((v) => v || null),
  trdr: z.number().int().positive().nullish().transform((v) => v ?? null),
  kind: z.enum(CONTRACT_KINDS).nullish().transform((v) => v ?? null),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((v) => v || null),
  vatRate: z.number().finite().min(0).max(100).default(24),
  terms: z.string().trim().max(20_000).nullish().transform((v) => v || null),
});
export type FloorPlanOfferInput = z.infer<typeof floorPlanOfferInput>;

/**
 * Νέα προσφορά (Contract, στάδιο OFFER, πρόχειρη) από τη διαστασιολόγηση κάτοψης ενός έργου: πελάτης
 * και τοποθεσία από το έργο, γραμμές ανά χώρο από συνταγή ή είδος, περίληψη με όλους τους χώρους.
 * Συνδέεται κατευθείαν με το PRJC. Τίποτα δεν γράφεται στο SoftOne.
 */
/** Προεπιλογές του modal: τίτλος, πελάτης του έργου και τοποθεσία. */
export async function floorPlanOfferDefaults(prjc: number) {
  const project = await prisma.softoneProject.findUnique({ where: { prjc }, select: { code: true, name: true, trdr: true } });
  if (!project) throw new ContractError('Το έργο δεν βρέθηκε στον καθρέφτη του SoftOne', 404);
  const [customer, site] = await Promise.all([
    project.trdr ? prisma.softoneTrader.findUnique({ where: { trdr: project.trdr }, select: { trdr: true, name: true, code: true, email: true, city: true } }) : null,
    getProjectSite(prjc),
  ]);
  return {
    title: `Προσφορά κάτοψης — ${project.name || project.code}`,
    customer: customer ? { trdr: customer.trdr, name: customer.name, code: customer.code, email: customer.email, city: customer.city } : null,
    site: site ? site.formatted || [site.address, site.zip, site.city].filter(Boolean).join(', ') : null,
  };
}

export async function createFloorPlanOffer(prjc: number, input: FloorPlanOfferInput, userId: string) {
  const project = await prisma.softoneProject.findUnique({ where: { prjc }, select: { code: true, name: true, trdr: true } });
  if (!project) throw new ContractError('Το έργο δεν βρέθηκε στον καθρέφτη του SoftOne', 404);
  const trdr = input.trdr ?? project.trdr;
  if (!trdr) throw new ContractError('Επιλέξτε πελάτη — το έργο δεν έχει πελάτη στο SoftOne', 400);

  const recipeIds = [...new Set(input.rooms.flatMap((r) => (r.material?.type === 'recipe' ? [r.material.recipeId] : [])))];
  const mtrls = [...new Set(input.rooms.flatMap((r) => (r.material?.type === 'item' ? [r.material.mtrl] : [])))];
  const recipes = new Map<string, RecipeView>();
  for (const id of recipeIds) { const r = await getRecipe(id); if (r) recipes.set(id, r); }
  const items = new Map<number, FloorPlanItem>();
  for (const mtrl of mtrls) { const it = await itemDefaults(mtrl); if (it) items.set(mtrl, { mtrl, code: it.code, name: it.name, price: it.price }); }

  const { lines, kind: autoKind, missing } = floorPlanOffer({ rooms: input.rooms, recipes, items, markupPct: input.markupPct, mode: input.mode });
  if (missing.length) throw new ContractError(`Δεν βρέθηκε το υλικό/η συνταγή για: ${missing.join(', ')}`, 404);
  if (!lines.length) throw new ContractError('Διαλέξτε υλικό ή συνταγή σε τουλάχιστον έναν χώρο', 400);

  const label = (r: FloorPlanOfferInput['rooms'][number]) => {
    if (!r.material) return null;
    if (r.material.type === 'recipe') { const x = recipes.get(r.material.recipeId); return x ? x.mtrlName || x.name : null; }
    return items.get(r.material.mtrl)?.name ?? null;
  };
  const site = await getProjectSite(prjc);
  const parsed = contractInput.parse({
    title: input.title ?? `Προσφορά κάτοψης — ${project.name || project.code}`,
    summary: floorPlanSummary({ rooms: input.rooms, materialLabel: label, source: input.source, wallLenM: input.wallLenM }),
    kind: input.kind ?? autoKind,
    trdr,
    validUntil: input.validUntil,
    vatRate: input.vatRate,
    terms: input.terms,
    site: site ? { address: site.address, zip: site.zip, district: site.district, city: site.city, formatted: site.formatted, lat: site.lat, lng: site.lng, source: site.source, precision: site.precision } : null,
    lines: lines.map((l) => ({ ...l, discount: 0, partyKey: null, crewFee: null })),
  });
  const id = await createContract(parsed, userId);
  await prisma.contract.update({ where: { id }, data: { prjc } });
  return { id, lines: lines.length, kind: input.kind ?? autoKind };
}
