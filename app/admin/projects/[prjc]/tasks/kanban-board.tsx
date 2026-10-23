'use client';

import * as React from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent, type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FiAlertCircle, FiAlertTriangle, FiBriefcase, FiCalendar, FiCheckCircle, FiClock, FiEdit2, FiExternalLink, FiEye, FiLink2, FiMoreVertical, FiPaperclip, FiPlus, FiTrash2 } from 'react-icons/fi';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PHASES, PHASE_KEYS, adjacentPhase, beforeInScope, boardColumns, durationLabel, phaseMeta, phaseOf, type PhaseKey } from '@/lib/project-tasks-core';
import type { TaskView } from '@/lib/project-tasks';
import { cn } from '@/lib/utils';

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const dayMs = 86_400_000;

export type DueTone = 'done' | 'overdue' | 'today' | 'soon' | 'later';
/** Προθεσμία ως φράση: «εκπρόθεσμη 3 μέρες» / «λήγει σήμερα» / «σε 4 μέρες». Χωρίς `today` → απλή ημερομηνία. */
export function dueInfo(end: string, progress: number, today?: string | null): { label: string; tone: DueTone } {
  if (progress >= 100) return { label: 'Ολοκληρώθηκε', tone: 'done' };
  if (!today) return { label: `έως ${fmt(end)}`, tone: 'later' };
  const n = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / dayMs);
  if (n < 0) return { label: `εκπρόθεσμη ${-n === 1 ? '1 μέρα' : `${-n} μέρες`}`, tone: 'overdue' };
  if (n === 0) return { label: 'λήγει σήμερα', tone: 'today' };
  if (n === 1) return { label: 'λήγει αύριο', tone: 'soon' };
  return { label: n <= 14 ? `σε ${n} μέρες` : `έως ${fmt(end)}`, tone: n <= 3 ? 'soon' : 'later' };
}

