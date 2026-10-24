// lib/portal-requests.ts — SERVER. Πελάτης στην πύλη: «Αίτημα προσφοράς» (γίνεται πρόχειρη προσφορά για εμάς,
// με την περιγραφή και τις φωτογραφίες του) και «Πληρωμές» (οι δόσεις όλων των συμβάσεών του). Μόνο βάση
// εφαρμογής — τίποτα προς το SoftOne.
import 'server-only';
import { prisma } from '@/lib/db';
import { contractRef } from '@/lib/contracts/core';
import { addNote } from '@/lib/contracts/notes';
import { logContractEvent } from '@/lib/contracts/history';
import { getSetting } from '@/lib/settings';
import { mailgunConfig, sendTransactionalEmail } from '@/lib/mailgun';
import { emailBrand } from '@/lib/email/brand';
import { offerRequestCustomerEmail, offerRequestStaffEmail } from '@/lib/email/templates';
import { appUrl } from '@/lib/app-url';
import { verdictText } from '@/lib/rfp-agent-core';
import { siteLine } from '@/lib/customer-profile-core';
import { ContractError } from '@/lib/contracts/service';

export { offerRequestInput, SITE_REQUIRED, type OfferRequestInput } from './portal-requests-core';
import type { OfferRequestInput } from './portal-requests-core';

type Who = { id: string; email: string; name: string | null };

export async function createOfferRequest(trdr: number, input: OfferRequestInput, photos: File[], by: Who) {
  const [trader, saved] = await Promise.all([
    prisma.softoneTrader.findUnique({ where: { trdr }, select: { name: true, email: true, phone: true } }),
    input.siteId ? prisma.customerSite.findFirst({ where: { id: input.siteId, trdr } }) : Promise.resolve(null),
  ]);
  if (input.siteId && !saved) throw new ContractError('Η τοποθεσία δεν βρέθηκε — διαλέξτε ξανά.', 404);
  // Με αποθηκευμένη τοποθεσία: πλήρης διεύθυνση στην προσφορά + δέσιμο για τον τεχνικό φάκελο.
  if (saved) input = { ...input, site: `${saved.label} — ${siteLine(saved)}${saved.notes ? `\nΣημειώσεις χώρου: ${saved.notes}` : ''}` };
  const where = saved
    ? { customerSiteId: saved.id, siteAddress: [saved.address, saved.floor].filter(Boolean).join(', ') || null, siteZip: saved.zip, siteDistrict: saved.district, siteCity: saved.city, siteLat: saved.lat, siteLng: saved.lng }
    : { siteAddress: input.site };
  const c = await prisma.contract.create({
    data: {
      title: input.title, kind: input.kind, stage: 'OFFER', status: 'DRAFT', trdr,
      customerName: trader?.name ?? null, customerEmail: by.email, customerPhone: trader?.phone ?? null,
      summary: `Αίτημα πελάτη από την πύλη:\n${input.description}`, ...where, startDate: input.wanted ? new Date(`${input.wanted}T00:00:00Z`) : null,
    },
    select: { id: true, number: true },
  });
  // Η περιγραφή μένει και ως μήνυμα του πελάτη (με τις φωτογραφίες) — αρχή του ιστορικού της προσφοράς.
  await addNote(c.id, { targetType: 'CONTRACT', targetId: null, targetLabel: null, kind: 'NOTE', body: input.description, shareWith: [], replyToId: null }, photos, { kind: 'CUSTOMER', id: by.id, name: by.name, email: by.email });
  await logContractEvent(c.id, { type: 'REQUESTED', actor: { kind: 'CUSTOMER', id: by.id, name: by.name || by.email }, summary: `Αίτημα προσφοράς: ${input.title}`, customer: true });
  // Η συνομιλία με τον βοηθό μένει ως εσωτερική σημείωση — μας δίνει το πλαίσιο, ο πελάτης δεν τη χρειάζεται ξανά.
  if (input.transcript?.length) {
    const t = input.transcript.map((m) => `${m.role === 'user' ? 'Πελάτης' : 'Βοηθός'}: ${m.text}`).join('\n').slice(0, 3900);
    await prisma.contractNote.create({ data: { contractId: c.id, kind: 'NOTE', targetType: 'CONTRACT', body: `Συνομιλία με τον AI βοηθό:\n${t}`, shareWith: [], authorKind: 'STAFF', authorName: 'AI βοηθός portal', revision: 1 } });
  }
  if (input.scope) {
    await logContractEvent(c.id, { type: 'REQUESTED', actor: { kind: 'SYSTEM', name: 'AI βοηθός' }, summary: `Εκτίμηση βοηθού: ${verdictText(input.scope.verdict)}${input.scope.cannot.length ? ` — εκτός: ${input.scope.cannot.join(', ')}` : ''}`, customer: false });
  }
  const ref = contractRef(c.number);
  await notify(c.id, ref, input, photos.length, trader?.name ?? `Πελάτης #${trdr}`, by);
  return { id: c.id, ref };
}

