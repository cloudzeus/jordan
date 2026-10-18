import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/rbac';
import { customerProject } from '@/lib/portal-erp';
import { prisma } from '@/lib/db';
import { btn, Container } from '@/components/site/ui';
import { PortalShell } from '../../../portal-shell';
import { date, Empty, ErpUnavailable, eur, PageTitle, Stat, Status } from '../../_ui/bits';
import { DocTable } from '../../_ui/doc-table';
import { projectTone } from '../../_ui/tones';
import { customerProjectTasks } from '@/lib/project-tasks';
import { zonedParts } from '@/lib/appointments-core';
import { ProjectTasksSection } from './project-tasks-section';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Έργο' };

/**
 * Ένα έργο του πελάτη: κατάσταση, ημερομηνίες και ΜΟΝΟ τα παραστατικά προς τον πελάτη (πωλήσεις)
 * και οι πληρωμές του. Αγορές, κόστος, γενικά έξοδα και κερδοφορία δεν ζητούνται καν.
 */
export default async function CustomerProjectPage({ params }: { params: Promise<{ prjc: string }> }) {
  const user = await requireCustomer();
  const prjc = Number((await params).prjc);
  const [data, org] = await Promise.all([
    customerProject(user.customerTrdr, prjc).then((d) => ({ ok: true as const, d }), () => ({ ok: false as const, d: null })),
    prisma.softoneTrader.findUnique({ where: { trdr: user.customerTrdr }, select: { name: true } }),
  ]);
  if (data.ok && !data.d) notFound();
  if (!data.ok) {
    // SoftOne δεν απάντησε: δείχνουμε τουλάχιστον το έργο από τον καθρέφτη.
    const p = await prisma.softoneProject.findFirst({ where: { prjc, trdr: user.customerTrdr }, select: { code: true, name: true } });
    if (!p) notFound();
    // Οι εργασίες είναι δικά μας δεδομένα — φαίνονται και όταν το SoftOne δεν απαντά.
    const work = await customerProjectTasks(user.customerTrdr, prjc);
    return (
      <PortalShell user={user} org={org?.name ?? null} active="projects">
        <Container className="py-14 md:py-20">
          <PageTitle eyebrow={`Έργο ${p.code}`} title={p.name} back={{ href: '/dashboard/customer/projects', label: 'Τα έργα μου' }} />
          <div className="mt-10"><ErpUnavailable /></div>
          {work && <ProjectTasksSection tasks={work.tasks} progress={work.progress} today={zonedParts(new Date()).date} />}
        </Container>
      </PortalShell>
    );
  }
  const { project: p, docs, totals, requests } = data.d!;
  const work = await customerProjectTasks(user.customerTrdr, prjc);
  const sales = docs.filter((d) => d.kind !== 'payment');
  const payments = docs.filter((d) => d.kind === 'payment');
  return (
    <PortalShell user={user} org={org?.name ?? null} active="projects">
      <Container className="py-14 md:py-20">
        <PageTitle eyebrow={`Έργο ${p.code}`} title={p.name} back={{ href: '/dashboard/customer/projects', label: 'Τα έργα μου' }} />
        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
          <Status label={p.stateLabel} tone={projectTone[p.state]} />
          <span>Έναρξη {date(p.fromDate)}</span>
          {p.finalDate && <span>Προβλεπόμενη λήξη {date(p.finalDate)}</span>}
          {p.closeDate && <span>Ολοκληρώθηκε {date(p.closeDate)}</span>}
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          <Stat label="Τιμολογημένα (με ΦΠΑ)" value={eur(totals.invoiced)} hint="τιμολόγια μείον πιστωτικά" />
          <Stat label="Πληρωμές σας" value={eur(totals.paid)} />
          <Stat label="Ανοιχτές παραγγελίες" value={String(totals.openOrders)} hint={requests ? `+ ${requests} αιτήματα από το portal` : undefined} />
        </div>

        {work && <ProjectTasksSection tasks={work.tasks} progress={work.progress} today={zonedParts(new Date()).date} />}

        <section className="mt-16" aria-labelledby="docs">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="docs" className="font-site text-[length:var(--fs-24)] font-light">Παραγγελίες, δελτία & τιμολόγια</h2>
            <Link href={`/dashboard/customer/orders/new?project=${p.prjc}`} className={btn.ghost}>Νέα παραγγελία για το έργο</Link>
          </div>
          <div className="mt-6">{sales.length ? <DocTable docs={sales} /> : <Empty title="Δεν υπάρχουν ακόμη παραστατικά" />}</div>
        </section>

        {payments.length > 0 && (
          <section className="mt-16" aria-labelledby="payments">
            <h2 id="payments" className="font-site text-[length:var(--fs-24)] font-light">Πληρωμές</h2>
            <div className="mt-6"><DocTable docs={payments} link={false} /></div>
          </section>
        )}
      </Container>
    </PortalShell>
  );
}