/** Σήμανση προθεσμίας — χρώμα ΜΑΖΙ με εικονίδιο και κείμενο, ποτέ μόνο χρώμα. */
export function DueBadge({ end, progress, today, className }: { end: string; progress: number; today?: string | null; className?: string }) {
  const d = dueInfo(end, progress, today);
  const Icon = d.tone === 'done' ? FiCheckCircle : d.tone === 'overdue' ? FiAlertCircle : FiClock;
  return (
    <span title={`Λήξη ${fmt(end)}`} className={cn('inline-flex items-center gap-1 whitespace-nowrap tabular-nums',
      d.tone === 'overdue' ? 'font-medium text-red-700 dark:text-red-300' : d.tone === 'today' ? 'font-medium text-amber-800 dark:text-amber-300' : d.tone === 'done' ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground', className)}>
      <Icon className="size-3 shrink-0" aria-hidden />{d.label}
    </span>
  );
}

export type BoardActions = {
  onOpen: (id: string) => void;
  onMove: (id: string, to: PhaseKey, beforeId: string | null) => void;
  onProgress: (id: string, progress: number) => void;
  onDelete: (id: string) => void;
  /** Χωρίς onNew (π.χ. Kanban όλων των έργων) δεν εμφανίζεται το «+» στις στήλες. */
  onNew?: (phase: PhaseKey) => void;
  /** Μετάβαση στην καρτέλα του έργου της κάρτας (Kanban πολλών έργων). */
  onProject?: (id: string) => void;
};

/** Ετικέτα έργου πάνω στην κάρτα — μόνο στο Kanban πολλών έργων. */
export type CardProject = { code: string; name: string };

/**
 * Kanban 4 στηλών (= φάσεις ποσοστού). Σύρσιμο με ποντίκι/αφή (κατώφλι 6px ώστε το κλικ να ανοίγει
 * την κάρτα) ή με πληκτρολόγιο (Space → βέλη → Space)· εναλλακτικά ⋮ → «Μετακίνηση σε».
 */
export type TaskRef = { name: string; done: boolean };

export function KanbanBoard({ tasks, canManage, names, actions, boardId = 'project-tasks-kanban', scopeOf, projectOf, today = null }: {
  tasks: TaskView[]; canManage: boolean; names: Map<string, TaskRef>; actions: BoardActions;
  /** «Σήμερα» (YYYY-MM-DD, Αθήνα) από τον server → προθεσμίες ως «σε N μέρες». Χωρίς αυτό: ημερομηνία. */
  today?: string | null;
  /** Σταθερό id του DndContext (ίδια aria ids σε SSR και client). */
  boardId?: string;
  /** Kanban πολλών έργων: σε ποιο έργο ανήκει η κάρτα — η σειρά μέσα στη στήλη μετρά ανά έργο. */
  scopeOf?: (t: TaskView) => string;
  projectOf?: (t: TaskView) => CardProject | null;
}) {
  // Πληκτρολόγιο: ←/→ = προηγούμενη/επόμενη φάση. Το sortableKeyboardCoordinates ξαναδιάλεγε την
  // ίδια στήλη (το πλαίσιό της περικλείει την κάρτα), οπότε η κάρτα δεν άλλαζε ποτέ στήλη.
  const colsRef = React.useRef<Record<PhaseKey, string[]> | null>(null);
  const keyboardCoordinates = React.useCallback<KeyboardCoordinateGetter>((event, args) => {
    const dir = event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : 0;
    const { active, droppableRects } = args.context;
    const c = colsRef.current;
    if (dir && active && c) {
      event.preventDefault();
      const from = PHASE_KEYS.find((k) => c[k].includes(String(active.id)));
      const to = from ? adjacentPhase(from, dir) : null;
      const rect = to ? droppableRects.get(to) : null;
      return rect ? { x: rect.left + 8, y: rect.top + 8 } : args.currentCoordinates;
    }
    return sortableKeyboardCoordinates(event, args);
  }, []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );
  // Τοπική διάταξη κατά το σύρσιμο (για να «ανοίγει χώρος» και σε άλλη στήλη).
  const columnsOf = React.useCallback((list: TaskView[]) => boardColumns(list, scopeOf), [scopeOf]);
  const [cols, setCols] = React.useState(() => columnsOf(tasks));
  const [active, setActive] = React.useState<string | null>(null);
  React.useEffect(() => { colsRef.current = cols; });
  // Εκτός συρσίματος η διάταξη ακολουθεί τα δεδομένα (adjust-state-while-rendering)
  const [prevDeps, setPrevDeps] = React.useState({ tasks, active, columnsOf });
  if (prevDeps.tasks !== tasks || prevDeps.active !== active || prevDeps.columnsOf !== columnsOf) {
    setPrevDeps({ tasks, active, columnsOf });
    if (!active) setCols(columnsOf(tasks));
  }
  const byId = React.useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const colOf = (id: string): PhaseKey | null => (PHASES.find((p) => p.key === id)?.key as PhaseKey | undefined) ?? (Object.keys(cols) as PhaseKey[]).find((k) => cols[k].includes(id)) ?? null;

  const onDragStart = (e: DragStartEvent) => setActive(String(e.active.id));
  const onDragOver = (e: DragOverEvent) => {
    const id = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    const from = colOf(id);
    const to = colOf(over);
    if (!from || !to || from === to) return;
    setCols((c) => {
      const target = c[to].filter((x) => x !== id);
      const at = target.indexOf(over);
      target.splice(at < 0 ? target.length : at, 0, id);
      return { ...c, [from]: c[from].filter((x) => x !== id), [to]: target };
    });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    setActive(null);
    const over = e.over ? String(e.over.id) : null;
    const to = over ? colOf(over) : null;
    if (!to) { setCols(columnsOf(tasks)); return; }
    // Το onDragOver έχει ήδη βάλει την κάρτα στη στήλη· εδώ μόνο η τελική θέση μέσα της.
    let list = cols[to].includes(id) ? cols[to] : [...cols[to], id];
    if (over && over !== to && over !== id && list.includes(over)) list = arrayMove(list, list.indexOf(id), list.indexOf(over));
    setCols((c) => ({ ...c, [to]: list }));
    const t = byId.get(id);
    const scope = t && scopeOf ? scopeOf(t) : null;
    const before = beforeInScope(list, id, (o) => !scopeOf || (byId.has(o) && scopeOf(byId.get(o)!) === scope));
    const was = t ? phaseOf(t.progress) : null;
    const prevList = columnsOf(tasks)[to];
    const unchanged = was === to && prevList.join() === list.join();
    if (!unchanged) actions.onMove(id, to, before);
  };

  // Κινητό: οι στήλες κυλούν οριζόντια ΜΕΣΑ στο δικό τους πλαίσιο (snap) — η σελίδα δεν κυλά πλάγια.
  const board = (
    <div className="-mx-1 grid snap-x snap-mandatory auto-cols-[minmax(16rem,85%)] grid-flow-col gap-3 overflow-x-auto overscroll-x-contain px-1 pb-2 md:mx-0 md:snap-none md:auto-cols-auto md:grid-flow-row md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-4">
      {PHASES.map((p) => (
        <Column key={p.key} phase={p.key} count={cols[p.key].length} canManage={canManage} onNew={actions.onNew ? () => actions.onNew!(p.key) : undefined}>
          <SortableContext items={cols[p.key]} strategy={verticalListSortingStrategy}>
            {cols[p.key].map((id) => byId.get(id) && (
              <SortableCard key={id} task={byId.get(id)!} disabled={!canManage} names={names} actions={actions} canManage={canManage} dimmed={active === id} project={projectOf?.(byId.get(id)!) ?? null} today={today} />
            ))}
          </SortableContext>
        </Column>
      ))}
    </div>
  );

  return (
    // σταθερό id → ίδια aria ids σε SSR και client (χωρίς hydration mismatch)
    <DndContext id={boardId} sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActive(null); setCols(columnsOf(tasks)); }}
      accessibility={{
        screenReaderInstructions: { draggable: 'Πατήστε Space για να σηκώσετε την κάρτα, βέλη για μετακίνηση, Space για απόθεση, Escape για ακύρωση.' },
        announcements: {
          onDragStart: ({ active: a }) => `Σηκώθηκε η «${byId.get(String(a.id))?.name ?? ''}».`,
          onDragOver: ({ over }) => (over ? `Πάνω από ${phaseMeta(colOf(String(over.id)) ?? 'TODO').label}.` : ''),
          onDragEnd: ({ over }) => (over ? `Αποτέθηκε στη στήλη ${phaseMeta(colOf(String(over.id)) ?? 'TODO').label}.` : 'Ακυρώθηκε.'),
          onDragCancel: () => 'Η μετακίνηση ακυρώθηκε.',
        },
      }}>
      {board}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {active && byId.get(active) ? <CardBody task={byId.get(active)!} names={names} project={projectOf?.(byId.get(active)!) ?? null} today={today} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ phase, count, canManage, onNew, children }: { phase: PhaseKey; count: number; canManage: boolean; onNew?: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: phase });
  const m = phaseMeta(phase);
  return (
    <section aria-label={`${m.label}: ${count} εργασίες`}
      className={cn('flex min-h-32 snap-start flex-col rounded-xl border border-border bg-muted/50 motion-safe:transition-colors motion-safe:duration-150', isOver && 'border-primary bg-primary/5')}>
      <header className="flex min-h-11 items-center gap-2 py-1 pl-3 pr-1">
        <span className="size-2 shrink-0 rounded-full" style={{ background: m.color }} aria-hidden />
        <h3 className="truncate text-(length:--fs-13) font-semibold" title={`Ποσοστό ${m.steps.map((s) => `${s}%`).join('–')}`}>{m.label}</h3>
        <span className="rounded-full bg-background px-1.5 text-(length:--fs-11) font-medium tabular-nums text-muted-foreground" aria-hidden>{count}</span>
        {canManage && onNew && (
          <button type="button" onClick={onNew} className="ml-auto inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Νέα εργασία στο «${m.label}»`}>
            <FiPlus className="size-4" aria-hidden />
          </button>
        )}
      </header>
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2 px-2 pb-2">
        {children}
        {count === 0 && (
          <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-3 py-4 text-center text-(length:--fs-12) text-muted-foreground">
            {canManage ? 'Σύρετε εδώ μια κάρτα' : 'Καμία εργασία'}
          </p>
        )}
      </div>
    </section>
  );
}

