import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { editSoftoneItem } from '@/lib/softone-sync/item-edit';
import {
  capacityPallets, checkReservation, checkTiers, offerState, PALLET_STEP, roundStep, sortTiers, type Tier,
} from '@/lib/container-pricing';

/**
 * Κοινό container (Operations): ο διαχειριστής επιλέγει ΕΝΑ προϊόν, δίνει τα τ.μ. του container και
 * της παλέτας και τα σημεία (σε παλέτες) όπου πέφτει η τιμή. Οι τιμές γράφονται στο SoftOne ως
 * PRICEW01…05 του είδους· τα σημεία και οι κρατήσεις των πελατών μένουν στην εφαρμογή.
 */

export class OfferError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const tierInput = z.object({
  level: z.number().int().min(1).max(5),
  fromPallets: z.number().min(0).max(1000),
  price: z.number().min(0).max(1e7),
});

export const offerInput = z.object({
  mtrl: z.number().int().positive(),
  title: z.string().trim().max(150).optional().nullable().transform((v) => v || null),
  sqmPerContainer: z.number().positive('Δώσε τα τ.μ. που χωρούν στο container').max(1e6),
  sqmPerPallet: z.number().positive('Δώσε τα τ.μ. ανά παλέτα').max(1e5),
  minOrder: z.number().min(PALLET_STEP).max(100).default(PALLET_STEP),
  closesAt: z.string().datetime({ offset: true }).optional().nullable().or(z.literal('')).transform((v) => (v ? new Date(v) : null)),
  notes: z.string().trim().max(2000).optional().nullable().transform((v) => v || null),
  tiers: z.array(tierInput).min(1).max(5),
});
export type OfferInput = z.infer<typeof offerInput>;

export const reservationInput = z.object({
  trdr: z.number().int().positive(),
  pallets: z.number().positive().max(1000),
  notes: z.string().trim().max(500).optional().nullable().transform((v) => v || null),
});

function validate(input: OfferInput) {
  const capacity = capacityPallets(input.sqmPerContainer, input.sqmPerPallet);
  if (capacity < input.minOrder) throw new OfferError('Το container δεν χωρά ούτε την ελάχιστη παραγγελία — έλεγξε τα τ.μ.');
  const errors = checkTiers(input.tiers, capacity, input.minOrder).filter((i) => i.level === 'error');
  if (errors.length) throw new OfferError(errors.map((e) => e.message).join(' '));
  return capacity;
}

const filledOf = (rs: { pallets: number; status: string }[]) => roundStep(rs.filter((r) => r.status === 'ACTIVE').reduce((a, r) => a + r.pallets, 0));
/** Αιτήματα από το portal που περιμένουν έγκριση — ΔΕΝ μετράνε στο γέμισμα/τιμή, αλλά «κρατάνε» θέση. */
const pendingOf = (rs: { pallets: number; status: string }[]) => roundStep(rs.filter((r) => r.status === 'PENDING').reduce((a, r) => a + r.pallets, 0));
/** Διακριτοί συμμετέχοντες (πελάτες ή συνεργάτες) με ενεργή κράτηση. */
const participantsOf = (rs: { status: string; trdr: number | null; partnerId: string | null }[]) =>
  new Set(rs.filter((r) => r.status === 'ACTIVE').map((r) => (r.trdr != null ? `c${r.trdr}` : `p${r.partnerId}`))).size;

/** Ποιος κλείνει: ακριβώς ένα από πελάτη SoftOne ή συνεργάτη. */
export type Booker = { trdr: number | null; partnerId: string | null };

// ── Ανάγνωση ────────────────────────────────────────────────────────────────────────────────

export async function listOffers() {
  const rows = await prisma.containerOffer.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { tiers: true, reservations: { select: { pallets: true, status: true, trdr: true, partnerId: true } } },
  });
  return rows.map((o) => {
    const tiers = o.tiers.map(({ level, fromPallets, price }) => ({ level, fromPallets, price }));
    const filled = filledOf(o.reservations);
    const st = offerState({ tiers, sqmPerContainer: o.sqmPerContainer, sqmPerPallet: o.sqmPerPallet }, filled);
    return {
      id: o.id, mtrl: o.mtrl, code: o.code, name: o.name, title: o.title, status: o.status,
      sqmPerContainer: o.sqmPerContainer, sqmPerPallet: o.sqmPerPallet, minOrder: o.minOrder, baseUnit: o.baseUnit,
      closesAt: o.closesAt?.toISOString() ?? null, notes: o.notes, createdAt: o.createdAt.toISOString(),
      tiers: sortTiers(tiers),
      customers: participantsOf(o.reservations),
      pending: pendingOf(o.reservations),
      ...st,
    };
  });
}
export type OfferRow = Awaited<ReturnType<typeof listOffers>>[number];

