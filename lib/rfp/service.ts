// lib/rfp/service.ts — SERVER. Αιτήματα προσφοράς (RFP) προς συνεργεία: δημιουργία με PDF specs
// (χωρίς τις τιμές μας), αποστολή με μοναδικό σύνδεσμο, απάντηση από σύνδεσμο ή portal, ημερολόγιο
// συνεδρίας με αλυσίδα hash (απόδειξη) και ανάθεση (το συνεργείο μπαίνει στη σύμβαση).
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { appUrl } from '@/lib/app-url';
import { bunnyDownload } from '@/lib/bunny';
import { emailBrand } from '@/lib/email/brand';
import { button, callout, facts, none, paragraph, renderEmail } from '@/lib/email/layout';
import { sendLeadMail } from '@/lib/lead-mail';
import { uploadEntityFile } from '@/lib/entity-files/service';
import { floorPlanForDocument } from '@/lib/floorplan/plans';
import { KIND_LABEL, dayEl, eur, type ContractKind } from '@/lib/contracts/core';
import { areaOnly, bidInput, canRespond, distributeAmount, rfpRef, type BidInput } from './core';
import { eventHash, hashToken, newToken, sha256, validToken, verifyChain } from './chain';
import { renderRfpPdf } from './pdf';
import type { PartyRef } from '@/lib/rbac';

export class RfpError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

type User = { id: string; name: string | null; email: string };
/** Πλαίσιο καταγραφής: ποιος/από πού (για την απόδειξη). */
export type EventCtx = { actor: 'link' | 'portal' | 'staff' | 'system'; userId?: string | null; ip?: string | null; userAgent?: string | null; sessionId?: string | null };

const SUBFOLDER = 'Αιτήματα προσφοράς';
const linkUrl = (token: string) => `${appUrl()}/rfp/${token}`;

// ── Ημερολόγιο (αλυσίδα hash) ───────────────────────────────────────────────────────────────
export async function logRfpEvent(recipientId: string, type: string, ctx: EventCtx, data: Record<string, unknown> = {}) {
  return prisma.$transaction(async (tx) => {
    // Σειριακά ανά παραλήπτη: δύο ταυτόχρονα γεγονότα θα «έδεναν» και τα δύο στο ίδιο προηγούμενο
    // (διακλάδωση της αλυσίδας). Το κλείδωμα λύνεται με το τέλος της συναλλαγής.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rfp:${recipientId}`}))`;
    const last = await tx.rfpEvent.findFirst({ where: { recipientId }, orderBy: [{ at: 'desc' }, { id: 'desc' }], select: { hash: true, at: true } });
    // Χρονοσφραγίδα πάντα μετά την προηγούμενη (σταθερή σειρά για την επαλήθευση).
    const at = new Date(Math.max(Date.now(), (last?.at.getTime() ?? 0) + 1));
    const e = {
      recipientId, type, at, actor: ctx.actor, userId: ctx.userId ?? null, ip: ctx.ip?.slice(0, 100) ?? null,
      userAgent: ctx.userAgent?.slice(0, 400) ?? null, sessionId: ctx.sessionId?.slice(0, 100) ?? null, data,
    };
    const prevHash = last?.hash ?? null;
    return tx.rfpEvent.create({ data: { ...e, data: data as object, prevHash, hash: eventHash(prevHash, e) } });
  });
}

export async function recipientEvents(recipientId: string) {
  const rows = await prisma.rfpEvent.findMany({ where: { recipientId }, orderBy: [{ at: 'asc' }, { id: 'asc' }] });
  const chain = verifyChain(rows.map((r) => ({ ...r, data: r.data as unknown })));
  return {
    chain,
    events: rows.map((r) => ({ id: r.id, type: r.type, at: r.at.toISOString(), actor: r.actor, userId: r.userId, ip: r.ip, userAgent: r.userAgent, sessionId: r.sessionId, data: r.data as Record<string, unknown>, hash: r.hash, prevHash: r.prevHash })),
  };
}

