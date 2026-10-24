import Link from 'next/link';
import type { Metadata } from 'next';
import { FiArrowRight, FiBookOpen, FiBriefcase, FiFileText, FiMapPin } from 'react-icons/fi';
import { requireCustomer } from '@/lib/rbac';
import { customerProfile, type CustomerProfile } from '@/lib/customer-profile';
import { Container } from '@/components/site/ui';
import { PortalShell } from '../../portal-shell';
import { date, Empty, PageTitle } from '../_ui/bits';
import { AssignSite, CompanyForm, ContactForm, SitesManager } from './profile-forms';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Το προφίλ μου' };

type Install = CustomerProfile['unassigned'][number];
const PHASE: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Ετοιμάζουμε προσφορά', tone: 'review' }, SENT: { label: 'Προσφορά — περιμένει εσάς', tone: 'review' },
  ACCEPTED: { label: 'Συμφωνήθηκε', tone: 'progress' }, ACTIVE: { label: 'Σε εξέλιξη', tone: 'progress' }, COMPLETED: { label: 'Ολοκληρώθηκε', tone: 'done' },
};
const REQ: Record<string, { label: string; tone: string }> = { PENDING: { label: 'Σε έλεγχο', tone: 'review' }, APPLIED: { label: 'Έγινε η αλλαγή', tone: 'done' }, REJECTED: { label: 'Δεν έγινε', tone: 'danger' } };