export async function getReservations(offerId: string) {
  const rs = await prisma.containerReservation.findMany({ where: { offerId }, orderBy: { createdAt: 'asc' } });
  const trdrs = rs.map((r) => r.trdr).filter((t): t is number => t != null);
  const pids = rs.map((r) => r.partnerId).filter((p): p is string => !!p);
  const [traders, partners] = await Promise.all([
    prisma.softoneTrader.findMany({ where: { trdr: { in: trdrs } }, select: { trdr: true, code: true, name: true } }),
    prisma.partner.findMany({ where: { id: { in: pids } }, select: { id: true, name: true } }),
  ]);
  const tById = new Map(traders.map((t) => [t.trdr, t]));
  const pById = new Map(partners.map((p) => [p.id, p]));
  return rs.map((r) => {
    const t = r.trdr != null ? tById.get(r.trdr) : undefined;
    const p = r.partnerId ? pById.get(r.partnerId) : undefined;
    return {
      id: r.id, trdr: r.trdr, partnerId: r.partnerId, kind: (r.partnerId ? 'PARTNER' : 'CUSTOMER') as 'PARTNER' | 'CUSTOMER',
      customer: t?.name ?? p?.name ?? (r.trdr != null ? `Πελάτης #${r.trdr}` : 'Συνεργάτης'), customerCode: t?.code ?? null,
      pallets: r.pallets, status: r.status, notes: r.notes, decisionNote: r.decisionNote,
      fromPortal: r.status === 'PENDING' || r.decidedAt != null, createdAt: r.createdAt.toISOString(),
    };
  });
}

// ── Εγγραφή προσφοράς ──────────────────────────────────────────────────────────────────────

async function itemSnapshot(mtrl: number) {
  const item = await prisma.softoneItem.findUnique({ where: { mtrl }, select: { code: true, name: true, unit1: true, isService: true } });
  if (!item) throw new OfferError('Το προϊόν δεν βρέθηκε στο μητρώο ειδών', 404);
  if (item.isService) throw new OfferError('Κοινό container γίνεται μόνο για είδη, όχι για υπηρεσίες');
  const unit = item.unit1 ? await prisma.softoneUnit.findUnique({ where: { code: Number(item.unit1) }, select: { shortcut: true } }) : null;
  return { code: item.code, name: item.name, baseUnit: unit?.shortcut ?? null };
}

export async function createOffer(input: OfferInput, userId: string | null) {
  validate(input);
  const snap = await itemSnapshot(input.mtrl);
  return prisma.containerOffer.create({
    data: {
      mtrl: input.mtrl, ...snap, title: input.title, sqmPerContainer: input.sqmPerContainer, sqmPerPallet: input.sqmPerPallet,
      minOrder: input.minOrder, closesAt: input.closesAt, notes: input.notes, createdById: userId,
      tiers: { create: input.tiers.map(({ level, fromPallets, price }) => ({ level, fromPallets, price })) },
    },
    select: { id: true, status: true },
  });
}

export async function updateOffer(id: string, input: OfferInput) {
  const cur = await prisma.containerOffer.findUnique({ where: { id }, include: { reservations: true } });
  if (!cur) throw new OfferError('Η προσφορά δεν υπάρχει', 404);
  if (cur.status === 'CLOSED' || cur.status === 'CANCELLED') throw new OfferError('Κλεισμένη/ακυρωμένη προσφορά δεν αλλάζει');
  const capacity = validate(input);
  const filled = filledOf(cur.reservations);
  if (filled > capacity) throw new OfferError(`Υπάρχουν ήδη κρατήσεις ${filled} παλετών — η χωρητικότητα δεν μπορεί να γίνει ${capacity}`);
  if (input.mtrl !== cur.mtrl && cur.reservations.length) throw new OfferError('Το προϊόν δεν αλλάζει όταν υπάρχουν κρατήσεις');
  const snap = input.mtrl !== cur.mtrl ? await itemSnapshot(input.mtrl) : {};
  await prisma.$transaction([
    prisma.containerOfferTier.deleteMany({ where: { offerId: id } }),
    prisma.containerOffer.update({
      where: { id },
      data: {
        mtrl: input.mtrl, ...snap, title: input.title, sqmPerContainer: input.sqmPerContainer, sqmPerPallet: input.sqmPerPallet,
        minOrder: input.minOrder, closesAt: input.closesAt, notes: input.notes,
        tiers: { create: input.tiers.map(({ level, fromPallets, price }) => ({ level, fromPallets, price })) },
      },
    }),
  ]);
  // Ανοιχτό container: οι νέες τιμές πάνε αμέσως στο SoftOne.
  if (cur.status === 'OPEN') await syncPrices(id);
  return { id };
}