async function notify(id: string, ref: string, input: OfferRequestInput, photos: number, who: string, by: Who) {
  try {
    const [brand, inbox, override] = await Promise.all([emailBrand(), getSetting<string>('company.email'), getSetting<string>('orders.notifyEmail')]);
    const base = appUrl();
    if (override?.trim().toLowerCase() !== 'off') {
      const m = offerRequestStaffEmail(brand, {
        ref, title: input.title, who, by: `${by.name ?? ''} (${by.email})`.trim(), description: input.description, site: input.site,
        wanted: input.wanted ? new Date(`${input.wanted}T00:00:00Z`).toLocaleDateString('el-GR') : null, photos, link: base ? `${base}/admin/projects/contracts/${id}` : null,
      });
      await sendTransactionalEmail(override?.trim() || inbox?.trim() || mailgunConfig().address, m.subject, m.html, { fromName: brand.name, replyTo: by.email, text: m.text });
    }
    const c = offerRequestCustomerEmail(brand, { ref, title: input.title, link: base ? `${base}/dashboard/customer/requests` : null });
    await sendTransactionalEmail(by.email, c.subject, c.html, { fromName: brand.name, text: c.text });
  } catch (e) {
    console.error('[offer-request-mail]', e instanceof Error ? e.message : e);
  }
}

/** Τα αιτήματα προσφοράς του πελάτη και πού βρίσκεται το καθένα. */
export async function customerOfferRequests(trdr: number) {
  const ev = await prisma.contractEvent.findMany({ where: { type: 'REQUESTED', contract: { trdr } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, contract: { select: { id: true, number: true, title: true, status: true, summary: true } } } });
  return ev.map(({ createdAt, contract: c }) => ({
    id: c.id, ref: contractRef(c.number), title: c.title, at: createdAt.toISOString(),
    description: c.summary.replace(/^Αίτημα πελάτη από την πύλη:\n/, ''),
    state: c.status === 'DRAFT' ? 'PREPARING' as const : c.status === 'CANCELLED' ? 'CANCELLED' as const : c.status === 'SENT' ? 'OFFERED' as const : 'CONTRACT' as const,
  }));
}

/** Δόσεις του πελάτη από όσες συμβάσεις έχει αποδεχτεί (όχι συνεργείων). */
export async function customerPayments(trdr: number) {
  const rows = await prisma.contractMilestone.findMany({
    where: { partyId: null, contract: { trdr, status: { in: ['ACCEPTED', 'ACTIVE', 'COMPLETED'] } } },
    orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }],
    select: { id: true, title: true, amount: true, dueDate: true, status: true, doneAt: true, paidAt: true, deliveryNote: true, contract: { select: { id: true, number: true, title: true, prjc: true } } },
  });
  return rows.map((m) => ({
    id: m.id, title: m.title, amount: m.amount, status: m.status as 'PENDING' | 'DONE' | 'PAID',
    dueDate: m.dueDate?.toISOString().slice(0, 10) ?? null, doneAt: m.doneAt?.toISOString() ?? null, paidAt: m.paidAt?.toISOString() ?? null, deliveryNote: m.deliveryNote,
    contract: { id: m.contract.id, ref: contractRef(m.contract.number), title: m.contract.title, prjc: m.contract.prjc },
  }));
}
export type CustomerPayment = Awaited<ReturnType<typeof customerPayments>>[number];