// ── Specs ──────────────────────────────────────────────────────────────────────────────────
async function contractForSpecs(contractId: string) {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
  if (!c) throw new RfpError('Η προσφορά/σύμβαση δεν βρέθηκε', 404);
  if (c.status === 'COMPLETED' || c.status === 'CANCELLED') throw new RfpError('Η σύμβαση είναι κλειστή', 409);
  if (!c.lines.length) throw new RfpError('Η προσφορά δεν έχει γραμμές — πρόσθεσε πρώτα υλικά/εργασίες', 409);
  return c;
}

/**
 * Η κάτοψη στα specs ΧΩΡΙΣ στοιχεία πελάτη: ουδέτερος τίτλος και κομμένο το υπόμνημα της εικόνας (εκεί
 * γράφεται ο τίτλος της χαρτογράφησης — συνήθως «κωδικός · πελάτης»). Ύψος υπομνήματος όπως το σχεδιάζει
 * το components/admin/floorplan/export.ts: lf = max(14, πλάτος/80), ύψος = lf × (4 + χώροι × 1,3).
 */
async function anonymousPlan(fp: Awaited<ReturnType<typeof floorPlanForDocument>>) {
  if (!fp) return null;
  let png = fp.png;
  if (png) {
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(png).metadata();
      const W = meta.width ?? 0, H = meta.height ?? 0;
      const lf = Math.max(14, Math.round(W / 80));
      const legend = Math.round(lf * (4 + fp.rows.length * 1.3));
      png = H - legend > 50 ? new Uint8Array(await sharp(png).extract({ left: 0, top: 0, width: W, height: H - legend }).png().toBuffer()) : null;
    } catch (e) {
      console.error('[rfp] crop plan legend', e);
      png = null; // καλύτερα χωρίς εικόνα παρά με στοιχεία πελάτη
    }
  }
  return { ...fp, title: 'Κάτοψη χώρων', png };
}

async function buildSpecsPdf(rfp: { number: number; title: string; scope: string; dueDate: Date | null }, contractId: string) {
  const c = await contractForSpecs(contractId);
  const [brand, floorPlan] = await Promise.all([emailBrand(), floorPlanForDocument(c.floorPlanId).then(anonymousPlan)]);
  return renderRfpPdf({
    ref: rfpRef(rfp.number), title: rfp.title, issuedOn: new Date(), dueDate: rfp.dueDate?.toISOString().slice(0, 10) ?? null,
    area: areaOnly(c), kindLabel: KIND_LABEL[c.kind as ContractKind] ?? c.kind, scope: rfp.scope,
    company: brand,
    lines: c.lines.map((l) => ({ kind: l.kind, name: l.name, qty: l.qty, unit: l.unit, notes: l.notes })),
    floorPlan,
  });
}

// ── Δημιουργία & αποστολή ───────────────────────────────────────────────────────────────────
export const rfpInput = z.object({
  title: z.string().trim().min(1, 'Δώστε τίτλο').max(200),
  scope: z.string().trim().max(10_000).default(''),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal('')).transform((v) => v || null),
  message: z.string().trim().max(2000).nullish().transform((v) => v || null),
  sendEmail: z.boolean().default(true),
  recipients: z.array(z.object({ kind: z.enum(['SUPPLIER', 'PARTNER']), ref: z.string().min(1).max(64) })).min(1, 'Διαλέξτε τουλάχιστον ένα συνεργείο').max(30),
});
export type RfpInput = z.infer<typeof rfpInput>;

