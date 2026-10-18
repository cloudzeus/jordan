import 'server-only';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { RoleKey } from '@prisma/client';
import { appUrl } from '@/lib/app-url';
import { welcomeEmail } from '@/lib/email/templates';
import type { EmailBrand } from '@/lib/email/layout';

/**
 * Πρόσβαση πελατών & συνεργατών στο portal.
 *
 * Ο χρήστης φτιάχνεται ΠΑΝΩ σε ένα πρόσωπο επικοινωνίας:
 *  • πρόσωπο πελάτη (CustomerContact, SoftOne TRDR) → ρόλος CUSTOMER, `User.customerTrdr`·
 *  • πρόσωπο εταιρίας-συνεργάτη (PartnerContact) → ρόλος COLLABORATOR, `User.partnerId`·
 *  • συνεργάτης φυσικό πρόσωπο (Partner, PERSON) → ρόλος COLLABORATOR για τον ίδιο.
 * Ο κωδικός ορίζεται από τον διαχειριστή (bcrypt cost 12, όπως οι υπόλοιποι χρήστες). Το email
 * καλωσορίσματος ΔΕΝ περιέχει τον κωδικό — μόνο το όνομα χρήστη και τον σύνδεσμο σύνδεσης.
 */

export class AccessError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export type HolderKind = 'customer-contact' | 'partner-contact' | 'partner';

const opt = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const email = z.string().trim().max(200).email('Μη έγκυρο email').optional().nullable().or(z.literal('')).transform((v) => (v ? v.toLowerCase() : null));

export const customerContactInput = z.object({
  name: z.string().trim().min(1, 'Το ονοματεπώνυμο είναι υποχρεωτικό').max(150),
  role: opt(120), phone: opt(40), mobile: opt(40), email, notes: opt(500),
  isPrimary: z.boolean().default(false),
});

/** Κωδικός: ≥ 8 χαρακτήρες, γράμματα ΚΑΙ αριθμοί. */
export const passwordSchema = z.string()
  .min(8, 'Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες')
  .max(128)
  .refine((p) => /[A-Za-zΑ-Ωα-ω]/.test(p) && /\d/.test(p), 'Ο κωδικός θέλει γράμματα και αριθμούς');

export const grantInput = z.object({
  email: z.string().trim().toLowerCase().email('Μη έγκυρο email'),
  password: passwordSchema,
  sendWelcome: z.boolean().default(true),
});

// ── Πρόσωπα πελάτη ─────────────────────────────────────────────────────────────────────────

async function lastLogins(userIds: string[]) {
  if (!userIds.length) return new Map<string, Date>();
  const rows = await prisma.auditLog.groupBy({ by: ['userId'], where: { userId: { in: userIds }, action: 'auth.login' }, _max: { createdAt: true } });
  return new Map(rows.filter((r) => r.userId && r._max.createdAt).map((r) => [r.userId!, r._max.createdAt!]));
}

const userView = (u: { id: string; email: string; isActive: boolean; createdAt: Date } | null, last: Map<string, Date>) =>
  u ? { id: u.id, email: u.email, isActive: u.isActive, createdAt: u.createdAt.toISOString(), lastLogin: last.get(u.id)?.toISOString() ?? null } : null;

export type AccessUser = ReturnType<typeof userView>;

export async function listCustomerContacts(trdr: number) {
  const rows = await prisma.customerContact.findMany({
    where: { trdr }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { user: { select: { id: true, email: true, isActive: true, createdAt: true } } },
  });
  const last = await lastLogins(rows.map((r) => r.userId).filter((x): x is string => !!x));
  return rows.map(({ user, ...c }) => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), user: userView(user, last) }));
}

async function mustBeCustomer(trdr: number) {
  const t = await prisma.softoneTrader.findUnique({ where: { trdr }, select: { sodtype: true } });
  if (t?.sodtype !== 13) throw new AccessError('Ο συναλλασσόμενος δεν είναι πελάτης', 404);
}

export async function addCustomerContact(trdr: number, input: z.infer<typeof customerContactInput>) {
  await mustBeCustomer(trdr);
  return prisma.$transaction(async (tx) => {
    const count = await tx.customerContact.count({ where: { trdr } });
    const isPrimary = input.isPrimary || count === 0;
    if (isPrimary) await tx.customerContact.updateMany({ where: { trdr }, data: { isPrimary: false } });
    return tx.customerContact.create({ data: { ...input, isPrimary, trdr, sortOrder: count } });
  });
}

