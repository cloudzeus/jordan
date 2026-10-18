import 'server-only';
import { prisma } from '@/lib/db';
import { SODTYPE_LABEL } from '@/lib/softone';
import { softoneCreateCustomer, type CustomerInput } from '@/lib/softone-lead';

/**
 * «Με ποιον» είναι ένα ραντεβού του προσωπικού: συναλλασσόμενος του SoftOne (καθρέφτης
 * SoftoneTrader), επαφή συναλλασσομένου (CustomerContact), συνεργάτης ή επαφή συνεργάτη — ή νέος
 * πελάτης που δημιουργείται ΚΑΙ στο SoftOne (CUSTOMER).
 */

export type PartyKind = 'trader' | 'contact' | 'partner' | 'partnerContact';
export type PartyRef = { kind: PartyKind; id: string };
export type PartyHit = PartyRef & { label: string; sub: string; email: string | null; phone: string | null };
/** Στιγμιότυπο που γράφεται στο ραντεβού. */
export type PartySnapshot = {
  name: string; company: string | null; email: string | null; phone: string | null;
  trdr: number | null; customerContactId: string | null; partnerId: string | null; partnerContactId: string | null;
};

const ci = (q: string) => ({ contains: q, mode: 'insensitive' as const });

export async function searchParties(raw: string, take = 8): Promise<PartyHit[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const [traders, contacts, partners, pcontacts] = await Promise.all([
    prisma.softoneTrader.findMany({ where: { isActive: true, OR: [{ name: ci(q) }, { code: ci(q) }, { afm: { startsWith: q } }, { email: ci(q) }] }, take, orderBy: { name: 'asc' } }),
    prisma.customerContact.findMany({ where: { OR: [{ name: ci(q) }, { email: ci(q) }, { phone: { contains: q } }, { mobile: { contains: q } }] }, take, orderBy: { name: 'asc' } }),
    prisma.partner.findMany({ where: { isActive: true, OR: [{ name: ci(q) }, { tradeName: ci(q) }, { afm: { startsWith: q } }, { email: ci(q) }] }, take, orderBy: { name: 'asc' } }),
    prisma.partnerContact.findMany({ where: { OR: [{ name: ci(q) }, { email: ci(q) }, { phone: { contains: q } }, { mobile: { contains: q } }] }, take, orderBy: { name: 'asc' }, include: { partner: { select: { name: true } } } }),
  ]);
  const owners = new Map((await prisma.softoneTrader.findMany({ where: { trdr: { in: [...new Set(contacts.map((c) => c.trdr))] } }, select: { trdr: true, name: true } })).map((t) => [t.trdr, t.name]));
  const join = (...xs: (string | null | undefined)[]) => xs.filter(Boolean).join(' · ');
  return [
    ...traders.map((t) => ({ kind: 'trader' as const, id: String(t.trdr), label: t.name, sub: join(SODTYPE_LABEL[t.sodtype] ?? t.kind, t.code, t.afm && `ΑΦΜ ${t.afm}`, t.city), email: t.email, phone: t.phone })),
    ...contacts.map((c) => ({ kind: 'contact' as const, id: c.id, label: c.name, sub: join('Επαφή', owners.get(c.trdr) ?? `Πελάτης #${c.trdr}`, c.role), email: c.email, phone: c.mobile || c.phone })),
    ...partners.map((p) => ({ kind: 'partner' as const, id: p.id, label: p.tradeName || p.name, sub: join('Συνεργάτης', p.specialty, p.city), email: p.email, phone: p.mobile || p.phone })),
    ...pcontacts.map((c) => ({ kind: 'partnerContact' as const, id: c.id, label: c.name, sub: join('Επαφή συνεργάτη', c.partner.name, c.role), email: c.email, phone: c.mobile || c.phone })),
  ];
}

