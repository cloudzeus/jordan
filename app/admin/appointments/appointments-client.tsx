'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { FiCalendar, FiCheck, FiCheckCircle, FiClock, FiMail, FiMoreVertical, FiPhone, FiUserX, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { DataTable } from '@/components/ui/data-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AppointmentsCalendar, type CalendarView } from '@/components/admin/appointments-calendar';
import {
  APPOINTMENT_TONE, canReschedule, computeSlots, formatSlotEl, isActiveStatus, staffCanMove, zonedParts, zonedToUtc,
  type Availability, type AppointmentStatus,
} from '@/lib/appointments-core';
import type { AppointmentView, BlockView } from '@/lib/appointments';

const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const DASH = <span className="text-muted-foreground/40">—</span>;

async function patch(id: string, body: unknown) {
  const res = await fetch(`/api/admin/appointments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message ?? 'Η ενέργεια απέτυχε');
}

function StatusBadge({ r }: { r: AppointmentView }) {
  const c = APPOINTMENT_TONE[r.status];
  return <span className="whitespace-nowrap rounded-md px-2 py-0.5 text-[length:var(--fs-11)] font-medium" style={{ color: c, background: soft(c, 12) }}>{r.statusLabel}</span>;
}

type Action = { kind: 'cancel' | 'reschedule'; row: AppointmentView } | null;

/** Το ⋮ μενού ενεργειών ενός ραντεβού — ίδιο στη λίστα και στο παράθυρο λεπτομερειών. */
function ActionsMenu({ r, onAction, onDone, align = 'end' }: { r: AppointmentView; onAction: (a: Action) => void; onDone: () => void; align?: 'start' | 'end' }) {
  const move = async (status: AppointmentStatus, msg: string) => {
    try { await patch(r.id, { action: 'status', status }); toast.success(msg); onDone(); } catch (e) { toast.error((e as Error).message); }
  };
  const any = canReschedule(r.status) || (['CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const).some((s) => staffCanMove(r.status, s));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Ενέργειες ${r.code}`}><FiMoreVertical className="size-4" aria-hidden /></DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        {staffCanMove(r.status, 'CONFIRMED') && <DropdownMenuItem className={ITEM} onSelect={() => move('CONFIRMED', `Το ${r.code} επιβεβαιώθηκε — ο επισκέπτης ενημερώνεται με email`)}><FiCheck className="size-3.5" aria-hidden /> Επιβεβαίωση</DropdownMenuItem>}
        {canReschedule(r.status) && <DropdownMenuItem className={ITEM} onSelect={() => onAction({ kind: 'reschedule', row: r })}><FiClock className="size-3.5" aria-hidden /> Μεταφορά σε άλλη ώρα…</DropdownMenuItem>}
        {staffCanMove(r.status, 'COMPLETED') && <DropdownMenuItem className={ITEM} onSelect={() => move('COMPLETED', `Το ${r.code} ολοκληρώθηκε`)}><FiCheckCircle className="size-3.5" aria-hidden /> Ολοκληρώθηκε</DropdownMenuItem>}
        {staffCanMove(r.status, 'NO_SHOW') && <DropdownMenuItem className={ITEM} onSelect={() => move('NO_SHOW', `Το ${r.code} σημειώθηκε ως «δεν προσήλθε»`)}><FiUserX className="size-3.5" aria-hidden /> Δεν προσήλθε</DropdownMenuItem>}
        {any && <DropdownMenuSeparator />}
        <DropdownMenuItem className={ITEM} asChild><a href={`mailto:${r.email}?subject=${encodeURIComponent(`Ραντεβού ${r.code}`)}`}><FiMail className="size-3.5" aria-hidden /> Email στον επισκέπτη</a></DropdownMenuItem>
        {r.phone && <DropdownMenuItem className={ITEM} asChild><a href={`tel:${r.phone.replace(/\s/g, '')}`}><FiPhone className="size-3.5" aria-hidden /> Κλήση {r.phone}</a></DropdownMenuItem>}
        {staffCanMove(r.status, 'CANCELLED') && (<><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => onAction({ kind: 'cancel', row: r })}><FiX className="size-3.5" aria-hidden /> Ακύρωση…</DropdownMenuItem></>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Details({ r }: { r: AppointmentView }) {
  const dl = (k: string, v: React.ReactNode) => (v ? <><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v}</dd></> : null);
  return (
    <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1.5 text-[length:var(--fs-13)]">
      {dl('Πότε', r.when)}
      {r.rescheduledFrom && dl('Αρχική ώρα', <span className="text-muted-foreground line-through">{formatSlotEl(r.rescheduledFrom)}</span>)}
      {dl('Επισκέπτης', r.name)}
      {dl('Εταιρεία', r.company)}
      {dl('Email', <a className="underline-offset-2 hover:underline" href={`mailto:${r.email}`}>{r.email}</a>)}
      {dl('Τηλέφωνο', r.phone && <a className="tabular-nums underline-offset-2 hover:underline" href={`tel:${r.phone.replace(/\s/g, '')}`}>{r.phone}</a>)}
      {dl('Θέμα', r.topic)}
      {dl('Μήνυμα', r.message && <span className="whitespace-pre-wrap">{r.message}</span>)}
      {dl('Σημείωση', r.staffNote && <span className="whitespace-pre-wrap">{r.staffNote}</span>)}
      {dl('SoftOne', r.softoneCode ? `Υποψήφιος ${r.softoneCode}` : r.softoneStatus === 'DISABLED' ? 'Δεν στάλθηκε (ρύθμιση κλειστή)' : r.softoneStatus === 'FAILED' ? 'Αποτυχία — δείτε Leads' : null)}
    </dl>
  );
}

function CancelDialog({ row, onClose, onDone }: { row: AppointmentView | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [notify, setNotify] = React.useState(true);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!row) return;
    setBusy(true);
    try {
      await patch(row.id, { action: 'status', status: 'CANCELLED', staffNote: new FormData(e.currentTarget).get('note')?.toString() ?? null, notify });
      toast.success(`Το ${row.code} ακυρώθηκε${notify ? ' — ο επισκέπτης ενημερώνεται με email' : ''}`); onDone();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Ακύρωση ραντεβού {row?.code}</DialogTitle>
            <DialogDescription>{row?.name}{row?.company ? ` · ${row.company}` : ''} — {row?.when}. Η ώρα ελευθερώνεται για άλλους.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <label className="block space-y-1 text-[length:var(--fs-12)] font-medium">
              <span>Μήνυμα προς τον επισκέπτη (προαιρετικό)</span>
              <textarea name="note" rows={3} maxLength={1000} className="w-full rounded-md border border-input bg-background px-3 py-2 text-[length:var(--fs-13)] font-normal" placeholder="π.χ. Το atelier θα είναι κλειστό λόγω έκθεσης" />
            </label>
            <label className="flex items-center gap-2 text-[length:var(--fs-12)]"><Switch checked={notify} onCheckedChange={setNotify} /> Email ενημέρωσης στον επισκέπτη</label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Πίσω</Button>
            <Button type="submit" variant="destructive" disabled={busy}>Ακύρωση ραντεβού</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RescheduleDialog({ row, rows, blocks, availability, onClose, onDone }: { row: AppointmentView | null; rows: AppointmentView[]; blocks: BlockView[]; availability: Availability; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = React.useState('');
  const [start, setStart] = React.useState<string | null>(null);
  const [force, setForce] = React.useState(false);
  const [time, setTime] = React.useState('10:00');
  const [notify, setNotify] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (row) { setDate(zonedParts(new Date(row.start)).date); setStart(null); setForce(false); setTime(zonedParts(new Date(row.start)).time); setNotify(true); }
  }, [row]);

  const slots = React.useMemo(() => {
    if (!row || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const busy = rows.filter((r) => r.id !== row.id && isActiveStatus(r.status)).map((r) => ({ start: new Date(r.start), end: new Date(r.end) }));
    const bl = blocks.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
    return computeSlots({ availability: { ...availability, minNoticeHours: 0, horizonDays: 366 }, from: date, days: 1, now: new Date(), busy, blocks: bl })[0]?.slots ?? [];
  }, [row, rows, blocks, availability, date]);

  async function submit() {
    if (!row) return;
    const iso = force ? zonedToUtc(date, time).toISOString() : start;
    if (!iso) return;
    setBusy(true);
    try { await patch(row.id, { action: 'reschedule', start: iso, force, notify }); toast.success(`Το ${row.code} μεταφέρθηκε${notify ? ' — ο επισκέπτης ενημερώνεται με email' : ''}`); onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Μεταφορά ραντεβού {row?.code}</DialogTitle>
          <DialogDescription>Τώρα: {row?.when}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <label className="block space-y-1 text-[length:var(--fs-12)] font-medium">
            <span>Νέα ημερομηνία</span>
            <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setStart(null); }} />
          </label>
          {!force && (
            <div className="space-y-1.5">
              <p className="text-[length:var(--fs-12)] font-medium">Ελεύθερες ώρες</p>
              {slots.length ? (
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                  {slots.map((s) => (
                    <button key={s.start} type="button" disabled={!s.free} onClick={() => setStart(s.start)} aria-pressed={start === s.start}
                      className={cn('h-9 cursor-pointer rounded-md border text-[length:var(--fs-12)] tabular-nums transition disabled:cursor-not-allowed disabled:opacity-35 disabled:line-through',
                        start === s.start ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary')}>{s.time}</button>
                  ))}
                </div>
              ) : <p className="text-[length:var(--fs-12)] text-muted-foreground">Το atelier είναι κλειστό αυτή τη μέρα (ωράριο). Διαλέξτε άλλη μέρα ή παράκαμψη ωραρίου.</p>}
            </div>
          )}
          <label className="flex items-center gap-2 text-[length:var(--fs-12)]"><Switch checked={force} onCheckedChange={setForce} /> Παράκαμψη ωραρίου (οποιαδήποτε ώρα)</label>
          {force && (
            <label className="block space-y-1 text-[length:var(--fs-12)] font-medium">
              <span>Ώρα έναρξης</span>
              <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />
            </label>
          )}
          <label className="flex items-center gap-2 text-[length:var(--fs-12)]"><Switch checked={notify} onCheckedChange={setNotify} /> Email με τη νέα ώρα στον επισκέπτη</label>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Άκυρο</Button>
          <Button type="button" disabled={busy || (!force && !start)} onClick={submit}>Μεταφορά</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AppointmentsClient({ rows, blocks, availability, canManage, today }: { rows: AppointmentView[]; blocks: BlockView[]; availability: Availability; canManage: boolean; today: string }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [view, setView] = React.useState<CalendarView>('week');
  const [anchor, setAnchor] = React.useState(today);
  const [showCancelled, setShowCancelled] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [action, setAction] = React.useState<Action>(null);
  const [filter, setFilter] = React.useState<'upcoming' | 'PENDING' | 'past' | 'all'>('upcoming');

  React.useEffect(() => { if (window.matchMedia('(max-width: 767px)').matches) setView('day'); }, []);

  const sel = rows.find((r) => r.id === selected) ?? null;
  const events = rows.filter((r) => showCancelled || r.status !== 'CANCELLED').map((r) => ({
    id: r.id, start: r.start, end: r.end, title: r.company || r.name, subtitle: `${zonedParts(new Date(r.start)).time} · ${r.name}`,
    color: APPOINTMENT_TONE[r.status], muted: r.status === 'CANCELLED' || r.status === 'NO_SHOW',
  }));
  const onAction = (a: Action) => { setSelected(null); setAction(a); };
  const done = () => { setAction(null); setSelected(null); refresh(); };

  const now = Date.now();
  const match = (r: AppointmentView, f: typeof filter) =>
    f === 'all' ? true : f === 'PENDING' ? r.status === 'PENDING' && new Date(r.end).getTime() > now : f === 'past' ? new Date(r.end).getTime() <= now : new Date(r.end).getTime() > now && isActiveStatus(r.status);
  const data = rows.filter((r) => match(r, filter)).sort((a, b) => (filter === 'past' ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));

  const columns = React.useMemo<ColumnDef<AppointmentView>[]>(() => [
    { accessorKey: 'start', header: 'Πότε', size: 210, cell: ({ row }) => <span className="tabular-nums">{row.original.when}</span> },
    { id: 'who', accessorFn: (r) => `${r.name} ${r.company ?? ''} ${r.email} ${r.code}`, header: 'Επισκέπτης', size: 260, cell: ({ row }) => (
      <span className="min-w-0"><span className="block truncate font-medium">{row.original.company || row.original.name}</span><span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">{row.original.name} · {row.original.email}</span></span>
    ) },
    { accessorKey: 'topic', header: 'Θέμα', size: 180, cell: ({ row }) => row.original.topic ?? DASH },
    { accessorKey: 'code', header: 'Κωδικός', size: 110, cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.code}</span> },
    { accessorKey: 'status', header: 'Κατάσταση', size: 160, cell: ({ row }) => <StatusBadge r={row.original} /> },
    { id: 'actions', header: () => <span className="sr-only">Ενέργειες</span>, size: 44, enableSorting: false, enableHiding: false, enableResizing: false,
      cell: ({ row }) => (canManage ? <div className="flex justify-end"><ActionsMenu r={row.original} onAction={onAction} onDone={refresh} /></div> : null) },
  ], [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (active: boolean) => cn('inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-[length:var(--fs-11)] font-medium transition',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground');

  return (
    <>
      <Tabs defaultValue="calendar">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="calendar"><FiCalendar className="size-3.5" aria-hidden /> Ημερολόγιο</TabsTrigger>
            <TabsTrigger value="list">Λίστα</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-3 text-[length:var(--fs-11)] text-muted-foreground">
            {(['PENDING', 'CONFIRMED', 'COMPLETED'] as const).map((s) => <span key={s} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: APPOINTMENT_TONE[s] }} />{{ PENDING: 'Σε αναμονή', CONFIRMED: 'Επιβεβαιωμένο', COMPLETED: 'Ολοκληρώθηκε' }[s]}</span>)}
            <label className="inline-flex items-center gap-1.5"><Switch checked={showCancelled} onCheckedChange={setShowCancelled} /> Ακυρωμένα</label>
          </div>
        </div>
        <TabsContent value="calendar">
          <AppointmentsCalendar view={view} anchor={anchor} today={today} events={events} blocks={blocks} availability={availability}
            onNavigate={setAnchor} onView={setView} onSelectEvent={setSelected} onSelectDay={(d) => { setAnchor(d); setView('day'); }} />
        </TabsContent>
        <TabsContent value="list">
          <DataTable
            columns={columns} data={data} searchKey="name" filterAllColumns searchPlaceholder="Αναζήτηση (όνομα, εταιρεία, email, κωδικός…)"
            persistKey="admin.appointments.table.v1" pageSize={25} growColumnId="who" responsiveHide={['topic', 'code']}
            expandable={(r) => <div className="max-w-2xl px-2 py-3"><Details r={r} /></div>}
            toolbar={(
              <div className="flex flex-wrap items-center gap-1.5">
                {([['upcoming', 'Επερχόμενα'], ['PENDING', 'Σε αναμονή'], ['past', 'Παλαιότερα'], ['all', 'Όλα']] as const).map(([f, l]) => (
                  <button key={f} type="button" className={chip(filter === f)} aria-pressed={filter === f} onClick={() => setFilter(f)}>{l} <span className="tabular-nums opacity-70">{rows.filter((r) => match(r, f)).length}</span></button>
                ))}
              </div>
            )}
            emptyState={<div className="space-y-2 py-10 text-center"><FiCalendar className="mx-auto size-8 text-muted-foreground/50" aria-hidden /><p className="text-[length:var(--fs-13)] text-muted-foreground">{rows.length ? 'Κανένα ραντεβού με αυτό το φίλτρο.' : 'Δεν υπάρχουν ακόμη ραντεβού από το website.'}</p></div>}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!sel} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="sm:max-w-lg">
          {sel && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3 pr-8">
                  <div className="min-w-0">
                    <DialogTitle className="truncate">{sel.company || sel.name}</DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-2"><span className="tabular-nums">{sel.code}</span><StatusBadge r={sel} /></DialogDescription>
                  </div>
                  {canManage && <ActionsMenu r={sel} onAction={onAction} onDone={done} />}
                </div>
              </DialogHeader>
              <DialogBody><Details r={sel} /></DialogBody>
            </>
          )}
        </DialogContent>
      </Dialog>
      <CancelDialog row={action?.kind === 'cancel' ? action.row : null} onClose={() => setAction(null)} onDone={done} />
      <RescheduleDialog row={action?.kind === 'reschedule' ? action.row : null} rows={rows} blocks={blocks} availability={availability} onClose={() => setAction(null)} onDone={done} />
    </>
  );
}
