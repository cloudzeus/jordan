// lib/contracts/history.ts — SERVER. Ιστορικό επικοινωνίας: καταγραφή συμβάντων και ανάγνωση ανά προσφορά,
// ανά έργο (όλες οι προσφορές/συμβάσεις του έργου) ή ανά πελάτη. Τίποτα από εδώ δεν σβήνεται.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { contractRef } from './core';
import { buildHistory, type HistoryEntry, type HistoryViewer } from './history-core';
import { messageRows } from '@/lib/messages';
import { messageEntries } from '@/lib/messages-core';

type Actor = { kind: 'STAFF' | 'CUSTOMER' | 'SYSTEM'; id?: string | null; name?: string | null };

/** Καταγραφή συμβάντος· δεν ρίχνει ποτέ τη ροή που το καλεί. */
export async function logContractEvent(contractId: string, e: { type: string; actor: Actor; summary: string; customer?: boolean; revision?: number | null; refId?: string | null }) {
  await prisma.contractEvent.create({
    data: {
      contractId, type: e.type, actorKind: e.actor.kind, actorId: e.actor.id ?? null, actorName: e.actor.name ?? null,
      summary: e.summary.slice(0, 2000), customer: !!e.customer, revision: e.revision ?? null, refId: e.refId ?? null,
    },
  }).catch((err) => console.error('[contracts] history', err));
}

/** Ανά προσφορά, ανά έργο (προαιρετικά μόνο ενός πελάτη) ή ανά πελάτη. */
export type HistoryScope = { contractId: string } | { prjc: number; trdr?: number } | { trdr: number };

export async function contractHistory(scope: HistoryScope, viewer: HistoryViewer, opts: { companyName?: string; limit?: number } = {}): Promise<HistoryEntry[]> {
  const where: Prisma.ContractWhereInput = 'contractId' in scope ? { id: scope.contractId }
    : 'prjc' in scope ? { prjc: scope.prjc, ...(scope.trdr != null ? { trdr: scope.trdr } : {}) } : { trdr: scope.trdr };
  const contracts = await prisma.contract.findMany({ where, select: { id: true, number: true } });
  const ids = contracts.map((c) => c.id);
  const refs = Object.fromEntries(contracts.map((c) => [c.id, contractRef(c.number)]));
  // Μηνύματα «Επικοινωνίας» (έργο/πελάτης/προσφορά) — υπάρχουν και χωρίς προσφορά.
  const msgWhere: Prisma.MessageWhereInput = 'contractId' in scope ? { contractId: scope.contractId }
    : 'prjc' in scope ? { prjc: scope.prjc, ...(scope.trdr != null ? { trdr: scope.trdr } : {}) } : { trdr: scope.trdr };
  const [notes, events, msgs] = await Promise.all([
    ids.length ? prisma.contractNote.findMany({ where: { contractId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: opts.limit ?? 500 }) : [],
    ids.length ? prisma.contractEvent.findMany({ where: { contractId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: opts.limit ?? 500 }) : [],
    messageRows(msgWhere, opts.limit ?? 500),
  ]);
  const messages = messageEntries(msgs, viewer, { companyName: opts.companyName, refs });
  return [...buildHistory(
    notes.map((n) => ({
      id: n.id, contractId: n.contractId, kind: n.kind, body: n.body, targetLabel: n.targetLabel, replyToId: n.replyToId, revision: n.revision,
      authorKind: n.authorKind as 'STAFF' | 'CUSTOMER', authorName: n.authorName, shareWith: n.shareWith, resolved: !!n.resolvedAt,
      photoCount: n.photoFileIds.length, createdAt: n.createdAt.toISOString(),
    })),
    events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    viewer,
    { refs, companyName: opts.companyName },
  ), ...messages].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1)).slice(0, opts.limit ?? 500);
}