/** Γράφει τις τιμές των κλιμακίων στο είδος (PRICEW01…05) — με επαλήθευση από το editSoftoneItem. */
export async function syncPrices(id: string) {
  const o = await prisma.containerOffer.findUnique({ where: { id }, include: { tiers: true } });
  if (!o) throw new OfferError('Η προσφορά δεν υπάρχει', 404);
  const patch: Record<string, number> = {};
  for (const t of o.tiers) patch[`priceW0${t.level}`] = t.price;
  return editSoftoneItem(o.mtrl, patch);
}

/**
 * OPEN → CLOSED (το container «έκλεισε»: ολοκληρώνεται η παραγγελία) · CLOSED → OPEN (επαναφορά) ·
 * DRAFT/SCHEDULED/OPEN → CANCELLED. Η ΠΡΩΤΗ δημοσίευση γίνεται μόνο με `publishOffer`.
 */
export async function setStatus(id: string, next: 'OPEN' | 'CLOSED' | 'CANCELLED') {
  const o = await prisma.containerOffer.findUnique({ where: { id } });
  if (!o) throw new OfferError('Η προσφορά δεν υπάρχει', 404);
  if (o.status === next) return o;
  if (next === 'CLOSED' && o.status !== 'OPEN') throw new OfferError('Κλείνει μόνο ανοιχτή προσφορά');
  if (next === 'OPEN' && o.status !== 'CLOSED') throw new OfferError('Ξανανοίγει μόνο κλεισμένη προσφορά — η πρώτη δημοσίευση γίνεται από τον οδηγό');
  if (next === 'CANCELLED' && o.status === 'CLOSED') throw new OfferError('Κλεισμένη προσφορά δεν ακυρώνεται');
  if (next === 'OPEN') {
    const clash = await prisma.containerOffer.findFirst({ where: { mtrl: o.mtrl, status: { in: ['OPEN', 'SCHEDULED'] }, id: { not: id } }, select: { title: true, name: true } });
    if (clash) throw new OfferError(`Υπάρχει ήδη ενεργή προσφορά για το ίδιο προϊόν (${clash.title ?? clash.name})`, 409);
  }
  return prisma.containerOffer.update({ where: { id }, data: { status: next } });
}

export async function deleteOffer(id: string) {
  const o = await prisma.containerOffer.findUnique({ where: { id }, include: { reservations: { where: { status: 'ACTIVE' } } } });
  if (!o) throw new OfferError('Η προσφορά δεν υπάρχει', 404);
  if ((o.status !== 'DRAFT' && o.status !== 'SCHEDULED') || o.reservations.length) throw new OfferError('Διαγράφεται μόνο πρόχειρη/προγραμματισμένη προσφορά χωρίς κρατήσεις — αλλιώς ακύρωσέ την');
  await prisma.containerOffer.delete({ where: { id } });
  return o;
}

// ── Κρατήσεις ──────────────────────────────────────────────────────────────────────────────

export async function addReservation(offerId: string, input: z.infer<typeof reservationInput>, userId: string | null) {
  return prisma.$transaction(async (tx) => {
    const o = await tx.containerOffer.findUnique({ where: { id: offerId }, include: { reservations: true } });
    if (!o) throw new OfferError('Η προσφορά δεν υπάρχει', 404);
    if (o.status !== 'OPEN') throw new OfferError('Κρατήσεις γίνονται μόνο σε δημοσιευμένη (ανοιχτή) προσφορά');
    if (o.closesAt && o.closesAt.getTime() < Date.now()) throw new OfferError('Έληξε η προθεσμία συμμετοχής');
    const customer = await tx.softoneTrader.findUnique({ where: { trdr: input.trdr }, select: { sodtype: true } });
    if (customer?.sodtype !== 13) throw new OfferError('Ο συναλλασσόμενος δεν είναι πελάτης');
    const free = roundStep(capacityPallets(o.sqmPerContainer, o.sqmPerPallet) - filledOf(o.reservations));
    const err = checkReservation(input.pallets, free, o.minOrder);
    if (err) throw new OfferError(err);
    return tx.containerReservation.create({ data: { offerId, trdr: input.trdr, pallets: input.pallets, notes: input.notes, createdById: userId } });
  });
}

