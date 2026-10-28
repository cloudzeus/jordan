// lib/contracts/offer-requests.ts — SERVER. Τα αιτήματα προσφοράς από την πύλη, με όλη τη διαδρομή τους.
import 'server-only';
import { prisma } from '@/lib/db';
import { contractRef, totals } from './core';
import { isOpenRequest } from './history-core';
import { requestWorkflow } from './offer-requests-core';

export async function listOfferRequests() {
  // Αίτημα = προσφορά που ξεκίνησε από τον πελάτη (συμβάν REQUESTED από CUSTOMER).
  const rows = await prisma.contract.findMany({
    where: { events: { some: { type: 'REQUESTED', actorKind: 'CUSTOMER' } } },
    orderBy: { createdAt: 'desc' }, take: 500,
    select: {
      id: true, number: true, title: true, status: true, trdr: true, prjc: true, customerName: true, customerEmail: true, siteCity: true, siteAddress: true, vatRate: true, revision: true,
      lines: { where: { inactive: false }, select: { qty: true, unitPrice: true, discount: true } },
      events: { select: { type: true, actorKind: true, actorName: true, summary: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      notes: { select: { kind: true, authorKind: true, resolvedAt: true, replyToId: true, photoFileIds: true } },
    },
  });
  return rows.map((c) => {
    const flow = requestWorkflow(c.events.map((e) => ({ type: e.type, createdAt: e.createdAt.toISOString() })), c.status);
    const req = c.events.find((e) => e.type === 'REQUESTED' && e.actorKind === 'CUSTOMER');
    const ai = c.events.find((e) => e.type === 'REQUESTED' && e.actorKind === 'SYSTEM');
    const staff = c.events.find((e) => e.type === 'REQUESTED' && e.actorKind === 'STAFF');
    return {
      id: c.id, ref: contractRef(c.number), title: c.title, status: c.status, prjc: c.prjc,
      customer: c.customerName ?? '—', email: c.customerEmail, city: c.siteCity ?? c.siteAddress, revision: c.revision,
      requestedAt: (req ?? c.events[0])?.createdAt.toISOString() ?? null,
      aiVerdict: ai?.summary.replace(/^Εκτίμηση βοηθού:\s*/, '') ?? null,
      /** Καταχωρίστηκε από το προσωπικό εκ μέρους του πελάτη («Προβολή ως»). */
      onBehalfBy: staff?.actorName ?? null,
      gross: c.lines.length ? totals(c.lines, c.vatRate).gross : null,
      photos: c.notes.reduce((n, x) => n + (x.authorKind === 'CUSTOMER' ? x.photoFileIds.length : 0), 0),
      openQuestions: c.notes.filter((n) => isOpenRequest({ kind: n.kind, authorKind: n.authorKind as 'STAFF' | 'CUSTOMER', resolved: !!n.resolvedAt, replyToId: n.replyToId })).length,
      ...flow,
    };
  });
}
export type OfferRequestRow = Awaited<ReturnType<typeof listOfferRequests>>[number];
