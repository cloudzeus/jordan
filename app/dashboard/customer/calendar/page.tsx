import Link from 'next/link';
import type { Metadata } from 'next';
import { FiCalendar, FiChevronLeft, FiChevronRight, FiDownload, FiList } from 'react-icons/fi';
import { requireCustomer } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { customerCalendar } from '@/lib/portal-calendar';
import { addDays, agenda, layoutWeek, monthWeeks, shiftMonth, weekStart, type CalEvent } from '@/lib/portal-calendar-core';
import { Container } from '@/components/site/ui';
import { cn } from '@/lib/utils';
import { PortalShell } from '../../portal-shell';
import { PageTitle } from '../_ui/bits';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ημερολόγιο' };

type View = 'month' | 'week' | 'list';
const DOW = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σάβ', 'Κυρ'];
const MAX_LANES = 3;
const LEGEND: { tone: CalEvent['tone']; label: string }[] = [
  { tone: 'todo', label: 'Προγραμματισμένη εργασία' }, { tone: 'progress', label: 'Σε εξέλιξη / δόση' }, { tone: 'review', label: 'Θέλει εσάς (έλεγχος, πληρωμή)' },
  { tone: 'done', label: 'Ολοκληρώθηκε' }, { tone: 'danger', label: 'Λήξη προσφοράς' },
];
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const dayLong = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const dayShort = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const toneStyle = (t: CalEvent["tone"]) => ({ background: `color-mix(in srgb, var(--s-${t}) 14%, white)`, borderColor: `var(--s-${t})` });

function href(v: View, m: string, d?: string) { return `?v=${v}&m=${m}${d ? `&d=${d}` : ''}`; }

function EventCard({ e, compact = false }: { e: CalEvent; compact?: boolean }) {
  const body = (
    <>
      <span className="block truncate text-(length:--fs-14) font-semibold text-(--s-ink)">{e.title}</span>
      {!compact && e.sub && <span className="block truncate text-(length:--fs-13) text-(--s-ink-2)">{e.sub}</span>}
      <span className="mt-0.5 block text-(length:--fs-12) font-semibold" style={{ color: `var(--s-${e.tone})` }}>{e.status}{e.start !== e.end ? ` · ${dayShort(e.start)}–${dayShort(e.end)}` : ''}</span>
    </>
  );
  const cls = 'block rounded-md border-l-[3px] px-3 py-2 transition-[filter] hover:brightness-[0.97]';
  return e.href ? <Link href={e.href} className={cls} style={toneStyle(e.tone)}>{body}</Link> : <div className={cls} style={toneStyle(e.tone)}>{body}</div>;
}