export async function updateCustomerContact(trdr: number, id: string, input: z.infer<typeof customerContactInput>) {
  const c = await prisma.customerContact.findFirst({ where: { id, trdr } });
  if (!c) throw new AccessError('Το πρόσωπο δεν υπάρχει', 404);
  return prisma.$transaction(async (tx) => {
    if (input.isPrimary) await tx.customerContact.updateMany({ where: { trdr, id: { not: id } }, data: { isPrimary: false } });
    const updated = await tx.customerContact.update({ where: { id }, data: input });
    // Το όνομα του χρήστη ακολουθεί το πρόσωπο.
    if (c.userId && input.name !== c.name) await tx.user.update({ where: { id: c.userId }, data: { name: input.name } });
    return updated;
  });
}

/** Διαγραφή προσώπου: μαζί και ο χρήστης του (η πρόσβαση κόβεται αμέσως). */
export async function deleteCustomerContact(trdr: number, id: string) {
  const c = await prisma.customerContact.findFirst({ where: { id, trdr } });
  if (!c) throw new AccessError('Το πρόσωπο δεν υπάρχει', 404);
  await prisma.$transaction(async (tx) => {
    await tx.customerContact.delete({ where: { id } });
    if (c.userId) await tx.user.delete({ where: { id: c.userId } });
    if (c.isPrimary) {
      const next = await tx.customerContact.findFirst({ where: { trdr }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
      if (next) await tx.customerContact.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  });
  return c;
}

// ── Πρόσβαση (χρήστης) ─────────────────────────────────────────────────────────────────────

type Holder = { name: string; userId: string | null; roleKey: RoleKey; customerTrdr: number | null; partnerId: string | null; orgName: string; contactEmail: string | null };

async function loadHolder(kind: HolderKind, id: string): Promise<Holder> {
  if (kind === 'customer-contact') {
    const c = await prisma.customerContact.findUnique({ where: { id } });
    if (!c) throw new AccessError('Το πρόσωπο δεν υπάρχει', 404);
    const t = await prisma.softoneTrader.findUnique({ where: { trdr: c.trdr }, select: { name: true } });
    return { name: c.name, userId: c.userId, roleKey: 'CUSTOMER', customerTrdr: c.trdr, partnerId: null, orgName: t?.name ?? '', contactEmail: c.email };
  }
  if (kind === 'partner-contact') {
    const c = await prisma.partnerContact.findUnique({ where: { id }, include: { partner: { select: { id: true, name: true } } } });
    if (!c) throw new AccessError('Το πρόσωπο δεν υπάρχει', 404);
    return { name: c.name, userId: c.userId, roleKey: 'COLLABORATOR', customerTrdr: null, partnerId: c.partner.id, orgName: c.partner.name, contactEmail: c.email };
  }
  const p = await prisma.partner.findUnique({ where: { id } });
  if (!p) throw new AccessError('Ο συνεργάτης δεν υπάρχει', 404);
  if (p.type !== 'PERSON') throw new AccessError('Σε εταιρία η πρόσβαση δίνεται σε πρόσωπο επικοινωνίας');
  return { name: p.name, userId: p.userId, roleKey: 'COLLABORATOR', customerTrdr: null, partnerId: p.id, orgName: p.name, contactEmail: p.email };
}

async function linkUser(kind: HolderKind, id: string, userId: string | null, tx: Pick<typeof prisma, 'customerContact' | 'partnerContact' | 'partner'>) {
  if (kind === 'customer-contact') await tx.customerContact.update({ where: { id }, data: { userId } });
  else if (kind === 'partner-contact') await tx.partnerContact.update({ where: { id }, data: { userId } });
  else await tx.partner.update({ where: { id }, data: { userId } });
}

/** Δημιουργεί χρήστη για το πρόσωπο. Το email πρέπει να είναι ελεύθερο σε ΟΛΟΥΣ τους χρήστες. */
export async function grantAccess(kind: HolderKind, id: string, input: z.infer<typeof grantInput>) {
  const h = await loadHolder(kind, id);
  if (h.userId) throw new AccessError('Το πρόσωπο έχει ήδη πρόσβαση — άλλαξε τον κωδικό του αντί για νέο χρήστη', 409);
  const exists = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (exists) throw new AccessError(`Το email ${input.email} χρησιμοποιείται ήδη από άλλον χρήστη`, 409);
  const role = await prisma.role.findUnique({ where: { key: h.roleKey }, select: { id: true } });
  if (!role) throw new AccessError(`Λείπει ο ρόλος ${h.roleKey} — τρέξε το seed ρόλων`, 500);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: input.email, name: h.name, passwordHash, roleId: role.id, emailVerified: new Date(), isActive: true,
        customerTrdr: h.customerTrdr, partnerId: h.partnerId,
      },
      select: { id: true, email: true },
    });
    await linkUser(kind, id, u.id, tx);
    // Το email επικοινωνίας του προσώπου συμπληρώνεται αν έλειπε.
    if (!h.contactEmail) {
      if (kind === 'customer-contact') await tx.customerContact.update({ where: { id }, data: { email: input.email } });
      else if (kind === 'partner-contact') await tx.partnerContact.update({ where: { id }, data: { email: input.email } });
    }
    return u;
  });
  let welcome: 'sent' | 'failed' | 'skipped' = 'skipped';
  if (input.sendWelcome) {
    try { await sendWelcome(user.email, h.name, h.orgName); welcome = 'sent'; } catch { welcome = 'failed'; }
  }
  return { userId: user.id, email: user.email, role: h.roleKey, welcome };
}

