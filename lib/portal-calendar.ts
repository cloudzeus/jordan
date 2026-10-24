// lib/portal-calendar.ts — SERVER. Τα γεγονότα του ημερολογίου πελάτη: εργασίες των έργων του (πολυήμερες),
// ορόσημα/δόσεις των συμβάσεων του και η λήξη ισχύος όσων προσφορών περιμένουν απάντηση.
import 'server-only';
import { prisma } from '@/lib/db';
import { contractRef } from '@/lib/contracts/core';
import { customerProjectTasks } from '@/lib/project-tasks';
import { customerPayments } from '@/lib/portal-requests';
import type { CalEvent } from './portal-calendar-core';

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const PHASE_TONE = { TODO: 'todo', IN_PROGRESS: 'progress', REVIEW: 'review', DONE: 'done' } as const;
const PHASE_LABEL = { TODO: 'Προγραμματισμένη', IN_PROGRESS: 'Σε εξέλιξη', REVIEW: 'Σε έλεγχο', DONE: 'Ολοκληρώθηκε' } as const;

export async function customerCalendar(trdr: number): Promise<CalEvent[]> {
  const [projects, payments, offers] = await Promise.all([
    prisma.softoneProject.findMany({ where: { trdr }, select: { prjc: true, code: true, name: true } }),
    customerPayments(trdr),
    prisma.contract.findMany({ where: { trdr, status: 'SENT', validUntil: { not: null } }, select: { id: true, number: true, title: true, validUntil: true } }),
  ]);
  const out: CalEvent[] = [];
  const work = await Promise.all(projects.map((p) => customerProjectTasks(trdr, p.prjc).catch(() => null).then((w) => ({ p, w }))));
  for (const { p, w } of work) {
    for (const t of w?.tasks ?? []) {
      out.push({
        id: `task-${t.id}`, kind: 'task', title: t.name, sub: p.name, start: t.start, end: t.end < t.start ? t.start : t.end,
        tone: PHASE_TONE[t.phase], status: PHASE_LABEL[t.phase], href: `/dashboard/customer/projects/${p.prjc}`,
      });
    }
  }
  for (const m of payments) {
    if (!m.dueDate && !m.paidAt) continue;
    const day = m.status === 'PAID' && m.paidAt ? m.paidAt.slice(0, 10) : m.dueDate!;
    out.push({
      id: `ms-${m.id}`, kind: 'payment', title: m.title, sub: `${m.contract.ref} · ${m.contract.title}`, start: day, end: day, amount: m.amount,
      tone: m.status === 'PAID' ? 'done' : m.status === 'DONE' ? 'review' : 'progress',
      status: m.status === 'PAID' ? `Εξοφλήθηκε · ${eur(m.amount)}` : m.status === 'DONE' ? `Προς πληρωμή · ${eur(m.amount)}` : `Δόση · ${eur(m.amount)}`,
      href: `/dashboard/customer/contracts/${m.contract.id}`,
    });
  }
  for (const o of offers) {
    const day = o.validUntil!.toISOString().slice(0, 10);
    out.push({ id: `offer-${o.id}`, kind: 'milestone', title: `Ισχύς προσφοράς: ${o.title}`, sub: contractRef(o.number), start: day, end: day, tone: 'danger', status: 'Περιμένει την απάντησή σας', href: `/dashboard/customer/contracts/${o.id}` });
  }
  return out;
}
