import Link from 'next/link';
import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/rbac';
import { customerProjects } from '@/lib/portal-erp';
import { prisma } from '@/lib/db';
import { Container } from '@/components/site/ui';
import { PortalShell } from '../../portal-shell';
import { date, Empty, PageTitle, Status } from '../_ui/bits';
import { projectTone } from '../_ui/tones';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Τα έργα μου' };

/** Τα έργα του πελάτη (SoftOne PRJC με πελάτη = ο συνδεδεμένος). Κανένα στοιχείο κόστους. */
export default async function CustomerProjectsPage() {
  const user = await requireCustomer();
  const [projects, org] = await Promise.all([
    customerProjects(user.customerTrdr),
    prisma.softoneTrader.findUnique({ where: { trdr: user.customerTrdr }, select: { name: true } }),
  ]);
  const active = projects.filter((p) => p.state === 'active').length;
  return (
    <PortalShell user={user} org={org?.name ?? null} active="projects">
      <Container className="py-14 md:py-20">
        <PageTitle eyebrow="Παρακολούθηση έργων" title="Τα έργα μου">
          Δείτε πώς προχωρά κάθε έργο σας: τι έχει γίνει, τι ακολουθεί και ποια υλικά παραγγείλατε.{projects.length === 1 ? ` Έχετε 1 έργο${active ? ', σε εξέλιξη' : ''}.` : projects.length ? ` Έχετε ${projects.length} έργα${active ? ` — ${active === 1 ? 'το ένα' : `τα ${active}`} σε εξέλιξη` : ''}.` : null}
        </PageTitle>
        {projects.length === 0 ? (
          <div className="mt-12"><Empty title="Δεν υπάρχουν έργα στο όνομά σας">Όταν ανοίξει έργο για εσάς, θα εμφανιστεί εδώ.</Empty></div>
        ) : (
          <ul className="mt-12 border-t border-(--s-line)">
            {projects.map((p) => (
              <li key={p.prjc} className="border-b border-(--s-line)">
                <Link href={`/dashboard/customer/projects/${p.prjc}`} className="group grid gap-x-6 gap-y-1 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <span className="min-w-0">
                    <span className="block text-(length:--fs-13) tabular-nums text-(--s-mute)">{p.code}</span>
                    <span className="block text-(length:--fs-18) font-semibold leading-snug text-(--s-ink) group-hover:underline group-hover:underline-offset-4">{p.name}</span>
                    <span className="mt-1 block text-(length:--fs-13) text-(--s-ink-2)">
                      Ξεκίνησε {date(p.fromDate)}{p.closeDate ? ` · ολοκληρώθηκε ${date(p.closeDate)}` : p.finalDate ? ` · αναμένεται να ολοκληρωθεί ${date(p.finalDate)}` : ''}
                    </span>
                  </span>
                  <Status label={p.stateLabel} tone={projectTone[p.state]} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </PortalShell>
  );
}
