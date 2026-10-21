import 'server-only';
import { prisma } from '@/lib/db';
import { contractRef, docTitle, eur as eurEl, lineNet, STAGE_LABEL, STATUS_LABEL, totals, type ContractStatus } from '@/lib/contracts/core';
import { ContractError, transition } from '@/lib/contracts/service';
import { logAudit } from '@/lib/audit';
import { getSetting } from '@/lib/settings';
import { mailgunConfig, sendTransactionalEmail } from '@/lib/mailgun';
import { emailBrand } from '@/lib/email/brand';
import { contractAcceptedStaffEmail } from '@/lib/email/templates';
import { appUrl } from '@/lib/app-url';
import { zonedParts } from '@/lib/appointments-core';

/**
 * Προσφορές & συμβάσεις και ραντεβού για το B2B portal του πελάτη.
 *
 * Ο πελάτης βλέπει ό,τι του στάλθηκε (όχι πρόχειρα): τις γραμμές με ΤΗ ΔΙΚΗ ΤΟΥ τιμή, το
 * χρονοδιάγραμμα πληρωμών του (ορόσημα χωρίς συνεργείο) και τα έγγραφα «πελάτη». Ποτέ αμοιβές ή
 * στοιχεία συνεργείων (`crewFee`, `partyId`, ορόσημα συνεργείων, έγγραφα ανάθεσης).
 */

const VISIBLE = ['SENT', 'ACCEPTED', 'ACTIVE', 'COMPLETED'] as const;
const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export type CustomerContract = {
  id: string; ref: string; title: string; summary: string; stage: string; stageLabel: string; status: string; statusLabel: string;
  prjc: number | null; site: string | null; startDate: string | null; endDate: string | null; validUntil: string | null;
  vatRate: number; net: number; vat: number; total: number;
  lines: { id: string; kind: string; name: string; code: string | null; qty: number; unit: string | null; unitPrice: number; discount: number; net: number; notes: string | null }[];
  milestones: { id: string; title: string; deliverables: string | null; dueDate: string | null; amount: number; status: string }[];
  documents: { id: string; title: string; version: number; createdAt: string; hasFile: boolean }[];
  acceptedAt: string | null;
  updatedAt: string;
};

async function load(trdr: number, id?: string): Promise<CustomerContract[]> {
  const rows = await prisma.contract.findMany({
    where: { trdr, status: { in: [...VISIBLE] }, ...(id ? { id } : {}) },
    orderBy: { updatedAt: 'desc' },
    include: {
      lines: { orderBy: { sortOrder: 'asc' }, select: { id: true, kind: true, name: true, code: true, qty: true, unit: true, unitPrice: true, discount: true, notes: true } },
      milestones: { where: { partyId: null }, orderBy: [{ sortOrder: 'asc' }, { dueDate: 'asc' }], select: { id: true, title: true, deliverables: true, dueDate: true, amount: true, status: true } },
      documents: { where: { audience: 'CUSTOMER' }, orderBy: { createdAt: 'desc' }, select: { id: true, stage: true, version: true, createdAt: true, fileId: true } },
    },
  });
  return rows.map((c) => {
    const t = totals(c.lines, c.vatRate);
    return {
      id: c.id, ref: contractRef(c.number), title: c.title, summary: c.summary,
      stage: c.stage, stageLabel: STAGE_LABEL[c.stage] ?? c.stage, status: c.status, statusLabel: STATUS_LABEL[c.status as ContractStatus] ?? c.status,
      prjc: c.prjc, site: c.siteFormatted || [c.siteAddress, c.siteCity].filter(Boolean).join(', ') || null,
      startDate: dateOnly(c.startDate), endDate: dateOnly(c.endDate), validUntil: dateOnly(c.validUntil),
      vatRate: c.vatRate, net: t.net, vat: t.vat, total: t.gross,
      lines: c.lines.map((l) => ({ ...l, net: lineNet(l) })),
      milestones: c.milestones.map((m) => ({ ...m, dueDate: dateOnly(m.dueDate) })),
      documents: c.documents.map((d) => ({ id: d.id, title: docTitle(d.stage, 'CUSTOMER'), version: d.version, createdAt: d.createdAt.toISOString(), hasFile: !!d.fileId })),
      acceptedAt: c.acceptedAt?.toISOString() ?? null,
      updatedAt: c.updatedAt.toISOString(),
    };
  });
}

