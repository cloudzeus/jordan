import Link from 'next/link';
import { FiBox, FiBriefcase, FiCalendar, FiCreditCard, FiMapPin, FiPhone, FiTool, FiUsers } from 'react-icons/fi';
import type { PartyRef, UserWithRole } from '@/lib/rbac';
import { partnerAppointments, partnerNetwork, partyAssignments, partyName, partyTasks, paymentSummary } from '@/lib/portal-party';
import { portalData } from '@/lib/portal-data';
import { siteCompany } from '@/lib/site-company';
import { PLACE_LABEL } from '@/lib/softone-action';
import { ActionCard, Figure, Label, Pill, SectionHead } from '@/components/site/b2b';
import { DimLine, Grid } from '@/components/site/blueprint';
import { PortalShell } from '../portal-shell';
import { AssignmentCard, dayShort, eur, MilestoneList, ScheduleRuler, todayIso } from './ui';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('el-GR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Athens' }).format(new Date()));
  return h < 12 ? 'Καλημέρα' : h < 18 ? 'Καλησπέρα' : 'Καλό βράδυ';
}

const timeEl = (iso: string) => new Date(iso).toLocaleString('el-GR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' });

/** Λογαριασμός συνεργάτη/συνεργείου που δεν έχει δεθεί ακόμη με καρτέλα — η σελίδα το λέει, δεν «σπάει». */
export async function NotLinked({ user }: { user: NonNullable<UserWithRole> }) {
  const c = await siteCompany();
  return (
    <PortalShell user={user} org={null} active="home">
      <section className="relative overflow-hidden bg-(--s-paper)">
        <Grid />
        <div className="relative mx-auto w-full max-w-[1440px] px-5 py-20 sm:px-8 lg:px-12">
          <p className="s-kicker text-(--s-accent)">Ο λογαριασμός σας</p>
          <h1 className="font-display mt-5 text-(length:--fs-48)">Σχεδόν έτοιμοι.</h1>
          <p className="mt-4 max-w-xl text-(length:--fs-17) text-(--s-ink-2)">Ο λογαριασμός σας δεν έχει συνδεθεί ακόμη με την καρτέλα σας. Επικοινωνήστε μαζί μας στο <a className="s-link text-(--s-ink)" href={`mailto:${c.salesEmail}`}>{c.salesEmail}</a> και θα το ολοκληρώσουμε.</p>
        </div>
      </section>
    </PortalShell>
  );
}

/**
 * Επισκόπηση για όσους εκτελούν — συνεργάτες και συνεργεία:
 * σήμερα και οι επόμενες 2 εβδομάδες (χάρακας), οι αναθέσεις με εργοτάξιο και αμοιβή, τα χρήματα
 * (τι πληρώθηκε / τι οφείλεται / τι έρχεται). Ο συνεργάτης βλέπει επιπλέον ραντεβού, τα έργα και
 * τους πελάτες με τους οποίους είναι συνδεδεμένος, και τα κοινά container.
 */
