// lib/portal-glance.ts — SERVER. Δεδομένα για το «Με μια ματιά» του πελάτη: τι περιμένει από αυτόν, πώς πάει κάθε
// έργο του, οι πληρωμές του και τα στοιχεία πληρωμής. Μόνο βάση εφαρμογής.
import 'server-only';
import { prisma } from '@/lib/db';
import { contractRef, totals } from '@/lib/contracts/core';
import { customerProjectTasks } from '@/lib/project-tasks';
import { getSetting } from '@/lib/settings';
import { parseBankAccounts } from '@/lib/email/bank';
import { zonedParts } from '@/lib/appointments-core';
import { customerOfferRequests, customerPayments } from '@/lib/portal-requests';
import { paymentSplit, projectPulse, type Pulse } from '@/lib/portal-glance-core';

export type GlanceAction = { kind: 'OFFER' | 'PAYMENT' | 'REPLY'; title: string; detail: string; href: string };
export type GlanceProject = { prjc: number; code: string; name: string; contractId: string | null; pulse: Pulse };

export async function customerGlance(trdr: number) {
  const today = zonedParts(new Date()).date;
  const [offers, payments, requests, replies, bankRaw] = await Promise.all([
    prisma.contract.findMany({ where: { trdr, status: 'SENT' }, orderBy: { updatedAt: 'desc' }, select: { id: true, number: true, title: true, validUntil: true, vatRate: true, lines: { select: { qty: true, unitPrice: true, discount: true } } } }),
    customerPayments(trdr),
    customerOfferRequests(trdr),
    // Απαντήσεις μας σε θέματα του πελάτη τις τελευταίες 14 ημέρες, σε θέματα που δεν έκλεισαν.
    prisma.contractNote.findMany({
      where: { contract: { trdr }, authorKind: 'STAFF', shareWith: { has: 'CUSTOMER' }, replyToId: { not: null }, createdAt: { gte: new Date(Date.now() - 14 * 864e5) } },
      orderBy: { createdAt: 'desc' }, take: 5, select: { contractId: true, body: true, contract: { select: { number: true } } },
    }),
    getSetting<string>('company.bankAccounts'),
  ]);

  const actions: GlanceAction[] = [
    ...offers.map((o) => ({
      kind: 'OFFER' as const, title: `Προσφορά ${contractRef(o.number)} περιμένει την απάντησή σας`,
      detail: `${o.title} · ${totals(o.lines, o.vatRate).gross.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })}${o.validUntil ? ` · ισχύει έως ${o.validUntil.toLocaleDateString('el-GR')}` : ''}`,
      href: `/dashboard/customer/contracts/${o.id}`,
    })),
    ...payments.filter((p) => p.status === 'DONE').map((p) => ({
      kind: 'PAYMENT' as const, title: `Δόση προς πληρωμή: ${p.title}`,
      detail: `${p.amount.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })} · ${p.contract.ref}${p.dueDate ? ` · έως ${new Date(`${p.dueDate}T00:00:00Z`).toLocaleDateString('el-GR')}` : ''}`,
      href: '/dashboard/customer/payments',
    })),
    ...[...new Map(replies.map((r) => [r.contractId, r])).values()].map((r) => ({
      kind: 'REPLY' as const, title: `Σας απαντήσαμε στην ${contractRef(r.contract.number)}`, detail: r.body.length > 110 ? `${r.body.slice(0, 107)}…` : r.body,
      href: `/dashboard/customer/contracts/${r.contractId}#notes`,
    })),
  ];

  // Έργα με ενεργή/αποδεκτή σύμβαση: πρόοδος από τις εργασίες που βλέπει ο πελάτης.
  const active = await prisma.contract.findMany({ where: { trdr, status: { in: ['ACCEPTED', 'ACTIVE'] }, prjc: { not: null } }, select: { id: true, prjc: true } });
  const prjcs = [...new Set(active.map((c) => c.prjc!))];
  const meta = await prisma.softoneProject.findMany({ where: { prjc: { in: prjcs }, trdr }, select: { prjc: true, code: true, name: true } });
  const projects: GlanceProject[] = [];
  for (const p of meta) {
    const work = await customerProjectTasks(trdr, p.prjc).catch(() => null);
    const tasks = (work?.tasks ?? []).map((t) => ({ id: t.id, name: t.name, start: t.start, end: t.end, progress: t.progress }));
    projects.push({ ...p, contractId: active.find((c) => c.prjc === p.prjc)?.id ?? null, pulse: projectPulse(tasks, today) });
  }

  return {
    today, actions, projects,
    pay: paymentSplit(payments.map((p) => ({ amount: p.amount, status: p.status, dueDate: p.dueDate })), today),
    nextPayment: payments.find((p) => p.status === 'DONE') ?? payments.find((p) => p.status === 'PENDING') ?? null,
    preparing: requests.filter((r) => r.state === 'PREPARING').length,
    bank: parseBankAccounts(bankRaw),
  };
}
export type CustomerGlance = Awaited<ReturnType<typeof customerGlance>>;
