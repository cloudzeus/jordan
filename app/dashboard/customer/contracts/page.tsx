import Link from 'next/link';
import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/rbac';
import { customerContracts } from '@/lib/portal-customer';
import { prisma } from '@/lib/db';
import { Container } from '@/components/site/ui';
import { Pill } from '@/components/site/b2b';
import { PortalShell } from '../../portal-shell';
import { date, Empty, eur, PageTitle } from '../_ui/bits';
import { contractTone } from '../_ui/tones';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Προσφορές & συμβάσεις' };

/** Οι προσφορές και οι συμβάσεις του πελάτη — ό,τι του στάλθηκε, με το σύνολο και την πορεία του. */
export default async function CustomerContractsPage() {
  const user = await requireCustomer();
  const [rows, org] = await Promise.all([
    customerContracts(user.customerTrdr),
    prisma.softoneTrader.findUnique({ where: { trdr: user.customerTrdr }, select: { name: true } }),
  ]);
  const pending = rows.filter((r) => r.status === 'SENT');
  const rest = rows.filter((r) => r.status !== 'SENT');
  return (
    <PortalShell user={user} org={org?.name ?? null} active="contracts">
      <Container className="py-14 md:py-20">
        <PageTitle eyebrow="Προσφορές & συμβάσεις" title="Οι συμφωνίες μας">
          {pending.length ? `${pending.length === 1 ? 'Μία προσφορά περιμένει' : `${pending.length} προσφορές περιμένουν`} την απάντησή σας. ` : null}
          Εδώ βρίσκετε τις προσφορές που σας στείλαμε και τις συμβάσεις σας. Ανοίξτε μια προσφορά για να δείτε τι περιλαμβάνει, να μας ρωτήσετε κάτι ή να την αποδεχτείτε.
        </PageTitle>
        {rows.length === 0 ? (
          <div className="mt-12"><Empty title="Καμία προσφορά ακόμη">Όταν σας στείλουμε προσφορά, θα τη βρείτε εδώ.</Empty></div>
        ) : (
          <>
            {pending.length > 0 && (
              <ul className="mt-12 grid gap-5 md:grid-cols-2" data-reveal data-stagger>
                {pending.map((c) => (
                  <li key={c.id}>
                    <Link href={`/dashboard/customer/contracts/${c.id}`} className="group relative flex h-full flex-col justify-between gap-6 rounded-xl border border-(--s-line) border-l-4 border-l-(--s-accent) bg-white p-6 transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-30px_rgba(28,50,65,0.45)] motion-reduce:transition-none">
                      <span>
                        <span className="flex items-start justify-between gap-4">
                          <span className="text-(length:--fs-14) tabular-nums text-(--s-ink-2)">Προσφορά {c.ref}</span>
                          <Pill label="Περιμένει απάντηση" tone="warn" pulse />
                        </span>
                        <span className="mt-2 block text-(length:--fs-22) font-semibold leading-snug text-(--s-ink)">{c.title}</span>
                        {c.validUntil && <span className="mt-2 block text-(length:--fs-13) text-(--s-ink-2)">Ισχύει έως {date(c.validUntil)}</span>}
                      </span>
                      <span className="flex items-end justify-between border-t border-(--s-line) pt-4">
                        <span className="text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">Σύνολο με ΦΠΑ</span>
                        <span className="p-amount text-(length:--fs-28) text-(--s-ink)">{eur(c.total)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {rest.length > 0 && (
              <ul className="mt-12 border-t border-(--s-line)">
                {rest.map((c) => (
                  <li key={c.id} className="border-b border-(--s-line)">
                    <Link href={`/dashboard/customer/contracts/${c.id}`} className="group grid gap-x-6 gap-y-1 py-5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <span className="min-w-0">
                        <span className="block text-(length:--fs-13) tabular-nums text-(--s-mute)">{c.ref} · {c.stageLabel}</span>
                        <span className="block text-(length:--fs-18) font-semibold leading-snug text-(--s-ink) group-hover:underline group-hover:underline-offset-4">{c.title}</span>
                        <span className="mt-1 block text-(length:--fs-13) text-(--s-ink-2)">{c.startDate ? `Έναρξη ${date(c.startDate)}` : 'Χωρίς ημερομηνία έναρξης'}{c.endDate ? ` · παράδοση ${date(c.endDate)}` : ''}</span>
                      </span>
                      <span className="p-amount text-(length:--fs-18) sm:text-right">{eur(c.total)}</span>
                      <Pill label={c.statusLabel} tone={contractTone(c.status)} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Container>
    </PortalShell>
  );
}
