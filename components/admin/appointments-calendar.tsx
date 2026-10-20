'use client';

import * as React from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  addDays, toMinutes, WEEKDAYS_SHORT_EL, zonedParts, type Availability, type Weekly,
} from '@/lib/appointments-core';

export type CalendarEvent = { id: string; start: string; end: string; title: string; subtitle?: string | null; color: string; muted?: boolean };
export type CalendarBlock = { id: string; start: string; end: string; allDay: boolean; reason: string | null };
export type CalendarView = 'day' | 'week' | 'month';

const HOUR_REM = 3.25; // ύψος μίας ώρας στην προβολή εβδομάδας/ημέρας
const monthFmt = new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const weekdayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
/** Δευτέρα της εβδομάδας του `d`. */
export const mondayOf = (d: string) => addDays(d, -((weekdayOf(d) + 6) % 7));
const CLOSED_BG = 'color-mix(in srgb, var(--muted-foreground) 9%, var(--card))';
const HATCH = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--muted-foreground) 14%, transparent) 0 6px, transparent 6px 12px)';

function rangeOf(view: CalendarView, anchor: string) {
  if (view === 'day') return [anchor];
  if (view === 'week') { const m = mondayOf(anchor); return Array.from({ length: 7 }, (_, i) => addDays(m, i)); }
  const first = `${anchor.slice(0, 7)}-01`;
  const start = mondayOf(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function calendarTitle(view: CalendarView, anchor: string) {
  if (view === 'month') return monthFmt.format(new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`));
  if (view === 'day') return dayFmt.format(new Date(`${anchor}T00:00:00Z`));
  const m = mondayOf(anchor);
  return `${shortFmt.format(new Date(`${m}T00:00:00Z`))} – ${shortFmt.format(new Date(`${addDays(m, 6)}T00:00:00Z`))} ${m.slice(0, 4)}`;
}

/** Ποια διαστήματα (σε λεπτά της ημέρας, ώρα Αθήνας) πιάνει ένα instant-διάστημα σε κάθε μέρα. */
function onDay(date: string, startIso: string, endIso: string) {
  const s = zonedParts(new Date(startIso)); const e = zonedParts(new Date(endIso));
  if (e.date < date || s.date > date || (e.date === date && e.minutes === 0 && s.date < date)) return null;
  return { from: s.date < date ? 0 : s.minutes, to: e.date > date ? 1440 : e.minutes };
}

/**
 * Ημερολόγιο ραντεβού (ημέρα / εβδομάδα / μήνας) — ώρα Αθήνας. Σκιάζει τις ώρες λειτουργίας,
 * διαγραμμίζει αποκλεισμούς και ανοίγει το ραντεβού με κλικ. Χωρίς εξωτερική βιβλιοθήκη.
 */
export function AppointmentsCalendar({
  view, anchor, today, events, blocks, availability, onNavigate, onView, onSelectEvent, onSelectDay, onSelectSlot,
}: {
  view: CalendarView; anchor: string; today: string;
  events: CalendarEvent[]; blocks: CalendarBlock[]; availability: Availability;
  onNavigate: (anchor: string) => void; onView: (v: CalendarView) => void;
  onSelectEvent: (id: string) => void; onSelectDay?: (date: string) => void;
  /** Κλικ σε κενό σημείο της ημέρας/εβδομάδας → ώρα στρογγυλεμένη στο τέταρτο. */
  onSelectSlot?: (date: string, time: string) => void;
}) {
  const days = rangeOf(view, anchor);
  const step = view === 'day' ? 1 : view === 'week' ? 7 : 0;
  const go = (dir: -1 | 1) => {
    if (step) return onNavigate(addDays(anchor, dir * step));
    const d = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + dir);
    onNavigate(d.toISOString().slice(0, 10));
  };

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" onClick={() => go(-1)} aria-label="Προηγούμενο"><FiChevronLeft className="size-4" aria-hidden /></Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => go(1)} aria-label="Επόμενο"><FiChevronRight className="size-4" aria-hidden /></Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => onNavigate(today)}>Σήμερα</Button>
          <h2 className="ml-2 text-(length:--fs-14) font-semibold capitalize">{calendarTitle(view, anchor)}</h2>
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Προβολή">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => onView(v)}
              className={cn('h-7 cursor-pointer rounded px-3 text-(length:--fs-12) font-medium', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {v === 'day' ? 'Ημέρα' : v === 'week' ? 'Εβδομάδα' : 'Μήνας'}
            </button>
          ))}
        </div>
      </div>
      {view === 'month'
        ? <MonthGrid days={days} anchor={anchor} today={today} events={events} blocks={blocks} weekly={availability.weekly} onSelectEvent={onSelectEvent} onSelectDay={onSelectDay} />
        : <TimeGrid days={days} today={today} events={events} blocks={blocks} weekly={availability.weekly} onSelectEvent={onSelectEvent} onSelectDay={onSelectDay} onSelectSlot={onSelectSlot} />}
    </div>
  );
}

function TimeGrid({ days, today, events, blocks, weekly, onSelectEvent, onSelectDay, onSelectSlot }: {
  days: string[]; today: string; events: CalendarEvent[]; blocks: CalendarBlock[]; weekly: Weekly;
  onSelectEvent: (id: string) => void; onSelectDay?: (date: string) => void; onSelectSlot?: (date: string, time: string) => void;
}) {
  // Εύρος ωρών: το ωράριο της εβδομάδας (default 09–19), διευρυμένο για ραντεβού εκτός ωραρίου.
  const open = Object.values(weekly).flat();
  let minH = open.length ? Math.floor(Math.min(...open.map((r) => toMinutes(r.from))) / 60) : 9;
  let maxH = open.length ? Math.ceil(Math.max(...open.map((r) => toMinutes(r.to))) / 60) : 19;
  for (const d of days) for (const e of events) {
    const span = onDay(d, e.start, e.end);
    if (span) { minH = Math.min(minH, Math.floor(span.from / 60)); maxH = Math.max(maxH, Math.ceil(span.to / 60)); }
  }
  minH = Math.max(0, minH - 1); maxH = Math.min(24, maxH + 1);
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);
  const top = (m: number) => `${((m - minH * 60) / 60) * HOUR_REM}rem`;
  const height = (a: number, b: number) => `${((b - a) / 60) * HOUR_REM}rem`;
  const nowParts = zonedParts(new Date());

  return (
    <div className="overflow-x-auto">
      <div className={cn('grid', days.length > 1 && 'min-w-184')} style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="sticky top-0 z-10 border-b border-border bg-card" />
        {days.map((d) => (
          <button key={d} type="button" onClick={() => onSelectDay?.(d)} disabled={!onSelectDay}
            className={cn('sticky top-0 z-10 flex cursor-pointer flex-col items-center border-b border-l border-border bg-card py-1.5 disabled:cursor-default', d === today && 'text-primary')}>
            <span className="text-(length:--fs-11) uppercase text-muted-foreground">{WEEKDAYS_SHORT_EL[weekdayOf(d)]}</span>
            <span className={cn('grid size-7 place-items-center rounded-full text-(length:--fs-14) font-semibold tabular-nums', d === today && 'bg-primary text-primary-foreground')}>{Number(d.slice(8))}</span>
          </button>
        ))}

        <div className="relative">
          {hours.map((h) => (
            <div key={h} className="relative border-b border-transparent text-right" style={{ height: `${HOUR_REM}rem` }}>
              <span className="absolute -top-2 right-1.5 text-(length:--fs-11) tabular-nums text-muted-foreground">{h > minH ? `${String(h).padStart(2, '0')}:00` : ''}</span>
            </div>
          ))}
        </div>
        {days.map((d) => {
          const ranges = weekly[String(weekdayOf(d)) as keyof Weekly] ?? [];
          const dayBlocks = blocks.map((b) => ({ b, span: onDay(d, b.start, b.end) })).filter((x) => x.span);
          const dayEvents = events.map((e) => ({ e, span: onDay(d, e.start, e.end) })).filter((x): x is { e: CalendarEvent; span: { from: number; to: number } } => !!x.span)
            .sort((a, b) => a.span.from - b.span.from);
          // Επικαλύψεις: απλές «λωρίδες» ώστε δύο ραντεβού στην ίδια ώρα να φαίνονται δίπλα-δίπλα.
          const lanes: number[] = []; const laneOf = new Map<string, number>();
          for (const { e, span } of dayEvents) {
            let l = lanes.findIndex((end) => end <= span.from);
            if (l < 0) { l = lanes.length; lanes.push(0); }
            lanes[l] = span.to; laneOf.set(e.id, l);
          }
          const laneCount = Math.max(1, lanes.length);
          return (
            <div key={d} className={cn('relative border-l border-border', onSelectSlot && 'cursor-copy')} style={{ height: `${hours.length * HOUR_REM}rem`, background: CLOSED_BG }}
              title={onSelectSlot ? 'Κλικ για νέο ραντεβού' : undefined}
              onClick={onSelectSlot ? (ev) => {
                if (ev.target !== ev.currentTarget && (ev.target as HTMLElement).closest('button')) return;
                const r = ev.currentTarget.getBoundingClientRect();
                const m = minH * 60 + Math.floor((((ev.clientY - r.top) / r.height) * hours.length * 60) / 15) * 15;
                onSelectSlot(d, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
              } : undefined}>
              {hours.map((h) => <div key={h} className="pointer-events-none relative z-1 border-b border-border/60" style={{ height: `${HOUR_REM}rem` }} />)}
              {ranges.map((r) => (
                <div key={r.from} aria-hidden className="absolute inset-x-0 bg-card" style={{ top: top(Math.max(toMinutes(r.from), minH * 60)), height: height(Math.max(toMinutes(r.from), minH * 60), Math.min(toMinutes(r.to), maxH * 60)) }} />
              ))}
              {dayBlocks.map(({ b, span }) => {
                const a = Math.max(span!.from, minH * 60); const z = Math.min(span!.to, maxH * 60);
                if (z <= a) return null;
                return (
                  <div key={b.id} className="absolute inset-x-0 flex items-start justify-center overflow-hidden px-1 pt-1" style={{ top: top(a), height: height(a, z), backgroundImage: HATCH }} title={b.reason ?? 'Κλειστό'}>
                    <span className="truncate rounded bg-background/90 px-1.5 text-(length:--fs-11) text-muted-foreground">{b.reason ?? 'Κλειστό'}</span>
                  </div>
                );
              })}
              {d === nowParts.date && nowParts.minutes >= minH * 60 && nowParts.minutes <= maxH * 60 && (
                <div aria-hidden className="pointer-events-none absolute inset-x-0 z-5 h-px bg-[#DC2626]" style={{ top: top(nowParts.minutes) }}><span className="absolute -left-1 -top-1 size-2 rounded-full bg-[#DC2626]" /></div>
              )}
              {dayEvents.map(({ e, span }) => {
                const lane = laneOf.get(e.id) ?? 0;
                return (
                  <button key={e.id} type="button" onClick={() => onSelectEvent(e.id)}
                    className={cn('absolute z-6 flex cursor-pointer flex-col overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left shadow-2xs transition hover:brightness-95', e.muted && 'opacity-55')}
                    style={{ top: top(span.from), height: `max(1.6rem, ${height(span.from, span.to)})`, left: `calc(${(lane / laneCount) * 100}% + 2px)`, width: `calc(${100 / laneCount}% - 4px)`, borderColor: e.color, background: soft(e.color, 14), color: e.color }}>
                    <span className="truncate text-(length:--fs-12) font-semibold leading-tight">{e.title}</span>
                    {e.subtitle && <span className="truncate text-(length:--fs-11) leading-tight text-foreground/70">{e.subtitle}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({ days, anchor, today, events, blocks, weekly, onSelectEvent, onSelectDay }: {
  days: string[]; anchor: string; today: string; events: CalendarEvent[]; blocks: CalendarBlock[]; weekly: Weekly;
  onSelectEvent: (id: string) => void; onSelectDay?: (date: string) => void;
}) {
  const month = anchor.slice(0, 7);
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border">
        {[1, 2, 3, 4, 5, 6, 0].map((w) => <div key={w} className="py-1.5 text-center text-(length:--fs-11) font-medium uppercase text-muted-foreground">{WEEKDAYS_SHORT_EL[w]}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = d.slice(0, 7) === month;
          const closed = (weekly[String(weekdayOf(d)) as keyof Weekly] ?? []).length === 0;
          const blocked = blocks.find((b) => { const s = onDay(d, b.start, b.end); return s && s.from === 0 && s.to === 1440; });
          const partial = !blocked && blocks.some((b) => onDay(d, b.start, b.end));
          const list = events.filter((e) => zonedParts(new Date(e.start)).date === d).sort((a, b) => a.start.localeCompare(b.start));
          return (
            <div key={d} className={cn('flex min-h-22 flex-col gap-0.5 border-b border-l border-border p-1 first:border-l-0 nth-[7n+1]:border-l-0 sm:min-h-28', !inMonth && 'opacity-60')}
              style={{ ...(closed || !inMonth ? { background: CLOSED_BG } : {}), ...(blocked ? { backgroundImage: HATCH } : {}) }}>
              <button type="button" onClick={() => onSelectDay?.(d)} className="flex cursor-pointer items-center justify-between gap-1 rounded px-0.5 text-left hover:bg-muted" aria-label={`Ημέρα ${d}`}>
                <span className={cn('grid size-6 place-items-center rounded-full text-(length:--fs-12) tabular-nums', !inMonth && 'text-muted-foreground/60', d === today && 'bg-primary font-semibold text-primary-foreground')}>{Number(d.slice(8))}</span>
                {(blocked || partial) && <span className="truncate text-(length:--fs-10) text-muted-foreground">{blocked?.reason ?? (blocked ? 'Κλειστό' : 'μερικώς κλειστό')}</span>}
              </button>
              {list.slice(0, 3).map((e) => (
                <button key={e.id} type="button" onClick={() => onSelectEvent(e.id)}
                  className={cn('flex cursor-pointer items-center gap-1 truncate rounded px-1 py-0.5 text-left text-(length:--fs-11) hover:brightness-95', e.muted && 'opacity-55 line-through')}
                  style={{ background: soft(e.color, 14), color: e.color }}>
                  <span className="tabular-nums font-semibold">{zonedParts(new Date(e.start)).time}</span><span className="hidden truncate text-foreground/80 sm:inline">{e.title}</span>
                </button>
              ))}
              {list.length > 3 && <button type="button" onClick={() => onSelectDay?.(d)} className="cursor-pointer px-1 text-left text-(length:--fs-11) text-muted-foreground hover:text-foreground">+{list.length - 3} ακόμη</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
