// «Με μια ματιά» στην αρχική του πελάτη: τι χρειάζεται από εσάς, πώς πάει κάθε έργο (δακτύλιος προόδου,
// ειλικρινής κατάσταση, τώρα / επόμενο, χρονογραμμή με «σήμερα»), πού βρίσκονται οι πληρωμές (μπάρα σε
// τμήματα με υπόμνημα) και χρήσιμα εργαλεία. Κάθε γράφημα έχει και τα νούμερα σε κείμενο. Ύφος website.
import Link from 'next/link';
import { FiAlertTriangle, FiArrowRight, FiCalendar, FiCheckCircle, FiClock, FiCreditCard, FiFileText, FiMail, FiMessageCircle, FiPhone, FiPlus } from 'react-icons/fi';
import type { CustomerGlance } from '@/lib/portal-glance';
import type { Pulse } from '@/lib/portal-glance-core';
import { siteCompany } from '@/lib/site-company';
import { CopyIban } from './glance-tools';

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const dm = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayN = (d: string) => Date.parse(`${d}T00:00:00Z`) / 864e5;
const INK = '#1C3241', ACCENT = '#7A5C43', GOOD = '#15803D', WARN = '#B45309', LINE = '#E4DED5';

function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    // Τα μεγέθη κειμένου είναι μονάδες του viewBox: κλιμακώνονται μαζί με το svg (size-32 = 8rem), άρα σε rem.
    <svg viewBox="0 0 128 128" className="size-32 shrink-0" role="img" aria-label={label}>
      <circle cx="64" cy="64" r={r} fill="none" stroke={LINE} strokeWidth="10" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={INK} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 64 64)" />
      <text x="64" y="62" textAnchor="middle" className="font-num" fontSize="28" fill={INK}>{pct}%</text>
      <text x="64" y="82" textAnchor="middle" fontSize="11" fill="#6B7378">ολοκλήρωση</text>
    </svg>
  );
}

const STATE = {
  ON_TRACK: { icon: FiCheckCircle, color: GOOD, text: () => 'Το έργο προχωρά κανονικά' },
  DELAYED: { icon: FiAlertTriangle, color: WARN, text: (p: Pulse) => `Καθυστέρηση ${p.delayDays} ${p.delayDays === 1 ? 'ημέρας' : 'ημερών'} — θα σας ενημερώσουμε για το νέο πρόγραμμα` },
  NOT_STARTED: { icon: FiClock, color: INK, text: (p: Pulse) => (p.from ? `Ξεκινάμε στις ${dm(p.from)}` : 'Το πρόγραμμα οριστικοποιείται') },
  DONE: { icon: FiCheckCircle, color: GOOD, text: () => 'Το έργο ολοκληρώθηκε' },
};

function Timeline({ p, today }: { p: Pulse; today: string }) {
  if (!p.from || !p.to) return null;
  const span = Math.max(1, dayN(p.to) - dayN(p.from));
  const at = Math.min(100, Math.max(0, ((dayN(today) - dayN(p.from)) / span) * 100));
  return (
    <div className="mt-5">
      <div className="relative h-2 bg-(--s-paper)" aria-hidden>
        <div className="absolute inset-y-0 left-0" style={{ width: `${p.progress}%`, background: INK }} />
        <div className="absolute -top-1.5 h-5 w-0.5" style={{ left: `${at}%`, background: ACCENT }} />
      </div>
      <p className="mt-1.5 flex justify-between text-(length:--fs-12) tabular-nums text-(--s-mute)">
        <span>{dm(p.from)}</span><span style={{ color: ACCENT }}>σήμερα</span><span>παράδοση {dm(p.to)}</span>
      </p>
    </div>
  );
}

