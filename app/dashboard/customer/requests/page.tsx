import Link from 'next/link';
import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/rbac';
import { customerOfferRequests } from '@/lib/portal-requests';
import { prisma } from '@/lib/db';
import { Container } from '@/components/site/ui';
import { Pill } from '@/components/site/b2b';
import { PortalShell } from '../../portal-shell';
import { PageTitle } from '../_ui/bits';
import { RfpWizard } from './rfp-wizard';
import { customerSites } from '@/lib/customer-profile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Αιτήματα προσφοράς' };

const STATE = {
  PREPARING: { label: 'Ετοιμάζουμε την προσφορά', tone: 'warn' as const },
  OFFERED: { label: 'Η προσφορά στάλθηκε', tone: 'active' as const },
  CONTRACT: { label: 'Έγινε σύμβαση', tone: 'good' as const },
  CANCELLED: { label: 'Ακυρώθηκε', tone: 'neutral' as const },
};
const when = (iso: string) => new Date(iso).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'long', year: 'numeric' });

/** Ο πελάτης ζητά νέα προσφορά και βλέπει πού βρίσκεται κάθε αίτημά του. */
export default async function CustomerRequestsPage() {
  const user = await requireCustomer();
  const [rows, org, sites] = await Promise.all([
    customerOfferRequests(user.customerTrdr),
    prisma.softoneTrader.findUnique({ where: { trdr: user.customerTrdr }, select: { name: true } }),
    customerSites(user.customerTrdr),
  ]);
  return (
    <PortalShell user={user} org={org?.name ?? null} active="requests">
      <Container className="space-y-16 py-14 md:py-20">
        <div>
          <PageTitle eyebrow="Αιτήματα προσφοράς" title="Ζητήστε προσφορά">
            Ο βοηθός μας σας κάνει λίγες απλές ερωτήσεις και ετοιμάζει το αίτημα. Εμείς το ελέγχουμε και σας στέλνουμε προσφορά εδώ, όπου μπορείτε να ρωτήσετε ή να ζητήσετε αλλαγές.
          </PageTitle>
          <div className="mt-10">
            <RfpWizard sites={sites} disabledReason={user.viewAs ? 'Σε «Προβολή ως» ο βοηθός απαντά, αλλά η αποστολή γίνεται μόνο από τον πελάτη.' : null} />
          </div>
        </div>
        <section aria-labelledby="rq-list">
          <h2 id="rq-list" className="font-site text-(length:--fs-24) font-medium">Τα αιτήματά σας</h2>
          {rows.length === 0 ? (
            <p className="mt-4 text-(length:--fs-15) text-(--s-ink-2)">Δεν έχετε στείλει αίτημα ακόμη.</p>
          ) : (
            <ul className="mt-6 border-t border-(--s-line)">
              {rows.map((r) => {
                const s = STATE[r.state];
                const inner = (
                  <>
                    <span className="flex flex-wrap items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-(length:--fs-13) tabular-nums text-(--s-mute)">{r.ref} · {when(r.at)}</span>
                        <span className="mt-0.5 block text-(length:--fs-18) font-semibold leading-snug text-(--s-ink)">{r.title}</span>
                      </span>
                      <Pill label={s.label} tone={s.tone} pulse={r.state === 'PREPARING'} />
                    </span>
                    <span className="mt-2 line-clamp-3 block whitespace-pre-line text-(length:--fs-14) text-(--s-ink-2)">{r.description}</span>
                  </>
                );
                return (
                  <li key={r.id} className="border-b border-(--s-line)">
                    {r.state === 'OFFERED' || r.state === 'CONTRACT'
                      ? <Link href={`/dashboard/customer/contracts/${r.id}`} className="group block py-5 hover:bg-(--s-paper)/60">{inner}<span className="s-link mt-2 inline-block text-(length:--fs-14) text-(--s-ink)">Δείτε την προσφορά</span></Link>
                      : <div className="py-5">{inner}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </Container>
    </PortalShell>
  );
}
