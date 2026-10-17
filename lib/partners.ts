import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { PartnerType } from '@prisma/client';

/**
 * Συνεργάτες (Operations) — τοπικό μητρώο, ΟΧΙ καθρέφτης SoftOne.
 *
 * Εταιρία ή φυσικό πρόσωπο. Η εταιρία έχει πολλά πρόσωπα επικοινωνίας με ιδιότητα. Ο συνεργάτης
 * συσχετίζεται με πολλούς πελάτες (SoftoneTrader, SODTYPE 13) και με έργα (SoftoneProject) — μόνο
 * έργα ΤΩΝ συσχετισμένων πελατών του. Αποσύνδεση πελάτη αφαιρεί και τα έργα του από τον συνεργάτη.
 */

export const CUSTOMER_SODTYPE = 13;

export class PartnerError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const opt = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const partnerInput = z
  .object({
    type: z.enum(['COMPANY', 'PERSON']),
    name: opt(200),
    tradeName: opt(200),
    firstName: opt(100),
    lastName: opt(100),
    specialty: opt(120),
    afm: opt(20),
    doy: opt(120),
    country: opt(3),
    address: opt(200),
    city: opt(100),
    zip: opt(20),
    phone: opt(40),
    mobile: opt(40),
    email: z.string().trim().max(200).email('Μη έγκυρο email').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
    website: opt(200),
    notes: opt(2000),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'COMPANY' && !v.name) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Η επωνυμία είναι υποχρεωτική' });
    if (v.type === 'PERSON' && !v.lastName) ctx.addIssue({ code: 'custom', path: ['lastName'], message: 'Το επώνυμο είναι υποχρεωτικό' });
  });
export type PartnerInput = z.infer<typeof partnerInput>;

export const contactInput = z.object({
  name: z.string().trim().min(1, 'Το ονοματεπώνυμο είναι υποχρεωτικό').max(150),
  role: opt(120),
  phone: opt(40),
  mobile: opt(40),
  email: z.string().trim().max(200).email('Μη έγκυρο email').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  notes: opt(500),
  isPrimary: z.boolean().default(false),
});
export type ContactInput = z.infer<typeof contactInput>;

/** Εμφανιζόμενο όνομα: εταιρία = επωνυμία· πρόσωπο = «Επώνυμο Όνομα» (ταξινόμηση/αναζήτηση). */
export function partnerDisplayName(v: { type: PartnerType; name?: string | null; firstName?: string | null; lastName?: string | null }): string {
  if (v.type === 'PERSON') return [v.lastName, v.firstName].filter(Boolean).join(' ').trim();
  return (v.name ?? '').trim();
}

function toData(input: PartnerInput) {
  const isPerson = input.type === 'PERSON';
  return {
    type: input.type,
    name: partnerDisplayName(input),
    tradeName: isPerson ? null : input.tradeName,
    firstName: isPerson ? input.firstName : null,
    lastName: isPerson ? input.lastName : null,
    specialty: input.specialty,
    afm: input.afm ? input.afm.replace(/\s+/g, '').toUpperCase() : null,
    doy: input.doy,
    country: input.country ? input.country.toUpperCase() : 'GR',
    address: input.address, city: input.city, zip: input.zip,
    phone: input.phone, mobile: input.mobile, email: input.email, website: input.website,
    notes: input.notes, isActive: input.isActive,
  };
}

export type PartnerListRow = {
  id: string;
  type: PartnerType;
  name: string;
  tradeName: string | null;
  specialty: string | null;
  afm: string | null;
  city: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  isActive: boolean;
  contactCount: number;
  customerCount: number;
  projectCount: number;
  /** Ονόματα πελατών, για αναζήτηση/εμφάνιση στη λίστα. */
  customers: string;
  updatedAt: string;
};