function PayBar({ g }: { g: CustomerGlance['pay'] }) {
  const pct = (n: number) => (g.total ? (n / g.total) * 100 : 0);
  const parts = [
    { k: 'Εξοφλήθηκαν', v: g.paid, color: INK, style: {} },
    { k: 'Προς πληρωμή', v: g.due, color: ACCENT, style: { backgroundImage: `repeating-linear-gradient(135deg, ${ACCENT} 0 6px, #9A7A5F 6px 9px)` } },
    { k: 'Επόμενες', v: g.upcoming, color: LINE, style: {} },
  ];
  return (
    <div>
      <div className="flex h-3 overflow-hidden" role="img" aria-label={`Πληρωμές: ${parts.map((p) => `${p.k} ${eur(p.v)}`).join(', ')}`}>
        {parts.filter((p) => p.v > 0).map((p) => <div key={p.k} style={{ width: `${pct(p.v)}%`, background: p.color, ...p.style }} />)}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-(length:--fs-13)">
        {parts.map((p) => (
          <div key={p.k}>
            <dt className="flex items-center gap-1.5 text-(--s-mute)"><span aria-hidden className="inline-block size-2.5" style={{ background: p.color, ...p.style }} />{p.k}</dt>
            <dd className="font-num mt-0.5 text-(length:--fs-16) tabular-nums text-(--s-ink)">{eur(p.v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const ACTION_ICON = { OFFER: FiFileText, PAYMENT: FiCreditCard, REPLY: FiMessageCircle };

export async function CustomerGlanceSection({ g }: { g: CustomerGlance }) {
  const company = await siteCompany();
  const phone = company.phones[0];
  return (
    <section className="border-t border-(--s-line) bg-white" aria-labelledby="glance">
      <div className="mx-auto w-full max-w-[90rem] px-5 py-14 sm:px-8 lg:px-12 lg:py-16">
        <p className="text-(length:--fs-12) uppercase tracking-[0.22em] text-(--s-mute)">Με μια ματιά</p>
        <h2 id="glance" className="font-site mt-2 text-(length:--fs-32) font-light leading-tight">Πού βρισκόμαστε</h2>

        {/* ── Τι χρειάζεται από εσάς ── */}
        <div className="mt-8">
          {g.actions.length === 0 ? (
            <p className="flex items-center gap-3 border-l-2 px-5 py-4 text-(length:--fs-15) text-(--s-ink-2)" style={{ borderColor: GOOD, background: '#15803D0d' }}>
              <FiCheckCircle className="size-5 shrink-0" style={{ color: GOOD }} aria-hidden />
              Δεν χρειάζεται κάτι από εσάς αυτή τη στιγμή.{g.preparing ? ` Ετοιμάζουμε ${g.preparing === 1 ? 'την προσφορά που ζητήσατε' : `${g.preparing} προσφορές που ζητήσατε`}.` : ''}
            </p>
          ) : (
            <>
              <h3 className="text-(length:--fs-14) font-medium text-(--s-ink)">Χρειάζεται η απάντησή σας ({g.actions.length})</h3>
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {g.actions.map((a, i) => {
                  const Icon = ACTION_ICON[a.kind];
                  return (
                    <li key={`${a.kind}-${i}`}>
                      <Link href={a.href} className={`group flex h-full items-start gap-4 border p-4 transition-[border-color,box-shadow] hover:shadow-[0_18px_50px_-30px_rgba(28,50,65,0.45)] ${i === 0 ? 'border-(--s-ink)' : 'border-(--s-line) hover:border-(--s-ink)'}`}>
                        <span className="inline-flex size-10 shrink-0 items-center justify-center" style={{ background: `${a.kind === 'PAYMENT' ? ACCENT : INK}14`, color: a.kind === 'PAYMENT' ? ACCENT : INK }}><Icon className="size-5" aria-hidden /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-(length:--fs-15) text-(--s-ink)">{a.title}</span>
                          <span className="mt-0.5 block text-(length:--fs-13) text-(--s-ink-2)">{a.detail}</span>
                        </span>
                        <FiArrowRight className="mt-1 size-4 shrink-0 text-(--s-mute) transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* ── Έργα ── */}
          <div className="space-y-6">
            {g.projects.length === 0 ? (
              <div className="border border-(--s-line) p-6 text-(length:--fs-15) text-(--s-ink-2)">Όταν αποδεχτείτε μια προσφορά, εδώ θα βλέπετε την πρόοδο του έργου σας μέρα με τη μέρα.</div>
            ) : g.projects.map((p) => {
              const s = STATE[p.pulse.state];
              return (
                <article key={p.prjc} className="border border-(--s-line) p-6" aria-labelledby={`gp-${p.prjc}`}>
                  <p className="text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">Έργο {p.code}</p>
                  <h3 id={`gp-${p.prjc}`} className="font-site mt-1 text-(length:--fs-22) font-light leading-snug">{p.name}</h3>
                  <div className="mt-5 flex flex-wrap items-center gap-6">
                    <Ring pct={p.pulse.progress} label={`Ολοκλήρωση ${p.pulse.progress}%`} />
                    <div className="min-w-0 flex-1 space-y-3">
                      <p className="flex items-start gap-2 text-(length:--fs-16)" style={{ color: s.color }}><s.icon className="mt-0.5 size-5 shrink-0" aria-hidden /><span>{s.text(p.pulse)}</span></p>
                      {p.pulse.now.length > 0 && <p className="text-(length:--fs-14) text-(--s-ink-2)"><span className="text-(--s-mute)">Τώρα: </span>{p.pulse.now.map((t) => t.name).join(' · ')}</p>}
                      {p.pulse.next && <p className="text-(length:--fs-14) text-(--s-ink-2)"><span className="text-(--s-mute)">Επόμενο: </span>{p.pulse.next.name} <span className="tabular-nums">· από {dm(p.pulse.next.start)}</span></p>}
                    </div>
                  </div>
                  <Timeline p={p.pulse} today={g.today} />
                  <Link href={`/dashboard/customer/projects/${p.prjc}`} className="s-link mt-5 inline-flex min-h-11 items-center gap-1.5 text-(length:--fs-14) text-(--s-ink)">Όλες οι εργασίες του έργου <FiArrowRight className="size-4" aria-hidden /></Link>
                </article>
              );
            })}
          </div>

          {/* ── Πληρωμές & εργαλεία ── */}
          <div className="space-y-6">
            <article className="border border-(--s-line) p-6" aria-labelledby="gpay">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id="gpay" className="font-site text-(length:--fs-22) font-light">Πληρωμές</h3>
                {g.pay.total > 0 && <span className="text-(length:--fs-13) tabular-nums text-(--s-mute)">{g.pay.paidPct}% εξοφλημένο</span>}
              </div>
              {g.pay.total === 0 ? (
                <p className="mt-3 text-(length:--fs-14) text-(--s-ink-2)">Δεν υπάρχουν πληρωμές ακόμη.</p>
              ) : (
                <>
                  <div className="mt-4"><PayBar g={g.pay} /></div>
                  {g.nextPayment && (
                    <p className="mt-5 border-l-2 border-(--s-accent) bg-(--s-paper) px-4 py-3 text-(length:--fs-14) text-(--s-ink-2)">
                      <span className="block text-(--s-ink)">{g.nextPayment.status === 'DONE' ? 'Προς πληρωμή τώρα' : 'Επόμενη δόση'}: {g.nextPayment.title}</span>
                      <span className="font-num tabular-nums">{eur(g.nextPayment.amount)}</span>{g.nextPayment.dueDate ? ` · έως ${dm(g.nextPayment.dueDate)}` : ''}
                    </p>
                  )}
                  {g.bank.length > 0 && (
                    <div className="mt-4">
                      <p className="text-(length:--fs-13) text-(--s-mute)">Στοιχεία κατάθεσης — αιτιολογία: ο αριθμός της σύμβασης</p>
                      <div className="mt-1">{g.bank.map((b) => <CopyIban key={b.iban} bank={b.bank} iban={b.iban} />)}</div>
                    </div>
                  )}
                  <Link href="/dashboard/customer/payments" className="s-link mt-4 inline-flex min-h-11 items-center gap-1.5 text-(length:--fs-14) text-(--s-ink)">Όλες οι πληρωμές <FiArrowRight className="size-4" aria-hidden /></Link>
                </>
              )}
            </article>

            <nav aria-label="Χρήσιμα" className="grid grid-cols-2 gap-3">
              {[
                { href: '/api/portal/calendar', icon: FiCalendar, label: 'Στο ημερολόγιό μου', hint: 'εργασίες & δόσεις', download: true },
                { href: '/dashboard/customer/requests', icon: FiPlus, label: 'Ζητήστε προσφορά', hint: 'για νέα δουλειά' },
                ...(phone ? [{ href: `tel:${phone.replace(/\s/g, '')}`, icon: FiPhone, label: 'Καλέστε μας', hint: phone }] : []),
                { href: `mailto:${company.salesEmail}`, icon: FiMail, label: 'Γράψτε μας', hint: company.salesEmail },
              ].map((u) => (
                <a key={u.label} href={u.href} {...('download' in u && u.download ? { download: 'atelier-erga.ics' } : {})}
                  className="group flex min-h-16 items-start gap-3 border border-(--s-line) p-3.5 transition-colors hover:border-(--s-ink)">
                  <u.icon className="mt-0.5 size-5 shrink-0 text-(--s-accent)" aria-hidden />
                  <span className="min-w-0"><span className="block text-(length:--fs-14) text-(--s-ink)">{u.label}</span><span className="block truncate text-(length:--fs-12) text-(--s-mute)">{u.hint}</span></span>
                </a>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </section>
  );
}