export async function cancelReservation(offerId: string, id: string) {
  const r = await prisma.containerReservation.findFirst({ where: { id, offerId } });
  if (!r) throw new OfferError('Η κράτηση δεν υπάρχει', 404);
  const o = await prisma.containerOffer.findUnique({ where: { id: offerId }, select: { status: true } });
  if (o?.status === 'CLOSED') throw new OfferError('Το container έχει κλείσει — οι κρατήσεις δεν αλλάζουν');
  return prisma.containerReservation.update({ where: { id }, data: { status: 'CANCELLED' } });
}

// ── Αιτήματα κράτησης από το portal (click στον άδειο χώρο του container) ─────────────────────

export const requestInput = z.object({
  pallets: z.number().positive().max(1000),
  notes: z.string().trim().max(500).optional().nullable().transform((v) => v || null),
});

/** Ο χρήστης του portal → ποιος κλείνει (πελάτης ή συνεργάτης). */
export function bookerOf(u: { customerTrdr: number | null; partnerId: string | null }): Booker | null {
  if (u.customerTrdr) return { trdr: u.customerTrdr, partnerId: null };
  if (u.partnerId) return { trdr: null, partnerId: u.partnerId };
  return null;
}

async function isRecipient(offerId: string, b: Booker) {
  const r = await prisma.offerRecipient.findFirst({
    where: { offerId, ...(b.trdr != null ? { kind: 'CUSTOMER', refId: String(b.trdr) } : { kind: 'PARTNER', refId: b.partnerId! }) },
    select: { id: true },
  });
  return !!r;
}

/**
 * Αίτημα κράτησης (PENDING): μόνο σε ανοιχτή προσφορά, μόνο για παραλήπτη της, σε βήματα ½ ≥ ελάχιστης.
 * Ελέγχει χώρο έναντι ενεργών ΚΑΙ εκκρεμών αιτημάτων — δύο αιτήματα δεν «πιάνουν» την ίδια θέση.
 */
export async function requestReservation(offerId: string, b: Booker, input: z.infer<typeof requestInput>, userId: string | null) {
  if (!(await isRecipient(offerId, b))) throw new OfferError('Η προσφορά δεν είναι διαθέσιμη για εσάς', 404);
  return prisma.$transaction(async (tx) => {
    const o = await tx.containerOffer.findUnique({ where: { id: offerId }, include: { reservations: true } });
    if (!o) throw new OfferError('Η προσφορά δεν υπάρχει', 404);
    if (o.status !== 'OPEN') throw new OfferError('Η προσφορά δεν δέχεται πλέον κρατήσεις');
    if (o.closesAt && o.closesAt.getTime() < Date.now()) throw new OfferError('Έληξε η προθεσμία συμμετοχής');
    const free = roundStep(capacityPallets(o.sqmPerContainer, o.sqmPerPallet) - filledOf(o.reservations) - pendingOf(o.reservations));
    const err = checkReservation(input.pallets, Math.max(0, free), o.minOrder);
    if (err) throw new OfferError(err);
    return tx.containerReservation.create({
      data: { offerId, trdr: b.trdr, partnerId: b.partnerId, pallets: input.pallets, notes: input.notes, status: 'PENDING', createdById: userId },
    });
  });
}

/** Ο ίδιος αποσύρει ΔΙΚΟ του αίτημα που δεν έχει εγκριθεί ακόμη. */
export async function withdrawRequest(offerId: string, id: string, b: Booker) {
  const r = await prisma.containerReservation.findFirst({ where: { id, offerId, status: 'PENDING', trdr: b.trdr, partnerId: b.partnerId } });
  if (!r) throw new OfferError('Το αίτημα δεν βρέθηκε ή έχει ήδη απαντηθεί', 404);
  return prisma.containerReservation.update({ where: { id }, data: { status: 'CANCELLED', decidedAt: new Date(), decisionNote: 'Αποσύρθηκε από τον αιτούντα' } });
}

