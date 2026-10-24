import Link from 'next/link';
import { FiBox, FiCalendar, FiClipboard, FiFileText, FiGrid, FiLayers, FiMapPin, FiPhone, FiPlus, FiRepeat, FiTruck } from 'react-icons/fi';
import { portalData } from '@/lib/portal-data';
import { customerProjects, customerSalesDocs } from '@/lib/portal-erp';
import { customerOrderRequests } from '@/lib/order-requests';
import { customerAppointments, customerContracts } from '@/lib/portal-customer';
import { PLACE_LABEL } from '@/lib/softone-action';
import { siteCompany } from '@/lib/site-company';
import type { CustomerDoc } from '@/lib/portal-erp-core';
import type { UserWithRole } from '@/lib/rbac';
import { ActionCard, Figure, Label, Pill, SectionHead } from '@/components/site/b2b';
import { DimLine, Grid } from '@/components/site/blueprint';
import { PortalShell } from './portal-shell';
import { OfferCard } from './offer-card';
import { customerGlance } from '@/lib/portal-glance';
import { CustomerGlanceSection } from './customer/_ui/glance';

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

function greeting() {
  const h = Number(new Intl.DateTimeFormat('el-GR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Athens' }).format(new Date()));
  return h < 12 ? 'Καλημέρα' : h < 18 ? 'Καλησπέρα' : 'Καλό βράδυ';
}

/** Μια κίνηση σε απλά λόγια — όχι λογιστική ορολογία. */
function sentence(d: CustomerDoc): { icon: typeof FiFileText; text: string } {
  switch (d.kind) {
    case 'order': return { icon: FiClipboard, text: `Παραγγελία ${d.fincode} · ${d.stateLabel?.toLowerCase() ?? ''}` };
    case 'delivery': return { icon: FiTruck, text: `Αποστολή υλικών · ${d.fincode}` };
    case 'invoice': return { icon: FiFileText, text: `Τιμολόγιο ${d.fincode} · ${eur(d.total)}` };
    case 'credit': return { icon: FiRepeat, text: `Πιστωτικό ${d.fincode} · ${eur(d.total)}` };
    case 'quote': return { icon: FiLayers, text: `Νέα προσφορά για εσάς · ${d.fincode}` };
    default: return { icon: FiFileText, text: d.fincode };
  }
}

/** Ποσοστό χρόνου που πέρασε από την έναρξη ως την (προβλεπόμενη) λήξη του έργου. */
function elapsed(from: string | null, to: string | null, done: boolean) {
  if (done) return 100;
  if (!from || !to) return null;
  const a = Date.parse(from), b = Date.parse(to), n = Date.now();
  if (!(b > a)) return null;
  return Math.max(2, Math.min(98, ((n - a) / (b - a)) * 100));
}

/**
 * Επισκόπηση του B2B portal (πελάτης ή συνεργάτης): χαιρετισμός, τα νούμερα που μετράνε, τα ζωντανά
 * container, και — για πελάτες — τα έργα με τη χρονική τους πορεία και οι πρόσφατες κινήσεις σε απλά λόγια.
 */