/** Ο χρήστης του προσώπου — και έλεγχος ότι είναι ΕΞΩΤΕΡΙΚΟΣ (ποτέ admin/υπάλληλος από εδώ). */
async function holderUser(kind: HolderKind, id: string) {
  const h = await loadHolder(kind, id);
  if (!h.userId) throw new AccessError('Το πρόσωπο δεν έχει πρόσβαση', 404);
  const u = await prisma.user.findUnique({ where: { id: h.userId }, include: { role: { select: { key: true } } } });
  if (!u || (u.role.key !== 'CUSTOMER' && u.role.key !== 'COLLABORATOR')) throw new AccessError('Ο χρήστης δεν είναι πελάτης/συνεργάτης', 403);
  return { h, u };
}

export async function setPassword(kind: HolderKind, id: string, password: string) {
  const { u } = await holderUser(kind, id);
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  // Οι ανοιχτές συνεδρίες κλείνουν: ο παλιός κωδικός δεν πρέπει να «κρατά» κανέναν μέσα.
  await prisma.session.deleteMany({ where: { userId: u.id } });
  return { userId: u.id };
}

export async function setActive(kind: HolderKind, id: string, active: boolean) {
  const { u } = await holderUser(kind, id);
  await prisma.user.update({ where: { id: u.id }, data: { isActive: active } });
  if (!active) await prisma.session.deleteMany({ where: { userId: u.id } });
  return { userId: u.id, isActive: active };
}

/** Αφαίρεση πρόσβασης: διαγράφεται ο χρήστης· το πρόσωπο μένει. */
export async function revokeAccess(kind: HolderKind, id: string) {
  const { u } = await holderUser(kind, id);
  await prisma.user.delete({ where: { id: u.id } }); // onDelete: SetNull στο πρόσωπο
  return { userId: u.id, email: u.email };
}

export async function resendWelcome(kind: HolderKind, id: string) {
  const { h, u } = await holderUser(kind, id);
  await sendWelcome(u.email, h.name, h.orgName);
  return { email: u.email };
}

/** Κατάσταση πρόσβασης για συνεργάτη: τα πρόσωπά του (εταιρία) ή ο ίδιος (πρόσωπο). */
export async function partnerAccess(partnerId: string) {
  const p = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: { user: { select: { id: true, email: true, isActive: true, createdAt: true } }, contacts: { include: { user: { select: { id: true, email: true, isActive: true, createdAt: true } } } } },
  });
  if (!p) throw new AccessError('Ο συνεργάτης δεν υπάρχει', 404);
  const ids = [p.userId, ...p.contacts.map((c) => c.userId)].filter((x): x is string => !!x);
  const last = await lastLogins(ids);
  return {
    self: p.type === 'PERSON' ? userView(p.user, last) : null,
    contacts: Object.fromEntries(p.contacts.map((c) => [c.id, userView(c.user, last)])),
  };
}

// ── Email καλωσορίσματος (κοινό πρότυπο: lib/email/templates.ts → welcomeEmail) ───────────────

export function welcomeEmailHtml(d: { name: string; email: string; orgName: string; company: string; loginUrl: string; lostUrl: string; brand?: EmailBrand }) {
  return welcomeEmail(d.brand ?? { name: d.company }, d).html;
}

async function sendWelcome(to: string, name: string, orgName: string) {
  const [{ emailBrand }, { sendTransactionalEmail }, { getSetting }] = await Promise.all([import('@/lib/email/brand'), import('@/lib/mailgun'), import('@/lib/settings')]);
  const [brand, contactEmail] = await Promise.all([emailBrand(), getSetting<string>('company.email')]);
  const base = appUrl();
  const m = welcomeEmail(brand, { name, email: to, orgName, loginUrl: `${base}/auth/signin`, lostUrl: `${base}/auth/lost-password` });
  await sendTransactionalEmail(to, m.subject, m.html, { replyTo: contactEmail, fromName: brand.name, text: m.text });
}
