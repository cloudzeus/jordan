'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FiAlertTriangle, FiColumns, FiEdit2, FiExternalLink, FiList, FiMoreVertical, FiSearch, FiTrello, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GanttChart, type GanttRow } from '@/components/admin/project-tasks/gantt-chart';
import {
  PHASES, PARTY_KINDS, STATUS_FILTERS, durationLabel, filterAllTasks, groupByProject, isOverdue, phaseMeta, phaseOf,
  type PhaseKey, type StatusFilter, type TaskFilter,
} from '@/lib/project-tasks-core';
import type { AllTaskView } from '@/lib/project-tasks';
import { cn } from '@/lib/utils';
import { AllTasksBoard } from './all-tasks-board';

export type AllTasksQuery = { q?: string; prjc?: string; phase?: string; party?: string; status?: string; from?: string; to?: string; view?: string };

const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';
const ALL = '__all';
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

function fromQuery(q: AllTasksQuery): TaskFilter {
  const phases = (q.phase ?? '').split(',').filter((p): p is PhaseKey => PHASES.some((ph) => ph.key === p));
  const status = STATUS_FILTERS.some((s) => s.key === q.status) ? (q.status as StatusFilter) : 'open';
  return { q: q.q ?? '', prjc: q.prjc && Number.isInteger(Number(q.prjc)) ? Number(q.prjc) : null, phases, party: q.party || null, status, from: isDate(q.from) ? q.from! : null, to: isDate(q.to) ? q.to! : null };
}

/** Τα φίλτρα στο URL: σύνδεσμος που ανοίγει την ίδια προβολή (χωρίς νέο αίτημα στον server). */
function writeQuery(f: TaskFilter, view: string) {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q);
  if (f.prjc != null) sp.set('prjc', String(f.prjc));
  if (f.phases?.length) sp.set('phase', f.phases.join(','));
  if (f.party) sp.set('party', f.party);
  if (f.status && f.status !== 'open') sp.set('status', f.status);
  if (f.from) sp.set('from', f.from);
  if (f.to) sp.set('to', f.to);
  if (view !== 'gantt') sp.set('view', view);
  const qs = sp.toString();
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
}

async function api(url: string, init: RequestInit) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || 'Η ενέργεια απέτυχε');
  return body;
}

