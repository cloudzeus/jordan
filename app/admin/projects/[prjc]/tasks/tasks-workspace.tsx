'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiAlertTriangle, FiBookmark, FiCalendar, FiColumns, FiCopy, FiEye, FiList, FiMoreVertical, FiPlus, FiSearch, FiSettings, FiTrello, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { GanttChart } from '@/components/admin/project-tasks/gantt-chart';
import { PHASES, durationLabel, moveOnBoard, phaseCounts, phaseMeta, phaseOf, progressForPhase, projectProgress, type PhaseKey } from '@/lib/project-tasks-core';
import type { PartyOption, TaskView, TemplateView } from '@/lib/project-tasks';
import { cn } from '@/lib/utils';
import { DueBadge, KanbanBoard, type TaskRef } from './kanban-board';
import { TaskDialog } from './task-dialog';
import { ApplyTemplateDialog, SaveTemplateDialog } from './template-dialogs';
import { unwrap } from '@/lib/action-result';
import { deleteTaskAction, moveTaskAction, saveTaskAction } from '../../actions';

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const VIEW_KEY = 'admin.project-tasks.view';
const TAB = 'min-h-9 px-2.5';
// Αναζήτηση χωρίς τόνους/πεζά-κεφαλαία («αποτυπωση» βρίσκει «Αποτύπωση»).
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();