async function recipientSnapshot(r: RfpInput['recipients'][number]) {
  if (r.kind === 'SUPPLIER') {
    const t = await prisma.softoneTrader.findUnique({ where: { trdr: Number(r.ref) }, select: { trdr: true, name: true, email: true, phone: true, afm: true } });
    if (!t) throw new RfpError('Ο προμηθευτής δεν βρέθηκε', 404);
    return { kind: 'SUPPLIER', trdr: t.trdr, partnerId: null, name: t.name, email: t.email, phone: t.phone, afm: t.afm, specialty: null };
  }
  const p = await prisma.partner.findUnique({ where: { id: r.ref }, select: { id: true, name: true, email: true, mobile: true, phone: true, afm: true, specialty: true } });
  if (!p) throw new RfpError('Ο συνεργάτης δεν βρέθηκε', 404);
  return { kind: 'PARTNER', trdr: null, partnerId: p.id, name: p.name, email: p.email, phone: p.mobile || p.phone, afm: p.afm, specialty: p.specialty };
}

type SendResult = 'sent' | 'skipped' | 'failed' | 'no-email';

async function sendInvite(recipientId: string, token: string, user: User, message: string | null): Promise<SendResult> {
  const r = await prisma.rfpRecipient.findUnique({ where: { id: recipientId }, include: { rfp: true } });
  if (!r) throw new RfpError('Ο παραλήπτης δεν βρέθηκε', 404);
  if (!r.email) return 'no-email';
  const ref = rfpRef(r.rfp.number);
  const [brand, pdf] = await Promise.all([
    emailBrand(),
    r.rfp.specsFileId ? prisma.entityFile.findUnique({ where: { id: r.rfp.specsFileId }, select: { storageKey: true } }).then((f) => (f ? bunnyDownload(f.storageKey) : null)) : null,
  ]);
  const m = renderEmail({
    brand,
    subject: `Αίτημα προσφοράς ${ref} · ${r.rfp.title}`,
    preheader: `Ζητάμε την προσφορά σας για «${r.rfp.title}» — specs στο συνημμένο PDF.`,
    label: 'Αίτημα προσφοράς', eyebrow: ref, title: r.rfp.title,
    greeting: `${r.name},`,
    intro: 'Ετοιμάζουμε ένα έργο και θα θέλαμε την προσφορά σας για τις εργασίες που περιγράφονται στο συνημμένο PDF (εργασίες, ποσότητες, κάτοψη και χώροι). Πατήστε το κουμπί για να δείτε το αίτημα και να δώσετε την τιμή σας.',
    blocks: [
      message ? callout('accent', message) : none,
      r.rfp.scope ? paragraph(r.rfp.scope) : none,
      facts([['Αριθμός', ref], ['Προθεσμία απάντησης', r.rfp.dueDate ? dayEl(r.rfp.dueDate) : 'Το συντομότερο']], { title: 'Στοιχεία' }),
      button(linkUrl(token), 'Άνοιγμα αιτήματος & υποβολή προσφοράς', { note: 'Ο σύνδεσμος είναι προσωπικός — μην τον προωθήσετε.' }),
    ],
    signoff: true,
  });
  const result = await sendLeadMail(r.email, m.subject, m.html, {
    text: m.text, replyTo: user.email,
    attachments: pdf ? [{ filename: r.rfp.specsFileName ?? `${ref}.pdf`, content: new Uint8Array(pdf), contentType: 'application/pdf' }] : undefined,
  });
  const sends = [...(Array.isArray(r.sends) ? r.sends : []), { to: r.email, at: new Date().toISOString(), by: user.name || user.email, result }];
  await prisma.rfpRecipient.update({ where: { id: r.id }, data: { sends } });
  await logRfpEvent(r.id, 'EMAIL_SENT', { actor: 'staff', userId: user.id }, { to: r.email, result, attachment: !!pdf });
  return result;
}

/**
 * Νέο αίτημα: specs PDF στα αρχεία (έργου, ή πελάτη πριν από το έργο), παραλήπτες με μοναδικό σύνδεσμο,
 * email (όπου υπάρχει διεύθυνση). Επιστρέφει τους συνδέσμους — φαίνονται ΜΟΝΟ τώρα (στη βάση μένει hash).
 */
