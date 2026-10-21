import Link from 'next/link';
import { FiDownload, FiFileText, FiMapPin } from 'react-icons/fi';
import { zonedParts } from '@/lib/appointments-core';
import { MILESTONE_STATUS_LABEL } from '@/lib/contracts/core';
import { phaseMeta, type PhaseKey } from '@/lib/project-tasks-core';
import type { PartyAssignment, PartyMilestone, PartyTask } from '@/lib/portal-party';
import { Pill, type Tone } from '@/components/site/b2b';
import { cn } from '@/lib/utils';

/**
 * Κοινά κομμάτια της πύλης συνεργατών & συνεργείων — ίδια γλώσσα με το website: λεπτές γραμμές,
 * χαρτί με πλέγμα σχεδίου, κότες διάστασης, Noto Serif για τους αριθμούς. Χρώματα μόνο από `--s-*`.
 */

export const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 });
export const qtyEl = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 3 });
const D = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
export const dayShort = (iso: string | null) => (iso ? D(iso).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—');
export const dayLong = (iso: string | null) => (iso ? D(iso).toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '—');
export const todayIso = () => zonedParts(new Date()).date;
const addDays = (iso: string, n: number) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86_400_000);

export const mapsHref = (s: { line: string | null; lat: number | null; lng: number | null }) =>
  s.lat != null && s.lng != null ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}` : s.line ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.line)}` : null;

export const milestoneTone = (s: string): Tone => (s === 'PAID' ? 'good' : s === 'DONE' ? 'warn' : 'neutral');
export const statusTone = (s: string): Tone => (s === 'ACTIVE' ? 'active' : s === 'COMPLETED' ? 'good' : s === 'CANCELLED' ? 'bad' : 'neutral');

/** Χρώματα φάσης εργασίας μέσα στην παλέτα του site (όχι τα έντονα του admin). */
const PHASE_INK: Record<PhaseKey, string> = { TODO: '#A8A29E', IN_PROGRESS: '#1C3241', REVIEW: '#7A5C43', DONE: '#2F6B3A' };

/* ───────────── Πρόγραμμα 14 ημερών: χάρακας σχεδίου ───────────── */

/**
 * Οι εργασίες των επόμενων δύο εβδομάδων πάνω σε «χάρακα»: τικ ανά ημέρα, Σαββατοκύριακα σε χαρτί,
 * το σήμερα με τη γραμμή του accent. Στο κινητό γίνεται ατζέντα ανά ημέρα — ίδια δεδομένα.
 */