export function AllTasksClient({ tasks, canManage, today, query }: { tasks: AllTaskView[]; canManage: boolean; today: string; query: AllTasksQuery }) {
  const router = useRouter();
  const [f, setF] = React.useState<TaskFilter>(() => fromQuery(query));
  const [view, setView] = React.useState(query.view === 'list' || query.view === 'board' ? query.view : 'gantt');
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  React.useEffect(() => writeQuery(f, view), [f, view]);
  const set = (patch: Partial<TaskFilter>) => setF((x) => ({ ...x, ...patch }));

  const projects = React.useMemo(() => [...new Map(tasks.map((t) => [t.prjc, `${t.projectCode} · ${t.projectName}`])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'el')), [tasks]);
  const parties = React.useMemo(() => {
    const m = new Map<string, { label: string; kind: string }>();
    for (const t of tasks) for (const p of t.parties) m.set(`${p.kind}:${p.ref}`, { label: p.label, kind: p.kind });
    return [...m.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, 'el'));
  }, [tasks]);

  const rows = React.useMemo(() => filterAllTasks(tasks, f, today), [tasks, f, today]);
  // Kanban: η προεπιλογή «Ανοιχτές» θα άδειαζε τη στήλη «Ολοκληρώθηκε» — εκεί δείχνουμε και τις ολοκληρωμένες.
  const boardRows = React.useMemo(() => (f.status === 'open' ? filterAllTasks(tasks, { ...f, status: 'all' }, today) : rows), [tasks, f, today, rows]);
  const groups = React.useMemo(() => groupByProject(rows), [rows]);
  const overdue = rows.filter((t) => isOverdue(t, today)).length;
  const conflicts = rows.filter((t) => t.conflict).length;
  const active = (f.q ? 1 : 0) + (f.prjc != null ? 1 : 0) + (f.phases?.length ? 1 : 0) + (f.party ? 1 : 0) + (f.from || f.to ? 1 : 0) + (f.status !== 'open' ? 1 : 0);

  const gantt: GanttRow[] = groups.flatMap((g) => {
    const key = `p:${g.prjc}`;
    const closed = collapsed.has(key);
    const head: GanttRow = { id: key, name: `${g.code} · ${g.name}`, start: g.start, end: g.end, progress: g.progress, phase: phaseOf(g.progress), group: { collapsed: closed, href: `/admin/projects/${g.prjc}/tasks`, count: g.tasks.length } };
    return [head, ...(closed ? [] : g.tasks.map((t) => ({ id: t.id, name: t.name, start: t.start, end: t.end, progress: t.progress, phase: t.phase, dependsOn: t.dependsOn, conflict: t.conflict, nested: true, sub: isOverdue(t, today) ? 'εκπρόθεσμη' : null })))];
  });
  const toggle = (id: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const byId = React.useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const openTask = (id: string) => { const t = byId.get(id); if (t) router.push(`/admin/projects/${t.prjc}/tasks?task=${t.id}`); };

  const move = async (t: AllTaskView, to: PhaseKey) => {
    try {
      await api(`/api/admin/projects/${t.prjc}/tasks/${t.id}/move`, { method: 'POST', body: JSON.stringify({ to, beforeId: null }) });
      toast.success(`«${t.name}» → ${phaseMeta(to).label}`, { duration: 2500 });
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
  };
  const setProgress = async (t: AllTaskView, progress: number) => {
    try {
      await api(`/api/admin/projects/${t.prjc}/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ progress }) });
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const chip = (on: boolean) => cn('inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[length:var(--fs-12)] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground');

  return (
    <>
      {/* Φίλτρα */}
      <section aria-label="Φίλτρα" className="mb-4 space-y-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Label htmlFor="at-q" className="sr-only">Αναζήτηση</Label>
            <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="at-q" value={f.q ?? ''} onChange={(e) => set({ q: e.target.value })} placeholder="Εργασία, έργο, εμπλεκόμενος…" className="pl-8" />
          </div>
          <Select value={f.prjc != null ? String(f.prjc) : ALL} onValueChange={(v) => set({ prjc: v === ALL ? null : Number(v) })}>
            <SelectTrigger className="w-full" aria-label="Έργο"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL}>Όλα τα έργα</SelectItem>
              {projects.map(([id, l]) => <SelectItem key={id} value={String(id)}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={f.party ?? ALL} onValueChange={(v) => set({ party: v === ALL ? null : v })}>
            <SelectTrigger className="w-full" aria-label="Εμπλεκόμενος"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL}>Όλοι οι εμπλεκόμενοι</SelectItem>
              {parties.map(([k, p]) => <SelectItem key={k} value={k}>{p.label} · {PARTY_KINDS.find((x) => x.key === p.kind)?.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <Input type="date" aria-label="Από" value={f.from ?? ''} onChange={(e) => set({ from: e.target.value || null })} className="w-full min-w-0 px-2" />
            <span className="text-muted-foreground" aria-hidden>–</span>
            <Input type="date" aria-label="Έως" value={f.to ?? ''} onChange={(e) => set({ to: e.target.value || null })} className="w-full min-w-0 px-2" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[length:var(--fs-11)] font-medium uppercase tracking-wide text-muted-foreground">Κατάσταση</span>
          {STATUS_FILTERS.map((s) => (
            <button key={s.key} type="button" aria-pressed={f.status === s.key} className={chip(f.status === s.key)} onClick={() => set({ status: s.key })}>
              {s.label} <span className="tabular-nums opacity-70">{filterAllTasks(tasks, { ...f, status: s.key }, today).length}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[length:var(--fs-11)] font-medium uppercase tracking-wide text-muted-foreground">Φάση</span>
          {PHASES.map((p) => {
            const on = !!f.phases?.includes(p.key);
            return (
              <button key={p.key} type="button" aria-pressed={on} className={chip(on)} onClick={() => set({ phases: on ? f.phases!.filter((x) => x !== p.key) : [...(f.phases ?? []), p.key] })}>
                <span className="size-2 rounded-full" style={{ background: on ? 'currentColor' : p.color }} aria-hidden />{p.label}
              </button>
            );
          })}
          {active > 0 && (
            <button type="button" className="ml-auto inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-[length:var(--fs-12)] font-medium text-muted-foreground hover:text-foreground" onClick={() => setF({ q: '', prjc: null, phases: [], party: null, status: 'open', from: null, to: null })}>
              <FiX className="size-3.5" aria-hidden /> Καθαρισμός φίλτρων
            </button>
          )}
        </div>
      </section>

      <Tabs value={view} onValueChange={setView}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="board"><FiTrello className="size-3.5" aria-hidden /> Kanban</TabsTrigger>
            <TabsTrigger value="gantt"><FiColumns className="size-3.5" aria-hidden /> Gantt έργων</TabsTrigger>
            <TabsTrigger value="list"><FiList className="size-3.5" aria-hidden /> Λίστα</TabsTrigger>
          </TabsList>
          <p className="flex flex-wrap items-center gap-x-3 text-[length:var(--fs-12)] text-muted-foreground" role="status">
            <span><span className="font-semibold tabular-nums text-foreground">{view === 'board' ? boardRows.length : rows.length}</span> εργασίες · {groups.length} έργα{view === 'board' && f.status === 'open' ? ' · μαζί με τις ολοκληρωμένες' : ''}</span>
            {overdue > 0 && <span className="text-red-600 dark:text-red-400">{overdue} εκπρόθεσμες</span>}
            {conflicts > 0 && <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><FiAlertTriangle className="size-3" aria-hidden />{conflicts} με σύγκρουση</span>}
            {view === 'gantt' && groups.length > 1 && (
              <button type="button" className="min-h-8 cursor-pointer font-medium text-primary hover:underline" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(groups.map((g) => `p:${g.prjc}`)))}>
                {collapsed.size ? 'Ανάπτυξη όλων' : 'Σύμπτυξη όλων'}
              </button>
            )}
          </p>
        </div>

        {(view === 'board' ? boardRows : rows).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
            <FiTrello className="mx-auto size-8 text-muted-foreground opacity-50" aria-hidden />
            <p className="mt-3 text-[length:var(--fs-14)] font-medium">{tasks.length ? 'Καμία εργασία με αυτά τα φίλτρα' : 'Δεν υπάρχουν ακόμη εργασίες'}</p>
            <p className="mt-1 text-[length:var(--fs-12)] text-muted-foreground">{tasks.length ? 'Αλλάξτε ή καθαρίστε τα φίλτρα.' : <>Προσθέστε εργασίες από την καρτέλα ενός <Link href="/admin/projects" className="underline">έργου</Link> → καρτέλα «Εργασίες».</>}</p>
          </div>
        ) : (
          <>
            <TabsContent value="board">
              <AllTasksBoard tasks={boardRows} canManage={canManage} />
            </TabsContent>
            <TabsContent value="gantt">
              <GanttChart rows={gantt} today={today} onSelect={openTask} onToggle={toggle} label="Έργο / εργασία" />
            </TabsContent>
            <TabsContent value="list">
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[820px] text-[length:var(--fs-12)]">
                  <caption className="sr-only">Όλες οι εργασίες με έργο, ημερομηνίες, εμπλεκόμενους και ποσοστό</caption>
                  <thead className="border-b border-border text-left text-[length:var(--fs-11)] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Εργασία</th>
                      <th scope="col" className="px-3 py-2 font-medium">Έργο</th>
                      <th scope="col" className="px-3 py-2 font-medium">Έναρξη</th>
                      <th scope="col" className="px-3 py-2 font-medium">Λήξη</th>
                      <th scope="col" className="px-3 py-2 font-medium">Χρόνος</th>
                      <th scope="col" className="px-3 py-2 font-medium">Εμπλεκόμενοι</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">%</th>
                      <th scope="col" className="w-11 px-1 py-2"><span className="sr-only">Ενέργειες</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.flatMap((g) => g.tasks).map((t) => {
                      const late = isOverdue(t, today);
                      return (
                        <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted">
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => openTask(t.id)} className="cursor-pointer text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t.name}</button>
                            {t.conflict && <FiAlertTriangle className="ml-1.5 inline size-3 text-red-600" aria-label="Ξεκινά πριν τις εξαρτήσεις" />}
                          </td>
                          <td className="px-3 py-2"><Link href={`/admin/projects/${t.prjc}/tasks`} className="hover:underline"><span className="tabular-nums text-muted-foreground">{t.projectCode}</span> {t.projectName}</Link></td>
                          <td className="px-3 py-2 tabular-nums">{fmt(t.start)}</td>
                          <td className={cn('px-3 py-2 tabular-nums', late && 'font-medium text-red-600 dark:text-red-400')}>{fmt(t.end)}{late && <span className="sr-only"> (εκπρόθεσμη)</span>}</td>
                          <td className="px-3 py-2">{durationLabel(t.durationValue, t.durationUnit)}</td>
                          <td className="max-w-56 truncate px-3 py-2 text-muted-foreground" title={t.parties.map((p) => p.label).join(', ')}>{t.parties.map((p) => p.label).join(', ') || '—'}</td>
                          <td className="px-3 py-2 text-right"><span className="inline-flex items-center gap-1.5 font-semibold tabular-nums"><span className="size-2 rounded-full" style={{ background: phaseMeta(t.phase).color }} aria-hidden />{t.progress}%</span></td>
                          <td className="px-1 py-1 text-right"><RowMenu t={t} canManage={canManage} onOpen={() => openTask(t.id)} onMove={(to) => void move(t, to)} onProgress={(p) => void setProgress(t, p)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </>
        )}
      </Tabs>
    </>
  );
}

function RowMenu({ t, canManage, onOpen, onMove, onProgress }: { t: AllTaskView; canManage: boolean; onOpen: () => void; onMove: (to: PhaseKey) => void; onProgress: (p: number) => void }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-background" aria-label={`Ενέργειες για «${t.name}»`}>
        <FiMoreVertical className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-[length:var(--fs-11)] font-semibold text-muted-foreground">{t.name}</DropdownMenuLabel>
        {canManage && <DropdownMenuItem className={ITEM} onSelect={onOpen}><FiEdit2 className="size-3.5" aria-hidden /> Επεξεργασία</DropdownMenuItem>}
        {canManage && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={ITEM}>Μετακίνηση σε</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {PHASES.map((p) => (
                  <DropdownMenuItem key={p.key} className={ITEM} disabled={t.phase === p.key} onSelect={() => onMove(p.key)}>
                    <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden /> {p.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={ITEM}>Ποσοστό</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {[0, 25, 50, 75, 100].map((v) => <DropdownMenuItem key={v} className={cn(ITEM, 'tabular-nums')} disabled={t.progress === v} onSelect={() => onProgress(v)}>{v}%</DropdownMenuItem>)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem className={ITEM} onSelect={() => router.push(`/admin/projects/${t.prjc}/tasks`)}><FiTrello className="size-3.5" aria-hidden /> Kanban του έργου</DropdownMenuItem>
        <DropdownMenuItem className={ITEM} onSelect={() => router.push(`/admin/projects/${t.prjc}`)}><FiExternalLink className="size-3.5" aria-hidden /> Καρτέλα έργου</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