/** Έγκριση: PENDING → ACTIVE, αν χωράει στο container (έναντι ενεργών). Μετά: νέα 3D εικόνα + email πτώσης. */
export async function approveReservation(offerId: string, id: string, userId: string | null) {
  return prisma.$transaction(async (tx) => {
    const o = await tx.containerOffer.findUnique({ where: { id: offerId }, include: { reservations: true } });
    if (!o) throw new OfferError('Η προσφορά δεν υπάρχει', 404);
    if (o.status !== 'OPEN') throw new OfferError('Εγκρίσεις γίνονται μόνο σε ανοιχτή προσφορά');
    const r = o.reservations.find((x) => x.id === id);
    if (!r || r.status !== 'PENDING') throw new OfferError('Το αίτημα δεν βρέθηκε ή έχει ήδη απαντηθεί', 404);
    const free = roundStep(capacityPallets(o.sqmPerContainer, o.sqmPerPallet) - filledOf(o.reservations));
    if (r.pallets > free + 1e-9) throw new OfferError(`Δεν χωράει: ελεύθερες ${free} παλέτες, το αίτημα ζητά ${r.pallets}.`);
    return tx.containerReservation.update({ where: { id }, data: { status: 'ACTIVE', decidedById: userId, decidedAt: new Date() } });
  });
}

export async function rejectReservation(offerId: string, id: string, userId: string | null, note: string | null) {
  const r = await prisma.containerReservation.findFirst({ where: { id, offerId, status: 'PENDING' } });
  if (!r) throw new OfferError('Το αίτημα δεν βρέθηκε ή έχει ήδη απαντηθεί', 404);
  return prisma.containerReservation.update({ where: { id }, data: { status: 'REJECTED', decidedById: userId, decidedAt: new Date(), decisionNote: note?.trim().slice(0, 300) || null } });
}

/** Email προς τον αιτούντα (ή την εταιρεία για νέο αίτημα): ποιος, πού. Επιστρέφει παραλήπτες/στοιχεία. */
export async function reservationContext(offerId: string, id: string) {
  const r = await prisma.containerReservation.findFirst({ where: { id, offerId }, include: { offer: { select: { title: true, name: true, code: true, sqmPerPallet: true, baseUnit: true } } } });
  if (!r) return null;
  const requester = r.createdById ? await prisma.user.findUnique({ where: { id: r.createdById }, select: { email: true, name: true, role: { select: { key: true } } } }) : null;
  const who = r.trdr != null
    ? (await prisma.softoneTrader.findUnique({ where: { trdr: r.trdr }, select: { name: true } }))?.name ?? `Πελάτης #${r.trdr}`
    : (await prisma.partner.findUnique({ where: { id: r.partnerId ?? '' }, select: { name: true } }))?.name ?? 'Συνεργάτης';
  return { r, who, requester: requester && (requester.role.key === 'CUSTOMER' || requester.role.key === 'COLLABORATOR') ? requester : null };
}

/** Προτάσεις για νέο container από τη ρύθμιση μονάδων του είδους (Container → Παλέτα → τ.μ.). */
export async function offerDefaults(mtrl: number) {
  const item = await prisma.softoneItem.findUnique({ where: { mtrl }, select: { buyRatio: true, unitBuy: true, unit1: true } });
  return { sqmPerContainer: item?.unitBuy && item.unitBuy !== item.unit1 ? item.buyRatio ?? null : null };
}

export type OfferTier = Tier;

// ── Παραλήπτες ─────────────────────────────────────────────────────────────────────────────

export const recipientsInput = z.object({
  recipients: z.array(z.object({ kind: z.enum(['CUSTOMER', 'PARTNER']), refId: z.string().min(1).max(64) })).max(2000),
});

/** Ορίζει τους παραλήπτες· όνομα/email από το μητρώο (πελάτης: email SoftOne· συνεργάτης: δικό του ή κύριου προσώπου). */
export async function setRecipients(offerId: string, list: z.infer<typeof recipientsInput>['recipients']) {
  const o = await prisma.containerOffer.findUnique({ where: { id: offerId }, select: { id: true } });
  if (!o) throw new OfferError('Η προσφορά δεν υπάρχει', 404);
  const trdrs = list.filter((r) => r.kind === 'CUSTOMER').map((r) => Number(r.refId)).filter(Number.isInteger);
  const pids = list.filter((r) => r.kind === 'PARTNER').map((r) => r.refId);
  const [traders, partners] = await Promise.all([
    prisma.softoneTrader.findMany({ where: { trdr: { in: trdrs }, sodtype: 13 }, select: { trdr: true, name: true, email: true } }),
    prisma.partner.findMany({ where: { id: { in: pids } }, select: { id: true, name: true, email: true, contacts: { where: { isPrimary: true }, select: { email: true } } } }),
  ]);
  const rows = [
    ...traders.map((t) => ({ kind: 'CUSTOMER', refId: String(t.trdr), name: t.name, email: t.email?.trim() || null })),
    ...partners.map((p) => ({ kind: 'PARTNER', refId: p.id, name: p.name, email: (p.email || p.contacts[0]?.email)?.trim() || null })),
  ];
  const keep = new Set(rows.map((r) => `${r.kind}:${r.refId}`));
  const existing = await prisma.offerRecipient.findMany({ where: { offerId }, select: { id: true, kind: true, refId: true } });
  await prisma.$transaction([
    prisma.offerRecipient.deleteMany({ where: { id: { in: existing.filter((e) => !keep.has(`${e.kind}:${e.refId}`)).map((e) => e.id) } } }),
    ...rows.map((r) => prisma.offerRecipient.upsert({
      where: { offerId_kind_refId: { offerId, kind: r.kind, refId: r.refId } },
      create: { offerId, ...r }, update: { name: r.name, email: r.email },
    })),
  ]);
  return { total: rows.length, withoutEmail: rows.filter((r) => !r.email).length };
}

