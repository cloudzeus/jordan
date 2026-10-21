import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiMapPin, FiPhone } from 'react-icons/fi';
import { requireCustomer } from '@/lib/rbac';
import { customerContract } from '@/lib/portal-customer';
import { siteCompany } from '@/lib/site-company';
import { prisma } from '@/lib/db';
import { Journey, Label, Panel, Pill } from '@/components/site/b2b';
import { CropMarks, Grid } from '@/components/site/blueprint';
import { Container } from '@/components/site/ui';
import { PortalShell } from '../../../portal-shell';
import { date, eur, PageTitle, qty } from '../../_ui/bits';
import { contractTone } from '../../_ui/tones';
import { DocList, MilestoneList } from '../../../_party/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Προσφορά / σύμβαση' };

const STEPS = ['Προσφορά', 'Αποδοχή', 'Εκτέλεση', 'Παράδοση'];
const stepOf = (s: string) => (s === 'SENT' ? 0 : s === 'ACCEPTED' ? 1 : s === 'ACTIVE' ? 2 : 3);

/** Μία προσφορά/σύμβαση του πελάτη: πορεία, γραμμές με τη δική του τιμή, πληρωμές, PDF. */
export default async function CustomerContractPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCustomer();
  const { id } = await params;
  const [c, org, company] = await Promise.all([
    customerContract(user.customerTrdr, id),
    prisma.softoneTrader.findUnique({ where: { trdr: user.customerTrdr }, select: { name: true } }),
    siteCompany(),
  ]);
  if (!c) notFound();
  const paid = c.milestones.filter((m) => m.status === 'PAID').reduce((t, m) => t + m.amount, 0);

  return (
    <PortalShell user={user} org={org?.name ?? null} active="contracts">
      <section className="relative overflow-hidden bg-(--s-paper)">
        <Grid />
        <Container className="relative py-12 md:py-16">
          <PageTitle eyebrow={`${c.ref} · ${c.stageLabel}`} title={c.title} back={{ href: '/dashboard/customer/contracts', label: 'Προσφορές & συμβάσεις' }}>
            <span className="flex flex-wrap items-center gap-3">
              <Pill label={c.statusLabel} tone={contractTone(c.status)} />
              {c.prjc != null && <Link href={`/dashboard/customer/projects/${c.prjc}`} className="s-link text-(--s-ink)">Δείτε το έργο</Link>}
            </span>
          </PageTitle>
          <Journey steps={STEPS} current={stepOf(c.status)} className="mt-10 max-w-3xl" />
        </Container>
      </section>

      <Container className="grid gap-14 py-14 md:py-20 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-16">
          {c.summary && <p className="max-w-2xl whitespace-pre-line text-(length:--fs-17) text-(--s-ink-2)">{c.summary}</p>}

          <section aria-labelledby="lines">
            <Label>Περιεχόμενο</Label>
            <h2 id="lines" className="font-site mt-2 text-(length:--fs-24) font-light">Υλικά & εργασίες</h2>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-(length:--fs-14)">
                <thead>
                  <tr className="border-b border-(--s-ink) text-left text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">
                    <th className="py-2 pr-4 font-normal">Περιγραφή</th>
                    <th className="py-2 pr-4 text-right font-normal">Ποσότητα</th>
                    <th className="py-2 pr-4 text-right font-normal">Τιμή</th>
                    <th className="py-2 text-right font-normal">Αξία</th>
                  </tr>
                </thead>
                <tbody>
                  {c.lines.map((l) => (
                    <tr key={l.id} className="border-b border-(--s-line) align-top">
                      <td className="py-3 pr-4">
                        {l.name}
                        <span className="mt-0.5 block text-(length:--fs-12) text-(--s-mute)">{l.kind === 'SERVICE' ? 'Εργασία' : 'Υλικό'}{l.code ? ` · ${l.code}` : ''}{l.discount ? ` · έκπτωση ${qty(l.discount)}%` : ''}</span>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">{qty(l.qty)}{l.unit ? ` ${l.unit}` : ''}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{eur(l.unitPrice)}</td>
                      <td className="font-num py-3 text-right text-(length:--fs-16) tabular-nums">{eur(l.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="text-(length:--fs-14)">
                  <tr><td colSpan={3} className="pt-4 text-right text-(--s-mute)">Καθαρή αξία</td><td className="pt-4 text-right tabular-nums">{eur(c.net)}</td></tr>
                  <tr><td colSpan={3} className="pt-1 text-right text-(--s-mute)">ΦΠΑ {qty(c.vatRate)}%</td><td className="pt-1 text-right tabular-nums">{eur(c.vat)}</td></tr>
                  <tr><td colSpan={3} className="pt-3 text-right text-(--s-ink)">Σύνολο</td><td className="font-num pt-3 text-right text-(length:--fs-28) tabular-nums">{eur(c.total)}</td></tr>
                </tfoot>
              </table>
            </div>
          </section>

          {c.milestones.length > 0 && (
            <section aria-labelledby="pay">
              <Label>Χρονοδιάγραμμα</Label>
              <h2 id="pay" className="font-site mt-2 text-(length:--fs-24) font-light">Πληρωμές</h2>
              <div className="mt-6"><MilestoneList items={c.milestones.map((m) => ({ ...m, paidAt: null }))} /></div>
            </section>
          )}

          <section aria-labelledby="docs">
            <Label>Έγγραφα</Label>
            <h2 id="docs" className="font-site mt-2 text-(length:--fs-24) font-light">PDF</h2>
            <div className="mt-6"><DocList docs={c.documents} /></div>
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
          <Panel className="relative">
            <CropMarks className="text-(--s-line)" size={12} />
            <Label>Σύνοψη</Label>
            <p className="font-num mt-3 text-(length:--fs-48) leading-none tabular-nums">{eur(c.total)}</p>
            <p className="mt-1 text-(length:--fs-13) text-(--s-ink-2)">με ΦΠΑ {qty(c.vatRate)}%</p>
            <dl className="mt-6 space-y-3 border-t border-(--s-line) pt-4 text-(length:--fs-14)">
              {c.validUntil && c.status === 'SENT' && <div className="flex justify-between gap-4"><dt className="text-(--s-mute)">Ισχύει έως</dt><dd>{date(c.validUntil)}</dd></div>}
              <div className="flex justify-between gap-4"><dt className="text-(--s-mute)">Έναρξη</dt><dd>{date(c.startDate)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-(--s-mute)">Παράδοση</dt><dd>{date(c.endDate)}</dd></div>
              {c.milestones.length > 0 && <div className="flex justify-between gap-4"><dt className="text-(--s-mute)">Εξοφλήθηκαν</dt><dd className="tabular-nums">{eur(paid)}</dd></div>}
            </dl>
            {c.site && <p className="mt-5 flex items-start gap-2 border-t border-(--s-line) pt-4 text-(length:--fs-14) text-(--s-ink-2)"><FiMapPin className="mt-0.5 size-4 shrink-0 text-(--s-accent)" aria-hidden />{c.site}</p>}
          </Panel>
          {c.status === 'SENT' && (
            <div className="border-l-2 border-(--s-accent) bg-(--s-paper) px-5 py-4 text-(length:--fs-14) text-(--s-ink-2)">
              <p className="text-(--s-ink)">Θέλετε να προχωρήσουμε;</p>
              <p className="mt-1">Απαντήστε στο email της προσφοράς ή καλέστε μας — θα ενεργοποιήσουμε τη σύμβαση και το πρόγραμμα.</p>
              <a href={`tel:${company.phones[0].replace(/\s/g, '')}`} className="mt-2 inline-flex min-h-11 items-center gap-2 tabular-nums text-(--s-ink)"><FiPhone className="size-4 text-(--s-accent)" aria-hidden /><span className="s-link">{company.phones[0]}</span></a>
            </div>
          )}
        </aside>
      </Container>
    </PortalShell>
  );
}