export function TasksWorkspace({ prjc, tasks: initial, options, templates, canManage, canFiles, today, openTaskId = null }: {
  prjc: number; tasks: TaskView[]; options: PartyOption[]; templates: TemplateView[]; canManage: boolean; canFiles: boolean; today: string;
  /** `?task=` από τη σελίδα «Όλες οι εργασίες»: ανοίγει κατευθείαν η φόρμα της. */
  openTaskId?: string | null;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  // Αισιόδοξες αλλαγές (Kanban) πάνω στα δεδομένα του server· ο server ξαναστέλνει μετά το refresh.
  const [tasks, setTasks] = React.useState(initial);
  // Συγχρονισμός με νέα props (adjust-state-while-rendering)
  const [prevInitial, setPrevInitial] = React.useState(initial);
  if (initial !== prevInitial) { setPrevInitial(initial); setTasks(initial); }
  const [view, setView] = React.useState('board');
  // eslint-disable-next-line react-hooks/set-state-in-effect -- ανάγνωση localStorage μετά το hydration (στο SSR δεν υπάρχει)
  React.useEffect(() => { try { const v = localStorage.getItem(VIEW_KEY); if (v) setView(v); } catch { /* ιδιωτική περιήγηση */ } }, []);
  const changeView = (v: string) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* */ } };
  const [query, setQuery] = React.useState('');

  const [editing, setEditing] = React.useState<{ open: boolean; task: TaskView | null; progress: number }>({ open: false, task: null, progress: 0 });
  // `?task=` → άνοιγμα της φόρμας όταν αλλάζει (και στο πρώτο render) — adjust-state-while-rendering
  const [prevOpenTaskId, setPrevOpenTaskId] = React.useState<string | null>(null);
  if (openTaskId !== prevOpenTaskId) {
    setPrevOpenTaskId(openTaskId);
    const t = openTaskId ? initial.find((x) => x.id === openTaskId) : null;
    if (t && canManage) setEditing({ open: true, task: t, progress: 0 });
  }
  const [saveTpl, setSaveTpl] = React.useState(false);
  const [applyTpl, setApplyTpl] = React.useState(false);

  const names = React.useMemo(() => new Map<string, TaskRef>(tasks.map((t) => [t.id, { name: t.name, done: t.progress === 100 }])), [tasks]);
  const counts = phaseCounts(tasks);
  const total = projectProgress(tasks);
  const conflicts = tasks.filter((t) => t.sched.conflict).length;
  const overdue = tasks.filter((t) => t.progress < 100 && t.sched.end < today).length;
  const dueToday = tasks.filter((t) => t.progress < 100 && t.sched.end === today).length;
  const finish = tasks.length ? tasks.map((t) => t.sched.end).sort().at(-1)! : null;

  // Φίλτρο: όνομα, περιγραφή ή εμπλεκόμενος
  const q = norm(query.trim());
  const visible = React.useMemo(() => (!q ? tasks : tasks.filter((t) => norm(`${t.name} ${t.description ?? ''} ${t.parties.map((p) => p.label).join(' ')}`).includes(q))), [tasks, q]);

  const open = (id: string) => setEditing({ open: true, task: tasks.find((t) => t.id === id) ?? null, progress: 0 });
  const onNew = (phase?: PhaseKey) => setEditing({ open: true, task: null, progress: phase ? progressForPhase(phase, 0) : 0 });

  const move = async (id: string, to: PhaseKey, beforeId: string | null) => {
    const prev = tasks;
    const changes = moveOnBoard(tasks, id, to, beforeId);
    const by = new Map(changes.map((c) => [c.id, c]));
    setTasks((ts) => ts.map((t) => (by.has(t.id) ? { ...t, progress: by.get(t.id)!.progress, phase: phaseOf(by.get(t.id)!.progress), sortOrder: by.get(t.id)!.sortOrder } : t)));
    const t = tasks.find((x) => x.id === id);
    try {
      await unwrap(moveTaskAction(prjc, id, { to, beforeId }));
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
      await unwrap(saveTaskAction(prjc, id, { progress }));
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
      await unwrap(deleteTaskAction(prjc, id));
      toast.success('Η εργασία διαγράφηκε');
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const gantt = [...visible].sort((a, b) => a.sched.start.localeCompare(b.sched.start) || a.sortOrder - b.sortOrder).map((t) => ({
    id: t.id, name: t.name, start: t.sched.start, end: t.sched.end, progress: t.progress, phase: t.phase, dependsOn: t.dependsOn, conflict: t.sched.conflict,
  }));
  const byId = new Map(visible.map((t) => [t.id, t]));

  return (
    <>
      {tasks.length > 0 && (
        // Σύνοψη σε μία γραμμή: ποσοστό + λεπτή μπάρα + ό,τι θέλει προσοχή (εκπρόθεσμες / σήμερα)
        <section aria-label="Πρόοδος έργου" className="mb-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-xs sm:px-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex min-w-56 flex-1 items-center gap-3">
              <span className="text-(length:--fs-20) font-semibold tabular-nums">{total}%</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-(length:--fs-11) text-muted-foreground">
                  <span>Ολοκλήρωση έργου</span>
                  {finish && <span className="tabular-nums">τέλος {fmt(finish)}</span>}
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={total} aria-valuemin={0} aria-valuemax={100} aria-label="Ολοκλήρωση έργου"
                  title="Σταθμισμένο με τη διάρκεια κάθε εργασίας">
                  <div className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${total}%` }} />
                </div>
              </div>
            </div>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-(length:--fs-12) text-muted-foreground">
              {/* Στο Kanban οι μετρητές φάσεων φαίνονται ήδη στις στήλες */}
              {view !== 'board' && PHASES.map((p) => (
                <li key={p.key} className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />{p.label}
                  <span className="font-semibold tabular-nums text-foreground">{counts[p.key]}</span>
                </li>
              ))}
              {overdue > 0 && <li className="inline-flex items-center gap-1.5 font-medium text-red-700 dark:text-red-300"><FiAlertTriangle className="size-3.5" aria-hidden /><span className="tabular-nums">{overdue}</span> {overdue === 1 ? 'εκπρόθεσμη' : 'εκπρόθεσμες'}</li>}
              {dueToday > 0 && <li className="inline-flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300"><FiCalendar className="size-3.5" aria-hidden /><span className="tabular-nums">{dueToday}</span> λήγ{dueToday === 1 ? 'ει' : 'ουν'} σήμερα</li>}
              {view === 'board' && !overdue && !dueToday && <li className="tabular-nums">{counts.DONE}/{tasks.length} ολοκληρώθηκαν</li>}
            </ul>
          </div>
          {conflicts > 0 && (
            <p role="status" className="mt-2 flex items-start gap-2 border-t border-border pt-2 text-(length:--fs-12) text-muted-foreground">
              <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
              <span>
                <span className="font-medium text-foreground">{conflicts === 1 ? '1 εργασία ξεκινά' : `${conflicts} εργασίες ξεκινούν`} πριν τελειώσουν οι προαπαιτούμενες.</span>{' '}
                Αδειάστε την ημερομηνία έναρξης για αυτόματο υπολογισμό.
              </span>
            </p>
          )}
        </section>
      )}

      <Tabs value={view} onValueChange={changeView}>
        {/* Γραμμή εργαλείων: προβολή · αναζήτηση · μία κύρια ενέργεια · ⋮ */}
        {tasks.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <TabsList className="group-data-[orientation=horizontal]/tabs:h-10">
              <TabsTrigger value="board" className={TAB}><FiTrello className="size-3.5" aria-hidden /> Kanban</TabsTrigger>
              <TabsTrigger value="gantt" className={TAB}><FiColumns className="size-3.5" aria-hidden /> Gantt</TabsTrigger>
              <TabsTrigger value="list" className={TAB}><FiList className="size-3.5" aria-hidden /> Λίστα</TabsTrigger>
            </TabsList>
            <div className="relative order-last w-full sm:order-none sm:w-60">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Αναζήτηση εργασίας ή ατόμου…" aria-label="Αναζήτηση εργασιών"
                className="h-10 pl-8 pr-9 [&::-webkit-search-cancel-button]:hidden" />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label="Καθαρισμός αναζήτησης">
                  <FiX className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {canManage && <Button className="min-h-10 px-3" onClick={() => onNew()}><FiPlus className="size-4" aria-hidden /> Νέα εργασία</Button>}
              {canManage && <MoreMenu hasTasks onApply={() => setApplyTpl(true)} onSave={() => setSaveTpl(true)} onGo={(href) => router.push(href)} />}
            </div>
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
            <span className="mx-auto inline-flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><FiTrello className="size-5" aria-hidden /></span>
            <p className="mt-3 text-(length:--fs-14) font-medium">Δεν υπάρχουν εργασίες ακόμη</p>
            <p className="mx-auto mt-1 max-w-sm text-(length:--fs-13) text-muted-foreground">
              {canManage ? 'Ξεκινήστε από ένα έτοιμο template ή προσθέστε την πρώτη εργασία.' : 'Μόλις προστεθούν εργασίες στο έργο θα εμφανιστούν εδώ.'}
            </p>
            {canManage && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button className="min-h-10 px-3" onClick={() => onNew()}><FiPlus className="size-4" aria-hidden /> Νέα εργασία</Button>
                <Button variant="outline" className="min-h-10 px-3" onClick={() => setApplyTpl(true)}><FiCopy className="size-4" aria-hidden /> Από template</Button>
                <MoreMenu hasTasks={false} onApply={() => setApplyTpl(true)} onSave={() => setSaveTpl(true)} onGo={(href) => router.push(href)} />
              </div>
            )}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-8 text-center">
            <p className="text-(length:--fs-13) text-muted-foreground">Καμία εργασία δεν ταιριάζει με «{query.trim()}».</p>
            <Button variant="outline" className="mt-3 min-h-10 px-3" onClick={() => setQuery('')}><FiX className="size-4" aria-hidden /> Καθαρισμός αναζήτησης</Button>
          </div>
        ) : (
          <>
            <TabsContent value="board">
              <KanbanBoard tasks={visible} canManage={canManage} names={names} today={today}
                actions={{ onOpen: open, onMove: (id, to, b) => void move(id, to, b), onProgress: (id, p) => void setProgress(id, p), onDelete: (id) => void remove(id), onNew }} />
            </TabsContent>
            <TabsContent value="gantt">
              <GanttChart rows={gantt} today={today} onSelect={open} />
            </TabsContent>
            <TabsContent value="list">
              <TaskTable tasks={gantt.map((g) => byId.get(g.id)!)} names={names} today={today} onOpen={open} />
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

/** Δευτερεύουσες ενέργειες (templates, ημερολόγιο) — πάντα σε ⋮, ποτέ σκόρπια κουμπιά. */
function MoreMenu({ hasTasks, onApply, onSave, onGo }: { hasTasks: boolean; onApply: () => void; onSave: () => void; onGo: (href: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex size-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted" aria-label="Περισσότερες ενέργειες">
        <FiMoreVertical className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem className={ITEM} onSelect={onApply}><FiCopy className="size-3.5" aria-hidden /> Προσθήκη από template…</DropdownMenuItem>
        <DropdownMenuItem className={ITEM} disabled={!hasTasks} onSelect={onSave}><FiBookmark className="size-3.5" aria-hidden /> Αποθήκευση ως template…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={ITEM} onSelect={() => onGo('/admin/projects/task-templates')}><FiSettings className="size-3.5" aria-hidden /> Διαχείριση templates</DropdownMenuItem>
        <DropdownMenuItem className={ITEM} onSelect={() => onGo('/admin/appointments')}><FiCalendar className="size-3.5" aria-hidden /> Ημερολόγιο</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Πίνακας — και η προσβάσιμη εναλλακτική του Gantt. */
function TaskTable({ tasks, names, today, onOpen }: { tasks: TaskView[]; names: Map<string, TaskRef>; today: string; onOpen: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
      <table className="w-full min-w-[720px] text-(length:--fs-13)">
        <caption className="sr-only">Εργασίες έργου με ημερομηνίες, διάρκεια, εξαρτήσεις και ποσοστό</caption>
        <thead className="border-b border-border bg-muted/50 text-left text-(length:--fs-12) text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2.5 font-medium">Εργασία</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Πότε</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Χρόνος</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Μετά από</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Εμπλεκόμενοι</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Πρόοδος</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/50">
              <td className="px-3 py-2">
                <button type="button" onClick={() => onOpen(t.id)} className="min-h-8 cursor-pointer rounded text-left font-medium hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">{t.name}</button>
                <span className="ml-1.5 inline-flex gap-1 align-middle text-muted-foreground">
                  {t.customerVisible && <FiEye className="size-3" aria-label="Ορατή στον πελάτη" />}
                  {t.inCalendar && <FiCalendar className="size-3" aria-label="Στο ημερολόγιο" />}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className={cn('block tabular-nums', t.sched.conflict && 'text-red-700 dark:text-red-300')}>
                  {t.sched.conflict && <FiAlertTriangle className="mr-1 inline size-3 align-[-1px]" aria-label="Ξεκινά πριν τις εξαρτήσεις" />}
                  {fmt(t.sched.start)} – {fmt(t.sched.end)}{t.sched.auto && <span className="ml-1 text-(length:--fs-11) text-muted-foreground">(αυτόμ.)</span>}
                </span>
                <DueBadge end={t.sched.end} progress={t.progress} today={today} className="text-(length:--fs-11)" />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{durationLabel(t.durationValue, t.durationUnit)}</td>
              <td className="px-3 py-2 text-muted-foreground">{t.dependsOn.map((d) => names.get(d)?.name).filter(Boolean).join(', ') || '—'}</td>
              <td className="px-3 py-2 text-muted-foreground">{t.parties.map((p) => p.label).join(', ') || '—'}</td>
              <td className="px-3 py-2 text-right">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
                  <span className="size-2 rounded-full" style={{ background: phaseMeta(t.phase).color }} aria-hidden />
                  <span className="text-(length:--fs-12) text-muted-foreground">{phaseMeta(t.phase).label}</span>
                  <span className="font-semibold">{t.progress}%</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