export async function createRfp(contractId: string, raw: unknown, user: User) {
  const input = rfpInput.parse(raw);
  const c = await contractForSpecs(contractId);
  if (!c.prjc && !c.trdr) throw new RfpError('Η προσφορά χρειάζεται πελάτη ή έργο (για τον φάκελο αρχείων)', 409);
  const snaps = [];
  const seen = new Set<string>();
  for (const r of input.recipients) {
    const k = `${r.kind}:${r.ref}`;
    if (seen.has(k)) continue;
    seen.add(k);
    snaps.push(await recipientSnapshot(r));
  }

  const rfp = await prisma.rfp.create({
    data: { contractId, title: input.title, scope: input.scope, dueDate: input.dueDate ? new Date(input.dueDate) : null, createdById: user.id },
  });
  // Αν το PDF ή η αποθήκευσή του αποτύχει, δεν μένει «ανοιχτό» αίτημα χωρίς specs και παραλήπτες.
  let pdf: Buffer;
  try {
    pdf = await buildSpecsPdf(rfp, contractId);
    const fileName = `APR-${String(rfp.number).padStart(6, '0')}-specs.pdf`;
    const file = await uploadEntityFile({
      type: c.prjc ? 'PROJECT' : 'TRADER', id: (c.prjc ?? c.trdr)!, buffer: pdf, name: fileName, subfolder: SUBFOLDER,
      notes: `Αίτημα προσφοράς ${rfpRef(rfp.number)} — specs (χωρίς τιμές)`, user,
    });
    await prisma.rfp.update({ where: { id: rfp.id }, data: { specsFileId: file.id, specsFileName: fileName, specsSha256: sha256(pdf) } });
  } catch (e) {
    await prisma.rfp.delete({ where: { id: rfp.id } }).catch(() => null);
    throw e;
  }

  const out: { recipientId: string; name: string; email: string | null; url: string; email_result: SendResult | null }[] = [];
  for (const s of snaps) {
    const { token, hash } = newToken();
    const r = await prisma.rfpRecipient.create({ data: { ...s, rfpId: rfp.id, tokenHash: hash } });
    await logRfpEvent(r.id, 'INVITED', { actor: 'staff', userId: user.id }, { specsSha256: sha256(pdf), rfp: rfpRef(rfp.number) });
    const res = input.sendEmail ? await sendInvite(r.id, token, user, input.message) : null;
    out.push({ recipientId: r.id, name: r.name, email: r.email, url: linkUrl(token), email_result: res });
  }
  return { id: rfp.id, ref: rfpRef(rfp.number), recipients: out };
}

/** Νέος σύνδεσμος (ο παλιός παύει να ισχύει) + προαιρετικά ξανά email. */
export async function renewLink(recipientId: string, user: User, opts: { sendEmail: boolean }) {
  const r = await prisma.rfpRecipient.findUnique({ where: { id: recipientId }, include: { rfp: true } });
  if (!r) throw new RfpError('Ο παραλήπτης δεν βρέθηκε', 404);
  const { token, hash } = newToken();
  await prisma.rfpRecipient.update({ where: { id: r.id }, data: { tokenHash: hash } });
  await logRfpEvent(r.id, 'LINK_RENEWED', { actor: 'staff', userId: user.id });
  const email_result = opts.sendEmail ? await sendInvite(r.id, token, user, null) : null;
  return { url: linkUrl(token), email_result };
}

// ── Πλευρά συνεργείου (σύνδεσμος ή portal) ─────────────────────────────────────────────────
const recipientInclude = { rfp: { include: { contract: { select: { siteDistrict: true, siteCity: true, siteZip: true, kind: true, startDate: true, endDate: true } } } } } as const;

export async function recipientByToken(token: string) {
  if (!validToken(token)) return null;
  return prisma.rfpRecipient.findUnique({ where: { tokenHash: hashToken(token) }, include: recipientInclude });
}

const partyWhere = (p: PartyRef) => (p.partnerId ? { kind: 'PARTNER', partnerId: p.partnerId } : { kind: 'SUPPLIER', trdr: p.supplierTrdr! });

