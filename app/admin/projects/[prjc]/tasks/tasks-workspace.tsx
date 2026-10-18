'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiAlertTriangle, FiBookmark, FiCalendar, FiColumns, FiCopy, FiEye, FiList, FiMoreVertical, FiPlus, FiTrello } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { GanttChart } from '@/components/admin/project-tasks/gantt-chart';
import { PHASES, durationLabel, moveOnBoard, phaseCounts, phaseMeta, phaseOf, progressForPhase, projectProgress, type PhaseKey } from '@/lib/project-tasks-core';
import type { PartyOption, TaskView, TemplateView } from '@/lib/project-tasks';
import { cn } from '@/lib/utils';
import { KanbanBoard, type TaskRef } from './kanban-board';
import { TaskDialog } from './task-dialog';
import { ApplyTemplateDialog, SaveTemplateDialog } from './template-dialogs';

const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const VIEW_KEY = 'admin.project-tasks.view';

async function api(url: string, init: RequestInit) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || 'Η ενέργεια απέτυχε');
  return body;
}

export function TasksWorkspace({ prjc, tasks: initial, options, templates, canManage, canFiles, today }: {
  prjc: number; tasks: TaskView[]; options: PartyOption[]; templates: TemplateView[]; canManage: boolean; canFiles: boolean; today: string;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  // Αισιόδοξες αλλαγές (Kanban) πάνω στα δεδομένα του server· ο server ξαναστέλνει μετά το refresh.
  const [tasks, setTasks] = React.useState(initial);
  React.useEffect(() => setTasks(initial), [initial]);
  const [view, setView] = React.useState('board');
  React.useEffect(() => { try { const v = localStorage.getItem(VIEW_KEY); if (v) setView(v); } catch { /* ιδιωτική περιήγηση */ } }, []);
  const changeView = (v: string) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* */ } };

  const [editing, setEditing] = React.useState<{ open: boolean; task: TaskView | null; progress: number }>({ open: false, task: null, progress: 0 });
  const [saveTpl, setSaveTpl] = React.useState(false);
  const [applyTpl, setApplyTpl] = React.useState(false);

  const names = React.useMemo(() => new Map<string, TaskRef>(tasks.map((t) => [t.id, { name: t.name, done: t.progress === 100 }])), [tasks]);
  const counts = phaseCounts(tasks);
  const total = projectProgress(tasks);
  const conflicts = tasks.filter((t) => t.sched.conflict).length;
  const finish = tasks.length ? tasks.map((t) => t.sched.end).sort().at(-1)! : null;

  const open = (id: string) => setEditing({ open: true, task: tasks.find((t) => t.id === id) ?? null, progress: 0 });
  const onNew = (phase?: PhaseKey) => setEditing({ open: true, task: null, progress: phase ? progressForPhase(phase, 0) : 0 });

  const move = async (id: string, to: PhaseKey, beforeId: string | null) => {
    const prev = tasks;
    const changes = moveOnBoard(tasks, id, to, beforeId);
    const by = new Map(changes.map((c) => [c.id, c]));
    setTasks((ts) => ts.map((t) => (by.has(t.id) ? { ...t, progress: by.get(t.id)!.progress, phase: phaseOf(by.get(t.id)!.progress), sortOrder: by.get(t.id)!.sortOrder } : t)));
    const t = tasks.find((x) => x.id === id);
    try {
      await api(`/api/admin/projects/${prjc}/tasks/${id}/move`, { method: 'POST', body: JSON.stringify({ to, beforeId }) });
      if (t && phaseOf(t.progress) !== to) {
        const waiting = t.dependsOn.filter((d) => names.has(d) && !names.get(d)!.done);
        if (to !== 'TODO' && waiting.length) toast.warning(`Η «${t.name}» περιμένει: ${waiting.map((d) => names.get(d)!.name).join(', ')}`);
        else toast.success(`«${t.name}» → ${phaseMeta(to).label}`, { duration: 2500 });
      }
      refresh();
    } catch (e) {
      setTasks(prev);
      toast.error((e as Error).message);
    }
  };

  const setProgress = async (id: string, progress: number) => {
    try {
      await api(`/api/admin/projects/${prjc}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ progress }) });
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const remove = async (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const deps = tasks.filter((x) => x.dependsOn.includes(id));
    const ok = await confirmAction({
      message: `Διαγραφή της εργασίας «${t.name}»;${deps.length ? `\nΘα αφαιρεθεί και ως εξάρτηση από: ${deps.map((d) => d.name).join(', ')}.` : ''}${t.inCalendar ? '\nΘα σταλεί ακύρωση στα ημερολόγια.' : ''}\nΤα αρχεία της μένουν στον φάκελο του έργου.`,
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/projects/${prjc}/tasks/${id}`, { method: 'DELETE' });
      toast.success('Η εργασία διαγράφηκε');
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const gantt = [...tasks].sort((a, b) => a.sched.start.localeCompare(b.sched.start) || a.sortOrder - b.sortOrder).map((t) => ({
    id: t.id, name: t.name, start: t.sched.start, end: t.sched.end, progress: t.progress, phase: t.phase, dependsOn: t.dependsOn, conflict: t.sched.conflict,
  }));

  return (
    <>
      {/* Σύνοψη: συνολικό ποσοστό + μετρητές φάσεων */}
      <section aria-label="Πρόοδος έργου" className="mb-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div className="min-w-48 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[length:var(--fs-12)] font-medium text-muted-foreground">Ολοκλήρωση έργου</span>
              <span className="text-[length:var(--fs-24)] font-semibold tabular-nums">{total}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={total} aria-valuemin={0} aria-valuemax={100} aria-label="Ολοκλήρωση έργου">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${total}%` }} />
            </div>
            <p className="mt-1 text-[length:var(--fs-11)] text-muted-foreground">Σταθμισμένο με τη διάρκεια κάθε εργασίας{finish ? ` · προβλεπόμενο τέλος ${fmt(finish)}` : ''}</p>
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-2">
            {PHASES.map((p) => (
              <div key={p.key}>
                <dt className="flex items-center gap-1.5 text-[length:var(--fs-11)] text-muted-foreground"><span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />{p.label}</dt>
                <dd className="text-[length:var(--fs-18)] font-semibold tabular-nums">{counts[p.key]}</dd>
              </div>
            ))}
          </dl>
        </div>
        {conflicts > 0 && (
          <p role="status" className="mt-3 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-[length:var(--fs-12)] text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <FiAlertTriangle className="size-3.5 shrink-0" aria-hidden /> {conflicts === 1 ? '1 εργασία ξεκινά' : `${conflicts} εργασίες ξεκινούν`} πριν ολοκληρωθούν οι εργασίες από τις οποίες εξαρτώνται — αδειάστε την ημερομηνία έναρξης για αυτόματο υπολογισμό.
          </p>
        )}
      </section>

      <Tabs value={view} onValueChange={changeView}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="board"><FiTrello className="size-3.5" aria-hidden /> Kanban</TabsTrigger>
            <TabsTrigger value="gantt"><FiColumns className="size-3.5" aria-hidden /> Gantt</TabsTrigger>
            <TabsTrigger value="list"><FiList className="size-3.5" aria-hidden /> Λίστα</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1.5">
            {canManage && <Button size="sm" className="min-h-9" onClick={() => onNew()}><FiPlus className="size-3.5" aria-hidden /> Νέα εργασία</Button>}
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Templates εργασιών">
                  <FiMoreVertical className="size-4" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem className={ITEM} onSelect={() => setApplyTpl(true)}><FiCopy className="size-3.5" aria-hidden /> Προσθήκη από template…</DropdownMenuItem>
                  <DropdownMenuItem className={ITEM} disabled={!tasks.length} onSelect={() => setSaveTpl(true)}><FiBookmark className="size-3.5" aria-hidden /> Αποθήκευση ως template…</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className={ITEM} onSelect={() => router.push('/admin/projects/task-templates')}>Διαχείριση templates</DropdownMenuItem>
                  <DropdownMenuItem className={ITEM} onSelect={() => router.push('/admin/appointments')}><FiCalendar className="size-3.5" aria-hidden /> Ημερολόγιο</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
            <FiTrello className="mx-auto size-8 text-muted-foreground opacity-50" aria-hidden />
            <p className="mt-3 text-[length:var(--fs-14)] font-medium">Δεν υπάρχουν εργασίες στο έργο</p>
            <p className="mt-1 text-[length:var(--fs-12)] text-muted-foreground">Ξεκινήστε με μια νέα εργασία ή φέρτε έτοιμη σειρά από template.</p>
            {canManage && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button size="sm" className="min-h-9" onClick={() => onNew()}><FiPlus className="size-3.5" aria-hidden /> Νέα εργασία</Button>
                <Button size="sm" variant="outline" className="min-h-9" onClick={() => setApplyTpl(true)}><FiCopy className="size-3.5" aria-hidden /> Από template</Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <TabsContent value="board">
              <KanbanBoard tasks={tasks} canManage={canManage} names={names} actions={{ onOpen: open, onMove: (id, to, b) => void move(id, to, b), onProgress: (id, p) => void setProgress(id, p), onDelete: (id) => void remove(id), onNew }} />
            </TabsContent>
            <TabsContent value="gantt">
              <GanttChart rows={gantt} today={today} onSelect={open} />
            </TabsContent>
            <TabsContent value="list">
              <TaskTable tasks={gantt.map((g) => tasks.find((t) => t.id === g.id)!)} names={names} onOpen={open} />
            </TabsContent>
          </>
        )}
      </Tabs>

      {canManage && (
        <>
          <TaskDialog open={editing.open} onOpenChange={(o) => setEditing((e) => ({ ...e, open: o }))} prjc={prjc}
            task={editing.task} initialProgress={editing.progress}
            tasks={tasks} options={options} canFiles={canFiles} onSaved={refresh} />
          <SaveTemplateDialog open={saveTpl} onOpenChange={setSaveTpl} prjc={prjc} tasks={tasks} onSaved={refresh} />
          <ApplyTemplateDialog open={applyTpl} onOpenChange={setApplyTpl} prjc={prjc} templates={templates} today={today} onApplied={refresh} />
        </>
      )}
    </>
  );
}

/** Πίνακας — και η προσβάσιμη εναλλακτική του Gantt. */
function TaskTable({ tasks, names, onOpen }: { tasks: TaskView[]; names: Map<string, TaskRef>; onOpen: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[720px] text-[length:var(--fs-12)]">
        <caption className="sr-only">Εργασίες έργου με ημερομηνίες, διάρκεια, εξαρτήσεις και ποσοστό</caption>
        <thead className="border-b border-border text-left text-[length:var(--fs-11)] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Εργασία</th>
            <th scope="col" className="px-3 py-2 font-medium">Έναρξη</th>
            <th scope="col" className="px-3 py-2 font-medium">Λήξη</th>
            <th scope="col" className="px-3 py-2 font-medium">Χρόνος</th>
            <th scope="col" className="px-3 py-2 font-medium">Μετά από</th>
            <th scope="col" className="px-3 py-2 font-medium">Εμπλεκόμενοι</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted">
              <td className="px-3 py-2">
                <button type="button" onClick={() => onOpen(t.id)} className="cursor-pointer text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t.name}</button>
                <span className="ml-1.5 inline-flex gap-1 align-middle text-muted-foreground">
                  {t.customerVisible && <FiEye className="size-3" aria-label="Ορατή στον πελάτη" />}
                  {t.inCalendar && <FiCalendar className="size-3" aria-label="Στο ημερολόγιο" />}
                </span>
              </td>
              <td className={cn('px-3 py-2 tabular-nums', t.sched.conflict && 'text-red-600')}>{fmt(t.sched.start)}{t.sched.auto && <span className="ml-1 text-[length:var(--fs-10)] text-muted-foreground">(αυτόμ.)</span>}</td>
              <td className="px-3 py-2 tabular-nums">{fmt(t.sched.end)}</td>
              <td className="px-3 py-2">{durationLabel(t.durationValue, t.durationUnit)}</td>
              <td className="px-3 py-2 text-muted-foreground">{t.dependsOn.map((d) => names.get(d)?.name).filter(Boolean).join(', ') || '—'}</td>
              <td className="px-3 py-2 text-muted-foreground">{t.parties.map((p) => p.label).join(', ') || '—'}</td>
              <td className="px-3 py-2 text-right">
                <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums"><span className="size-2 rounded-full" style={{ background: phaseMeta(t.phase).color }} aria-hidden />{t.progress}%</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
