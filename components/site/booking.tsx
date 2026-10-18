'use client';

import * as React from 'react';
import Link from 'next/link';
import { FiArrowLeft, FiArrowRight, FiCalendar, FiCheck, FiChevronLeft, FiChevronRight, FiClock } from 'react-icons/fi';
import { btn, Field, inputCls, Notice } from '@/components/site/ui';
import { formatSlotEl, TOPICS, WEEKDAYS_SHORT_EL } from '@/lib/appointments-core';
import { cn } from '@/lib/utils';

type DaySlots = { date: string; weekday: number; open: boolean; slots: { start: string; end: string; time: string }[] };
type SlotsResponse = { today: string; lastDay: string; slotMinutes: number; days: DaySlots[]; hasMore: boolean };
type Done = { code: string; when: string; status: string };

const PROFESSIONS = ['Αρχιτέκτονας / αρχιτεκτονικό γραφείο', 'Τεχνικό γραφείο / μηχανικός', 'Κατασκευαστική εταιρεία', 'Εργολάβος / συνεργείο', 'Διακοσμητής', 'Άλλο'];
const SPAN = 14;
const dayFmt = new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/**
 * «Κλείστε ραντεβού στο atelier»: ο επισκέπτης βλέπει ΜΟΝΟ τις ελεύθερες ώρες (14 μέρες τη φορά),
 * διαλέγει μία και συμπληρώνει τα στοιχεία του. Η θέση ελέγχεται ξανά στον server τη στιγμή της
 * υποβολής· αν την πήρε άλλος στο μεταξύ, οι ώρες ανανεώνονται και ζητάμε άλλη.
 */