export async function partyRfps(p: PartyRef) {
  const rows = await prisma.rfpRecipient.findMany({ where: partyWhere(p), include: recipientInclude, orderBy: { createdAt: 'desc' }, take: 100 });
  return rows.map(publicView);
}
export async function partyRecipient(p: PartyRef, id: string) {
  const r = await prisma.rfpRecipient.findFirst({ where: { id, ...partyWhere(p) }, include: recipientInclude });
  return r;
}

type RecipientFull = NonNullable<Awaited<ReturnType<typeof recipientByToken>>>;

/** Ό,τι βλέπει το συνεργείο — χωρίς πελάτη, διεύθυνση ή τιμές μας. */
export function publicView(r: RecipientFull) {
  const ok = canRespond(r.rfp, r.status);
  return {
    recipientId: r.id, ref: rfpRef(r.rfp.number), title: r.rfp.title, scope: r.rfp.scope,
    dueDate: r.rfp.dueDate?.toISOString().slice(0, 10) ?? null, area: areaOnly(r.rfp.contract),
    kindLabel: KIND_LABEL[r.rfp.contract.kind as ContractKind] ?? r.rfp.contract.kind,
    rfpStatus: r.rfp.status, status: r.status, name: r.name, specsSha256: r.rfp.specsSha256, hasSpecs: !!r.rfp.specsFileId,
    bid: r.submittedAt ? { amount: r.amount, startDate: r.startDate?.toISOString().slice(0, 10) ?? null, durationDays: r.durationDays, notes: r.notes, submittedAt: r.submittedAt.toISOString() } : null,
    declinedAt: r.declinedAt?.toISOString() ?? null,
    canRespond: ok.ok, closedReason: ok.ok ? null : ok.reason,
    createdAt: r.createdAt.toISOString(),
  };
}
export type RfpPublicView = ReturnType<typeof publicView>;

export async function markViewed(r: RecipientFull, ctx: EventCtx) {
  await logRfpEvent(r.id, 'OPEN', ctx);
  if (r.status === 'INVITED') await prisma.rfpRecipient.update({ where: { id: r.id }, data: { status: 'VIEWED', viewedAt: new Date() } });
}

export async function specsFor(r: RecipientFull, ctx: EventCtx): Promise<{ pdf: Buffer; name: string }> {
  if (!r.rfp.specsFileId) throw new RfpError('Δεν υπάρχει PDF', 404);
  const f = await prisma.entityFile.findUnique({ where: { id: r.rfp.specsFileId }, select: { storageKey: true } });
  if (!f) throw new RfpError('Δεν υπάρχει PDF', 404);
  await logRfpEvent(r.id, 'SPECS_DOWNLOAD', ctx, { specsSha256: r.rfp.specsSha256 });
  return { pdf: await bunnyDownload(f.storageKey), name: r.rfp.specsFileName ?? `${rfpRef(r.rfp.number)}.pdf` };
}

export async function submitBid(r: RecipientFull, raw: unknown, ctx: EventCtx) {
  const ok = canRespond(r.rfp, r.status);
  if (!ok.ok) throw new RfpError(ok.reason, 409);
  const b: BidInput = bidInput.parse(raw);
  await prisma.rfpRecipient.update({
    where: { id: r.id },
    data: {
      status: 'SUBMITTED', amount: b.amount, startDate: b.startDate ? new Date(b.startDate) : null, durationDays: b.durationDays,
      notes: b.notes, termsAccepted: true, submittedAt: new Date(), declinedAt: null, viewedAt: r.viewedAt ?? new Date(),
    },
  });
  // Στην απόδειξη: ό,τι δηλώθηκε και το αποτύπωμα του εγγράφου που αποδέχτηκε.
  await logRfpEvent(r.id, 'SUBMIT', ctx, { amount: b.amount, startDate: b.startDate, durationDays: b.durationDays, notes: b.notes, termsAccepted: true, specsSha256: r.rfp.specsSha256 });
  await notifyStaff(r, `Νέα προσφορά συνεργείου: ${r.name} · ${eur(b.amount)} χωρίς ΦΠΑ`).catch(() => null);
}