export async function getRecipients(offerId: string) {
  const rs = await prisma.offerRecipient.findMany({ where: { offerId }, orderBy: [{ kind: 'asc' }, { name: 'asc' }], include: { emails: { orderBy: { sentAt: 'desc' } } } });
  return rs.map((r) => ({
    id: r.id, kind: r.kind, refId: r.refId, name: r.name, email: r.email,
    emails: r.emails.map((e) => ({ kind: e.kind, level: e.level, status: e.status, error: e.error, sentAt: e.sentAt.toISOString() })),
  }));
}

/** Υποψήφιοι παραλήπτες για το wizard: πελάτες και συνεργάτες με/χωρίς email. */
export async function recipientOptions() {
  const [customers, partners] = await Promise.all([
    prisma.softoneTrader.findMany({ where: { sodtype: 13, isActive: true }, orderBy: { name: 'asc' }, select: { trdr: true, code: true, name: true, email: true, city: true } }),
    prisma.partner.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, type: true, specialty: true, email: true, contacts: { where: { isPrimary: true }, select: { email: true } } } }),
  ]);
  return {
    customers: customers.map((c) => ({ kind: 'CUSTOMER' as const, refId: String(c.trdr), name: c.name, sub: [c.code, c.city].filter(Boolean).join(' · '), email: c.email?.trim() || null })),
    partners: partners.map((p) => ({ kind: 'PARTNER' as const, refId: p.id, name: p.name, sub: p.specialty ?? (p.type === 'COMPANY' ? 'Εταιρία' : 'Πρόσωπο'), email: (p.email || p.contacts[0]?.email)?.trim() || null })),
  };
}

// ── 3D εικόνα για τα email ─────────────────────────────────────────────────────────────────

export async function saveSnapshot(offerId: string, png: Buffer) {
  if (png.length > 6 * 1024 * 1024) throw new OfferError('Η εικόνα είναι πολύ μεγάλη');
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new OfferError('Η εικόνα πρέπει να είναι PNG');
  const { bunnyUpload } = await import('@/lib/bunny');
  const { publicUrl } = await bunnyUpload({ key: `offers/${offerId}/snapshot-${Date.now()}.png`, body: png, contentType: 'image/png' });
  await prisma.containerOffer.update({ where: { id: offerId }, data: { snapshotUrl: publicUrl } });
  return publicUrl;
}

// ── Email ──────────────────────────────────────────────────────────────────────────────────

