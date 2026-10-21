import 'server-only';
import { prisma } from '@/lib/db';
import { contractRef, docTitle, lineNet, STAGE_LABEL, STATUS_LABEL, totals, type ContractStatus } from '@/lib/contracts/core';

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