export async function declineBid(r: RecipientFull, reason: string | null, ctx: EventCtx) {
  const ok = canRespond(r.rfp, r.status);
  if (!ok.ok) throw new RfpError(ok.reason, 409);
  await prisma.rfpRecipient.update({ where: { id: r.id }, data: { status: 'DECLINED', declinedAt: new Date(), notes: reason?.slice(0, 2000) ?? r.notes } });
  await logRfpEvent(r.id, 'DECLINE', ctx, { reason: reason?.slice(0, 2000) ?? null });
}

async function notifyStaff(r: RecipientFull, subject: string) {
  if (!r.rfp.createdById) return;
  const u = await prisma.user.findUnique({ where: { id: r.rfp.createdById }, select: { email: true } });
  if (!u?.email) return;
  const brand = await emailBrand();
  const m = renderEmail({
    brand, subject: `${subject} — ${rfpRef(r.rfp.number)}`, internal: true, label: 'Αίτημα προσφοράς', eyebrow: rfpRef(r.rfp.number), title: r.rfp.title,
    blocks: [paragraph(subject), button(`${appUrl()}/admin/projects/contracts/${r.rfp.contractId}#rfp`, 'Σύγκριση προσφορών')],
  });
  await sendLeadMail(u.email, m.subject, m.html, { text: m.text });
}