export async function listPartners(): Promise<PartnerListRow[]> {
  const rows = await prisma.partner.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { contacts: true, customers: true, projects: true } }, customers: { select: { trdr: true } } },
  });
  const trdrs = [...new Set(rows.flatMap((r) => r.customers.map((c) => c.trdr)))];
  const names = new Map(
    (await prisma.softoneTrader.findMany({ where: { trdr: { in: trdrs } }, select: { trdr: true, name: true } })).map((t) => [t.trdr, t.name]),
  );
  return rows.map((r) => ({
    id: r.id, type: r.type, name: r.name, tradeName: r.tradeName, specialty: r.specialty, afm: r.afm, city: r.city,
    phone: r.phone, mobile: r.mobile, email: r.email, isActive: r.isActive,
    contactCount: r._count.contacts, customerCount: r._count.customers, projectCount: r._count.projects,
    customers: r.customers.map((c) => names.get(c.trdr) ?? `#${c.trdr}`).join(', '),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export type PartnerDetail = {
  partner: {
    id: string; type: PartnerType; name: string; tradeName: string | null; firstName: string | null; lastName: string | null;
    specialty: string | null; afm: string | null; doy: string | null; country: string | null; address: string | null;
    city: string | null; zip: string | null; phone: string | null; mobile: string | null; email: string | null;
    website: string | null; notes: string | null; isActive: boolean; createdAt: string; updatedAt: string;
  };
  contacts: { id: string; name: string; role: string | null; phone: string | null; mobile: string | null; email: string | null; notes: string | null; isPrimary: boolean }[];
  customers: { trdr: number; code: string | null; name: string; afm: string | null; city: string | null; phone: string | null; projectCount: number; linkedAt: string }[];
  projects: { prjc: number; code: string | null; name: string; trdr: number | null; customer: string | null; isActive: boolean; role: string | null; linkedAt: string }[];
};

export async function getPartnerDetail(id: string): Promise<PartnerDetail | null> {
  const p = await prisma.partner.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] },
      customers: { orderBy: { createdAt: 'asc' } },
      projects: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!p) return null;

  const trdrs = p.customers.map((c) => c.trdr);
  const prjcs = p.projects.map((x) => x.prjc);
  const [traders, projects] = await Promise.all([
    prisma.softoneTrader.findMany({ where: { trdr: { in: trdrs } }, select: { trdr: true, code: true, name: true, afm: true, city: true, phone: true } }),
    prisma.softoneProject.findMany({ where: { prjc: { in: prjcs } }, select: { prjc: true, code: true, name: true, trdr: true, isActive: true } }),
  ]);
  const tById = new Map(traders.map((t) => [t.trdr, t]));
  const pById = new Map(projects.map((x) => [x.prjc, x]));
  const projPerCustomer = new Map<number, number>();
  for (const x of projects) if (x.trdr != null) projPerCustomer.set(x.trdr, (projPerCustomer.get(x.trdr) ?? 0) + 1);

  const { contacts, customers, projects: links, ...rest } = p;
  return {
    partner: { ...rest, createdAt: rest.createdAt.toISOString(), updatedAt: rest.updatedAt.toISOString() },
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, role: c.role, phone: c.phone, mobile: c.mobile, email: c.email, notes: c.notes, isPrimary: c.isPrimary })),
    customers: customers.map((c) => {
      const t = tById.get(c.trdr);
      return {
        trdr: c.trdr, code: t?.code ?? null, name: t?.name ?? `Πελάτης #${c.trdr}`, afm: t?.afm ?? null, city: t?.city ?? null,
        phone: t?.phone ?? null, projectCount: projPerCustomer.get(c.trdr) ?? 0, linkedAt: c.createdAt.toISOString(),
      };
    }),
    projects: links.map((l) => {
      const x = pById.get(l.prjc);
      return {
        prjc: l.prjc, code: x?.code ?? null, name: x?.name ?? `Έργο #${l.prjc}`, trdr: x?.trdr ?? null,
        customer: x?.trdr != null ? tById.get(x.trdr)?.name ?? null : null, isActive: x?.isActive ?? false,
        role: l.role, linkedAt: l.createdAt.toISOString(),
      };
    }),
  };
}

async function mustExist(id: string) {
  const p = await prisma.partner.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!p) throw new PartnerError('Ο συνεργάτης δεν υπάρχει', 404);
  return p;
}

export async function createPartner(input: PartnerInput) {
  return prisma.partner.create({ data: toData(input), select: { id: true, name: true } });
}

export async function updatePartner(id: string, input: PartnerInput) {
  await mustExist(id);
  return prisma.partner.update({ where: { id }, data: toData(input), select: { id: true, name: true } });
}

export async function deletePartner(id: string) {
  const p = await mustExist(id);
  await prisma.partner.delete({ where: { id } }); // cascade: πρόσωπα, πελάτες, έργα
  return p;
}

// ── Πρόσωπα ────────────────────────────────────────────────────────────────────────────────────

/** Ένα μόνο «κύριο» πρόσωπο ανά συνεργάτη: όταν ορίζεται νέο, τα υπόλοιπα χάνουν τη σήμανση. */
export async function addContact(partnerId: string, input: ContactInput) {
  const p = await prisma.partner.findUnique({ where: { id: partnerId }, select: { type: true } });
  if (!p) throw new PartnerError('Ο συνεργάτης δεν υπάρχει', 404);
  if (p.type !== 'COMPANY') throw new PartnerError('Πρόσωπα επικοινωνίας έχουν μόνο οι εταιρίες');
  return prisma.$transaction(async (tx) => {
    const count = await tx.partnerContact.count({ where: { partnerId } });
    const isPrimary = input.isPrimary || count === 0;
    if (isPrimary) await tx.partnerContact.updateMany({ where: { partnerId }, data: { isPrimary: false } });
    return tx.partnerContact.create({ data: { ...input, isPrimary, partnerId, sortOrder: count } });
  });
}

export async function updateContact(partnerId: string, contactId: string, input: ContactInput) {
  const c = await prisma.partnerContact.findFirst({ where: { id: contactId, partnerId }, select: { id: true } });
  if (!c) throw new PartnerError('Το πρόσωπο δεν υπάρχει', 404);
  return prisma.$transaction(async (tx) => {
    if (input.isPrimary) await tx.partnerContact.updateMany({ where: { partnerId, id: { not: contactId } }, data: { isPrimary: false } });
    return tx.partnerContact.update({ where: { id: contactId }, data: input });
  });
}

