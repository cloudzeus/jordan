// lib/contracts/inbox.ts — SERVER. Τι περιμένει απάντηση από εμάς στις προσφορές:
// νέα αιτήματα προσφοράς από την πύλη (δεν τα έχει ανοίξει κανείς) και ερωτήσεις/αλλαγές πελατών χωρίς απάντηση.
import 'server-only';
import { prisma } from '@/lib/db';
import { contractRef } from './core';
import { logContractEvent } from './history';

export type InboxItem = {
  contractId: string; ref: string; title: string; customer: string | null;
  kind: 'REQUEST' | 'QUESTION'; body: string; at: string;
};

async function newRequestIds(): Promise<string[]> {
  const rows = await prisma.contractEvent.findMany({
    where: { type: 'REQUESTED', contract: { events: { none: { type: 'OPENED' } }, status: { notIn: ['CANCELLED'] } } },
    select: { contractId: true }, distinct: ['contractId'],
  });
  return rows.map((r) => r.contractId);
}

async function unansweredQuestions() {
  const open = await prisma.contractNote.findMany({
    where: { authorKind: 'CUSTOMER', replyToId: null, kind: { in: ['QUESTION', 'CHANGE'] }, resolvedAt: null, contract: { status: { notIn: ['CANCELLED', 'COMPLETED'] } } },
    select: { id: true, contractId: true, body: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 200,
  });
  if (!open.length) return open;
  const answered = new Set((await prisma.contractNote.findMany({
    where: { replyToId: { in: open.map((n) => n.id) }, authorKind: 'STAFF' }, select: { replyToId: true },
  })).map((r) => r.replyToId));
  return open.filter((n) => !answered.has(n.id));
}

/** Πλήθος για το σήμα του μενού. */
export async function countContractInbox(): Promise<number> {
  const [req, q] = await Promise.all([newRequestIds(), unansweredQuestions()]);
  return req.length + q.length;
}

/** Η λίστα στην κορυφή των «Συμβάσεις & Προσφορές». */
export async function contractInbox(): Promise<InboxItem[]> {
  const [reqIds, questions] = await Promise.all([newRequestIds(), unansweredQuestions()]);
  const ids = [...new Set([...reqIds, ...questions.map((q) => q.contractId)])];
  if (!ids.length) return [];
  const [contracts, events] = await Promise.all([
    prisma.contract.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, title: true, customerName: true } }),
    prisma.contractEvent.findMany({ where: { contractId: { in: reqIds }, type: 'REQUESTED' }, select: { contractId: true, summary: true, createdAt: true } }),
  ]);
  const byId = new Map(contracts.map((c) => [c.id, c]));
  const base = (id: string) => {
    const c = byId.get(id);
    return { contractId: id, ref: c ? contractRef(c.number) : '', title: c?.title ?? '', customer: c?.customerName ?? null };
  };
  const items: InboxItem[] = [
    ...events.map((e) => ({ ...base(e.contractId), kind: 'REQUEST' as const, body: e.summary, at: e.createdAt.toISOString() })),
    ...questions.map((q) => ({ ...base(q.contractId), kind: 'QUESTION' as const, body: q.body, at: q.createdAt.toISOString() })),
  ];
  return items.filter((i) => byId.has(i.contractId)).sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Το πρώτο άνοιγμα από το προσωπικό σημαίνει «το είδαμε» — φεύγει από τα νέα αιτήματα. */
export async function markRequestOpened(contractId: string, staff: { id: string; name: string | null }) {
  const [requested, opened] = await Promise.all([
    prisma.contractEvent.count({ where: { contractId, type: 'REQUESTED' } }),
    prisma.contractEvent.count({ where: { contractId, type: 'OPENED' } }),
  ]);
  if (!requested || opened) return;
  await logContractEvent(contractId, { type: 'OPENED', actor: { kind: 'STAFF', id: staff.id, name: staff.name }, summary: `Το αίτημα το άνοιξε ${staff.name ?? 'το προσωπικό'}` });
}