export function ScheduleRuler({ tasks, days = 14 }: { tasks: PartyTask[]; days?: number }) {
  const today = todayIso();
  const wd = D(today).getUTCDay();
  const from = addDays(today, -((wd + 6) % 7)); // Δευτέρα της εβδομάδας
  const to = addDays(from, days - 1);
  const cols = Array.from({ length: days }, (_, i) => addDays(from, i));
  const inWindow = tasks.filter((t) => t.end >= from && t.start <= to);
  const todayIdx = diffDays(from, today);

  if (!inWindow.length) {
    return (
      <div className="relative border border-dashed border-(--s-line) px-6 py-12 text-center">
        <p className="font-display text-(length:--fs-28)">Ελεύθερο δεκαπενθήμερο</p>
        <p className="mt-2 text-(length:--fs-14) text-(--s-ink-2)">Καμία εργασία σας από {dayShort(from)} ως {dayShort(to)}. Οι νέες αναθέσεις εμφανίζονται εδώ αυτόματα.</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop / tablet: χάρακας */}
      <div className="hidden md:block" role="table" aria-label={`Πρόγραμμα ${dayShort(from)} – ${dayShort(to)}`}>
        <div role="row" className="grid grid-cols-[minmax(180px,240px)_1fr] border-b border-(--s-ink)">
          <div role="columnheader" className="pb-2 text-(length:--fs-12) uppercase tracking-[0.18em] text-(--s-mute)">Εργασία</div>
          <div role="columnheader" className="grid" style={{ gridTemplateColumns: `repeat(${days}, minmax(0,1fr))` }}>
            {cols.map((c, i) => {
              const d = D(c); const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
              return (
                <div key={c} className={cn('relative pb-2 text-center', weekend && 'text-(--s-mute)')}>
                  <span className="block text-(length:--fs-11) uppercase tracking-[0.12em]">{d.toLocaleDateString('el-GR', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2)}</span>
                  <span className={cn('font-num block text-(length:--fs-18) tabular-nums leading-tight', i === todayIdx && 'text-(--s-accent)')}>{d.getUTCDate()}</span>
                  <span aria-hidden className={cn('absolute bottom-0 left-1/2 w-px -translate-x-1/2 bg-(--s-ink)', i % 7 === 0 ? 'h-3' : 'h-1.5')} />
                </div>
              );
            })}
          </div>
        </div>
        <div>
          {inWindow.map((t) => {
            const a = Math.max(0, diffDays(from, t.start));
            const b = Math.min(days - 1, diffDays(from, t.end));
            const ink = PHASE_INK[t.phase as PhaseKey] ?? '#1C3241';
            return (
              <div role="row" key={t.id} className="relative grid grid-cols-[minmax(180px,240px)_1fr] items-center border-b border-(--s-line) py-3">
                <div role="cell" className="min-w-0 pr-4">
                  <p className="truncate text-(length:--fs-11) uppercase tracking-[0.14em] text-(--s-mute)">{t.projectName}</p>
                  <p className="truncate text-(length:--fs-14) text-(--s-ink)" title={t.name}>{t.name}</p>
                </div>
                <div role="cell" className="relative grid" style={{ gridTemplateColumns: `repeat(${days}, minmax(0,1fr))` }}>
                  <DayBackdrop cols={cols} todayIdx={todayIdx} />
                  <div
                    className="relative mx-0.5 h-7 overflow-hidden border"
                    style={{ gridColumn: `${a + 1} / ${b + 2}`, borderColor: ink, background: t.phase === 'TODO' ? '#fff' : `${ink}14` }}
                    title={`${t.name} · ${dayShort(t.start)} – ${dayShort(t.end)} · ${t.progress}%`}
                  >
                    <span aria-hidden className="absolute inset-y-0 left-0" style={{ width: `${t.progress}%`, background: ink, opacity: t.phase === 'DONE' ? 0.9 : 0.75 }} />
                    <span className="relative flex h-full items-center px-2 text-(length:--fs-11) font-medium tabular-nums" style={{ color: t.progress >= 50 ? '#fff' : ink }}>
                      {t.start < from && '‹ '}{t.progress}%{t.end > to && ' ›'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Legend />
      </div>

      {/* Κινητό: ατζέντα */}
      <ol className="space-y-6 md:hidden">
        {cols.filter((c) => inWindow.some((t) => t.start <= c && t.end >= c) && c >= today).slice(0, 7).map((c) => (
          <li key={c}>
            <p className={cn('text-(length:--fs-12) uppercase tracking-[0.16em]', c === today ? 'text-(--s-accent)' : 'text-(--s-mute)')}>{c === today ? 'Σήμερα · ' : ''}{dayLong(c)}</p>
            <ul className="mt-2 border-t border-(--s-line)">
              {inWindow.filter((t) => t.start <= c && t.end >= c).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 border-b border-(--s-line) py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-(length:--fs-15)">{t.name}</span>
                    <span className="block truncate text-(length:--fs-12) text-(--s-mute)">{t.projectName}</span>
                  </span>
                  <span className="font-num shrink-0 text-(length:--fs-16) tabular-nums" style={{ color: PHASE_INK[t.phase as PhaseKey] }}>{t.progress}%</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Φόντο μιας γραμμής: Σαββατοκύριακα σε χαρτί, λεπτές κάθετες ανά ημέρα, η γραμμή του «σήμερα». */
function DayBackdrop({ cols, todayIdx }: { cols: string[]; todayIdx: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute -inset-y-3 inset-x-0 grid" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
      {cols.map((c, i) => {
        const g = D(c).getUTCDay();
        return <span key={c} className={cn('relative border-r border-(--s-line)/60', (g === 0 || g === 6) && 'bg-(--s-paper)', i === todayIdx && 'after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-(--s-accent)')} />;
      })}
    </div>
  );
}

function Legend() {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-(length:--fs-12) text-(--s-ink-2)">
      {(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as PhaseKey[]).map((k) => (
        <li key={k} className="inline-flex items-center gap-2"><span aria-hidden className="h-2.5 w-5 border" style={{ borderColor: PHASE_INK[k], background: k === 'TODO' ? '#fff' : PHASE_INK[k] }} />{phaseMeta(k).label}</li>
      ))}
      <li className="inline-flex items-center gap-2"><span aria-hidden className="h-3 w-px bg-(--s-accent)" />Σήμερα</li>
    </ul>
  );
}

/* ───────────── Ανάθεση (κάρτα) ───────────── */

export function AssignmentCard({ a }: { a: PartyAssignment }) {
  const paid = a.milestones.filter((m) => m.status === 'PAID').reduce((t, m) => t + m.amount, 0);
  const total = a.milestones.reduce((t, m) => t + m.amount, 0) || a.feeTotal;
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  const href = mapsHref(a.site);
  return (
    <article className="group relative flex h-full flex-col border border-(--s-line) bg-white transition-[border-color,box-shadow] hover:border-(--s-ink) hover:shadow-[0_18px_50px_-30px_rgba(28,50,65,0.45)]">
      <div className="flex items-start justify-between gap-4 p-5 pb-0">
        <div className="min-w-0">
          <p className="font-num text-(length:--fs-13) tabular-nums text-(--s-mute)">{a.ref}</p>
          <h3 className="font-display mt-1 text-(length:--fs-24) leading-tight">
            <Link href={`/dashboard/assignments/${a.contractId}`} className="after:absolute after:inset-0">{a.title}</Link>
          </h3>
        </div>
        <Pill label={a.statusLabel} tone={statusTone(a.status)} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-(length:--fs-13)">
        <div className="col-span-2 min-w-0">
          <dt className="sr-only">Εργοτάξιο</dt>
          <dd className="flex items-start gap-2 text-(--s-ink-2)">
            <FiMapPin className="mt-0.5 size-3.5 shrink-0 text-(--s-accent)" aria-hidden />
            {a.site.line && href ? <a href={href} target="_blank" rel="noreferrer" className="s-link relative z-10 truncate">{a.site.line}</a> : <span>Η διεύθυνση θα οριστεί</span>}
          </dd>
        </div>
        <div><dt className="text-(--s-mute)">Διάρκεια</dt><dd className="mt-0.5 tabular-nums">{dayShort(a.startDate)} – {dayShort(a.endDate)}</dd></div>
        <div><dt className="text-(--s-mute)">Αμοιβή</dt><dd className="font-num mt-0.5 text-(length:--fs-18) tabular-nums">{eur(a.feeTotal)}</dd></div>
      </dl>
      <div className="mt-auto border-t border-(--s-line) px-5 py-4">
        <div className="flex items-baseline justify-between text-(length:--fs-12) text-(--s-ink-2)">
          <span>Εξοφλήθηκε {eur(paid)}</span><span className="tabular-nums">{pct}%</span>
        </div>
        <div className="relative mt-2 h-1 bg-(--s-line)"><span className="absolute inset-y-0 left-0 bg-[#2F6B3A]" style={{ width: `${pct}%` }} /></div>
      </div>
    </article>
  );
}

/* ───────────── Ορόσημα πληρωμής ───────────── */

export function MilestoneList({ items, showContract = false }: { items: (PartyMilestone & { contractTitle?: string; ref?: string; contractId?: string })[]; showContract?: boolean }) {
  if (!items.length) return <p className="border border-dashed border-(--s-line) px-5 py-8 text-center text-(length:--fs-14) text-(--s-ink-2)">Κανένα ορόσημο πληρωμής.</p>;
  return (
    <ol className="border-t border-(--s-line)">
      {items.map((m) => (
        <li key={m.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-1 border-b border-(--s-line) py-4">
          <span className="font-num w-14 text-(length:--fs-13) uppercase leading-tight tabular-nums text-(--s-mute)">{m.dueDate ? dayShort(m.dueDate) : 'χωρίς ημ/νία'}</span>
          <span className="min-w-0">
            <span className="block text-(length:--fs-15)">{m.title}</span>
            {showContract && m.contractTitle && (
              m.contractId ? <Link href={`/dashboard/assignments/${m.contractId}`} className="s-link block truncate text-(length:--fs-12) text-(--s-ink-2)">{m.ref} · {m.contractTitle}</Link>
                : <span className="block truncate text-(length:--fs-12) text-(--s-ink-2)">{m.contractTitle}</span>
            )}
            {m.deliverables && <span className="mt-1 block text-(length:--fs-13) text-(--s-ink-2)">{m.deliverables}</span>}
            <Pill className="mt-2" label={MILESTONE_STATUS_LABEL[m.status] ?? m.status} tone={milestoneTone(m.status)} />
          </span>
          <span className="font-num text-right text-(length:--fs-20) tabular-nums">{eur(m.amount)}</span>
        </li>
      ))}
    </ol>
  );
}

/* ───────────── Έγγραφα ───────────── */

export function DocList({ docs }: { docs: { id: string; title: string; version: number; createdAt: string; hasFile: boolean }[] }) {
  if (!docs.length) return <p className="text-(length:--fs-14) text-(--s-ink-2)">Δεν υπάρχει ακόμη έγγραφο.</p>;
  return (
    <ul className="border-t border-(--s-line)">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-4 border-b border-(--s-line) py-3">
          <span className="flex min-w-0 items-center gap-3">
            <FiFileText className="size-4 shrink-0 text-(--s-accent)" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-(length:--fs-15)">{d.title} <span className="text-(--s-mute)">· έκδοση {d.version}</span></span>
              <span className="block text-(length:--fs-12) text-(--s-mute)">{dayShort(d.createdAt)}</span>
            </span>
          </span>
          {d.hasFile ? (
            <span className="flex shrink-0 items-center gap-4 text-(length:--fs-13)">
              <a href={`/api/portal/contract-docs/${d.id}?inline=1`} target="_blank" rel="noreferrer" className="s-link">Προβολή</a>
              <a href={`/api/portal/contract-docs/${d.id}`} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-(--s-ink)"><FiDownload className="size-3.5" aria-hidden />PDF</a>
            </span>
          ) : <span className="shrink-0 text-(length:--fs-12) text-(--s-mute)">ετοιμάζεται</span>}
        </li>
      ))}
    </ul>
  );
}