export const customerContracts = (trdr: number) => load(trdr);
export const customerContract = async (trdr: number, id: string) => (await load(trdr, id))[0] ?? null;

/** PDF προσφοράς/σύμβασης για λήψη: μόνο έγγραφο «πελάτη», σε σύμβαση του ίδιου που του στάλθηκε. */
export async function customerContractDocFile(trdr: number, docId: string) {
  const d = await prisma.contractDocument.findFirst({
    where: { id: docId, audience: 'CUSTOMER', contract: { trdr, status: { in: [...VISIBLE] } } },
    select: { fileId: true },
  });
  return d?.fileId ? prisma.entityFile.findUnique({ where: { id: d.fileId } }) : null;
}

/** Επερχόμενα ραντεβού του πελάτη (στο atelier ή στον χώρο του). */
export async function customerAppointments(trdr: number) {
  const rows = await prisma.appointment.findMany({
    where: { trdr, status: { in: ['PENDING', 'CONFIRMED'] }, endsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' }, take: 5,
    select: { id: true, startsAt: true, endsAt: true, status: true, place: true, location: true, topic: true },
  });
  return rows.map((a) => ({ ...a, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString() }));
}

export class AcceptError extends Error {}

/**
 * Ο πελάτης αποδέχεται προσφορά από την πύλη. Κανόνες: δική του (TRDR), σε κατάσταση «Στάλθηκε»,
 * εντός ισχύος. Η μετάβαση είναι η ίδια με το admin (`transition('accept')` → Αποδεκτή, στάδιο
 * Σύμβαση)· καταγράφεται ποιος την έκανε και ειδοποιείται το προσωπικό (best-effort).
 */
export async function customerAcceptContract(trdr: number, id: string, by: { id: string; email: string; name: string | null }) {
  const c = await prisma.contract.findFirst({ where: { id, trdr }, include: { lines: { select: { qty: true, unitPrice: true, discount: true } } } });
  if (!c) throw new AcceptError('Η προσφορά δεν βρέθηκε.');
  if (c.status !== 'SENT') throw new AcceptError(c.status === 'ACCEPTED' || c.status === 'ACTIVE' ? 'Η προσφορά έχει ήδη γίνει αποδεκτή.' : 'Η προσφορά δεν είναι πλέον διαθέσιμη για αποδοχή.');
  const today = zonedParts(new Date()).date;
  if (c.validUntil && c.validUntil.toISOString().slice(0, 10) < today) throw new AcceptError('Η ισχύς της προσφοράς έληξε — επικοινωνήστε μαζί μας για ανανέωση.');
  try {
    await transition(id, 'accept', by.id);
  } catch (e) {
    if (e instanceof ContractError) throw new AcceptError(e.message);
    throw e;
  }
  const total = totals(c.lines, c.vatRate).gross;
  await logAudit({ userId: by.id, userEmail: by.email, action: 'contract.accept.portal', resource: 'contract', resourceId: id, metadata: { trdr, ref: contractRef(c.number), total } }).catch(() => null);
  await notifyAccepted(c.id, contractRef(c.number), c.title, trdr, by, eurEl(total));
}

async function notifyAccepted(id: string, ref: string, title: string, trdr: number, by: { email: string; name: string | null }, total: string) {
  try {
    const [brand, inbox, override, trader] = await Promise.all([
      emailBrand(), getSetting<string>('company.email'), getSetting<string>('orders.notifyEmail'),
      prisma.softoneTrader.findUnique({ where: { trdr }, select: { name: true } }),
    ]);
    if (override?.trim().toLowerCase() === 'off') return;
    const to = override?.trim() || inbox?.trim() || mailgunConfig().address;
    const when = new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', dateStyle: 'medium', timeStyle: 'short' });
    const m = contractAcceptedStaffEmail(brand, {
      ref, title, who: trader?.name ?? `Πελάτης #${trdr}`, by: `${by.name ?? ''} (${by.email})`.trim(), total, when,
      link: appUrl() ? `${appUrl()}/admin/projects/contracts/${id}` : null,
    });
    await sendTransactionalEmail(to, m.subject, m.html, { fromName: brand.name, replyTo: by.email, text: m.text });
  } catch (e) {
    console.error('[contract-accept-mail]', e instanceof Error ? e.message : e);
  }
}