export async function deleteContact(partnerId: string, contactId: string) {
  const c = await prisma.partnerContact.findFirst({ where: { id: contactId, partnerId } });
  if (!c) throw new PartnerError('Το πρόσωπο δεν υπάρχει', 404);
  await prisma.$transaction(async (tx) => {
    await tx.partnerContact.delete({ where: { id: contactId } });
    // Αν έφυγε το κύριο, κύριο γίνεται το πρώτο που απομένει.
    if (c.isPrimary) {
      const next = await tx.partnerContact.findFirst({ where: { partnerId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
      if (next) await tx.partnerContact.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  });
  return c;
}

// ── Πελάτες & έργα ─────────────────────────────────────────────────────────────────────────────

export const linkCustomersInput = z.object({ trdrs: z.array(z.number().int().positive()).min(1).max(200) });
export const linkProjectInput = z.object({ prjc: z.number().int().positive(), role: opt(120) });

/** Συσχέτιση με πελάτες — μόνο συναλλασσόμενοι τύπου «Πελάτης». Οι ήδη συνδεδεμένοι αγνοούνται. */
export async function linkCustomers(partnerId: string, trdrs: number[]) {
  await mustExist(partnerId);
  const found = await prisma.softoneTrader.findMany({ where: { trdr: { in: trdrs } }, select: { trdr: true, sodtype: true, name: true } });
  const bad = trdrs.filter((t) => found.find((f) => f.trdr === t)?.sodtype !== CUSTOMER_SODTYPE);
  if (bad.length) throw new PartnerError(`Δεν είναι πελάτες: ${bad.join(', ')}`);
  const r = await prisma.partnerCustomer.createMany({ data: trdrs.map((trdr) => ({ partnerId, trdr })), skipDuplicates: true });
  return { added: r.count };
}

/** Αποσύνδεση πελάτη — μαζί φεύγουν και τα έργα ΑΥΤΟΥ του πελάτη από τον συνεργάτη. */
export async function unlinkCustomer(partnerId: string, trdr: number) {
  const link = await prisma.partnerCustomer.findUnique({ where: { partnerId_trdr: { partnerId, trdr } } });
  if (!link) throw new PartnerError('Ο πελάτης δεν είναι συνδεδεμένος', 404);
  const theirs = (await prisma.softoneProject.findMany({ where: { trdr }, select: { prjc: true } })).map((x) => x.prjc);
  const [, removed] = await prisma.$transaction([
    prisma.partnerCustomer.delete({ where: { partnerId_trdr: { partnerId, trdr } } }),
    prisma.partnerProject.deleteMany({ where: { partnerId, prjc: { in: theirs } } }),
  ]);
  return { projectsRemoved: removed.count };
}

/** Συσχέτιση με έργο — το έργο ΠΡΕΠΕΙ να ανήκει σε πελάτη που είναι ήδη συνδεδεμένος. */
export async function linkProject(partnerId: string, prjc: number, role: string | null) {
  await mustExist(partnerId);
  const project = await prisma.softoneProject.findUnique({ where: { prjc }, select: { prjc: true, trdr: true, name: true } });
  if (!project) throw new PartnerError('Το έργο δεν υπάρχει', 404);
  if (project.trdr == null) throw new PartnerError('Το έργο δεν έχει πελάτη στο SoftOne');
  const linked = await prisma.partnerCustomer.findUnique({ where: { partnerId_trdr: { partnerId, trdr: project.trdr } } });
  if (!linked) throw new PartnerError('Σύνδεσε πρώτα τον πελάτη του έργου');
  return prisma.partnerProject.upsert({
    where: { partnerId_prjc: { partnerId, prjc } },
    create: { partnerId, prjc, role },
    update: { role },
  });
}

export async function unlinkProject(partnerId: string, prjc: number) {
  const r = await prisma.partnerProject.deleteMany({ where: { partnerId, prjc } });
  if (r.count === 0) throw new PartnerError('Το έργο δεν είναι συνδεδεμένο', 404);
}

/** Επιλογές για τις συσχετίσεις: όλοι οι πελάτες και τα έργα που έχουν πελάτη. */
export async function partnerLinkOptions() {
  const [customers, projects] = await Promise.all([
    prisma.softoneTrader.findMany({
      where: { sodtype: CUSTOMER_SODTYPE }, orderBy: { name: 'asc' },
      select: { trdr: true, code: true, name: true, afm: true, city: true, isActive: true },
    }),
    prisma.softoneProject.findMany({
      where: { trdr: { not: null } }, orderBy: { name: 'asc' },
      select: { prjc: true, code: true, name: true, trdr: true, isActive: true },
    }),
  ]);
  return { customers, projects };
}
export type PartnerLinkOptions = Awaited<ReturnType<typeof partnerLinkOptions>>;