export async function Portal({ user }: { user: NonNullable<UserWithRole> }) {
  const customer = user.role.key === 'CUSTOMER' && user.customerTrdr != null;
  const trdr = user.customerTrdr ?? 0;
  const [data, c, projects, docs, requests, contracts, appts, glance] = await Promise.all([
    portalData(user),
    siteCompany(),
    customer ? customerProjects(trdr) : Promise.resolve([]),
    customer ? customerSalesDocs(trdr).catch(() => null) : Promise.resolve(null),
    customer ? customerOrderRequests(trdr) : Promise.resolve([]),
    customer ? customerContracts(trdr) : Promise.resolve([]),
    customer ? customerAppointments(trdr) : Promise.resolve([]),
    customer ? customerGlance(trdr) : Promise.resolve(null),
  ]);
  const toAnswer = contracts.filter((k) => k.status === 'SENT');
  const nextPay = contracts
    .flatMap((k) => k.milestones.filter((m) => m.status !== 'PAID').map((m) => ({ ...m, contractId: k.id, contractTitle: k.title })))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))[0];
  const open = data.offers.filter((o) => o.status === 'OPEN');
  const closed = data.offers.filter((o) => o.status === 'CLOSED');
  const activeProjects = projects.filter((p) => p.state === 'active');
  const pendingOrders = (docs ?? []).filter((d) => d.kind === 'order' && d.state !== 'done' && !d.cancelled).length;
  const waiting = requests.filter((r) => r.status === 'SUBMITTED' || r.status === 'IN_REVIEW').length;
  const recent = (docs ?? []).filter((d) => !d.cancelled).slice(0, 7);
  const first = (user.name ?? '').trim().split(/\s+/)[0];
  const today = new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Athens' }).format(new Date());

  return (
    <PortalShell user={user} org={data.org} active="home">
      {/* ═══ Σκηνή: χαιρετισμός + νούμερα ═══ */}
      <section className="relative overflow-hidden bg-(--s-paper)">
        <Grid />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_70%_at_20%_30%,rgba(255,255,255,0.95),transparent_70%)]" />
        <div className="relative mx-auto w-full max-w-[1440px] px-5 pb-12 pt-10 sm:px-8 lg:px-12 lg:pb-16 lg:pt-14">
          <p className="s-rise s-kicker text-(--s-accent)">{today}</p>
          <div className="mt-5 grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end">
            <div className="min-w-0">
              <h1 style={{ ["--d" as string]: "0.08s" }} className="s-rise font-display text-(length:--fs-56) lg:text-(length:--fs-72)">{greeting()}{first ? <>, <em>{first}.</em></> : '.'}</h1>
              <p style={{ ["--d" as string]: "0.16s" }} className="s-rise mt-4 max-w-xl text-(length:--fs-18) text-(--s-ink-2)">
                {data.org ? <><b className="font-medium text-(--s-ink)">{data.org}</b> · </> : null}
                {open.length ? `${open.length === 1 ? 'Ένα κοινό container είναι ανοιχτό' : `${open.length} κοινά container είναι ανοιχτά`} για εσάς αυτή τη στιγμή.` : 'Καμία ανοιχτή δυναμική προσφορά αυτή τη στιγμή — θα σας ειδοποιήσουμε με email.'}
              </p>
            </div>
            <DimLine label={customer ? 'ΠΡΟΣΦΟΡΕΣ · ΕΡΓΑ · ΠΑΡΑΓΓΕΛΙΕΣ' : 'ΠΡΟΣΦΟΡΕΣ · ΚΑΤΑΛΟΓΟΣ'} className="hidden text-(--s-mute) lg:flex" />
          </div>

          <div style={{ ['--d' as string]: '0.24s' }} className={customer ? 's-rise mt-12 grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4' : 's-rise mt-12 grid grid-cols-2 gap-x-8 gap-y-10'}>
            <Figure label="Ζωντανά container" value={<span data-count={open.length}>{open.length}</span>} tone={open.length ? '#B42318' : undefined} icon={FiBox} href="/dashboard/offers" hint={open.length ? 'η τιμή πέφτει όσο γεμίζουν' : 'κανένα ανοιχτό'} />
            {customer ? (
              <>
                <Figure label="Έργα σε εξέλιξη" value={<span data-count={activeProjects.length}>{activeProjects.length}</span>} icon={FiGrid} href="/dashboard/customer/projects" hint={`από ${projects.length} συνολικά`} />
                <Figure label="Παραγγελίες σε εξέλιξη" value={docs ? <span data-count={pendingOrders}>{pendingOrders}</span> : '—'} icon={FiClipboard} href="/dashboard/customer/orders?kind=order" hint={docs ? 'περιμένουν αποστολή' : 'το σύστημα δεν απάντησε'} />
                <Figure label="Προσφορές για εσάς" value={<span data-count={toAnswer.length}>{toAnswer.length}</span>} tone={toAnswer.length ? '#7A5C43' : undefined} icon={FiFileText} href="/dashboard/customer/contracts" hint={toAnswer.length ? 'περιμένουν την απάντησή σας' : `${waiting ? `${waiting} αιτήματα σε αναμονή` : 'καμία εκκρεμότητα'}`} />
              </>
            ) : (
              <Figure label="Δικές σας παλέτες" value={<span data-count={Math.round(data.offers.reduce((a, o) => a + o.mine, 0))}>{Math.round(data.offers.reduce((a, o) => a + o.mine, 0))}</span>} icon={FiLayers} href="/dashboard/offers" hint="σε όλα τα container" />
            )}
          </div>
        </div>
      </section>

      {/* ═══ Πελάτης: με μια ματιά (τι χρειάζεται από εσάς, έργα, πληρωμές, εργαλεία) ═══ */}
      {glance && <CustomerGlanceSection g={glance} />}

      {/* ═══ Ζωντανά container ═══ */}
      <section className="mx-auto w-full max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-20" aria-labelledby="live">
        <SectionHead id="live" label="Δυναμικές προσφορές" title="Ζωντανά τώρα" action={{ href: '/dashboard/offers', text: 'Όλες οι προσφορές' }} />
        {open.length === 0 ? (
          <div className="relative mt-10 border border-dashed border-(--s-line) px-6 py-16 text-center">
            <p className="font-display text-(length:--fs-32)">Κανένα ανοιχτό container</p>
            <p className="mt-2 text-(length:--fs-15) text-(--s-ink-2)">Μόλις ανοίξει νέο κοινό container για εσάς, θα έρθει email — και θα εμφανιστεί εδώ.</p>
          </div>
        ) : (
          <ul className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-reveal data-stagger>
            {open.map((o, i) => <li key={o.id} className={i === 0 && open.length > 2 ? 'md:col-span-2 xl:col-span-2' : undefined}><OfferCard o={o} big={i === 0 && open.length > 2} /></li>)}
          </ul>
        )}
        {closed.length > 0 && <p className="mt-6 text-(length:--fs-14) text-(--s-ink-2)">+ {closed.length} κλεισμένα container στο <Link href="/dashboard/offers" className="s-link text-(--s-ink)">ιστορικό</Link>.</p>}
      </section>

      {customer ? (
        <section className="border-t border-(--s-line) bg-white">
          <div className="mx-auto grid w-full max-w-[1440px] gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:px-12 lg:py-20">
            {/* Έργα με χρονική πορεία */}
            <div className="min-w-0">
              <SectionHead label="Παρακολούθηση" title="Τα έργα σας" action={{ href: '/dashboard/customer/projects', text: 'Όλα τα έργα' }} />
              {projects.length === 0 ? (
                <p className="mt-8 border border-dashed border-(--s-line) px-6 py-10 text-center text-(length:--fs-15) text-(--s-ink-2)">Δεν υπάρχει ακόμη έργο στο όνομά σας.</p>
              ) : (
                <ul className="mt-8 space-y-3" data-reveal data-stagger>
                  {(activeProjects.length ? activeProjects : projects).slice(0, 5).map((p) => {
                    const pct = elapsed(p.fromDate, p.finalDate, p.state === 'completed');
                    return (
                      <li key={p.prjc}>
                        <Link href={`/dashboard/customer/projects/${p.prjc}`} className="group block border border-(--s-line) bg-white p-5 transition-[border-color,box-shadow] hover:border-(--s-ink) hover:shadow-[0_18px_50px_-30px_rgba(28,50,65,0.45)]">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-(length:--fs-12) tabular-nums text-(--s-mute)">{p.code}</p>
                              <p className="font-display mt-1 text-(length:--fs-24) leading-tight">{p.name}</p>
                            </div>
                            <Pill label={p.stateLabel} tone={p.state === 'active' ? 'active' : p.state === 'completed' ? 'good' : 'neutral'} />
                          </div>
                          <div className="mt-5">
                            <div className="relative h-1 bg-(--s-line)">
                              {pct != null && <div className="absolute inset-y-0 left-0 bg-(--s-ink)" style={{ width: `${pct}%` }} />}
                              {pct != null && p.state === 'active' && <span className="absolute -top-1.5 size-4 -translate-x-1/2 rounded-full border-2 border-white bg-(--s-accent) shadow-sm" style={{ left: `${pct}%` }} aria-hidden />}
                            </div>
                            <div className="mt-2 flex justify-between text-(length:--fs-12) text-(--s-ink-2)">
                              <span>Έναρξη {day(p.fromDate) || '—'}</span>
                              <span>{p.closeDate ? `Ολοκληρώθηκε ${day(p.closeDate)}` : p.finalDate ? `Παράδοση ${day(p.finalDate)}` : 'χωρίς ημερομηνία λήξης'}</span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Πρόσφατες κινήσεις σε απλά λόγια */}
            <div className="min-w-0">
              <SectionHead label="Ροή" title="Τι έγινε πρόσφατα" action={{ href: '/dashboard/customer/orders', text: 'Όλες οι κινήσεις' }} />
              {docs == null ? (
                <p className="mt-8 border-l-2 border-(--s-ink) bg-(--s-paper) px-4 py-3 text-(length:--fs-14) text-(--s-ink-2)">Οι κινήσεις δεν είναι διαθέσιμες αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγο.</p>
              ) : recent.length === 0 ? (
                <p className="mt-8 text-(length:--fs-15) text-(--s-ink-2)">Καμία κίνηση ακόμη.</p>
              ) : (
                <ol className="relative mt-8 border-l border-(--s-line) pl-6" data-reveal data-stagger>
                  {recent.map((d) => {
                    const s = sentence(d);
                    return (
                      <li key={d.findoc} className="relative pb-6 last:pb-0">
                        <span className="absolute left-[-37px] grid size-6 place-items-center rounded-full border border-(--s-line) bg-white text-(--s-ink)" aria-hidden><s.icon className="size-3" /></span>
                        <Link href={d.kind === 'payment' ? '/dashboard/customer/orders' : `/dashboard/customer/orders/${d.findoc}`} className="group block">
                          <p className="text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">{day(d.date)}</p>
                          <p className="mt-0.5 text-(length:--fs-15) group-hover:underline group-hover:underline-offset-4">{s.text}</p>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {customer && (contracts.length > 0 || appts.length > 0) ? (
        <section className="border-t border-(--s-line) bg-white">
          <div className="mx-auto grid w-full max-w-[1440px] gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:px-12 lg:py-20">
            {/* Προσφορές & συμβάσεις */}
            <div className="min-w-0">
              <SectionHead label="Συμφωνίες" title="Προσφορές & συμβάσεις" action={{ href: '/dashboard/customer/contracts', text: 'Όλες' }} />
              {contracts.length === 0 ? (
                <p className="mt-8 text-(length:--fs-15) text-(--s-ink-2)">Καμία προσφορά ακόμη.</p>
              ) : (
                <ul className="mt-8 border-t border-(--s-line)" data-reveal data-stagger>
                  {[...toAnswer, ...contracts.filter((k) => k.status !== 'SENT')].slice(0, 4).map((k) => (
                    <li key={k.id} className="border-b border-(--s-line)">
                      <Link href={`/dashboard/customer/contracts/${k.id}`} className="group flex items-center justify-between gap-4 py-4">
                        <span className="min-w-0">
                          <span className="block text-(length:--fs-12) tabular-nums text-(--s-mute)">{k.ref} · {k.stageLabel}</span>
                          <span className="block truncate text-(length:--fs-16) group-hover:underline group-hover:underline-offset-4">{k.title}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-4">
                          <span className="font-num hidden text-(length:--fs-18) tabular-nums sm:inline">{eur(k.total)}</span>
                          <Pill label={k.status === 'SENT' ? 'Περιμένει απάντηση' : k.statusLabel} tone={k.status === 'SENT' ? 'warn' : k.status === 'COMPLETED' ? 'good' : 'active'} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Ραντεβού + επόμενη πληρωμή */}
            <div className="min-w-0 space-y-12">
              <div>
                <Label icon={FiCalendar}>Ραντεβού</Label>
                <h2 className="font-site mt-2 text-(length:--fs-24) font-light">Επόμενες συναντήσεις</h2>
                {appts.length === 0 ? (
                  <p className="mt-6 text-(length:--fs-14) text-(--s-ink-2)">Κανένα κλεισμένο ραντεβού. <a className="s-link text-(--s-ink)" href="/appointment">Κλείστε ραντεβού στο atelier</a>.</p>
                ) : (
                  <ul className="mt-6 border-t border-(--s-line)">
                    {appts.map((a) => (
                      <li key={a.id} className="border-b border-(--s-line) py-4">
                        <p className="text-(length:--fs-15) first-letter:uppercase">{new Date(a.startsAt).toLocaleString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' })}</p>
                        <p className="mt-1 flex items-center gap-2 text-(length:--fs-13) text-(--s-ink-2)"><FiMapPin className="size-3.5 text-(--s-accent)" aria-hidden />{a.place === 'customer' ? a.location ?? PLACE_LABEL.customer : PLACE_LABEL.atelier}{a.topic ? ` · ${a.topic}` : ''}</p>
                        <Pill className="mt-2" label={a.status === 'CONFIRMED' ? 'Επιβεβαιωμένο' : 'Αναμένει επιβεβαίωση'} tone={a.status === 'CONFIRMED' ? 'good' : 'warn'} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {nextPay && (
                <Link href={`/dashboard/customer/contracts/${nextPay.contractId}`} className="group block border-l-2 border-(--s-accent) bg-(--s-paper) px-5 py-4">
                  <Label>Επόμενη δόση</Label>
                  <p className="font-num mt-2 text-(length:--fs-40) leading-none tabular-nums">{eur(nextPay.amount)}</p>
                  <p className="mt-2 text-(length:--fs-14) text-(--s-ink-2)">{nextPay.title}{nextPay.dueDate ? ` · ${day(nextPay.dueDate)}` : ''} — <span className="group-hover:underline group-hover:underline-offset-4">{nextPay.contractTitle}</span></p>
                </Link>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* ═══ Τι θέλετε να κάνετε; ═══ */}
      <section className="relative overflow-hidden bg-(--s-paper)">
        <Grid />
        <div className="relative mx-auto w-full max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
          <Label>Συντομεύσεις</Label>
          <h2 className="font-display mt-3 text-(length:--fs-40)">Τι θέλετε να κάνετε;</h2>
          <div className={customer ? 'mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4' : 'mt-10 grid gap-4 sm:grid-cols-3'} data-reveal data-stagger>
            {customer && <ActionCard emphasis href="/dashboard/customer/orders/new" icon={FiPlus} title="Νέα παραγγελία" text="Υλικά και ποσότητες, σε ένα λεπτό." />}
            <ActionCard href="/dashboard/offers" icon={FiBox} title="Κοινά container" text="Κλείστε παλέτες — η τιμή πέφτει για όλους." />
            {customer && <ActionCard href="/dashboard/customer/projects" icon={FiGrid} title="Τα έργα μου" text="Πορεία, παραδόσεις και τιμολόγια ανά έργο." />}
            {customer && <ActionCard href="/dashboard/customer/contracts" icon={FiFileText} title="Προσφορές & συμβάσεις" text="Γραμμές, πληρωμές και τα PDF σας." />}
            {!customer && <ActionCard href={`mailto:${c.salesEmail}?subject=${encodeURIComponent('Ραντεβού στο atelier')}`} icon={FiPhone} title="Ραντεβού στο atelier" text={c.hours} />}
          </div>
          <p className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-(length:--fs-14) text-(--s-ink-2)">
            <span>Χρειάζεστε βοήθεια;</span>
            <a href={`tel:${c.phones[0].replace(/\s/g, '')}`} className="s-link tabular-nums text-(--s-ink)">{c.phones[0]}</a>
            <a href={`mailto:${c.salesEmail}`} className="s-link text-(--s-ink)">{c.salesEmail}</a>
          </p>
        </div>
      </section>
    </PortalShell>
  );
}