export function BookingForm({ idPrefix = 'bk', onDone, TitleAs = 'h2' }: { idPrefix?: string; onDone?: (d: Done) => void; TitleAs?: React.ElementType }) {
  const [from, setFrom] = React.useState<string | null>(null);
  const [data, setData] = React.useState<SlotsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [day, setDay] = React.useState<string | null>(null);
  const [slot, setSlot] = React.useState<{ start: string; end: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [done, setDone] = React.useState<Done | null>(null);
  const detailsRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async (start: string | null, keepDay = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/appointments/slots?days=${SPAN}${start ? `&from=${start}` : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as SlotsResponse;
      setData(d);
      setFrom(d.days[0]?.date ?? start);
      setDay((cur) => (keepDay && cur && d.days.some((x) => x.date === cur && x.slots.length) ? cur : d.days.find((x) => x.slots.length)?.date ?? null));
    } catch {
      setError('Δεν φορτώθηκαν οι διαθέσιμες ώρες. Δοκιμάστε ξανά ή τηλεφωνήστε μας.');
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(null); }, [load]);

  const current = data?.days.find((d) => d.date === day) ?? null;
  const canPrev = !!data && !!from && from > data.today;
  const canNext = !!data?.hasMore;

  function pick(s: { start: string; end: string }) {
    setSlot(s); setError(null);
    requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slot) return;
    const f = new FormData(e.currentTarget);
    const s = (k: string) => f.get(k)?.toString() ?? '';
    setSending(true); setError(null);
    const res = await fetch('/api/public/appointments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: slot.start, name: s('name'), company: s('company'), email: s('email'), phone: s('phone'), profession: s('profession'),
        topic: s('topic'), message: s('message'), newsletter: f.get('newsletter') === '1', terms: f.get('terms') === '1', website: s('website'),
      }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setSending(false);
    if (res?.ok) { setDone(body as Done); onDone?.(body as Done); return; }
    setError(body.message ?? 'Δεν μπορέσαμε να κλείσουμε το ραντεβού. Δοκιμάστε ξανά ή τηλεφωνήστε μας.');
    if (res?.status === 409) { setSlot(null); void load(from, true); }
  }

  if (done) {
    const confirmed = done.status === 'CONFIRMED';
    return (
      <div className="flex min-h-[24rem] flex-col justify-center" role="status">
        <span className="grid size-14 place-items-center rounded-full bg-[#15803D]/10 text-[#15803D]"><FiCheck className="size-6" aria-hidden /></span>
        <TitleAs className="font-display mt-6 text-[length:var(--fs-40)]">{confirmed ? 'Το ραντεβού κλείστηκε' : 'Λάβαμε το αίτημά σας'}</TitleAs>
        <p className="mt-3 text-[length:var(--fs-18)] text-[var(--s-ink)]">{done.when}</p>
        <p className="mt-1 text-[length:var(--fs-13)] tabular-nums uppercase tracking-[0.18em] text-[var(--s-mute)]">{done.code}</p>
        <p className="mt-5 max-w-md text-[length:var(--fs-15)] text-[var(--s-ink-2)]">
          {confirmed ? 'Σας στείλαμε email με τις λεπτομέρειες. Σας περιμένουμε στο atelier.' : 'Θα σας επιβεβαιώσουμε την ώρα με email — συνήθως την ίδια εργάσιμη. Μέχρι τότε η ώρα κρατιέται για εσάς.'}
        </p>
      </div>
    );
  }

  const dayBtn = (on: boolean, has: boolean) => cn(
    'flex min-h-[4.5rem] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 border px-1 transition-colors disabled:cursor-not-allowed',
    on ? 'border-[var(--s-ink)] bg-[var(--s-ink)] text-white' : has ? 'border-[var(--s-line)] bg-white text-[var(--s-ink)] hover:border-[var(--s-ink)]' : 'border-transparent bg-[var(--s-paper)] text-[#A8A29E]',
  );

  return (
    <div className="space-y-8">
      {error && <Notice tone="error">{error}</Notice>}

      {/* 1 · μέρα & ώρα */}
      <section aria-labelledby={`${idPrefix}-when`}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="s-kicker text-[var(--s-accent)]">01 · Μέρα & ώρα</p>
            <h3 id={`${idPrefix}-when`} className="mt-1 text-[length:var(--fs-16)] font-medium capitalize">{from ? monthFmt.format(new Date(`${from}T00:00:00Z`)) : '…'}</h3>
          </div>
          <div className="flex gap-1">
            <button type="button" className="grid size-11 cursor-pointer place-items-center border border-[var(--s-line)] hover:border-[var(--s-ink)] disabled:cursor-not-allowed disabled:opacity-30" disabled={!canPrev || loading} onClick={() => from && load(addDays(from, -SPAN))} aria-label="Προηγούμενες μέρες"><FiChevronLeft className="size-4" aria-hidden /></button>
            <button type="button" className="grid size-11 cursor-pointer place-items-center border border-[var(--s-line)] hover:border-[var(--s-ink)] disabled:cursor-not-allowed disabled:opacity-30" disabled={!canNext || loading} onClick={() => from && load(addDays(from, SPAN))} aria-label="Επόμενες μέρες"><FiChevronRight className="size-4" aria-hidden /></button>
          </div>
        </div>

        <div className="-mx-1 mt-4 overflow-x-auto px-1 pb-1" data-lenis-prevent>
          <div className={cn('grid min-w-[18rem] grid-cols-7 gap-1 sm:gap-1.5', loading && 'opacity-50')} role="listbox" aria-label="Μέρες">
            {(data?.days ?? Array.from({ length: SPAN }, (_, i) => ({ date: String(i), weekday: 0, open: false, slots: [] }))).map((d) => {
              const has = d.slots.length > 0;
              const on = d.date === day;
              return (
                <button key={d.date} type="button" role="option" aria-selected={on} disabled={!has || loading} className={dayBtn(on, has)} onClick={() => { setDay(d.date); setSlot(null); }}
                  aria-label={data ? `${dayFmt.format(new Date(`${d.date}T12:00:00Z`))} — ${has ? `${d.slots.length} ελεύθερες ώρες` : d.open ? 'πλήρες' : 'κλειστά'}` : undefined}>
                  <span className="text-[length:var(--fs-11)] uppercase tracking-[0.12em] opacity-80">{data ? WEEKDAYS_SHORT_EL[d.weekday] : ''}</span>
                  <span className="font-display text-[length:var(--fs-24)] leading-none tabular-nums">{data ? Number(d.date.slice(8)) : ''}</span>
                  <span className="text-[length:var(--fs-11)] opacity-80">{data ? (has ? <><span className="sm:hidden">{d.slots.length}</span><span className="hidden sm:inline">{d.slots.length} ώρες</span></> : d.open ? 'πλήρες' : '—') : ''}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 min-h-[3rem]" aria-live="polite">
          {loading && !data ? (
            <p className="text-[length:var(--fs-14)] text-[var(--s-mute)]">Φόρτωση διαθέσιμων ωρών…</p>
          ) : !data?.days.some((d) => d.slots.length) ? (
            <Notice tone="info">Δεν υπάρχουν ελεύθερες ώρες σε αυτές τις μέρες.{canNext ? ' Δείτε τις επόμενες με το βέλος.' : ' Τηλεφωνήστε μας για να βρούμε ώρα.'}</Notice>
          ) : current ? (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5" role="listbox" aria-label="Ελεύθερες ώρες">
              {current.slots.map((s) => {
                const on = slot?.start === s.start;
                return (
                  <button key={s.start} type="button" role="option" aria-selected={on} onClick={() => pick(s)}
                    className={cn('inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 border text-[length:var(--fs-15)] tabular-nums transition-colors', on ? 'border-[var(--s-ink)] bg-[var(--s-ink)] text-white' : 'border-[var(--s-line)] hover:border-[var(--s-ink)]')}>
                    {on && <FiCheck className="size-4" aria-hidden />}{s.time}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[length:var(--fs-14)] text-[var(--s-mute)]">Διαλέξτε μέρα.</p>
          )}
        </div>
      </section>

      {/* 2 · στοιχεία */}
      <div ref={detailsRef} className="scroll-mt-6">
        {slot ? (
          <section aria-labelledby={`${idPrefix}-who`} className="border-t border-[var(--s-line)] pt-8">
            <p className="s-kicker text-[var(--s-accent)]">02 · Τα στοιχεία σας</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 bg-[var(--s-paper)] px-4 py-3">
              <p id={`${idPrefix}-who`} className="flex items-center gap-2 text-[length:var(--fs-15)] font-medium"><FiCalendar className="size-4 text-[var(--s-accent)]" aria-hidden />{formatSlotEl(slot.start, slot.end)}</p>
              <button type="button" onClick={() => setSlot(null)} className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-[length:var(--fs-14)] text-[var(--s-ink-2)] hover:text-[var(--s-ink)]"><FiArrowLeft className="size-3.5" aria-hidden />Αλλαγή ώρας</button>
            </div>
            <form onSubmit={submit} className="mt-6 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Ονοματεπώνυμο *" htmlFor={`${idPrefix}-name`}><input id={`${idPrefix}-name`} name="name" required minLength={2} autoComplete="name" className={inputCls} /></Field>
                <Field label="Εταιρεία / γραφείο *" htmlFor={`${idPrefix}-company`}><input id={`${idPrefix}-company`} name="company" required minLength={2} autoComplete="organization" className={inputCls} /></Field>
                <Field label="Email *" htmlFor={`${idPrefix}-email`}><input id={`${idPrefix}-email`} name="email" type="email" required autoComplete="email" inputMode="email" className={inputCls} /></Field>
                <Field label="Τηλέφωνο *" htmlFor={`${idPrefix}-phone`}><input id={`${idPrefix}-phone`} name="phone" type="tel" required autoComplete="tel" inputMode="tel" className={inputCls} /></Field>
                <Field label="Δραστηριότητα" htmlFor={`${idPrefix}-prof`}>
                  <select id={`${idPrefix}-prof`} name="profession" defaultValue="" className={inputCls}>
                    <option value="">— Επιλέξτε —</option>
                    {PROFESSIONS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Θέμα" htmlFor={`${idPrefix}-topic`}>
                  <select id={`${idPrefix}-topic`} name="topic" defaultValue={TOPICS[0]} className={inputCls}>
                    {TOPICS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Πείτε μας για το έργο (προαιρετικά)" htmlFor={`${idPrefix}-msg`}><textarea id={`${idPrefix}-msg`} name="message" rows={3} maxLength={2000} className={cn(inputCls, 'h-auto py-3')} placeholder="π.χ. κατοικία 180 τ.μ., δάπεδα και μπάνια" /></Field>
              <div aria-hidden className="absolute -left-[9999px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
                  <input type="checkbox" name="newsletter" value="1" className="mt-0.5 size-5 shrink-0 accent-[var(--s-ink)]" />
                  <span>Θέλω να λαμβάνω τα νέα του atelier (νέα υλικά, δυναμικές προσφορές). Θα σας στείλουμε email επιβεβαίωσης.</span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
                  <input type="checkbox" name="terms" value="1" required className="mt-0.5 size-5 shrink-0 accent-[var(--s-ink)]" />
                  <span>Συμφωνώ να χρησιμοποιηθούν τα στοιχεία μου για το ραντεβού, σύμφωνα με την <Link href="/legal/privacy" target="_blank" className="s-link text-[var(--s-ink)]">πολιτική απορρήτου</Link>. *</span>
                </label>
              </div>
              <button type="submit" disabled={sending} className={cn(btn.primary, 'w-full')}>
                {sending ? 'Κράτηση…' : <>Κλείστε το ραντεβού <FiArrowRight className="size-4" aria-hidden /></>}
              </button>
            </form>
          </section>
        ) : (
          <p className="flex items-center gap-2 border-t border-[var(--s-line)] pt-6 text-[length:var(--fs-14)] text-[var(--s-mute)]"><FiClock className="size-4" aria-hidden />Διαλέξτε ώρα για να συνεχίσετε με τα στοιχεία σας.</p>
        )}
      </div>
    </div>
  );
}
