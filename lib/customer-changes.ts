// lib/customer-changes.ts — SERVER. Αιτήματα αλλαγής εταιρικών στοιχείων από την πύλη, για το προσωπικό.
// Κλείνουν με το χέρι: το SoftOne το ενημερώνει άνθρωπος (κανένα αυτόματο setData σε TRDR).
import 'server-only';
import { prisma } from '@/lib/db';
import type { CompanyChange } from './customer-profile-core';

export const countPendingCustomerChanges = () => prisma.customerChangeRequest.count({ where: { status: 'PENDING' } });

export async function listCustomerChanges() {
  const rows = await prisma.customerChangeRequest.findMany({ orderBy: [{ status: 'desc' }, { createdAt: 'desc' }], take: 300 });
  const traders = await prisma.softoneTrader.findMany({ where: { trdr: { in: [...new Set(rows.map((r) => r.trdr))] } }, select: { trdr: true, name: true, code: true } });
  const tn = new Map(traders.map((t) => [t.trdr, t]));
  return rows
    .map((r) => ({
      id: r.id, trdr: r.trdr, customer: tn.get(r.trdr)?.name ?? `#${r.trdr}`, code: tn.get(r.trdr)?.code ?? null,
      by: r.userEmail, at: r.createdAt.toISOString(), status: r.status, changes: r.changes as CompanyChange[], note: r.note, reply: r.reply,
      decidedAt: r.decidedAt?.toISOString() ?? null,
    }))
    .sort((a, b) => (a.status === 'PENDING') === (b.status === 'PENDING') ? (a.at < b.at ? 1 : -1) : a.status === 'PENDING' ? -1 : 1);
}

export async function decideCustomerChange(id: string, status: 'APPLIED' | 'REJECTED', reply: string | null, by: string) {
  const r = await prisma.customerChangeRequest.findUnique({ where: { id }, select: { status: true } });
  if (!r) throw new Error('Το αίτημα δεν βρέθηκε');
  if (r.status !== 'PENDING') throw new Error('Το αίτημα έχει ήδη κλείσει');
  await prisma.customerChangeRequest.update({ where: { id }, data: { status, reply, decidedById: by, decidedAt: new Date() } });
}