function SortableCard({ task, disabled, names, actions, canManage, dimmed, project, today }: { task: TaskView; disabled: boolean; names: Map<string, TaskRef>; actions: BoardActions; canManage: boolean; dimmed: boolean; project: CardProject | null; today: string | null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  const due = dueInfo(task.sched.end, task.progress, today);
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn('group relative', (isDragging || dimmed) && 'opacity-40')}>
      <div {...attributes} {...listeners} role="button" tabIndex={0} aria-roledescription="κάρτα εργασίας"
        aria-label={`${task.name}${project ? ` (${project.code})` : ''}, ${task.progress}%, ${due.label}`}
        onClick={() => actions.onOpen(task.id)} onKeyDown={(e) => { if (e.key === 'Enter') actions.onOpen(task.id); listeners?.onKeyDown?.(e); }}
        className={cn('cursor-pointer rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring', !disabled && 'touch-manipulation')}>
        <CardBody task={task} names={names} project={project} today={today} />
      </div>
      {(canManage || actions.onProject) && (
        <div className="absolute right-1 top-1">
          <CardMenu task={task} actions={actions} canManage={canManage} />
        </div>
      )}
    </div>
  );
}

function CardBody({ task, names, project = null, today = null, overlay = false }: { task: TaskView; names: Map<string, TaskRef>; project?: CardProject | null; today?: string | null; overlay?: boolean }) {
  const waiting = task.dependsOn.filter((d) => names.has(d) && !names.get(d)!.done);
  const people = task.parties.slice(0, 3);
  const done = task.progress >= 100;
  return (
    <article className={cn('rounded-lg border border-border bg-card p-3 pr-10 shadow-xs hover:border-foreground/20 motion-safe:transition-colors motion-safe:duration-150',
      overlay && 'shadow-lg ring-2 ring-primary motion-safe:rotate-1')}>
      {project && (
        <p className="mb-1 flex min-w-0 items-center gap-1 text-(length:--fs-11) text-muted-foreground" title={`${project.code} · ${project.name}`}>
          <FiBriefcase className="size-3 shrink-0" aria-hidden />
          <span className="font-mono tabular-nums">{project.code}</span>
          <span className="truncate">{project.name}</span>
        </p>
      )}
      <h4 className={cn('line-clamp-2 text-(length:--fs-13) font-medium leading-snug', done && 'text-muted-foreground')}>{task.name}</h4>

      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-(length:--fs-11) text-muted-foreground">
        <DueBadge end={task.sched.end} progress={task.progress} today={today} />
        <span className="inline-flex items-center gap-1 tabular-nums" title={`${fmt(task.sched.start)}${task.sched.end !== task.sched.start ? ` – ${fmt(task.sched.end)}` : ''}`}>
          <FiCalendar className="size-3" aria-hidden />{durationLabel(task.durationValue, task.durationUnit)}
        </span>
      </p>

      {(task.sched.conflict || (waiting.length > 0 && !done)) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {task.sched.conflict && <Chip tone="danger" icon={<FiAlertTriangle className="size-3" aria-hidden />}>Ξεκινά πριν τις εξαρτήσεις</Chip>}
          {waiting.length > 0 && !done && (
            <Chip tone="warn" icon={<FiLink2 className="size-3" aria-hidden />} title={waiting.map((d) => names.get(d)!.name).join(', ')}>
              Αναμένει {waiting.length === 1 ? `«${names.get(waiting[0])!.name}»` : `${waiting.length} εργασίες`}
            </Chip>
          )}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        {/* Πρόοδος: μία λεπτή μπάρα + ποσοστό (όχι πολύχρωμα τμήματα) */}
        <span className="h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Ολοκλήρωση ${task.progress}%`}>
          <span className="block h-full rounded-full bg-primary" style={{ width: `${task.progress}%` }} />
        </span>
        <span className="text-(length:--fs-11) font-medium tabular-nums text-muted-foreground" aria-hidden>{task.progress}%</span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {task.customerVisible && <FiEye className="size-3.5" aria-label="Ορατή στον πελάτη" />}
          {task.inCalendar && <FiCalendar className="size-3.5" aria-label="Στο ημερολόγιο" />}
          {task.files.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-(length:--fs-11) tabular-nums" aria-label={`${task.files.length} αρχεία`}>
              <FiPaperclip className="size-3.5" aria-hidden />{task.files.length}
            </span>
          )}
        </span>
        {people.length > 0 && (
          <span className="flex -space-x-1.5" aria-label={`Εμπλεκόμενοι: ${task.parties.map((p) => p.label).join(', ')}`}>
            {people.map((p) => (
              <span key={`${p.kind}:${p.ref}`} title={p.label} aria-hidden className="inline-flex size-6 items-center justify-center rounded-full border-2 border-card bg-secondary text-(length:--fs-10) font-semibold text-secondary-foreground">{initials(p.label)}</span>
            ))}
            {task.parties.length > 3 && <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-(length:--fs-10) tabular-nums">+{task.parties.length - 3}</span>}
          </span>
        )}
      </div>
    </article>
  );
}

function Chip({ children, icon, tone, title }: { children: React.ReactNode; icon?: React.ReactNode; tone?: 'warn' | 'danger'; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-(length:--fs-11) font-medium',
      tone === 'danger' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : tone === 'warn' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>
      {icon}<span className="truncate">{children}</span>
    </span>
  );
}

function CardMenu({ task, actions, canManage }: { task: TaskView; actions: BoardActions; canManage: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted" aria-label={`Ενέργειες για «${task.name}»`}>
        <FiMoreVertical className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-(length:--fs-11) font-semibold text-muted-foreground">{task.name}</DropdownMenuLabel>
        {canManage && (<>
        <DropdownMenuItem className={ITEM} onSelect={() => actions.onOpen(task.id)}><FiEdit2 className="size-3.5" aria-hidden /> Επεξεργασία</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={ITEM}>Μετακίνηση σε</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {PHASES.map((p) => (
              <DropdownMenuItem key={p.key} className={ITEM} disabled={task.phase === p.key} onSelect={() => actions.onMove(task.id, p.key, null)}>
                <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden /> {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={ITEM}>Ποσοστό</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {[0, 25, 50, 75, 100].map((v) => (
              <DropdownMenuItem key={v} className={cn(ITEM, 'tabular-nums')} disabled={task.progress === v} onSelect={() => actions.onProgress(task.id, v)}>{v}%</DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        </>)}
        {actions.onProject && (<>
          {canManage && <DropdownMenuSeparator />}
          <DropdownMenuItem className={ITEM} onSelect={() => actions.onProject!(task.id)}><FiExternalLink className="size-3.5" aria-hidden /> Καρτέλα έργου</DropdownMenuItem>
        </>)}
        {canManage && (<>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={cn(ITEM, 'text-destructive focus:text-destructive')} onSelect={() => actions.onDelete(task.id)}><FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή…</DropdownMenuItem>
        </>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
