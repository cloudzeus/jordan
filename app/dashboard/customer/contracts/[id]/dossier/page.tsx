import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FiCheckCircle, FiDownload, FiInfo, FiXCircle } from 'react-icons/fi';
import { requireCustomer } from '@/lib/rbac';
import { customerDossier } from '@/lib/dossier';
import { prisma } from '@/lib/db';
import { siteCompany } from '@/lib/site-company';
import { Container } from '@/components/site/ui';
import { Pill } from '@/components/site/b2b';
import { PortalShell } from '../../../../portal-shell';
import { date, PageTitle, qty } from '../../../_ui/bits';
import { PrintButton } from './print-button';
import { CustomerText } from '../../../_ui/customer-text';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Τεχνικός φάκελος' };

function Section({ n, title, children, hint }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-(--s-ink) pt-6" aria-labelledby={`ds-${n}`}>
      <h2 id={`ds-${n}`} className="flex items-baseline gap-3">
        <span className="font-num text-(length:--fs-14) tabular-nums text-(--s-accent)">{String(n).padStart(2, '0')}</span>
        <span className="font-site text-(length:--fs-24) font-medium">{title}</span>
      </h2>
      {hint && <p className="mt-1 text-(length:--fs-14) text-(--s-ink-2)">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
const th = 'py-2 pr-4 text-left text-(length:--fs-12) font-normal uppercase tracking-[0.14em] text-(--s-mute)';

/** Τεχνικός φάκελος: ό,τι χρειάζεται ο πελάτης — ή ένας άλλος επαγγελματίας — να ξέρει για όσα έγιναν. */
export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCustomer();
  const { id } = await params;
  const [ds, org, company] = await Promise.all([
    customerDossier(user.customerTrdr, id),
    prisma.softoneTrader.findUnique({ where: { trdr: user.customerTrdr }, select: { name: true } }),
    siteCompany(),
  ]);
  if (!ds) notFound();
  const done = ds.status === 'COMPLETED';
  let n = 0;
  return (
    <PortalShell user={user} org={org?.name ?? null} active="contracts">
      <div data-dossier>
      <Container className="py-14 md:py-20">
        <PageTitle eyebrow={`Τεχνικός φάκελος · ${ds.ref}`} title={ds.title} back={{ href: `/dashboard/customer/contracts/${ds.id}`, label: 'Η σύμβαση' }}>
          <span className="flex flex-wrap items-center gap-3">
            <Pill label={done ? 'Ολοκληρωμένο έργο' : 'Σε εξέλιξη — ο φάκελος συμπληρώνεται'} tone={done ? 'good' : 'active'} />
            {ds.completedAt && <span className="text-(length:--fs-14) text-(--s-ink-2)">Παράδοση {date(ds.completedAt)}</span>}
          </span>
        </PageTitle>

        <div className="mt-8 flex flex-wrap items-start justify-between gap-6" data-print-hide>
          <p className="flex max-w-2xl gap-3 border-l-2 border-(--s-accent) bg-(--s-paper) px-5 py-4 text-(length:--fs-15) text-(--s-ink-2)">
            <FiInfo className="mt-0.5 size-5 shrink-0 text-(--s-accent)" aria-hidden />
            Κρατήστε αυτόν τον φάκελο. Αν αργότερα δουλέψει άλλος επαγγελματίας στον χώρο (ηλεκτρολόγος, υδραυλικός, επιπλοποιός), δώστε του τον: θα ξέρει ακριβώς τι υλικά, πάχη και στεγάνωση υπάρχουν.
          </p>
          <PrintButton />
        </div>

        <div className="mt-12 space-y-14">
          <Section n={++n} title="Ταυτότητα έργου">
            <dl className="grid gap-x-10 gap-y-4 text-(length:--fs-15) sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Σύμβαση', ds.ref], ['Έργο', ds.project ? `${ds.project.code} · ${ds.project.name}` : '—'], ['Χώρος', ds.site ?? '—'],
                ['Αποδοχή', ds.acceptedAt ? date(ds.acceptedAt) : '—'], ['Έναρξη', ds.startDate ? date(ds.startDate) : '—'], ['Παράδοση', ds.completedAt ? date(ds.completedAt) : ds.endDate ? `προγρ. ${date(ds.endDate)}` : '—'],
                ['Ανάδοχος', company.legal], ['Επικοινωνία', [company.phones[0], company.salesEmail].filter(Boolean).join(' · ')],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">{k}</dt><dd className="mt-1 text-(--s-ink)">{v}</dd></div>
              ))}
            </dl>
            {ds.summary && <div className="mt-6"><CustomerText text={ds.summary} /></div>}
          </Section>

          {ds.rooms.length > 0 && (
            <Section n={++n} title="Χώροι & επιφάνειες" hint="Από την κάτοψη του έργου.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] border-collapse text-(length:--fs-15)">
                  <thead><tr className="border-b border-(--s-line)"><th className={th}>Χώρος</th><th className={`${th} text-right`}>Δάπεδο</th><th className={`${th} text-right`}>Τοίχοι</th><th className={th}>Υλικό</th></tr></thead>
                  <tbody>
                    {ds.rooms.map((r) => (
                      <tr key={r.name} className="border-b border-(--s-line)">
                        <td className="py-2.5 pr-4 text-(--s-ink)">{r.name}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{qty(r.floorM2)} m²</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{r.wallsM2 ? `${qty(r.wallsM2)} m²` : '—'}</td>
                        <td className="py-2.5 text-(--s-ink-2)">{r.material ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {ds.materials.length > 0 && (
            <Section n={++n} title="Υλικά που χρησιμοποιήθηκαν" hint="Με τους κωδικούς μας — για ίδια υλικά σε μελλοντική επισκευή ή επέκταση.">
              <div className="space-y-8">
                {ds.materials.map((g) => (
                  <div key={g.room} className="break-inside-avoid">
                    <h3 className="text-(length:--fs-16) text-(--s-ink)">{g.room}</h3>
                    <table className="mt-2 w-full border-collapse text-(length:--fs-14)">
                      <thead className="sr-only"><tr><th>Κωδικός</th><th>Υλικό</th><th>Ποσότητα</th></tr></thead>
                      <tbody>
                        {g.items.map((m) => (
                          <tr key={`${m.code}-${m.name}`} className="border-b border-(--s-line)">
                            <td className="w-[7rem] py-2 pr-4 font-num tabular-nums text-(--s-mute)">{m.code ?? '—'}</td>
                            <td className="py-2 pr-4 text-(--s-ink)">{m.name}</td>
                            <td className="whitespace-nowrap py-2 text-right tabular-nums">{qty(m.qty)} {m.unit ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(ds.tasks.length > 0 || ds.services.length > 0) && (
            <Section n={++n} title="Εργασίες που έγιναν">
              {ds.tasks.length > 0 ? (
                <ol className="space-y-2">
                  {ds.tasks.map((t) => (
                    <li key={t.name} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-(--s-line) py-2 text-(length:--fs-15)">
                      <span className="flex items-center gap-2 text-(--s-ink)"><FiCheckCircle className="size-4 shrink-0 text-[#15803D]" aria-hidden />{t.name}</span>
                      <span className="tabular-nums text-(--s-mute)">{date(t.start)}{t.end !== t.start ? ` – ${date(t.end)}` : ''}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-(length:--fs-15) text-(--s-ink-2)">{ds.services.map((s) => <li key={s}>{s}</li>)}</ul>
              )}
            </Section>
          )}

          {ds.deliveries.length > 0 && (
            <Section n={++n} title="Παραδόσεις">
              <ul className="space-y-6">
                {ds.deliveries.map((m) => (
                  <li key={m.title} className="break-inside-avoid">
                    <p className="flex flex-wrap items-baseline justify-between gap-3"><span className="text-(length:--fs-16) text-(--s-ink)">{m.title}</span>{m.doneAt && <span className="text-(length:--fs-14) tabular-nums text-(--s-mute)">{date(m.doneAt)}</span>}</p>
                    {m.note && <p className="mt-1 text-(length:--fs-15) text-(--s-ink-2)">{m.note}</p>}
                    {m.photos.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {m.photos.map((p, i) => <li key={p}><a href={`/api/portal/note-files/${p}`} target="_blank" rel="noopener noreferrer"><img src={`/api/portal/note-files/${p}`} alt={`${m.title} — φωτογραφία ${i + 1}`} loading="lazy" className="size-28 object-cover" /></a></li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {ds.care.length > 0 && (
            <Section n={++n} title="Φροντίδα & συντήρηση" hint="Για να κρατήσουν οι επιφάνειες την εμφάνισή τους για χρόνια.">
              <div className="grid gap-6 md:grid-cols-2">
                {ds.care.map((g) => (
                  <article key={g.key} className="break-inside-avoid border border-(--s-line) p-5">
                    <h3 className="font-site text-(length:--fs-20) font-light">{g.title}</h3>
                    <p className="mt-3 text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">Κάντε</p>
                    <ul className="mt-1.5 space-y-1.5">{g.dos.map((x) => <li key={x} className="flex gap-2 text-(length:--fs-14) text-(--s-ink-2)"><FiCheckCircle className="mt-0.5 size-4 shrink-0 text-[#15803D]" aria-hidden />{x}</li>)}</ul>
                    <p className="mt-4 text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">Αποφύγετε</p>
                    <ul className="mt-1.5 space-y-1.5">{g.donts.map((x) => <li key={x} className="flex gap-2 text-(length:--fs-14) text-(--s-ink-2)"><FiXCircle className="mt-0.5 size-4 shrink-0 text-[#B42318]" aria-hidden />{x}</li>)}</ul>
                  </article>
                ))}
              </div>
            </Section>
          )}

          {ds.documents.length > 0 && (
            <Section n={n + 1} title="Έγγραφα">
              <ul className="space-y-2">
                {ds.documents.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 border-b border-(--s-line) py-2 text-(length:--fs-15)">
                    <span className="text-(--s-ink)">{x.title} <span className="text-(--s-mute)">· v{x.version}</span></span>
                    <a href={`/api/portal/contract-docs/${x.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-(--s-ink)" data-print-hide><FiDownload className="size-4" aria-hidden /><span className="s-link">PDF</span></a>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
        <p className="mt-14 text-(length:--fs-12) text-(--s-mute)">Ο φάκελος δημιουργήθηκε από την πύλη του {company.brand} στις {new Date().toLocaleDateString('el-GR')}.</p>
      </Container>
      </div>
    </PortalShell>
  );
}
