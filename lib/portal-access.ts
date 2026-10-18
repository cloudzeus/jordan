import 'server-only';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { RoleKey } from '@prisma/client';
import { appUrl } from '@/lib/app-url';

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

// ── Email καλωσορίσματος ───────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function welcomeEmailHtml(d: { name: string; email: string; orgName: string; company: string; loginUrl: string; lostUrl: string; contact?: string | null }) {
  const F = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
  <tr><td bgcolor="#0f172a" style="padding:18px 24px;${F}font-size:18px;font-weight:800;color:#ffffff;">${esc(d.company)}</td></tr>
  <tr><td style="padding:28px;${F}color:#0f172a;">
    <h1 style="margin:0 0 12px;font-size:22px;">Καλώς ήρθατε${d.name ? `, ${esc(d.name)}` : ''}</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Σας δημιουργήσαμε πρόσβαση στην πλατφόρμα μας${d.orgName ? ` για λογαριασμό της <strong>${esc(d.orgName)}</strong>` : ''}. Εκεί θα βλέπετε τις προσφορές μας — όπως τα κοινά container με τιμή που πέφτει όσο γεμίζουν.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;"><tr><td style="padding:14px 16px;${F}font-size:14px;">
      <div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">Όνομα χρήστη</div>
      <div style="font-size:16px;font-weight:700;margin-top:2px;">${esc(d.email)}</div>
      <div style="color:#64748b;font-size:13px;margin-top:8px;">Τον κωδικό θα σας τον δώσει ο συνεργάτης μας. Μπορείτε επίσης να ορίσετε δικό σας από το «Ξέχασα τον κωδικό».</div>
    </td></tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr><td bgcolor="#0369a1" style="border-radius:10px;">
      <a href="${esc(d.loginUrl)}" style="${F}display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Σύνδεση</a>
    </td></tr></table>
    <p style="margin:10px 0 0;font-size:12px;color:#64748b;">Ξεχάσατε τον κωδικό; <a href="${esc(d.lostUrl)}" style="color:#0369a1;">Ορίστε νέο</a></p>
  </td></tr>
  <tr><td bgcolor="#f1f5f9" style="padding:14px 28px;${F}font-size:12px;color:#64748b;">${esc(d.company)}${d.contact ? ` · ${esc(d.contact)}` : ''}<br>Αν δεν περιμένατε αυτό το μήνυμα, απλώς αγνοήστε το.</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendWelcome(to: string, name: string, orgName: string) {
  const { getSetting } = await import('@/lib/settings');
  const { sendTransactionalEmail } = await import('@/lib/mailgun');
  const [company, phone, contactEmail] = await Promise.all([getSetting<string>('company.name'), getSetting<string>('company.phone'), getSetting<string>('company.email')]);
  const base = appUrl();
  const html = welcomeEmailHtml({
    name, email: to, orgName, company: (company ?? 'ATELIER').trim(), loginUrl: `${base}/auth/signin`, lostUrl: `${base}/auth/lost-password`,
    contact: [phone, contactEmail].filter(Boolean).join(' · ') || null,
  });
  await sendTransactionalEmail(to, `Η πρόσβασή σας στο ${(company ?? 'ATELIER').trim()}`, html, { replyTo: contactEmail, fromName: (company ?? 'ATELIER').trim() });
}