export class PartyError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function resolveParty(ref: PartyRef): Promise<PartySnapshot> {
  const none = { trdr: null, customerContactId: null, partnerId: null, partnerContactId: null };
  if (ref.kind === 'trader') {
    const t = await prisma.softoneTrader.findUnique({ where: { trdr: Number(ref.id) } });
    if (!t) throw new PartyError('Ο συναλλασσόμενος δεν βρέθηκε', 404);
    const primary = await prisma.customerContact.findFirst({ where: { trdr: t.trdr }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] });
    return { ...none, name: primary?.name ?? t.name, company: t.name, email: t.email || primary?.email || null, phone: t.phone || primary?.mobile || primary?.phone || null, trdr: t.trdr };
  }
  if (ref.kind === 'contact') {
    const c = await prisma.customerContact.findUnique({ where: { id: ref.id } });
    if (!c) throw new PartyError('Η επαφή δεν βρέθηκε', 404);
    const t = await prisma.softoneTrader.findUnique({ where: { trdr: c.trdr }, select: { name: true, email: true, phone: true } });
    return { ...none, name: c.name, company: t?.name ?? null, email: c.email || t?.email || null, phone: c.mobile || c.phone || t?.phone || null, trdr: c.trdr, customerContactId: c.id };
  }
  if (ref.kind === 'partner') {
    const p = await prisma.partner.findUnique({ where: { id: ref.id } });
    if (!p) throw new PartyError('Ο συνεργάτης δεν βρέθηκε', 404);
    return { ...none, name: p.tradeName || p.name, company: p.type === 'COMPANY' ? p.name : null, email: p.email, phone: p.mobile || p.phone, partnerId: p.id };
  }
  const c = await prisma.partnerContact.findUnique({ where: { id: ref.id }, include: { partner: true } });
  if (!c) throw new PartyError('Η επαφή συνεργάτη δεν βρέθηκε', 404);
  return { ...none, name: c.name, company: c.partner.name, email: c.email || c.partner.email, phone: c.mobile || c.phone || c.partner.phone, partnerId: c.partnerId, partnerContactId: c.id };
}

export type NewCustomerInput = CustomerInput & { name: string; contactName?: string | null };

/**
 * Νέος πελάτης από το modal: γράφεται στο SoftOne (με ΑΦΜ → κανονικός πελάτης, χωρίς ΑΦΜ →
 * υποψήφιος), μπαίνει στον καθρέφτη SoftoneTrader ώστε να βρίσκεται αμέσως στις αναζητήσεις, και —
 * αν δόθηκε υπεύθυνος — δημιουργείται επαφή του (CustomerContact, μόνο στην εφαρμογή).
 */
export async function createCustomerParty(input: NewCustomerInput): Promise<PartySnapshot & { code: string; linked: boolean }> {
  const afm = input.afm?.replace(/\s/g, '') || null;
  const r = await softoneCreateCustomer({ ...input, afm, company: input.name, name: input.contactName ?? null, note: 'Από ραντεβού (εφαρμογή)' }, { prospect: !afm });
  const mirror = { sodtype: 13, kind: SODTYPE_LABEL[13], code: r.code, name: input.name.trim(), afm, profession: input.profession ?? null, address: input.address ?? null, city: input.city ?? null, zip: input.zip ?? null, phone: input.phone ?? null, email: input.email ?? null, isActive: true };
  // Υπάρχων πελάτης (linked): ο καθρέφτης ενημερώνεται από τον συγχρονισμό — δεν τον αλλάζουμε εδώ.
  if (!r.linked) await prisma.softoneTrader.upsert({ where: { trdr: r.trdr }, update: mirror, create: { trdr: r.trdr, ...mirror } });
  let contactId: string | null = null;
  if (input.contactName?.trim()) {
    const c = await prisma.customerContact.create({ data: { trdr: r.trdr, name: input.contactName.trim(), email: input.email ?? null, mobile: input.phone ?? null, isPrimary: !r.linked } });
    contactId = c.id;
  }
  const t = r.linked ? await prisma.softoneTrader.findUnique({ where: { trdr: r.trdr }, select: { name: true } }) : null;
  return {
    name: input.contactName?.trim() || input.name.trim(), company: t?.name ?? input.name.trim(), email: input.email ?? null, phone: input.phone ?? null,
    trdr: r.trdr, customerContactId: contactId, partnerId: null, partnerContactId: null, code: r.code, linked: r.linked,
  };
}
