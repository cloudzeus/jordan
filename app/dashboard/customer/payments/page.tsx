import Link from 'next/link';
import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/rbac';
import { customerPayments, type CustomerPayment } from '@/lib/portal-requests';
import { prisma } from '@/lib/db';
import { Container } from '@/components/site/ui';
import { Pill } from '@/components/site/b2b';
import { PortalShell } from '../../portal-shell';
import { date, Empty, eur, PageTitle, Stat } from '../_ui/bits';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Πληρωμές' };

const STATUS = {
  DONE: { label: 'Προς πληρωμή', tone: 'warn' as const },
  PENDING: { label: 'Προγραμματισμένη', tone: 'neutral' as const },
  PAID: { label: 'Εξοφλήθηκε', tone: 'good' as const },
};

function Row({ p }: { p: CustomerPayment }) {
  const s = STATUS[p.status];
  return (
    <li className="border-b border-(--s-line)">
      <div className="grid gap-x-6 gap-y-1 py-5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <span className="min-w-0">
          <span className="block text-(length:--fs-13) tabular-nums text-(--s-mute)">
            {p.status === 'PAID' && p.paidAt ? `Εξοφλήθηκε ${date(p.paidAt.slice(0, 10))}` : p.dueDate ? `Έως ${date(p.dueDate)}` : 'Χωρίς ημερομηνία'}
          </span>
          <span className="block text-(length:--fs-18) font-semibold leading-snug text-(--s-ink)">{p.title}</span>
          <Link href={`/dashboard/customer/contracts/${p.contract.id}`} className="s-link mt-0.5 inline-block text-(length:--fs-13) text-(--s-ink-2)">{p.contract.ref} · {p.contract.title}</Link>
          {p.status === 'DONE' && p.deliveryNote && <span className="mt-2 block border-l-2 border-(--s-accent) pl-3 text-(length:--fs-14) text-(--s-ink-2)">{p.deliveryNote}</span>}
        </span>
        <span className="p-amount text-(length:--fs-24) tabular-nums sm:text-right">{eur(p.amount)}</span>
        <Pill label={s.label} tone={s.tone} pulse={p.status === 'DONE'} />
      </div>
    </li>
  );
}

/** Όλες οι δόσεις του πελάτη από τις συμβάσεις του: τι πληρώθηκε, τι είναι προς πληρωμή και τι ακολουθεί. */
export default async function CustomerPaymentsPage() {
  const user = await requireCustomer();
  const [rows, org] = await Promise.all([
    customerPayments(user.customerTrdr),
    prisma.softoneTrader.findUnique({ where: { trdr: user.customerTrdr }, select: { name: true } }),
  ]);
  const sum = (xs: CustomerPayment[]) => xs.reduce((t, p) => t + p.amount, 0);
  const due = rows.filter((p) => p.status === 'DONE');
  const next = rows.filter((p) => p.status === 'PENDING');
  const paid = rows.filter((p) => p.status === 'PAID').reverse();
  return (
    <PortalShell user={user} org={org?.name ?? null} active="payments">
      <Container className="py-14 md:py-20">
        <PageTitle eyebrow="Πληρωμές" title="Οι δόσεις σας">
          Οι πληρωμές των συμβάσεών σας. «Προς πληρωμή» είναι όσες αφορούν δουλειά που έχει ήδη παραδοθεί.
        </PageTitle>
        {rows.length === 0 ? (
          <div className="mt-12"><Empty title="Καμία πληρωμή ακόμη">Όταν αποδεχτείτε μια προσφορά, το χρονοδιάγραμμα πληρωμών της θα εμφανιστεί εδώ.</Empty></div>
        ) : (
          <>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <Stat label="Σύνολο συμβάσεων" value={eur(sum(rows))} />
              <Stat label="Εξοφλήθηκαν" value={eur(sum(paid))} />
              <Stat label="Υπόλοιπο" value={eur(sum(rows) - sum(paid))} hint={due.length ? `${eur(sum(due))} προς πληρωμή τώρα` : next[0]?.dueDate ? `επόμενη δόση ${date(next[0].dueDate)}` : undefined} />
            </div>
            {due.length > 0 && (
              <section className="mt-16" aria-labelledby="pay-due">
                <h2 id="pay-due" className="font-site text-(length:--fs-24) font-medium">Προς πληρωμή</h2>
                <ul className="mt-4 border-t border-(--s-line)">{due.map((p) => <Row key={p.id} p={p} />)}</ul>
              </section>
            )}
            {next.length > 0 && (
              <section className="mt-16" aria-labelledby="pay-next">
                <h2 id="pay-next" className="font-site text-(length:--fs-24) font-medium">Επόμενες</h2>
                <ul className="mt-4 border-t border-(--s-line)">{next.map((p) => <Row key={p.id} p={p} />)}</ul>
              </section>
            )}
            {paid.length > 0 && (
              <section className="mt-16" aria-labelledby="pay-paid">
                <h2 id="pay-paid" className="font-site text-(length:--fs-24) font-medium">Εξοφλημένες</h2>
                <ul className="mt-4 border-t border-(--s-line)">{paid.map((p) => <Row key={p.id} p={p} />)}</ul>
              </section>
            )}
          </>
        )}
      </Container>
    </PortalShell>
  );
}
