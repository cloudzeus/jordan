'use client';

// Χρονοδιάγραμμα της προσφοράς (πριν από την αποδοχή): εργασίες με διάρκεια, έναρξη ή «μετά από» άλλες,
// σε Gantt. Γεμίζει από template ή από τους χώρους της κάτοψης· με την ενεργοποίηση γίνεται Kanban/Gantt
// του έργου. Οι αλλαγές αποθηκεύονται με την προσφορά.
import * as React from 'react';
import { FiCamera, FiCheck, FiChevronDown, FiEye, FiEyeOff, FiLayers, FiMoreVertical, FiPlus, FiTrash2 } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GanttChart } from '@/components/admin/project-tasks/gantt-chart';
import { addWorkdays, durationLabel, schedule } from '@/lib/project-tasks-core';
import type { PlanRoom } from '@/lib/floorplan/saved';
import { cn } from '@/lib/utils';

export type EditorTask = {
  key: string; name: string; description: string | null; durationValue: number; durationUnit: 'DAYS' | 'HOURS';
  startDate: string | null; dependsOn: string[]; roomId: string | null; customerVisible: boolean; photoFileIds: string[];
  projectTaskId?: string | null;
};
export type TemplateOption = { id: string; name: string; items: { key: string; name: string; description: string | null; offsetDays: number; durationValue: number; durationUnit: string; dependsOn: string[]; customerVisible: boolean }[] };

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const dayEl = (d: string) => { const [y, m, x] = d.split('-'); return `${x}/${m}/${y.slice(2)}`; };
/** Εκτίμηση ημερών τοποθέτησης ανά χώρο: ~12 m² την ημέρα (δάπεδο + τοίχοι), τουλάχιστον 1. */
const roomDays = (r: PlanRoom) => Math.max(1, Math.ceil((r.floorM2 + r.wallsM2) / 12));