// ── Admin: λίστα & ανάθεση ─────────────────────────────────────────────────────────────────
export async function contractRfps(contractId: string) {
  const rows = await prisma.rfp.findMany({
    where: { contractId }, orderBy: { createdAt: 'desc' },
    include: { recipients: { orderBy: { createdAt: 'asc' }, include: { _count: { select: { events: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id, ref: rfpRef(r.number), title: r.title, scope: r.scope, status: r.status, dueDate: r.dueDate?.toISOString().slice(0, 10) ?? null,
    specsFileId: r.specsFileId, specsSha256: r.specsSha256, createdAt: r.createdAt.toISOString(), awardedRecipientId: r.awardedRecipientId,
    recipients: r.recipients.map((x) => ({
      id: x.id, kind: x.kind, name: x.name, email: x.email, phone: x.phone, status: x.status, amount: x.amount,
      startDate: x.startDate?.toISOString().slice(0, 10) ?? null, durationDays: x.durationDays, notes: x.notes,
      submittedAt: x.submittedAt?.toISOString() ?? null, viewedAt: x.viewedAt?.toISOString() ?? null, declinedAt: x.declinedAt?.toISOString() ?? null,
      sends: (Array.isArray(x.sends) ? x.sends : []) as { to: string; at: string; result: string }[], events: x._count.events,
    })),
  }));
}
export type ContractRfpView = Awaited<ReturnType<typeof contractRfps>>[number];

/**
 * Ανάθεση: το συνεργείο μπαίνει στη σύμβαση (ContractParty), αναλαμβάνει τις εργασίες (γραμμές
 * υπηρεσιών) που δεν έχουν ήδη συνεργείο και το ποσό του μοιράζεται σε αυτές ως αμοιβή (crewFee).
 * Οι υπόλοιποι παραλήπτες γίνονται «Δεν επιλέχθηκε» και ενημερώνονται με email.
 */
export async function awardRecipient(rfpId: string, recipientId: string, user: User) {
  const rfp = await prisma.rfp.findUnique({ where: { id: rfpId }, include: { recipients: true, contract: { include: { lines: true, parties: true } } } });
  if (!rfp) throw new RfpError('Το αίτημα δεν βρέθηκε', 404);
  if (rfp.status !== 'OPEN') throw new RfpError('Το αίτημα δεν είναι ανοιχτό', 409);
  const c = rfp.contract;
  if (c.status === 'COMPLETED' || c.status === 'CANCELLED') throw new RfpError('Η σύμβαση είναι κλειστή', 409);
  if (c.kind === 'PRODUCT') throw new RfpError('Ο τύπος «Μόνο προϊόν» δεν έχει συνεργεία — άλλαξε τον τύπο της σύμβασης', 409);
  const win = rfp.recipients.find((x) => x.id === recipientId);
  if (!win || win.status !== 'SUBMITTED' || !win.amount) throw new RfpError('Ανάθεση μόνο σε παραλήπτη που έχει υποβάλει προσφορά', 409);
  const lines = c.lines.filter((l) => l.kind === 'SERVICE' && !l.partyId);
  if (!lines.length) throw new RfpError('Δεν υπάρχουν εργασίες (γραμμές υπηρεσιών) χωρίς συνεργείο για να ανατεθούν', 409);
  const fees = distributeAmount(lines.map((l) => ({ id: l.id, weight: l.qty * l.unitPrice })), win.amount);

  const party = await prisma.$transaction(async (tx) => {
    const existing = c.parties.find((p) => (win.kind === 'SUPPLIER' ? p.trdr === win.trdr : p.partnerId === win.partnerId));
    const p = existing ?? await tx.contractParty.create({
      data: {
        contractId: c.id, kind: win.kind, trdr: win.trdr, partnerId: win.partnerId, name: win.name, email: win.email, phone: win.phone,
        afm: win.afm, specialty: win.specialty, scope: `${rfp.title} (${rfpRef(rfp.number)})`, sortOrder: c.parties.length,
      },
    });
    for (const l of lines) await tx.contractLine.update({ where: { id: l.id }, data: { partyId: p.id, crewFee: fees.get(l.id) ?? 0 } });
    await tx.rfpRecipient.update({ where: { id: win.id }, data: { status: 'AWARDED', partyId: p.id } });
    await tx.rfpRecipient.updateMany({ where: { rfpId, id: { not: win.id }, status: { in: ['INVITED', 'VIEWED', 'SUBMITTED'] } }, data: { status: 'NOT_AWARDED' } });
    await tx.rfp.update({ where: { id: rfpId }, data: { status: 'AWARDED', awardedRecipientId: win.id } });
    return p;
  });
  await logRfpEvent(win.id, 'AWARDED', { actor: 'staff', userId: user.id }, { amount: win.amount, partyId: party.id, lines: lines.length });
  const losers = rfp.recipients.filter((x) => x.id !== win.id && ['INVITED', 'VIEWED', 'SUBMITTED'].includes(x.status));
  const brand = await emailBrand();
  for (const x of losers) {
    let result: SendResult = 'no-email';
    if (x.email) {
      const m = renderEmail({
        brand, subject: `Αίτημα προσφοράς ${rfpRef(rfp.number)} — ολοκληρώθηκε`, label: 'Αίτημα προσφοράς', eyebrow: rfpRef(rfp.number), title: rfp.title,
        greeting: `${x.name},`, intro: 'Σας ευχαριστούμε για τον χρόνο σας. Για αυτό το έργο προχωρήσαμε με άλλη πρόταση — θα χαρούμε να συνεργαστούμε σε επόμενο.',
        signoff: true,
      });
      result = await sendLeadMail(x.email, m.subject, m.html, { text: m.text, replyTo: user.email });
    }
    await logRfpEvent(x.id, 'NOT_AWARDED', { actor: 'staff', userId: user.id }, { email: result });
  }
  return { partyId: party.id, lines: lines.length, amount: win.amount };
}

export async function setRfpStatus(rfpId: string, status: 'CLOSED' | 'CANCELLED' | 'OPEN') {
  const r = await prisma.rfp.findUnique({ where: { id: rfpId }, select: { status: true } });
  if (!r) throw new RfpError('Το αίτημα δεν βρέθηκε', 404);
  if (r.status === 'AWARDED') throw new RfpError('Το αίτημα έχει ανατεθεί', 409);
  await prisma.rfp.update({ where: { id: rfpId }, data: { status } });
}