function Section({ id, n, title, hint, children }: { id: string; n: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-8 border-t border-(--s-line) pt-10 lg:grid-cols-[18rem_1fr] lg:gap-16">
      <div>
        <p className="p-meta tabular-nums text-(--s-mute)">{n}</p>
        <h2 id={id} className="font-site mt-1 text-(length:--fs-24) font-medium text-(--s-ink)">{title}</h2>
        <p className="mt-2 text-(length:--fs-15) text-(--s-ink-2)">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Οι εγκαταστάσεις μιας τοποθεσίας: τι έγινε, πότε, και ο τεχνικός φάκελος της καθεμίας. */
function Installs({ rows, sites, locked }: { rows: Install[]; sites?: { id: string; label: string }[]; locked: boolean }) {
  if (!rows.length) return <p className="text-(length:--fs-15) text-(--s-ink-2)">Δεν υπάρχει ακόμη εργασία εδώ. Όταν ζητήσετε προσφορά για αυτή την τοποθεσία, θα τη βρίσκετε σε αυτό το σημείο, μαζί με τον τεχνικό φάκελο μόλις ολοκληρωθεί.</p>;
  return (
    <ul className="divide-y divide-(--s-line)">
      {rows.map((c) => {
        const ph = PHASE[c.status] ?? { label: c.status, tone: 'todo' };
        return (
          <li key={c.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1 basis-60">
              <p className="p-meta text-(--s-mute)">{c.ref}{c.date ? ` · ${date(c.date)}` : ''}</p>
              <Link href={`/dashboard/customer/contracts/${c.id}`} className="s-link text-(length:--fs-17) font-semibold text-(--s-ink)">{c.title}</Link>
              {sites && c.address && <p className="text-(length:--fs-14) text-(--s-ink-2)">{c.address}</p>}
            </div>
            <span className="p-chip" data-tone={ph.tone}>{ph.label}</span>
            {c.dossier && (
              <Link href={`/dashboard/customer/contracts/${c.id}/dossier`} className="p-btn p-btn-ghost">
                <FiBookOpen className="size-4" aria-hidden />{c.status === 'COMPLETED' ? 'Τεχνικός φάκελος' : 'Φάκελος (σε εξέλιξη)'}
              </Link>
            )}
            {c.prjc != null && <Link href={`/dashboard/customer/projects/${c.prjc}`} className="inline-flex min-h-11 items-center gap-1.5 text-(length:--fs-14) font-semibold text-(--s-ink-2) hover:text-(--s-ink)"><FiBriefcase className="size-4" aria-hidden />Έργο</Link>}
            {sites && <AssignSite contractId={c.id} sites={sites} locked={locked} />}
          </li>
        );
      })}
    </ul>
  );
}

/** Ο πελάτης διαχειρίζεται τα στοιχεία του, τις τοποθεσίες του και βλέπει τον τεχνικό φάκελο κάθε εγκατάστασης. */
export default async function CustomerProfilePage() {
  const user = await requireCustomer();
  const p = await customerProfile(user.customerTrdr, user.id);
  const locked = user.viewAs ? 'Σε «Προβολή ως» οι αλλαγές γίνονται μόνο από τον πελάτη.' : null;
  const pendingReq = p.requests.some((r) => r.status === 'PENDING');
  const done = p.sites.reduce((n, s) => n + s.installs.filter((i) => i.status === 'COMPLETED').length, 0) + p.unassigned.filter((i) => i.status === 'COMPLETED').length;
  return (
    <PortalShell user={user} org={p.company.name ?? null} active="profile">
      <Container className="space-y-14 py-14 md:py-20">
        <PageTitle eyebrow="Το προφίλ μου" title={p.company.name ?? 'Τα στοιχεία σας'}>
          Τα στοιχεία σας, οι χώροι όπου δουλεύουμε για εσάς και ο τεχνικός φάκελος κάθε εγκατάστασης — υλικά, φροντίδα και παραδόσεις — σε ένα σημείο.
        </PageTitle>

        <nav aria-label="Ενότητες προφίλ" className="flex flex-wrap gap-2">
          {[['#sites', `Τοποθεσίες · ${p.sites.length}`], ['#dossiers', `Τεχνικοί φάκελοι · ${done}`], ['#contact', 'Στοιχεία επαφής'], ['#company', 'Εταιρικά στοιχεία']].map(([h, l]) => (
            <a key={h} href={h} className="inline-flex min-h-11 items-center rounded-full px-4 text-(length:--fs-14) font-semibold text-(--s-ink) ring-1 ring-(--s-line) hover:ring-(--s-ink)">{l}</a>
          ))}
        </nav>

        <div id="dossiers" className="scroll-mt-40">
          <Section id="sites" n="01" title="Τοποθεσίες & εγκαταστάσεις" hint="Σπίτια, καταστήματα ή εργοτάξια. Διαλέξτε τοποθεσία όταν ζητάτε προσφορά· έτσι ο τεχνικός φάκελος κάθε εγκατάστασης μένει στη σωστή διεύθυνση.">
            {!p.sites.length && (
              <div className="mb-6"><Empty title="Δεν έχετε ακόμη τοποθεσίες" icon={FiMapPin}>Προσθέστε τον πρώτο σας χώρο — θα προτείνεται αυτόματα στα νέα αιτήματα προσφοράς.</Empty></div>
            )}
            <SitesManager locked={locked}
              sites={p.sites.map((s) => ({ id: s.id, label: s.label, address: s.address, zip: s.zip, district: s.district, city: s.city, floor: s.floor, notes: s.notes, isDefault: s.isDefault, line: s.line, installs: s.installs.length }))}>
              {Object.fromEntries(p.sites.map((s) => [s.id, <Installs key={s.id} rows={s.installs} locked={!!locked} />]))}
            </SitesManager>
            {p.unassigned.length > 0 && (
              <div className="mt-10">
                <h3 className="text-(length:--fs-17) font-semibold text-(--s-ink)">Χωρίς τοποθεσία</h3>
                <p className="mb-4 mt-1 text-(length:--fs-15) text-(--s-ink-2)">{p.sites.length ? 'Διαλέξτε σε ποια τοποθεσία ανήκει καθεμία, για να μπει ο φάκελός της στη σωστή θέση.' : 'Προσθέστε μια τοποθεσία και μετά διαλέξτε πού ανήκει καθεμία.'}</p>
                <Installs rows={p.unassigned} sites={p.sites.map((s) => ({ id: s.id, label: s.label }))} locked={!!locked} />
              </div>
            )}
            <Link href="/dashboard/customer/requests" className="s-link mt-8 inline-flex items-center gap-1.5 text-(length:--fs-15) font-semibold text-(--s-accent)">Ζητήστε προσφορά για μια τοποθεσία <FiArrowRight className="size-4" aria-hidden /></Link>
          </Section>
        </div>

        <Section id="contact" n="02" title="Στοιχεία επαφής" hint="Με ποιον μιλάμε και πού σας βρίσκουμε για ραντεβού, παραδόσεις και ερωτήσεις.">
          <ContactForm initial={p.contact} locked={locked} />
        </Section>

        <Section id="company" n="03" title="Εταιρικά στοιχεία" hint="Αυτά τυπώνονται στα τιμολόγια. Τις αλλαγές τις ελέγχουμε εμείς πριν τις περάσουμε.">
          <CompanyForm company={p.company} pending={pendingReq} locked={locked} />
          {p.requests.length > 0 && (
            <div className="mt-10">
              <h3 className="flex items-center gap-2 text-(length:--fs-17) font-semibold text-(--s-ink)"><FiFileText className="size-4" aria-hidden />Τα αιτήματα αλλαγής σας</h3>
              <ul className="mt-3 divide-y divide-(--s-line)">
                {p.requests.map((r) => (
                  <li key={r.id} className="py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="p-meta text-(--s-mute)">{new Date(r.at).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens' })}</span>
                      <span className="p-chip" data-tone={REQ[r.status]?.tone ?? 'todo'}>{REQ[r.status]?.label ?? r.status}</span>
                    </div>
                    <ul className="mt-2 space-y-1 text-(length:--fs-15) text-(--s-ink-2)">
                      {r.changes.map((c) => <li key={c.field}><span className="font-semibold text-(--s-ink)">{c.label}:</span> <span className="line-through decoration-(--s-mute)">{c.from ?? '—'}</span> → {c.to ?? '—'}</li>)}
                    </ul>
                    {r.reply && <p className="mt-2 border-l-2 border-(--s-accent) pl-3 text-(length:--fs-14) text-(--s-ink-2)">{r.reply}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      </Container>
    </PortalShell>
  );
}
