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
import { contractHistory } from '@/lib/contracts/history';
import { siteCompany } from '@/lib/site-company';
import { PortalHistory } from '../../_ui/history';
import { FiFolder } from 'react-icons/fi';

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
  const [work, company] = await Promise.all([customerProjectTasks(user.customerTrdr, prjc), siteCompany()]);
  // Ιστορικό επικοινωνίας όλων των προσφορών/συμβάσεων του έργου — μόνο του δικού του πελάτη.
  const history = await contractHistory({ prjc, trdr: user.customerTrdr }, 'CUSTOMER', { companyName: company.name, limit: 200 });
  const dossiers = await prisma.contract.findMany({ where: { prjc, trdr: user.customerTrdr, status: { in: ['ACCEPTED', 'ACTIVE', 'COMPLETED'] } }, orderBy: { createdAt: 'asc' }, select: { id: true, number: true, title: true, status: true } });
  const sales = docs.filter((d) => d.kind !== 'payment');
  const payments = docs.filter((d) => d.kind === 'payment');
  return (
    <PortalShell user={user} org={org?.name ?? null} active="projects">
      <Container className="py-14 md:py-20">
        <PageTitle eyebrow={`Έργο ${p.code}`} title={p.name} back={{ href: '/dashboard/customer/projects', label: 'Τα έργα μου' }} />
        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-(length:--fs-14) text-(--s-ink-2)">
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
            <h2 id="docs" className="font-site text-(length:--fs-24) font-light">Παραγγελίες, δελτία & τιμολόγια</h2>
            <Link href={`/dashboard/customer/orders/new?project=${p.prjc}`} className={btn.ghost}>Νέα παραγγελία για το έργο</Link>
          </div>
          <div className="mt-6">{sales.length ? <DocTable docs={sales} /> : <Empty title="Δεν υπάρχουν ακόμη παραστατικά" />}</div>
        </section>

        {payments.length > 0 && (
          <section className="mt-16" aria-labelledby="payments">
            <h2 id="payments" className="font-site text-(length:--fs-24) font-light">Πληρωμές</h2>
            <div className="mt-6"><DocTable docs={payments} link={false} /></div>
          </section>
        )}

        {dossiers.length > 0 && (
          <section className="mt-16" aria-labelledby="dossiers">
            <h2 id="dossiers" className="font-site text-(length:--fs-24) font-light">Τεχνικοί φάκελοι</h2>
            <p className="mt-2 text-(length:--fs-14) text-(--s-ink-2)">Υλικά, επιφάνειες, παραδόσεις και οδηγίες φροντίδας για κάθε σύμβαση του έργου.</p>
            <ul className="mt-6 grid gap-3 md:grid-cols-2">
              {dossiers.map((d) => (
                <li key={d.id}>
                  <Link href={`/dashboard/customer/contracts/${d.id}/dossier`} className="group flex h-full items-start gap-3 border border-(--s-line) bg-white p-5 transition-[border-color,box-shadow] hover:border-(--s-ink) hover:shadow-[0_18px_50px_-30px_rgba(28,50,65,0.45)]">
                    <FiFolder className="mt-0.5 size-5 shrink-0 text-(--s-accent)" aria-hidden />
                    <span className="min-w-0"><span className="block text-(length:--fs-13) tabular-nums text-(--s-mute)">{`ΣΥΜ-${String(d.number).padStart(6, '0')}`} · {d.status === 'COMPLETED' ? 'ολοκληρωμένο' : 'σε εξέλιξη'}</span><span className="block text-(length:--fs-16) text-(--s-ink)">{d.title}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {history.length > 0 && (
          <section className="mt-16" aria-labelledby="hist">
            <h2 id="hist" className="font-site text-(length:--fs-24) font-light">Ιστορικό επικοινωνίας</h2>
            <p className="mt-2 text-(length:--fs-14) text-(--s-ink-2)">Ερωτήσεις, αλλαγές, απαντήσεις και εκδόσεις προσφορών του έργου.</p>
            <div className="mt-6"><PortalHistory entries={history} showRef /></div>
          </section>
        )}
      </Container>
    </PortalShell>
  );
}
