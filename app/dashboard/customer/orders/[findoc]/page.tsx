import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/rbac';
import { customerSalesDoc } from '@/lib/portal-erp';
import { prisma } from '@/lib/db';
import { btn, Container } from '@/components/site/ui';
import { PortalShell } from '../../../portal-shell';
import { date, ErpUnavailable, eur, PageTitle, qty, Status } from '../../_ui/bits';
import { orderTone } from '../../_ui/tones';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Παραστατικό' };

/** Ένα παραστατικό πωλήσεων του πελάτη με τις γραμμές του (τιμές πώλησης ΠΡΟΣ τον πελάτη μόνο). */
export default async function CustomerDocPage({ params }: { params: Promise<{ findoc: string }> }) {
  const user = await requireCustomer();
  const findoc = Number((await params).findoc);
  const [res, org] = await Promise.all([
    customerSalesDoc(user.customerTrdr, findoc).then((d) => ({ ok: true as const, d }), () => ({ ok: false as const, d: null })),
    prisma.softoneTrader.findUnique({ where: { trdr: user.customerTrdr }, select: { name: true } }),
  ]);
  if (res.ok && !res.d) notFound();
  const back = { href: '/dashboard/customer/orders', label: 'Παραγγελίες' };
  if (!res.ok) {
    return (
      <PortalShell user={user} org={org?.name ?? null} active="orders">
        <Container className="py-14 md:py-20"><PageTitle eyebrow="Παραστατικό" title={`#${findoc}`} back={back} /><div className="mt-10"><ErpUnavailable /></div></Container>
      </PortalShell>
    );
  }
  const { doc, project, lines } = res.d!;
  const isOrder = doc.kind === 'order';
  return (
    <PortalShell user={user} org={org?.name ?? null} active="orders">
      <Container className="py-14 md:py-20">
        <PageTitle eyebrow={doc.seriesName ?? doc.kindLabel} title={doc.fincode} back={back} />
        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
          {doc.cancelled ? <Status label="Ακυρωμένο" tone="bad" /> : doc.state && <Status label={doc.stateLabel!} tone={orderTone[doc.state]} />}
          <span>Ημερομηνία {date(doc.date)}</span>
          {project && <Link href={`/dashboard/customer/projects/${project.prjc}`} className="s-link">Έργο: {project.name}</Link>}
        </div>

        <section className="mt-12" aria-label="Γραμμές">
          <div className="hidden grid-cols-[1fr_7rem_7rem_7rem_8rem] gap-4 border-b border-[var(--s-ink)] pb-2 text-[length:var(--fs-12)] uppercase tracking-[0.12em] text-[var(--s-mute)] md:grid">
            <span>Υλικό</span><span className="text-right">Ποσότητα</span><span className="text-right">{isOrder ? 'Εκτελέστηκε' : ''}</span><span className="text-right">Τιμή</span><span className="text-right">Αξία</span>
          </div>
          <ul>
            {lines.map((l) => (
              <li key={l.id} className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-[var(--s-line)] py-4 text-[length:var(--fs-15)] md:grid-cols-[1fr_7rem_7rem_7rem_8rem] md:items-baseline">
                <span className="col-span-2 min-w-0 md:col-span-1">
                  {l.name}{l.code && <span className="text-[length:var(--fs-13)] text-[var(--s-mute)]"> · {l.code}</span>}
                  {l.comment && <span className="block text-[length:var(--fs-13)] text-[var(--s-ink-2)]">{l.comment}</span>}
                </span>
                <span className="tabular-nums md:text-right">{qty(l.qty)} {l.unit ?? ''}</span>
                <span className="text-right tabular-nums text-[var(--s-ink-2)]">{isOrder ? <><span className="md:hidden">εκτελ. </span>{qty(l.executed)}</> : null}</span>
                <span className="tabular-nums text-[var(--s-ink-2)] md:text-right">{eur(l.price)}{l.discount ? <span className="text-[length:var(--fs-13)]"> −{qty(l.discount)}%</span> : null}</span>
                <span className="text-right tabular-nums">{eur(l.value)}</span>
              </li>
            ))}
          </ul>
          <dl className="ml-auto mt-6 grid max-w-xs grid-cols-2 gap-y-2 text-[length:var(--fs-15)]">
            <dt className="text-[var(--s-ink-2)]">Καθαρή αξία</dt><dd className="text-right tabular-nums">{eur(doc.net)}</dd>
            <dt className="text-[var(--s-ink-2)]">ΦΠΑ</dt><dd className="text-right tabular-nums">{eur(doc.vat)}</dd>
            <dt className="border-t border-[var(--s-ink)] pt-2 font-medium">Σύνολο</dt><dd className="font-num border-t border-[var(--s-ink)] pt-2 text-right text-[length:var(--fs-20)] tabular-nums">{eur(doc.total)}</dd>
          </dl>
        </section>

        <div className="mt-14 flex flex-wrap gap-4">
          <Link href={`/dashboard/customer/orders/new?repeat=${doc.findoc}`} className={btn.ghost}>Επανάληψη παραγγελίας</Link>
        </div>
      </Container>
    </PortalShell>
  );
}