async function emailContext(offerId: string) {
  const { getSetting } = await import('@/lib/settings');
  const o = await prisma.containerOffer.findUnique({ where: { id: offerId }, include: { tiers: true, reservations: true } });
  if (!o) throw new OfferError('Η προσφορά δεν υπάρχει', 404);
  const [name, phone, email, address, logoUrl, photo] = await Promise.all([
    getSetting<string>('company.name'), getSetting<string>('company.phone'), getSetting<string>('company.email'),
    getSetting<string>('company.address'), getSetting<string>('company.logoUrl'),
    prisma.itemMedia.findFirst({ where: { mtrl: o.mtrl, kind: 'IMAGE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: { publicUrl: true } }).catch(() => null),
  ]);
  const tiers = o.tiers.map(({ level, fromPallets, price }) => ({ level, fromPallets, price }));
  const filled = filledOf(o.reservations);
  const st = offerState({ tiers, sqmPerContainer: o.sqmPerContainer, sqmPerPallet: o.sqmPerPallet }, filled);
  const company = { name: (name ?? 'ATELIER').trim(), phone, email, address, logoUrl: logoUrl || null };
  const subject = `Κράτηση — ${o.title ?? o.name}`;
  return {
    o, st, company, filled, tiers,
    base: {
      company, title: o.title ?? 'Κοινό container', productName: o.name, productCode: o.code, baseUnit: o.baseUnit ?? 'τ.μ.',
      sqmPerPallet: o.sqmPerPallet, minOrder: o.minOrder, closesAt: o.closesAt?.toISOString() ?? null, capacity: st.capacity,
      filled, tiers, currentLevel: st.current?.level ?? 1, snapshotUrl: o.snapshotUrl, photoUrl: photo?.publicUrl ?? null,
      ctaUrl: email ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : 'mailto:',
    },
  };
}

/** Προεπισκόπηση (wizard / σελίδα): το HTML όπως θα το δει ο παραλήπτης. */
export async function previewEmail(offerId: string, kind: 'publish' | 'drop') {
  const { offerEmailHtml, offerEmailSubject } = await import('@/lib/dynamic-offer-email');
  const ctx = await emailContext(offerId);
  const data = { ...ctx.base, kind, recipientName: 'Γιώργος Παπαδόπουλος', previousPrice: kind === 'drop' ? sortTiers(ctx.tiers)[0]?.price ?? null : null };
  return { subject: offerEmailSubject(data), html: offerEmailHtml(data) };
}

/**
 * Αποστολή σε όλους τους παραλήπτες με email. ΙΔΕΜΠΟΤΕΝΤ: το OfferEmail (παραλήπτης, τύπος,
 * κλιμάκιο) είναι μοναδικό — δεύτερη κλήση δεν ξαναστέλνει όσα έφυγαν (ξαναδοκιμάζει τα αποτυχημένα).
 */
async function sendAll(offerId: string, kind: 'PUBLISH' | 'PRICE_DROP', level: number, previousPrice: number | null) {
  const { offerEmailHtml, offerEmailSubject } = await import('@/lib/dynamic-offer-email');
  const { sendTransactionalEmail } = await import('@/lib/mailgun');
  const ctx = await emailContext(offerId);
  const recipients = await prisma.offerRecipient.findMany({ where: { offerId }, include: { emails: { where: { kind, level } } } });
  let sent = 0; let failed = 0; let skipped = 0;
  for (const r of recipients) {
    if (!r.email) { skipped++; continue; }
    if (r.emails.some((e) => e.status === 'SENT')) continue;
    const data = { ...ctx.base, kind: kind === 'PUBLISH' ? 'publish' as const : 'drop' as const, recipientName: r.name, previousPrice };
    try {
      await sendTransactionalEmail(r.email, offerEmailSubject(data), offerEmailHtml(data), { replyTo: ctx.company.email, fromName: ctx.company.name });
      await prisma.offerEmail.upsert({ where: { recipientId_kind_level: { recipientId: r.id, kind, level } }, create: { offerId, recipientId: r.id, kind, level, status: 'SENT' }, update: { status: 'SENT', error: null, sentAt: new Date() } });
      sent++;
    } catch (e) {
      await prisma.offerEmail.upsert({ where: { recipientId_kind_level: { recipientId: r.id, kind, level } }, create: { offerId, recipientId: r.id, kind, level, status: 'FAILED', error: (e as Error).message.slice(0, 500) }, update: { status: 'FAILED', error: (e as Error).message.slice(0, 500), sentAt: new Date() } });
      failed++;
    }
  }
  return { sent, failed, skipped };
}

/** Δημοσίευση: τιμές στο SoftOne → OPEN → email σε όλους. `publishAt` στο μέλλον ⇒ SCHEDULED (cron). */
export async function publishOffer(offerId: string, publishAt: Date | null) {
  const o = await prisma.containerOffer.findUnique({ where: { id: offerId }, include: { tiers: true, _count: { select: { recipients: true } } } });
  if (!o) throw new OfferError('Η προσφορά δεν υπάρχει', 404);
  if (o.status !== 'DRAFT' && o.status !== 'SCHEDULED') throw new OfferError('Δημοσιεύεται μόνο πρόχειρη ή προγραμματισμένη προσφορά');
  if (o._count.recipients === 0) throw new OfferError('Διάλεξε τουλάχιστον έναν παραλήπτη');
  const clash = await prisma.containerOffer.findFirst({ where: { mtrl: o.mtrl, status: { in: ['OPEN', 'SCHEDULED'] }, id: { not: offerId } }, select: { title: true, name: true } });
  if (clash) throw new OfferError(`Υπάρχει ήδη ενεργή προσφορά για το ίδιο προϊόν (${clash.title ?? clash.name})`, 409);
  if (publishAt && publishAt.getTime() > Date.now() + 60_000) {
    await prisma.containerOffer.update({ where: { id: offerId }, data: { status: 'SCHEDULED', publishAt } });
    return { scheduled: true as const, publishAt: publishAt.toISOString() };
  }
  await syncPrices(offerId);
  const first = sortTiers(o.tiers)[0];
  await prisma.containerOffer.update({ where: { id: offerId }, data: { status: 'OPEN', publishAt: publishAt ?? new Date(), publishedAt: new Date(), notifiedLevel: first?.level ?? 1 } });
  const result = await sendAll(offerId, 'PUBLISH', 0, null);
  return { scheduled: false as const, ...result };
}

/** Ξαναστέλνει την προσφορά σε όσους δεν την έλαβαν (αποτυχίες / νέοι παραλήπτες). */
export const resendPublish = (offerId: string) => sendAll(offerId, 'PUBLISH', 0, null);

/** Αν το γέμισμα πέρασε σε φθηνότερο κλιμάκιο: email «η τιμή έπεσε» (μία φορά ανά κλιμάκιο). */
export async function notifyPriceDrop(offerId: string) {
  const o = await prisma.containerOffer.findUnique({ where: { id: offerId }, include: { tiers: true, reservations: true } });
  if (!o || o.status !== 'OPEN') return null;
  const tiers = sortTiers(o.tiers.map(({ level, fromPallets, price }) => ({ level, fromPallets, price })));
  const cur = offerState({ tiers, sqmPerContainer: o.sqmPerContainer, sqmPerPallet: o.sqmPerPallet }, filledOf(o.reservations)).current;
  const notifiedIdx = tiers.findIndex((t) => t.level === o.notifiedLevel);
  const curIdx = cur ? tiers.indexOf(tiers.find((t) => t.level === cur.level)!) : -1;
  if (!cur || curIdx <= notifiedIdx) return null;
  const previousPrice = tiers[Math.max(0, notifiedIdx)]?.price ?? null;
  const result = await sendAll(offerId, 'PRICE_DROP', cur.level, previousPrice);
  await prisma.containerOffer.update({ where: { id: offerId }, data: { notifiedLevel: cur.level } });
  return { level: cur.level, price: cur.price, ...result };
}

/** Cron: δημοσιεύει όσες ήρθε η ώρα τους και στέλνει εκκρεμείς ειδοποιήσεις πτώσης τιμής. */
export async function runDueOffers() {
  const due = await prisma.containerOffer.findMany({ where: { status: 'SCHEDULED', publishAt: { lte: new Date() } }, select: { id: true } });
  const published: string[] = [];
  for (const d of due) { await publishOffer(d.id, null); published.push(d.id); }
  const open = await prisma.containerOffer.findMany({ where: { status: 'OPEN' }, select: { id: true } });
  let drops = 0;
  for (const o of open) if (await notifyPriceDrop(o.id)) drops++;
  return { published: published.length, drops };
}

/** Προϊόντα για το βήμα 1 του οδηγού: αναζήτηση στα είδη (όχι υπηρεσίες), με φωτογραφία και μονάδες. */
export async function searchItems(q: string) {
  const term = q.trim();
  const items = await prisma.softoneItem.findMany({
    where: {
      isService: false, isActive: true,
      ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { code: { contains: term, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { name: 'asc' }, take: 30,
    select: { mtrl: true, code: true, name: true, unit1: true, unitBuy: true, buyRatio: true, price: true },
  });
  const [media, units] = await Promise.all([
    prisma.itemMedia.findMany({ where: { mtrl: { in: items.map((i) => i.mtrl) }, kind: 'IMAGE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: { mtrl: true, thumbUrl: true, publicUrl: true } }),
    prisma.softoneUnit.findMany({ select: { code: true, shortcut: true } }),
  ]);
  const photo = new Map<number, string>();
  for (const m of media) if (!photo.has(m.mtrl)) photo.set(m.mtrl, m.thumbUrl ?? m.publicUrl);
  const unit = new Map(units.map((u) => [String(u.code), u.shortcut]));
  return items.map((i) => ({ ...i, photo: photo.get(i.mtrl) ?? null, baseUnit: i.unit1 ? unit.get(i.unit1) ?? null : null }));
}