/** Μήνας τύπου Outlook: πλέγμα 7 στηλών, πολυήμερες μπάρες σε λωρίδες, «+N ακόμη» όταν δεν χωρούν. */
function MonthGrid({ weeks, events, ym, today }: { weeks: string[][]; events: CalEvent[]; ym: string; today: string }) {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-(--s-line)">
      <div className="grid grid-cols-7 border-b border-(--s-line) bg-(--s-paper)">
        {DOW.map((d, i) => <div key={d} className={cn('px-2 py-2.5 text-(length:--fs-13) font-semibold text-(--s-ink-2)', i >= 5 && 'text-(--s-mute)')}>{d}</div>)}
      </div>
      {weeks.map((days) => {
        const bars = layoutWeek(events, days);
        const hidden = days.map((_, c) => bars.filter((b) => b.lane >= MAX_LANES && b.col <= c && b.col + b.span > c).length);
        return (
          <div key={days[0]} className="relative grid min-h-24 grid-cols-7 border-b border-(--s-line) last:border-b-0 sm:min-h-32" style={{ gridTemplateRows: `auto repeat(${MAX_LANES}, minmax(0, auto)) 1fr` }}>
            {days.map((d, c) => (
              <div key={d} aria-hidden className={cn('col-span-1 border-r border-(--s-line) last:border-r-0', d.slice(0, 7) !== ym && 'bg-(--s-paper)/60', c >= 5 && d.slice(0, 7) === ym && 'bg-(--s-paper)/30')}
                style={{ gridColumn: c + 1, gridRow: `1 / -1` }} />
            ))}
            {days.map((d, c) => (
              <div key={`n-${d}`} className="relative flex items-center justify-between px-1.5 pt-1.5 sm:px-2" style={{ gridColumn: c + 1, gridRow: 1 }}>
                <span className={cn('grid size-7 place-items-center rounded-full text-(length:--fs-13) tabular-nums',
                  d === today ? 'bg-(--s-accent) font-semibold text-white' : d.slice(0, 7) === ym ? 'font-medium text-(--s-ink)' : 'text-(--s-mute)')}>
                  {Number(d.slice(8))}
                </span>
                {hidden[c] > 0 && <Link href={href('week', ym, d)} className="hidden text-(length:--fs-12) font-semibold text-(--s-ink-2) hover:text-(--s-ink) sm:inline">+{hidden[c]}</Link>}
              </div>
            ))}
            {bars.filter((b) => b.lane < MAX_LANES).map((b) => (
              <Link key={`${b.ev.id}-${days[0]}`} href={b.ev.href ?? href('week', ym, days[b.col])} title={`${b.ev.title} — ${b.ev.status}`}
                className={cn('relative mx-0.5 mb-0.5 flex h-2 items-center overflow-hidden border-l-[3px] px-1.5 sm:h-6', b.cutStart ? 'rounded-l-none' : 'rounded-l-md', b.cutEnd ? 'rounded-r-none' : 'rounded-r-md')}
                style={{ ...toneStyle(b.ev.tone), gridColumn: `${b.col + 1} / span ${b.span}`, gridRow: b.lane + 2 }}>
                <span className="sr-only sm:not-sr-only sm:truncate sm:text-(length:--fs-12) sm:font-semibold sm:text-(--s-ink)">{b.cutStart ? '… ' : ''}{b.ev.title}</span>
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Agenda({ groups, today, empty }: { groups: { day: string; items: CalEvent[] }[]; today: string; empty: string }) {
  if (!groups.length) return <p className="rounded-xl bg-(--s-paper) px-6 py-10 text-center text-(length:--fs-15) text-(--s-ink-2)">{empty}</p>;
  return (
    <ol className="divide-y divide-(--s-line) rounded-xl ring-1 ring-(--s-line)">
      {groups.map((g) => (
        <li key={g.day} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6 sm:p-5">
          <p className={cn('text-(length:--fs-15) font-semibold first-letter:uppercase', g.day === today ? 'text-(--s-accent)' : 'text-(--s-ink)')}>
            {dayLong(g.day)}{g.day === today && <span className="ml-2 text-(length:--fs-13)">· Σήμερα</span>}
          </p>
          <ul className="min-w-0 space-y-2">{g.items.map((e) => <li key={e.id}><EventCard e={e} /></li>)}</ul>
        </li>
      ))}
    </ol>
  );
}

/** Ημερολόγιο πελάτη: εργασίες των έργων, δόσεις και λήξεις προσφορών — μήνας, εβδομάδα ή λίστα. */
export default async function CustomerCalendarPage({ searchParams }: { searchParams: Promise<{ v?: string; m?: string; d?: string }> }) {
  const user = await requireCustomer();
  const sp = await searchParams;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
  const view: View = sp.v === 'week' || sp.v === 'list' ? sp.v : 'month';
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  const wk = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? '') ? sp.d! : ym === today.slice(0, 7) ? today : `${ym}-01`);
  const [events, org] = await Promise.all([
    customerCalendar(user.customerTrdr),
    prisma.softoneTrader.findUnique({ where: { trdr: user.customerTrdr }, select: { name: true } }),
  ]);
  const weeks = monthWeeks(ym);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  const prev = view === 'week' ? href('week', addDays(wk, -7).slice(0, 7), addDays(wk, -7)) : href(view, shiftMonth(ym, -1));
  const next = view === 'week' ? href('week', addDays(wk, 7).slice(0, 7), addDays(wk, 7)) : href(view, shiftMonth(ym, 1));
  const title = view === 'week' ? `${dayShort(weekDays[0])} – ${dayShort(weekDays[6])} ${weekDays[6].slice(0, 4)}` : monthName(ym);
  const monthAgenda = agenda(events, `${ym}-01`, addDays(`${shiftMonth(ym, 1)}-01`, -1));
  const upcoming = events.filter((e) => e.end >= today && e.tone !== 'done').sort((a, b) => (a.start < b.start ? -1 : 1));

  return (
    <PortalShell user={user} org={org?.name ?? null} active="calendar">
      <Container className="space-y-10 py-14 md:py-20">
        <PageTitle eyebrow="Ημερολόγιο" title="Πότε γίνεται τι">
          Οι εργασίες στα έργα σας, οι δόσεις και οι προθεσμίες, με τα χρώματα των φάσεων. Πατήστε ένα γεγονός για λεπτομέρειες.
          {upcoming[0] && <> Επόμενο: <span className="font-semibold text-(--s-ink)">{upcoming[0].title}</span>, {dayLong(upcoming[0].start < today ? today : upcoming[0].start)}.</>}
        </PageTitle>

        <div className="space-y-5">
          {/* Γραμμή εργαλείων τύπου Outlook */}
          <div className="flex flex-wrap items-center gap-3">
            <Link href={href(view, today.slice(0, 7), view === 'week' ? today : undefined)} className="p-btn p-btn-ghost">Σήμερα</Link>
            <div className="flex items-center">
              <Link href={prev} aria-label="Προηγούμενο" className="grid size-11 place-items-center rounded-lg text-(--s-ink) hover:bg-(--s-paper)"><FiChevronLeft className="size-5" /></Link>
              <Link href={next} aria-label="Επόμενο" className="grid size-11 place-items-center rounded-lg text-(--s-ink) hover:bg-(--s-paper)"><FiChevronRight className="size-5" /></Link>
            </div>
            <h2 className="font-site min-w-0 flex-1 text-(length:--fs-24) font-medium text-(--s-ink) first-letter:uppercase" aria-live="polite">{title}</h2>
            <nav aria-label="Προβολή" className="flex rounded-lg p-1 ring-1 ring-(--s-line)">
              {([['month', 'Μήνας', FiCalendar], ['week', 'Εβδομάδα', FiCalendar], ['list', 'Λίστα', FiList]] as const).map(([k, l, Icon]) => (
                <Link key={k} href={href(k, ym, k === 'week' ? wk : undefined)} aria-current={view === k ? 'page' : undefined}
                  className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-(length:--fs-14) font-semibold transition-colors', view === k ? 'bg-(--s-ink) text-white' : 'text-(--s-ink-2) hover:text-(--s-ink)')}>
                  <Icon className="size-4" aria-hidden />{l}
                </Link>
              ))}
            </nav>
          </div>

          {view === 'month' && (
            <>
              <MonthGrid weeks={weeks} events={events} ym={ym} today={today} />
              <div className="sm:hidden">
                <h3 className="mb-3 text-(length:--fs-17) font-semibold text-(--s-ink)">Μέσα στον μήνα</h3>
                <Agenda groups={monthAgenda} today={today} empty="Τίποτα προγραμματισμένο αυτόν τον μήνα." />
              </div>
            </>
          )}

          {view === 'week' && (
            <ol className="grid gap-3 sm:grid-cols-7 sm:gap-0 sm:overflow-hidden sm:rounded-xl sm:ring-1 sm:ring-(--s-line)">
              {weekDays.map((d) => {
                const items = events.filter((e) => e.start <= d && e.end >= d);
                return (
                  <li key={d} className={cn('min-h-0 rounded-xl ring-1 ring-(--s-line) sm:min-h-64 sm:rounded-none sm:border-r sm:ring-0 sm:last:border-r-0', 'border-(--s-line)', d === today && 'bg-(--s-accent)/[0.04]')}>
                    <p className="flex items-baseline gap-2 border-b border-(--s-line) px-3 py-2.5">
                      <span className="text-(length:--fs-13) font-semibold text-(--s-ink-2)">{DOW[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7]}</span>
                      <span className={cn('text-(length:--fs-20) font-semibold tabular-nums', d === today ? 'text-(--s-accent)' : 'text-(--s-ink)')}>{Number(d.slice(8))}</span>
                    </p>
                    <ul className="space-y-2 p-2">
                      {items.length ? items.map((e) => <li key={e.id}><EventCard e={e} compact /></li>) : <li className="px-1 py-2 text-(length:--fs-13) text-(--s-mute) sm:hidden">—</li>}
                    </ul>
                  </li>
                );
              })}
            </ol>
          )}

          {view === 'list' && <Agenda groups={monthAgenda} today={today} empty="Τίποτα προγραμματισμένο αυτόν τον μήνα. Δείτε τον επόμενο με το βέλος δεξιά." />}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-(--s-line) pt-5">
            <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Υπόμνημα χρωμάτων">
              {LEGEND.map((l) => (
                <li key={l.tone} className="inline-flex items-center gap-2 text-(length:--fs-13) text-(--s-ink-2)">
                  <span aria-hidden className="h-3.5 w-5 rounded-r-sm border-l-[3px]" style={toneStyle(l.tone)} />{l.label}
                </li>
              ))}
            </ul>
            <a href="/api/portal/calendar" className="p-btn p-btn-ghost"><FiDownload className="size-4" aria-hidden />Στο Outlook / Google</a>
          </div>
        </div>
      </Container>
    </PortalShell>
  );
}