export async function PartyHome({ user, party }: { user: NonNullable<UserWithRole>; party: PartyRef }) {
  const crew = user.role.key === 'SUPPLIER';
  const [org, assignments, tasks, c, network, appts, offers] = await Promise.all([
    partyName(party),
    partyAssignments(party),
    partyTasks(party),
    siteCompany(),
    party.partnerId ? partnerNetwork(party.partnerId) : Promise.resolve(null),
    party.partnerId ? partnerAppointments(party.partnerId) : Promise.resolve([]),
    crew ? Promise.resolve(null) : portalData(user),
  ]);
  const today = todayIso();
  const pay = paymentSummary(assignments);
  const running = assignments.filter((a) => a.status !== 'COMPLETED');
  const nowTasks = tasks.filter((t) => t.start <= today && t.end >= today && t.phase !== 'DONE');
  const weekEnd = new Date(`${today}T00:00:00Z`); weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const thisWeek = tasks.filter((t) => t.phase !== 'DONE' && t.start <= weekEnd.toISOString().slice(0, 10) && t.end >= today);
  const sites = new Set(thisWeek.map((t) => t.prjc)).size;
  const open = offers?.offers.filter((o) => o.status === 'OPEN') ?? [];
  const next = pay.next[0];
  const first = (user.name ?? '').trim().split(/\s+/)[0];
  const dateLine = new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Athens' }).format(new Date());

  return (
    <PortalShell user={user} org={org} active="home">
      {/* ═══ Σκηνή ═══ */}
      <section className="relative overflow-hidden bg-(--s-paper)">
        <Grid />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_70%_at_20%_30%,rgba(255,255,255,0.95),transparent_70%)]" />
        <div className="relative mx-auto w-full max-w-[1440px] px-5 pb-12 pt-10 sm:px-8 lg:px-12 lg:pb-16 lg:pt-14">
          <p className="s-rise s-kicker text-(--s-accent)">{dateLine}</p>
          <div className="mt-5 grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end">
            <div className="min-w-0">
              <h1 style={{ ['--d' as string]: '0.08s' }} className="s-rise font-display text-(length:--fs-56) lg:text-(length:--fs-72)">{greeting()}{first ? <>, <em>{first}.</em></> : '.'}</h1>
              <p style={{ ['--d' as string]: '0.16s' }} className="s-rise mt-4 max-w-xl text-(length:--fs-18) text-(--s-ink-2)">
                {org ? <><b className="font-medium text-(--s-ink)">{org}</b> · </> : null}
                {thisWeek.length
                  ? `Αυτή την εβδομάδα: ${thisWeek.length === 1 ? 'μία εργασία' : `${thisWeek.length} εργασίες`} σε ${sites === 1 ? 'ένα εργοτάξιο' : `${sites} εργοτάξια`}.`
                  : 'Καμία εργασία αυτή την εβδομάδα — οι νέες αναθέσεις εμφανίζονται εδώ.'}
              </p>
            </div>
            <DimLine label={crew ? 'ΑΝΑΘΕΣΕΙΣ · ΠΡΟΓΡΑΜΜΑ · ΠΛΗΡΩΜΕΣ' : 'ΑΝΑΘΕΣΕΙΣ · ΕΡΓΑ · ΠΡΟΣΦΟΡΕΣ'} className="hidden text-(--s-mute) lg:flex" />
          </div>

          <div style={{ ['--d' as string]: '0.24s' }} className="s-rise mt-12 grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
            <Figure label="Αναθέσεις σε εξέλιξη" value={<span data-count={running.length}>{running.length}</span>} icon={FiBriefcase} href="/dashboard/assignments" hint={`από ${assignments.length} συνολικά`} />
            <Figure label="Εργασίες σήμερα" value={<span data-count={nowTasks.length}>{nowTasks.length}</span>} icon={FiTool} hint={nowTasks[0] ? nowTasks[0].name : 'καμία για σήμερα'} />
            <Figure label="Προς εξόφληση" value={eur(pay.due)} tone={pay.due > 0 ? '#0F766E' : undefined} icon={FiCreditCard} href="/dashboard/payments" hint="παραδόθηκαν, περιμένουν πληρωμή" />
            {crew || !offers
              ? <Figure label="Επόμενη πληρωμή" value={next ? eur(next.amount) : '—'} icon={FiCalendar} href="/dashboard/payments" hint={next ? `${next.title} · ${dayShort(next.dueDate)}` : 'κανένα ορόσημο'} />
              : <Figure label="Ζωντανά container" value={<span data-count={open.length}>{open.length}</span>} tone={open.length ? '#B42318' : undefined} icon={FiBox} href="/dashboard/offers" hint={open.length ? 'η τιμή πέφτει όσο γεμίζουν' : 'κανένα ανοιχτό'} />}
          </div>
        </div>
      </section>

      {/* ═══ Πρόγραμμα ═══ */}
      <section className="mx-auto w-full max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-20" aria-labelledby="schedule">
        <SectionHead id="schedule" label="Πρόγραμμα" title="Οι επόμενες δύο εβδομάδες" />
        <div className="mt-10"><ScheduleRuler tasks={tasks} /></div>
      </section>

      {/* ═══ Αναθέσεις + χρήματα ═══ */}
      <section className="border-t border-(--s-line) bg-white">
        <div className="mx-auto grid w-full max-w-[1440px] gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:px-12 lg:py-20">
          <div className="min-w-0">
            <SectionHead label="Αναθέσεις" title="Τι έχετε αναλάβει" action={{ href: '/dashboard/assignments', text: 'Όλες οι αναθέσεις' }} />
            {assignments.length === 0 ? (
              <p className="mt-8 border border-dashed border-(--s-line) px-6 py-10 text-center text-(length:--fs-15) text-(--s-ink-2)">Δεν υπάρχει ακόμη ανάθεση. Μόλις υπογραφεί σύμβαση που σας αφορά, θα εμφανιστεί εδώ με εργοτάξιο, χρονοδιάγραμμα και αμοιβή.</p>
            ) : (
              <ul className="mt-8 grid gap-5 sm:grid-cols-2" data-reveal data-stagger>
                {(running.length ? running : assignments).slice(0, 4).map((a) => <li key={a.contractId}><AssignmentCard a={a} /></li>)}
              </ul>
            )}
          </div>
          <div className="min-w-0">
            <SectionHead label="Χρήματα" title="Πληρωμές" action={{ href: '/dashboard/payments', text: 'Όλο το ιστορικό' }} />
            <dl className="mt-8 grid grid-cols-3 gap-4 border-y border-(--s-line) py-5">
              <div><dt className="text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">Πληρώθηκαν</dt><dd className="font-num mt-1 text-(length:--fs-24) tabular-nums text-[#2F6B3A]">{eur(pay.paid)}</dd></div>
              <div><dt className="text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">Οφείλονται</dt><dd className="font-num mt-1 text-(length:--fs-24) tabular-nums text-(--s-accent)">{eur(pay.due)}</dd></div>
              <div><dt className="text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">Έρχονται</dt><dd className="font-num mt-1 text-(length:--fs-24) tabular-nums">{eur(pay.upcoming)}</dd></div>
            </dl>
            <div className="mt-6"><MilestoneList items={pay.next.slice(0, 4)} showContract /></div>
          </div>
        </div>
      </section>

      {/* ═══ Συνεργάτης: ραντεβού + δίκτυο ═══ */}
      {network && (
        <section className="border-t border-(--s-line) bg-white">
          <div className="mx-auto grid w-full max-w-[1440px] gap-14 px-5 py-16 sm:px-8 lg:grid-cols-3 lg:px-12 lg:py-20">
            <div className="min-w-0">
              <Label icon={FiCalendar}>Ραντεβού</Label>
              <h2 className="font-site mt-2 text-(length:--fs-24) font-light">Επόμενες συναντήσεις</h2>
              {appts.length === 0 ? <p className="mt-6 text-(length:--fs-14) text-(--s-ink-2)">Κανένα κλεισμένο ραντεβού.</p> : (
                <ul className="mt-6 border-t border-(--s-line)">
                  {appts.map((a) => (
                    <li key={a.id} className="border-b border-(--s-line) py-4">
                      <p className="text-(length:--fs-15) first-letter:uppercase">{timeEl(a.startsAt)}</p>
                      <p className="mt-1 flex items-center gap-2 text-(length:--fs-13) text-(--s-ink-2)"><FiMapPin className="size-3.5 text-(--s-accent)" aria-hidden />{a.place === 'customer' ? a.location ?? PLACE_LABEL.customer : PLACE_LABEL.atelier}</p>
                      <Pill className="mt-2" label={a.status === 'CONFIRMED' ? 'Επιβεβαιωμένο' : 'Αναμένει επιβεβαίωση'} tone={a.status === 'CONFIRMED' ? 'good' : 'warn'} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="min-w-0">
              <Label icon={FiBriefcase}>Έργα</Label>
              <h2 className="font-site mt-2 text-(length:--fs-24) font-light">Έργα όπου συμμετέχετε</h2>
              {network.projects.length === 0 ? <p className="mt-6 text-(length:--fs-14) text-(--s-ink-2)">Δεν σας έχει συνδεθεί ακόμη έργο.</p> : (
                <ul className="mt-6 border-t border-(--s-line)">
                  {network.projects.slice(0, 6).map((p) => (
                    <li key={p.prjc} className="flex items-baseline justify-between gap-3 border-b border-(--s-line) py-3">
                      <span className="min-w-0"><span className="block truncate text-(length:--fs-15)">{p.name}</span><span className="block text-(length:--fs-12) text-(--s-mute)">{p.code}{p.role ? ` · ${p.role}` : ''}</span></span>
                      <Pill label={p.active ? 'Ενεργό' : 'Κλειστό'} tone={p.active ? 'active' : 'neutral'} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="min-w-0">
              <Label icon={FiUsers}>Πελάτες</Label>
              <h2 className="font-site mt-2 text-(length:--fs-24) font-light">Πελάτες που συστήσατε</h2>
              {network.customers.length === 0 ? <p className="mt-6 text-(length:--fs-14) text-(--s-ink-2)">Κανένας πελάτης συνδεδεμένος μαζί σας.</p> : (
                <ul className="mt-6 border-t border-(--s-line)">
                  {network.customers.slice(0, 8).map((x) => (
                    <li key={x.trdr} className="flex items-baseline justify-between gap-3 border-b border-(--s-line) py-3">
                      <span className="truncate text-(length:--fs-15)">{x.name}</span>
                      {x.city && <span className="shrink-0 text-(length:--fs-12) text-(--s-mute)">{x.city}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ═══ Συντομεύσεις ═══ */}
      <section className="relative overflow-hidden bg-(--s-paper)">
        <Grid />
        <div className="relative mx-auto w-full max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
          <Label>Συντομεύσεις</Label>
          <h2 className="font-display mt-3 text-(length:--fs-40)">Τι θέλετε να κάνετε;</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3" data-reveal data-stagger>
            <ActionCard emphasis href="/dashboard/assignments" icon={FiBriefcase} title="Οι αναθέσεις μου" text="Εργοτάξιο, γραμμές εργασίας, σχέδια και η σύμβασή σας." />
            <ActionCard href="/dashboard/payments" icon={FiCreditCard} title="Πληρωμές" text="Τι πληρώθηκε, τι εκκρεμεί και πότε." />
            {crew
              ? <ActionCard href={`tel:${c.phones[0].replace(/\s/g, '')}`} icon={FiPhone} title="Επικοινωνία με το γραφείο" text={`${c.phones[0]} · ${c.hours}`} />
              : <ActionCard href="/dashboard/offers" icon={FiBox} title="Κοινά container" text="Κλείστε παλέτες — η τιμή πέφτει για όλους." />}
          </div>
          <p className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-(length:--fs-14) text-(--s-ink-2)">
            <span>Κάτι δεν ταιριάζει στο πρόγραμμα;</span>
            <a href={`tel:${c.phones[0].replace(/\s/g, '')}`} className="s-link tabular-nums text-(--s-ink)">{c.phones[0]}</a>
            <Link href={`mailto:${c.salesEmail}`} className="s-link text-(--s-ink)">{c.salesEmail}</Link>
          </p>
        </div>
      </section>
    </PortalShell>
  );
}
