import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FiDownload, FiMapPin, FiPhone } from 'react-icons/fi';
import { requireParty } from '@/lib/rbac';
import { partyAssignment, partyName, partyTasks } from '@/lib/portal-party';
import { siteCompany } from '@/lib/site-company';
import { phaseMeta, type PhaseKey } from '@/lib/project-tasks-core';
import { Label, Panel, Pill } from '@/components/site/b2b';
import { CropMarks, DimLine, Grid } from '@/components/site/blueprint';
import { Container } from '@/components/site/ui';
import { PortalShell } from '../../portal-shell';
import { PageTitle } from '../../customer/_ui/bits';
import { dayLong, dayShort, DocList, eur, mapsHref, MilestoneList, qtyEl, statusTone } from '../../_party/ui';
import { NotLinked } from '../../_party/party-home';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ανάθεση' };

/**
 * Μία ανάθεση: εργοτάξιο, τι αναλαμβάνετε (με τη δική σας αμοιβή — ποτέ την τιμή του πελάτη),
 * οι εργασίες σας στο έργο με τα σχέδιά τους, τα ορόσημα πληρωμής και η σύμβαση ανάθεσης (PDF).
 */
export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, party } = await requireParty();
  if (!party) return <NotLinked user={user} />;
  const { id } = await params;
  const [a, org, allTasks, c] = await Promise.all([partyAssignment(party, id), partyName(party), partyTasks(party), siteCompany()]);
  if (!a) notFound();
  const tasks = a.prjc != null ? allTasks.filter((t) => t.prjc === a.prjc) : [];
  const href = mapsHref(a.site);
  const days = a.startDate && a.endDate ? Math.round((Date.parse(a.endDate) - Date.parse(a.startDate)) / 86_400_000) + 1 : null;

  return (
    <PortalShell user={user} org={org} active="assignments">
      <section className="relative overflow-hidden bg-(--s-paper)">
        <Grid />
        <Container className="relative py-12 md:py-16">
          <PageTitle eyebrow={`${a.ref}${a.specialty ? ` · ${a.specialty}` : ''}`} title={a.title} back={{ href: '/dashboard/assignments', label: 'Αναθέσεις' }}>
            <span className="flex flex-wrap items-center gap-3">
              <Pill label={a.statusLabel} tone={statusTone(a.status)} />
              {a.projectName && <span>Έργο: <b className="font-medium text-(--s-ink)">{a.projectName}</b></span>}
              {a.customerName && <span>· Πελάτης: {a.customerName}</span>}
            </span>
          </PageTitle>
          {days != null && <DimLine label={`${dayShort(a.startDate)} — ${days} ΗΜΕΡΕΣ — ${dayShort(a.endDate)}`} className="mt-10 max-w-3xl text-(--s-ink)" />}
        </Container>
      </section>

      <Container className="grid gap-14 py-14 md:py-20 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-16">
          {/* Τι αναλαμβάνετε */}
          <section aria-labelledby="scope">
            <Label>Αντικείμενο</Label>
            <h2 id="scope" className="font-site mt-2 text-(length:--fs-24) font-light">Τι αναλαμβάνετε</h2>
            {a.scope && <p className="mt-4 max-w-2xl whitespace-pre-line text-(length:--fs-15) text-(--s-ink-2)">{a.scope}</p>}
            {a.lines.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-(length:--fs-14)">
                  <thead>
                    <tr className="border-b border-(--s-ink) text-left text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">
                      <th className="py-2 pr-4 font-normal">Εργασία</th>
                      <th className="py-2 pr-4 text-right font-normal">Ποσότητα</th>
                      <th className="py-2 text-right font-normal">Αμοιβή</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.lines.map((l) => (
                      <tr key={l.id} className="border-b border-(--s-line) align-top">
                        <td className="py-3 pr-4">{l.name}{l.notes && <span className="mt-0.5 block text-(length:--fs-12) text-(--s-mute)">{l.notes}</span>}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{qtyEl(l.qty)}{l.unit ? ` ${l.unit}` : ''}</td>
                        <td className="font-num py-3 text-right text-(length:--fs-16) tabular-nums">{l.fee != null ? eur(l.fee) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={2} className="pt-4 text-right text-(length:--fs-13) text-(--s-mute)">Σύνολο αμοιβής</td><td className="font-num pt-4 text-right text-(length:--fs-24) tabular-nums">{eur(a.feeTotal)}</td></tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* Εργασίες στο έργο */}
          <section aria-labelledby="tasks">
            <Label>Πρόγραμμα</Label>
            <h2 id="tasks" className="font-site mt-2 text-(length:--fs-24) font-light">Οι εργασίες σας στο έργο</h2>
            {tasks.length === 0 ? <p className="mt-4 text-(length:--fs-14) text-(--s-ink-2)">Δεν έχουν οριστεί ακόμη εργασίες με το όνομά σας.</p> : (
              <ol className="mt-6 border-t border-(--s-line)">
                {tasks.map((t) => (
                  <li key={t.id} className="grid gap-x-6 gap-y-2 border-b border-(--s-line) py-4 sm:grid-cols-[150px_1fr_auto]">
                    <span className="text-(length:--fs-13) tabular-nums text-(--s-ink-2)">{dayShort(t.start)} – {dayShort(t.end)}</span>
                    <span className="min-w-0">
                      <span className="block text-(length:--fs-15)">{t.name}</span>
                      {t.description && <span className="mt-1 block text-(length:--fs-13) text-(--s-ink-2)">{t.description}</span>}
                      {t.files.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          {t.files.map((f) => <a key={f.id} href={`/api/portal/task-files/${f.id}`} className="inline-flex min-h-8 items-center gap-1.5 text-(length:--fs-13) text-(--s-ink)"><FiDownload className="size-3.5 text-(--s-accent)" aria-hidden /><span className="s-link">{f.name}</span></a>)}
                        </span>
                      )}
                    </span>
                    <Pill label={`${phaseMeta(t.phase as PhaseKey).label} · ${t.progress}%`} tone={t.phase === 'DONE' ? 'good' : t.phase === 'TODO' ? 'neutral' : 'active'} />
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Ορόσημα */}
          <section aria-labelledby="ms">
            <Label>Χρήματα</Label>
            <h2 id="ms" className="font-site mt-2 text-(length:--fs-24) font-light">Ορόσημα πληρωμής</h2>
            <div className="mt-6"><MilestoneList items={a.milestones} /></div>
          </section>

          {/* Έγγραφα */}
          <section aria-labelledby="docs">
            <Label>Έγγραφα</Label>
            <h2 id="docs" className="font-site mt-2 text-(length:--fs-24) font-light">Η σύμβασή σας</h2>
            <div className="mt-6"><DocList docs={a.documents} /></div>
          </section>
        </div>

        {/* Πλαϊνό: εργοτάξιο + επικοινωνία */}
        <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
          <Panel className="relative">
            <CropMarks className="text-(--s-line)" size={12} />
            <Label icon={FiMapPin}>Εργοτάξιο</Label>
            <p className="font-site mt-3 text-(length:--fs-18) font-light leading-snug">{a.site.line ?? 'Η διεύθυνση θα οριστεί'}</p>
            {href && <a href={href} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 bg-(--s-ink) text-(length:--fs-14) font-medium text-white transition-colors hover:bg-[#2C4556]"><FiMapPin className="size-4" aria-hidden />Οδηγίες στον χάρτη</a>}
            <dl className="mt-6 space-y-3 border-t border-(--s-line) pt-4 text-(length:--fs-14)">
              <div className="flex justify-between gap-4"><dt className="text-(--s-mute)">Έναρξη</dt><dd className="text-right">{dayLong(a.startDate)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-(--s-mute)">Λήξη</dt><dd className="text-right">{dayLong(a.endDate)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-(--s-mute)">Αμοιβή</dt><dd className="font-num text-right text-(length:--fs-18) tabular-nums">{eur(a.feeTotal)}</dd></div>
            </dl>
          </Panel>
          <div className="border-l-2 border-(--s-ink) bg-(--s-paper) px-5 py-4 text-(length:--fs-14) text-(--s-ink-2)">
            <p className="text-(--s-ink)">Αλλαγή στο πρόγραμμα ή ερώτηση;</p>
            <a href={`tel:${c.phones[0].replace(/\s/g, '')}`} className="mt-2 inline-flex min-h-11 items-center gap-2 tabular-nums text-(--s-ink)"><FiPhone className="size-4 text-(--s-accent)" aria-hidden /><span className="s-link">{c.phones[0]}</span></a>
            <p>{c.hours}</p>
          </div>
        </aside>
      </Container>
    </PortalShell>
  );
}