export function ScheduleSection({ tasks, rooms, start, today, templates, readOnly, onChange, noteFor }: {
  tasks: EditorTask[];
  rooms: PlanRoom[];
  /** Έναρξη του έργου (της φόρμας) — αλλιώς σήμερα. */
  start: string | null;
  today: string;
  templates: TemplateOption[];
  readOnly: boolean;
  onChange: (tasks: EditorTask[]) => void;
  noteFor?: (t: EditorTask) => React.ReactNode;
}) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const base = start ?? today;
  const sched = React.useMemo(() => schedule(tasks.map((t) => ({ id: t.key, startDate: t.startDate, durationValue: t.durationValue, durationUnit: t.durationUnit, dependsOn: t.dependsOn })), base), [tasks, base]);
  const name = new Map(tasks.map((t) => [t.key, t.name]));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const set = (key: string, patch: Partial<EditorTask>) => onChange(tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const remove = (key: string) => onChange(tasks.filter((t) => t.key !== key).map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== key) })));
  const add = (t: Partial<EditorTask> = {}) => {
    const n: EditorTask = { key: uid(), name: '', description: null, durationValue: 1, durationUnit: 'DAYS', startDate: null, dependsOn: [], roomId: null, customerVisible: true, photoFileIds: [], ...t };
    onChange([...tasks, n]);
    setEditing(n.key);
  };
  // Template: τα offsets γίνονται ημερομηνίες από την έναρξη· οι εξαρτήσεις περνούν με νέα keys.
  const fromTemplate = (tpl: TemplateOption) => {
    const keys = new Map(tpl.items.map((i) => [i.key, uid()]));
    onChange([...tasks, ...tpl.items.map((i) => ({
      key: keys.get(i.key)!, name: i.name, description: i.description, durationValue: i.durationValue, durationUnit: (i.durationUnit === 'HOURS' ? 'HOURS' : 'DAYS') as EditorTask['durationUnit'],
      startDate: i.dependsOn.length ? null : addWorkdays(base, Math.max(0, i.offsetDays)),
      dependsOn: i.dependsOn.map((d) => keys.get(d)).filter((x): x is string => !!x), roomId: null, customerVisible: i.customerVisible, photoFileIds: [],
    }))]);
  };
  // Μία εργασία τοποθέτησης ανά χώρο με υλικό, η μία μετά την άλλη.
  const fromRooms = () => {
    const todo = rooms.filter((r) => r.material && !tasks.some((t) => t.roomId === r.id));
    let prev: string | null = tasks.length ? tasks[tasks.length - 1].key : null;
    const out: EditorTask[] = todo.map((r) => {
      const t: EditorTask = { key: uid(), name: `Τοποθέτηση: ${r.name}`, description: r.material ? `Υλικό: ${r.material.label}` : null, durationValue: roomDays(r), durationUnit: 'DAYS', startDate: null, dependsOn: prev ? [prev] : [], roomId: r.id, customerVisible: true, photoFileIds: [] };
      prev = t.key;
      return t;
    });
    onChange([...tasks, ...out]);
  };

  const gantt = tasks.map((t) => {
    const r = sched.rows.get(t.key)!;
    return { id: t.key, name: t.name || '(χωρίς όνομα)', start: r.start, end: r.end, progress: 0, phase: 'TODO' as const, dependsOn: t.dependsOn, conflict: r.conflict, sub: t.roomId ? roomName.get(t.roomId) ?? null : null };
  });
  const end = gantt.reduce((a, g) => (g.end > a ? g.end : a), base);
  const roomsLeft = rooms.filter((r) => r.material && !tasks.some((t) => t.roomId === r.id)).length;

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => add()}><FiPlus className="size-3.5" aria-hidden /> Εργασία</Button>
          {rooms.length > 0 && (
            <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={!roomsLeft} onClick={fromRooms} title="Μία εργασία τοποθέτησης για κάθε χώρο με υλικό (~12 m² την ημέρα)">
              <FiLayers className="size-3.5" aria-hidden /> Από τους χώρους{roomsLeft ? ` (${roomsLeft})` : ''}
            </Button>
          )}
          {templates.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="outline" className="gap-1.5">Από template <FiChevronDown className="size-3.5" aria-hidden /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-64">
                <DropdownMenuLabel className="text-(length:--fs-11) text-muted-foreground">Προστίθενται από την έναρξη {dayEl(base)}</DropdownMenuLabel>
                {templates.map((t) => <DropdownMenuItem key={t.id} className={ITEM} onSelect={() => fromTemplate(t)}>{t.name} <span className="ml-auto text-muted-foreground">{t.items.length}</span></DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {tasks.length > 0 && <span className="ml-auto text-(length:--fs-12) text-muted-foreground">{tasks.length} εργασίες · {dayEl(base)} → <b className="text-foreground">{dayEl(end)}</b></span>}
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-(length:--fs-13) text-muted-foreground">
          Δεν υπάρχουν εργασίες ακόμη. Φτιάξτε τις από τους χώρους, από ένα template ή μία-μία — φαίνονται αμέσως στο Gantt.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <GanttChart rows={gantt} today={today} onSelect={(id) => !readOnly && setEditing(id)} />
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {tasks.map((t, i) => {
              const r = sched.rows.get(t.key)!;
              const open = editing === t.key;
              return (
                <li key={t.key} className={cn('px-2 py-0.5', open && 'bg-muted/30 py-1.5')}>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-(length:--fs-11) font-semibold tabular-nums">{i + 1}</span>
                    <Input value={t.name} onChange={(e) => set(t.key, { name: e.target.value })} disabled={readOnly} placeholder="π.χ. Προετοιμασία υποστρώματος" aria-label={`Όνομα εργασίας ${i + 1}`}
                      className="h-8 min-w-40 flex-1 px-2 text-(length:--fs-12) border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-input disabled:opacity-100" />
                    <span className="flex items-center">
                      <Input inputMode="decimal" value={String(t.durationValue).replace('.', ',')} disabled={readOnly} aria-label="Διάρκεια"
                        onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); if (n > 0) set(t.key, { durationValue: n }); }}
                        className="h-8 w-11 px-1.5 text-right text-(length:--fs-12) tabular-nums border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-input disabled:opacity-100" />
                      <select value={t.durationUnit} disabled={readOnly} onChange={(e) => set(t.key, { durationUnit: e.target.value as EditorTask['durationUnit'] })} aria-label="Μονάδα διάρκειας"
                        className="h-8 cursor-pointer rounded-md border border-transparent bg-transparent px-1 text-(length:--fs-12) text-muted-foreground hover:border-input focus-visible:border-input">
                        <option value="DAYS">ημ.</option><option value="HOURS">ώρ.</option>
                      </select>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-(length:--fs-11) tabular-nums text-muted-foreground" title={r.auto ? 'Υπολογίζεται από τις εξαρτήσεις / την έναρξη' : 'Σταθερή ημερομηνία'}>
                      {dayEl(r.start)} → {dayEl(r.end)}{r.conflict && <span className="block font-medium text-rose-800">πριν τελειώσουν τα προηγούμενα</span>}
                    </span>
                    {t.photoFileIds.length > 0 && <span className="inline-flex items-center gap-1 text-(length:--fs-11) text-muted-foreground" title="Φωτογραφίες"><FiCamera className="size-3.5" aria-hidden />{t.photoFileIds.length}</span>}
                    {noteFor?.(t)}
                    <span title={t.customerVisible ? 'Ορατή στον πελάτη' : 'Μόνο για εμάς'} className="inline-flex size-6 items-center justify-center text-muted-foreground">{t.customerVisible ? <FiEye className="size-3.5" aria-label="Ορατή στον πελάτη" /> : <FiEyeOff className="size-3.5" aria-label="Μόνο για εμάς" />}</span>
                    {!readOnly && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ενέργειες εργασίας ${i + 1}`}>
                          <FiMoreVertical className="size-4" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-56">
                          <DropdownMenuItem className={ITEM} onSelect={() => setEditing(open ? null : t.key)}><FiChevronDown className="size-3.5" />{open ? 'Κλείσιμο λεπτομερειών' : 'Λεπτομέρειες & εξαρτήσεις'}</DropdownMenuItem>
                          <DropdownMenuItem className={ITEM} onSelect={() => set(t.key, { customerVisible: !t.customerVisible })}>{t.customerVisible ? <FiEyeOff className="size-3.5" /> : <FiEye className="size-3.5" />}{t.customerVisible ? 'Μόνο για εμάς' : 'Ορατή στον πελάτη'}</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" className={ITEM} disabled={!!t.projectTaskId} onSelect={() => remove(t.key)}><FiTrash2 className="size-3.5" />Αφαίρεση</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {open && !readOnly && (
                    <div className="mt-2 grid gap-2 pl-8 md:grid-cols-[minmax(0,1fr)_auto]">
                      <textarea value={t.description ?? ''} onChange={(e) => set(t.key, { description: e.target.value || null })} rows={2} aria-label="Περιγραφή εργασίας"
                        placeholder="Οδηγίες για την εργασία…" className="w-full resize-y rounded-md border border-input bg-background px-3 py-1.5 text-(length:--fs-12) outline-hidden focus-visible:ring-2 focus-visible:ring-ring" />
                      <div className="flex flex-wrap items-start gap-2">
                        <label className="text-(length:--fs-11) text-muted-foreground">
                          Σταθερή έναρξη
                          <Input type="date" value={t.startDate ?? ''} onChange={(e) => set(t.key, { startDate: e.target.value || null })} className="mt-0.5 h-9 w-40 text-(length:--fs-12)" />
                        </label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" size="sm" variant="outline" className="mt-4 h-9 gap-1.5">Μετά από {t.dependsOn.length ? `(${t.dependsOn.length})` : '…'} <FiChevronDown className="size-3.5" aria-hidden /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="max-h-72 min-w-60 overflow-y-auto">
                            <DropdownMenuLabel className="text-(length:--fs-11) text-muted-foreground">Ξεκινά όταν τελειώσουν</DropdownMenuLabel>
                            {tasks.filter((o) => o.key !== t.key).map((o) => (
                              <DropdownMenuCheckboxItem key={o.key} className="text-(length:--fs-12)" checked={t.dependsOn.includes(o.key)} onSelect={(e) => e.preventDefault()}
                                onCheckedChange={(on) => set(t.key, { dependsOn: on ? [...t.dependsOn, o.key] : t.dependsOn.filter((d) => d !== o.key) })}>
                                {name.get(o.key) || '(χωρίς όνομα)'}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {rooms.length > 0 && (
                          <label className="text-(length:--fs-11) text-muted-foreground">
                            Χώρος
                            <select value={t.roomId ?? ''} onChange={(e) => set(t.key, { roomId: e.target.value || null })} className="mt-0.5 block h-9 cursor-pointer rounded-md border border-input bg-transparent px-2 text-(length:--fs-12) text-foreground">
                              <option value="">—</option>
                              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                          </label>
                        )}
                      </div>
                      <p className="text-(length:--fs-11) text-muted-foreground md:col-span-2">
                        {t.dependsOn.length ? <>Ξεκινά μετά από: {t.dependsOn.map((d) => name.get(d) || '—').join(', ')}. </> : null}
                        Διάρκεια {durationLabel(t.durationValue, t.durationUnit)} · χωρίς σταθερή έναρξη ακολουθεί τα προηγούμενα ή την έναρξη του έργου.
                        {t.projectTaskId && <span className="ml-1 inline-flex items-center gap-1 text-emerald-800"><FiCheck className="size-3" aria-hidden />Υπάρχει ήδη στο έργο</span>}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
