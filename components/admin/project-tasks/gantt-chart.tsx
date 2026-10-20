'use client';

import * as React from 'react';
import Link from 'next/link';
import { FiAlertTriangle, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { addDays } from '@/lib/appointments-core';
import { isWorkday, phaseMeta, type PhaseKey } from '@/lib/project-tasks-core';
import { cn } from '@/lib/utils';

export type GanttRow = {
  id: string; name: string; start: string; end: string; progress: number; phase: PhaseKey;
  dependsOn?: string[]; conflict?: boolean; sub?: string | null;
  /** Γραμμή-ομάδα (έργο): συνοπτική μπάρα, αναδίπλωση με onToggle. */
  group?: { collapsed: boolean; href?: string; count: number };
  /** Εργασία μέσα σε ομάδα (εσοχή στο όνομα). */
  nested?: boolean;
};

const ROW_H = 40;
const HEAD_H = 44;
const ZOOM = { day: 32, week: 14 } as const;
type Zoom = keyof typeof ZOOM;

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC', ...o });
const fmtRange = (s: string, e: string) => (s === e ? fmt(s, { day: 'numeric', month: 'short' }) : `${fmt(s, { day: 'numeric', month: 'short' })} – ${fmt(e, { day: 'numeric', month: 'short' })}`);

/**
 * Gantt σε CSS/SVG χωρίς βιβλιοθήκη: στήλη ονομάτων (σταθερή) + χρονοδιάγραμμα με οριζόντια κύλιση.
 * Μπάρα = διάρκεια (με γέμισμα = ποσοστό), βέλη = εξαρτήσεις, γραμμή = σήμερα, γκρι = Σαββατοκύριακα.
 * Για αναγνώστες οθόνης κάθε μπάρα έχει πλήρη περιγραφή· ο πίνακας «Λίστα» είναι η εναλλακτική.
 */
export function GanttChart({ rows, today, onSelect, onToggle, showArrows = true, className, label = 'Εργασία' }: {
  rows: GanttRow[]; today: string; onSelect?: (id: string) => void; onToggle?: (id: string) => void; showArrows?: boolean; className?: string; label?: string;
}) {
  const [zoom, setZoom] = React.useState<Zoom>('day');
  const scroller = React.useRef<HTMLDivElement>(null);
  const px = ZOOM[zoom];

  const { from, span } = React.useMemo(() => {
    if (!rows.length) return { from: today, span: 14 };
    let min = rows.reduce((a, r) => (r.start < a ? r.start : a), rows[0].start);
    let max = rows.reduce((a, r) => (r.end > a ? r.end : a), rows[0].end);
    // Το «σήμερα» μέσα στο εύρος όταν απέχει έως 60 ημέρες — για να φαίνεται πού βρισκόμαστε.
    if (today < min && daysBetween(today, min) <= 60) min = today;
    if (today > max && daysBetween(max, today) <= 60) max = today;
    // λίγος αέρας: από τη Δευτέρα πριν, έως 7 ημέρες μετά
    const back = (new Date(`${min}T00:00:00Z`).getUTCDay() + 6) % 7;
    const f = addDays(min, -back);
    return { from: f, span: Math.max(14, daysBetween(f, max) + 8) };
  }, [rows, today]);

  const days = React.useMemo(() => Array.from({ length: span }, (_, i) => addDays(from, i)), [from, span]);
  const index = new Map(rows.map((r, i) => [r.id, i]));
  const xOf = (d: string) => daysBetween(from, d) * px;
  const width = span * px;
  const todayX = today >= from && daysBetween(from, today) < span ? xOf(today) + px / 2 : null;

  // Στο πρώτο άνοιγμα: κύλιση ώστε να φαίνεται το σήμερα (ή η αρχή)
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || todayX == null) return;
    el.scrollLeft = Math.max(0, todayX - el.clientWidth / 3);
  }, [todayX, zoom]);

  // Κεφαλίδα μηνών
  const months: { label: string; x: number; w: number }[] = [];
  days.forEach((d, i) => {
    const key = d.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.label === key) last.w += px;
    else months.push({ label: key, x: i * px, w: px });
  });

  if (!rows.length) {
    return <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-(length:--fs-13) text-muted-foreground">Δεν υπάρχουν εργασίες για διάγραμμα.</p>;
  }

  return (
    <div className={cn('rounded-xl border border-border bg-card', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-(length:--fs-11) text-muted-foreground">
          {(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: phaseMeta(k).color }} aria-hidden />{phaseMeta(k).label}</span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 bg-red-500" aria-hidden />Σήμερα</span>
        </div>
        <div role="group" aria-label="Κλίμακα" className="inline-flex rounded-md border border-border p-0.5">
          {(['day', 'week'] as const).map((z) => (
            <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)}
              className={cn('min-h-8 cursor-pointer rounded px-2.5 text-(length:--fs-11) font-medium transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                zoom === z ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {z === 'day' ? 'Ημέρες' : 'Εβδομάδες'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex">
        {/* Ονόματα — σταθερά αριστερά */}
        <div className="w-36 shrink-0 border-r border-border sm:w-56">
          <div className="flex items-end border-b border-border px-3 pb-1.5 text-(length:--fs-11) font-medium uppercase tracking-wide text-muted-foreground" style={{ height: HEAD_H }}>{label}</div>
          {rows.map((r) => r.group ? (
            <div key={r.id} className="flex items-center gap-1 border-b border-border bg-muted px-1.5" style={{ height: ROW_H }}>
              <button type="button" onClick={() => onToggle?.(r.id)} aria-expanded={!r.group.collapsed} aria-label={`${r.group.collapsed ? 'Ανάπτυξη' : 'Σύμπτυξη'} ${r.name}`}
                className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                {r.group.collapsed ? <FiChevronRight className="size-4" /> : <FiChevronDown className="size-4" />}
              </button>
              <span className="flex min-w-0 flex-col">
                {r.group.href ? <Link href={r.group.href} className="truncate text-(length:--fs-12) font-semibold hover:underline">{r.name}</Link> : <span className="truncate text-(length:--fs-12) font-semibold">{r.name}</span>}
                <span className="truncate text-(length:--fs-10) tabular-nums text-muted-foreground">{r.group.count} εργασίες · {r.progress}%{r.sub ? ` · ${r.sub}` : ''}</span>
              </span>
            </div>
          ) : (
            <div key={r.id} className={cn('flex flex-col justify-center border-b border-border pr-3', r.nested ? 'pl-10' : 'pl-3')} style={{ height: ROW_H }}>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(r.id)} className="cursor-pointer truncate text-left text-(length:--fs-12) font-medium hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">{r.name}</button>
              ) : <span className="truncate text-(length:--fs-12) font-medium">{r.name}</span>}
              <span className="truncate text-(length:--fs-10) tabular-nums text-muted-foreground">{fmtRange(r.start, r.end)}{r.sub ? ` · ${r.sub}` : ''}</span>
            </div>
          ))}
        </div>

        {/* Χρονοδιάγραμμα */}
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width, height: HEAD_H + rows.length * ROW_H }}>
            {/* μήνες + ημέρες */}
            <div className="absolute inset-x-0 top-0 border-b border-border" style={{ height: HEAD_H }}>
              {months.map((m) => (
                <div key={m.label} className="absolute top-0 truncate border-l border-border px-1.5 pt-1 text-(length:--fs-11) font-medium capitalize text-foreground" style={{ left: m.x, width: m.w }}>
                  {m.w >= 48 ? fmt(`${m.label}-01`, { month: 'long', year: 'numeric' }) : ''}
                </div>
              ))}
              {days.map((d, i) => {
                const mon = new Date(`${d}T00:00:00Z`).getUTCDay() === 1;
                const show = zoom === 'day' || mon;
                return show ? (
                  <div key={d} className={cn('absolute bottom-1 text-center text-(length:--fs-10) tabular-nums', d === today ? 'font-semibold text-red-600' : isWorkday(d) ? 'text-muted-foreground' : 'text-muted-foreground opacity-50')}
                    style={{ left: i * px, width: zoom === 'day' ? px : px * 7, textAlign: zoom === 'day' ? 'center' : 'left' }}>
                    {Number(d.slice(8))}
                  </div>
                ) : null;
              })}
            </div>
            {/* Σαββατοκύριακα + γραμμές */}
            {days.map((d, i) => !isWorkday(d) && (
              <div key={d} className="absolute bg-muted" style={{ left: i * px, width: px, top: HEAD_H, bottom: 0 }} aria-hidden />
            ))}
            {rows.map((r, i) => <div key={r.id} className="absolute inset-x-0 border-b border-border" style={{ top: HEAD_H + (i + 1) * ROW_H - 1 }} aria-hidden />)}
            {todayX != null && <div className="absolute w-0.5 bg-red-500/80" style={{ left: todayX, top: HEAD_H - 6, bottom: 0 }} aria-hidden />}

            {/* Εξαρτήσεις: από το τέλος του προαπαιτούμενου στην αρχή του επόμενου */}
            {showArrows && (
              <svg className="pointer-events-none absolute left-0" style={{ top: HEAD_H }} width={width} height={rows.length * ROW_H} aria-hidden>
                <defs>
                  <marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="currentColor" className="text-muted-foreground" /></marker>
                </defs>
                {rows.flatMap((r) => (r.dependsOn ?? []).map((d) => {
                  const pi = index.get(d);
                  if (pi == null) return null;
                  const p = rows[pi];
                  const x1 = xOf(p.end) + px - 2;
                  const y1 = pi * ROW_H + ROW_H / 2;
                  const x2 = xOf(r.start) + 1;
                  const y2 = index.get(r.id)! * ROW_H + ROW_H / 2;
                  const mid = Math.max(x1 + 6, Math.min(x2 - 6, x1 + 10));
                  const path = x2 - 8 > x1 ? `M${x1},${y1} H${mid} V${y2} H${x2}` : `M${x1},${y1} h8 V${(y1 + y2) / 2} H${x2 - 10} V${y2} H${x2}`;
                  return <path key={`${d}-${r.id}`} d={path} fill="none" strokeWidth={1.25} className={cn('stroke-muted-foreground', r.conflict && 'stroke-red-500')} markerEnd="url(#gantt-arrow)" />;
                }))}
              </svg>
            )}

            {/* Μπάρες */}
            {rows.map((r, i) => r.group && (
              <div key={`bg-${r.id}`} className="absolute inset-x-0 bg-muted opacity-60" style={{ top: HEAD_H + i * ROW_H, height: ROW_H - 1 }} aria-hidden />
            ))}
            {rows.map((r, i) => {
              const left = xOf(r.start) + 2;
              const w = Math.max(px - 4, (daysBetween(r.start, r.end) + 1) * px - 4);
              if (r.group) {
                // συνοπτική μπάρα έργου: εύρος όλων των εργασιών, γέμισμα = πρόοδος
                return (
                  <div key={r.id} role="img" aria-label={`${r.name}: ${fmtRange(r.start, r.end)}, ${r.progress}%`} title={`${r.name}: ${fmtRange(r.start, r.end)} · ${r.progress}%`}
                    className="absolute overflow-hidden rounded-sm bg-foreground opacity-80" style={{ left, width: w, top: HEAD_H + i * ROW_H + ROW_H / 2 - 4, height: 8 }}>
                    <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${r.progress}%` }} />
                  </div>
                );
              }
              const color = phaseMeta(r.phase).color;
              const label = `${r.name}: ${fmtRange(r.start, r.end)}, ${phaseMeta(r.phase).label}, ${r.progress}%${r.conflict ? ', ξεκινά πριν ολοκληρωθεί προαπαιτούμενη εργασία' : ''}`;
              const Tag = onSelect ? 'button' : 'div';
              return (
                <Tag key={r.id} type={onSelect ? 'button' : undefined} onClick={onSelect ? () => onSelect(r.id) : undefined} aria-label={label} title={label}
                  className={cn('absolute flex items-center overflow-hidden rounded-md text-left shadow-xs', onSelect && 'cursor-pointer transition-[filter] duration-150 hover:brightness-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    r.conflict && 'ring-2 ring-red-500 ring-offset-1')}
                  style={{ left, width: w, top: HEAD_H + i * ROW_H + 9, height: ROW_H - 18, background: `color-mix(in srgb, ${color} 22%, transparent)` }}>
                  <span className="absolute inset-y-0 left-0" style={{ width: `${r.progress}%`, background: color }} aria-hidden />
                  {w > 44 && (
                    <span className="relative ml-1 flex items-center gap-1 truncate rounded bg-background px-1 text-(length:--fs-10) font-semibold tabular-nums text-foreground">
                      {r.conflict && <FiAlertTriangle className="size-3 shrink-0" aria-hidden />}{r.progress}%
                    </span>
                  )}
                </Tag>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
