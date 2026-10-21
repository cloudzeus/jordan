import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getRecipe, type RecipeView } from '@/lib/install-recipes';
import { getProjectSite } from '@/lib/project-site';
import { ContractError, createContract, itemDefaults } from '@/lib/contracts/service';
import { CONTRACT_KINDS, contractInput } from '@/lib/contracts/core';
import type { PlanOwner } from './plans';
import { floorPlanOffer, floorPlanSummary, type FloorPlanItem, type FloorPlanRoom } from './offer-core';

export const floorPlanOfferInput = z.object({
  rooms: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    areaM2: z.number().finite().min(0).max(1e6),
    perimeterM: z.number().finite().min(0).max(1e6).nullable(),
    wallsM2: z.number().finite().min(0).max(1e6).nullish().transform((v) => v ?? null),
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
  includeWalls: z.boolean().default(true),
  /** Η αποθηκευμένη χαρτογράφηση (κάτοψη & χώροι στο PDF πελάτη και συνεργείων). */
  floorPlanId: z.string().min(1).max(64).nullish().transform((v) => v ?? null),
});
export type FloorPlanOfferInput = z.infer<typeof floorPlanOfferInput>;

/**
 * Νέα προσφορά (Contract, στάδιο OFFER, πρόχειρη) από τη διαστασιολόγηση κάτοψης ενός έργου: πελάτης
 * και τοποθεσία από το έργο, γραμμές ανά χώρο από συνταγή ή είδος, περίληψη με όλους τους χώρους.
 * Από έργο συνδέεται κατευθείαν με το PRJC· από πελάτη μένει χωρίς έργο μέχρι την αποδοχή. Τίποτα δεν
 * γράφεται στο SoftOne.
 */
/**
 * Το «πλαίσιο» της προσφοράς: για έργο — όνομα, πελάτης και τοποθεσία του έργου· για πελάτη (προσφορά
 * από το μενού του πελάτη, χωρίς έργο ακόμη) — ο πελάτης, χωρίς τοποθεσία.
 */
async function offerContext(owner: PlanOwner) {
  if (owner.kind === 'customer') {
    const t = await prisma.softoneTrader.findUnique({ where: { trdr: owner.trdr }, select: { trdr: true, name: true } });
    if (!t) throw new ContractError('Ο πελάτης δεν βρέθηκε στον καθρέφτη του SoftOne', 404);
    return { label: t.name, trdr: t.trdr, prjc: null, site: null };
  }
  const project = await prisma.softoneProject.findUnique({ where: { prjc: owner.prjc }, select: { code: true, name: true, trdr: true } });
  if (!project) throw new ContractError('Το έργο δεν βρέθηκε στον καθρέφτη του SoftOne', 404);
  return { label: project.name || project.code, trdr: project.trdr, prjc: owner.prjc, site: await getProjectSite(owner.prjc) };
}

/** Προεπιλογές του modal: τίτλος, πελάτης και τοποθεσία (του έργου, αν υπάρχει). */
export async function floorPlanOfferDefaults(owner: PlanOwner) {
  const ctx = await offerContext(owner);
  const customer = ctx.trdr ? await prisma.softoneTrader.findUnique({ where: { trdr: ctx.trdr }, select: { trdr: true, name: true, code: true, email: true, city: true } }) : null;
  const site = ctx.site;
  return {
    title: `Προσφορά κάτοψης — ${ctx.label}`,
    customer: customer ? { trdr: customer.trdr, name: customer.name, code: customer.code, email: customer.email, city: customer.city } : null,
    site: site ? site.formatted || [site.address, site.zip, site.city].filter(Boolean).join(', ') : null,
  };
}

export async function createFloorPlanOffer(owner: PlanOwner, input: FloorPlanOfferInput, userId: string) {
  const ctx = await offerContext(owner);
  const trdr = input.trdr ?? ctx.trdr;
  if (!trdr) throw new ContractError('Επιλέξτε πελάτη — το έργο δεν έχει πελάτη στο SoftOne', 400);

  const recipeIds = [...new Set(input.rooms.flatMap((r) => (r.material?.type === 'recipe' ? [r.material.recipeId] : [])))];
  const mtrls = [...new Set(input.rooms.flatMap((r) => (r.material?.type === 'item' ? [r.material.mtrl] : [])))];
  const recipes = new Map<string, RecipeView>();
  for (const id of recipeIds) { const r = await getRecipe(id); if (r) recipes.set(id, r); }
  const items = new Map<number, FloorPlanItem>();
  for (const mtrl of mtrls) { const it = await itemDefaults(mtrl); if (it) items.set(mtrl, { mtrl, code: it.code, name: it.name, price: it.price }); }

  if (input.floorPlanId) {
    const fp = await prisma.floorPlan.findUnique({ where: { id: input.floorPlanId }, select: { prjc: true, trdr: true } });
    const mine = fp && (owner.kind === 'project' ? fp.prjc === owner.prjc : fp.trdr === owner.trdr);
    if (!mine) throw new ContractError(owner.kind === 'project' ? 'Η χαρτογράφηση δεν βρέθηκε σε αυτό το έργο' : 'Η χαρτογράφηση δεν βρέθηκε σε αυτόν τον πελάτη', 404);
  }
  const { lines, kind: autoKind, missing } = floorPlanOffer({ rooms: input.rooms, recipes, items, markupPct: input.markupPct, mode: input.mode, includeWalls: input.includeWalls });
  if (missing.length) throw new ContractError(`Δεν βρέθηκε το υλικό/η συνταγή για: ${missing.join(', ')}`, 404);
  if (!lines.length) throw new ContractError('Διαλέξτε υλικό ή συνταγή σε τουλάχιστον έναν χώρο', 400);

  const label = (r: FloorPlanRoom) => {
    if (!r.material) return null;
    if (r.material.type === 'recipe') { const x = recipes.get(r.material.recipeId); return x ? x.mtrlName || x.name : null; }
    return items.get(r.material.mtrl)?.name ?? null;
  };
  const site = ctx.site;
  const parsed = contractInput.parse({
    title: input.title ?? `Προσφορά κάτοψης — ${ctx.label}`,
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
  // Από έργο: συνδέεται κατευθείαν. Από πελάτη: χωρίς έργο — δημιουργείται με την αποδοχή της προσφοράς.
  await prisma.contract.update({ where: { id }, data: { prjc: ctx.prjc, floorPlanId: input.floorPlanId } });
  return { id, lines: lines.length, kind: input.kind ?? autoKind };
}
