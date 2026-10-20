'use client';
// Η αρχική του προσωπικού: πλέγμα widgets με drag & drop (ποντίκι, αφή, πληκτρολόγιο), απόκρυψη,
// μέγεθος και επαναφορά. Το περιεχόμενο κάθε widget έρχεται έτοιμο από τον server (δικό του
// Suspense) — εδώ μόνο η διάταξη, που αποθηκεύεται ανά χρήστη (/api/admin/dashboard/layout).
import './home.css';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent, type Announcements,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  FiMoreVertical, FiMove, FiEyeOff, FiArrowUp, FiArrowDown, FiChevronsUp, FiChevronsDown, FiMaximize2,
  FiExternalLink, FiRotateCcw, FiRefreshCw, FiGrid, FiSliders,
} from 'react-icons/fi';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
  DropdownMenuCheckboxItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  WIDGET_SIZES, WIDGET_SIZE_LABEL, dropWidget, moveWidget, setHidden, setSize, sizeOf, type Layout, type WidgetSize,
} from '@/lib/dashboard/widgets';

export type WidgetMeta = { id: string; title: string; description: string; href?: string };

const SPAN: Record<WidgetSize, string> = {
  sm: 'col-span-12 md:col-span-6 xl:col-span-4',
  md: 'col-span-12 md:col-span-6 xl:col-span-8',
  lg: 'col-span-12',
};

const BTN = 'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground cx-transition hover:bg-(--cx-hover) hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring';

export function DashboardGrid({
  initial, custom: initialCustom, meta, icons, nodes,
}: {
  initial: Layout;
  custom: boolean;
  meta: WidgetMeta[];
  icons: Record<string, React.ReactNode>;
  nodes: Record<string, React.ReactNode>;
}) {
  const router = useRouter();
  const [layout, setLayout] = React.useState(initial);
  const [custom, setCustom] = React.useState(initialCustom);
  const [saving, setSaving] = React.useState(false);
  const metaBy = React.useMemo(() => new Map(meta.map((m) => [m.id, m])), [meta]);
  const hidden = new Set(layout.hidden);
  const visible = layout.order.filter((id) => !hidden.has(id) && metaBy.has(id));

  // Αποθήκευση με μικρή καθυστέρηση: πολλές μετακινήσεις στη σειρά = ένα αίτημα.
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = React.useCallback((next: Layout, refresh = false) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch('/api/admin/dashboard/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
        if (!res.ok) throw new Error(String(res.status));
        setCustom(true);
        if (refresh) router.refresh();
      } catch {
        toast.error('Η διάταξη δεν αποθηκεύτηκε — δοκίμασε ξανά.');
      } finally {
        setSaving(false);
      }
    }, 450);
  }, [router]);

  const update = (next: Layout, refresh = false) => { setLayout(next); persist(next, refresh); };

  const reset = async () => {
    if (timer.current) clearTimeout(timer.current);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/dashboard/layout', { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { layout: Layout };
      setLayout(body.layout);
      setCustom(false);
      router.refresh();
      toast.success('Επαναφέρθηκε η προεπιλεγμένη διάταξη.');
    } catch {
      toast.error('Η επαναφορά απέτυχε.');
    } finally {
      setSaving(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) update(dropWidget(layout, String(active.id), String(over.id)));
  };
  const name = (id: string | number) => metaBy.get(String(id))?.title ?? String(id);
  const pos = (id: string | number) => visible.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Πιάστηκε το «${name(active.id)}», θέση ${pos(active.id)} από ${visible.length}.`,
    onDragOver: ({ active, over }) => (over ? `Το «${name(active.id)}» πάνω από τη θέση ${pos(over.id)}.` : `Το «${name(active.id)}» εκτός λίστας.`),
    onDragEnd: ({ active, over }) => (over ? `Το «${name(active.id)}» αφέθηκε στη θέση ${pos(over.id)}.` : `Το «${name(active.id)}» αφέθηκε.`),
    onDragCancel: ({ active }) => `Ακυρώθηκε η μετακίνηση του «${name(active.id)}».`,
  };

  return (
    <div className="dash-root space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-(length:--fs-12) text-muted-foreground">
          <FiMove aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />
          Σύρε από τη λαβή για να αλλάξεις θέση — ή Space και βελάκια.
          {saving ? ' Αποθήκευση…' : custom ? ' Η διάταξή σου αποθηκεύεται αυτόματα.' : ''}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(BTN, 'h-9 w-auto gap-1.5 border border-border bg-card px-3 text-(length:--fs-13) font-medium')} aria-label="Ρυθμίσεις αρχικής">
            <FiSliders aria-hidden className="size-4" /> Προσαρμογή
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Widgets ({visible.length}/{meta.length})</DropdownMenuLabel>
            {meta.map((m) => (
              <DropdownMenuCheckboxItem
                key={m.id}
                checked={!hidden.has(m.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(on) => update(setHidden(layout, m.id, !on), on === true && !nodes[m.id])}
              >
                {m.title}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.refresh()}><FiRefreshCw aria-hidden /> Ανανέωση δεδομένων</DropdownMenuItem>
            <DropdownMenuItem onSelect={reset} disabled={!custom}><FiRotateCcw aria-hidden /> Επαναφορά προεπιλογής</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {visible.length === 0 ? (
        <div className="cx-card grid place-items-center gap-2 p-10 text-center">
          <FiGrid aria-hidden className="size-6 text-muted-foreground" />
          <p className="text-(length:--fs-14) text-muted-foreground">
            {meta.length ? 'Έκρυψες όλα τα widgets. Άνοιξέ τα από το «Προσαρμογή».' : 'Δεν υπάρχουν widgets για τα δικαιώματά σου.'}
          </p>
        </div>
      ) : (
        <DndContext
          id="admin-home-grid"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: { draggable: 'Πάτησε Space για να πιάσεις το widget, βελάκια για μετακίνηση, Space για να το αφήσεις ή Escape για ακύρωση.' },
          }}
        >
          <SortableContext items={visible} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-12 gap-3">
              {visible.map((id, i) => {
                const m = metaBy.get(id)!;
                const size = sizeOf(layout, id);
                return (
                  <WidgetFrame
                    key={id} meta={m} icon={icons[id]} size={size} first={i === 0} last={i === visible.length - 1}
                    onMove={(to) => update(moveWidget(layout, id, to))}
                    onSize={(s) => update(setSize(layout, id, s))}
                    onHide={() => update(setHidden(layout, id, true))}
                  >
                    {nodes[id] ?? <WidgetSkeleton />}
                  </WidgetFrame>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function WidgetFrame({
  meta, icon, size, first, last, onMove, onSize, onHide, children,
}: {
  meta: WidgetMeta; icon: React.ReactNode; size: WidgetSize; first: boolean; last: boolean;
  onMove: (to: 'up' | 'down' | 'first' | 'last') => void; onSize: (s: WidgetSize) => void; onHide: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: meta.id });
  const headingId = `w-${meta.id}-title`;
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(SPAN[size], 'relative flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-fluent-2', isDragging && 'z-20 opacity-90 shadow-fluent-16 ring-2 ring-ring')}
    >
      <header className="flex items-start gap-1.5 px-3 pb-2 pt-2.5">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className={cn(BTN, '-ml-1 cursor-grab touch-none active:cursor-grabbing')}
          aria-label={`Μετακίνηση: ${meta.title}`}
          {...attributes}
          {...listeners}
        >
          <FiMove aria-hidden className="size-4" />
        </button>
        {icon && <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-(--cx-accent-soft) text-primary [&_svg]:size-3.5">{icon}</span>}
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 id={headingId} className="truncate text-(length:--fs-14) font-semibold tracking-tight text-foreground">
            {meta.href ? <Link href={meta.href} className="hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">{meta.title}</Link> : meta.title}
          </h2>
          <p className="truncate text-(length:--fs-12) text-muted-foreground">{meta.description}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className={BTN} aria-label={`Ενέργειες: ${meta.title}`}>
            <FiMoreVertical aria-hidden className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {meta.href && <DropdownMenuItem asChild><Link href={meta.href}><FiExternalLink aria-hidden /> Άνοιγμα σελίδας</Link></DropdownMenuItem>}
            <DropdownMenuItem disabled={first} onSelect={() => onMove('first')}><FiChevronsUp aria-hidden /> Πρώτο</DropdownMenuItem>
            <DropdownMenuItem disabled={first} onSelect={() => onMove('up')}><FiArrowUp aria-hidden /> Μια θέση πριν</DropdownMenuItem>
            <DropdownMenuItem disabled={last} onSelect={() => onMove('down')}><FiArrowDown aria-hidden /> Μια θέση μετά</DropdownMenuItem>
            <DropdownMenuItem disabled={last} onSelect={() => onMove('last')}><FiChevronsDown aria-hidden /> Τελευταίο</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><FiMaximize2 aria-hidden /> Μέγεθος</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={size} onValueChange={(v) => onSize(v as WidgetSize)}>
                  {WIDGET_SIZES.map((s) => <DropdownMenuRadioItem key={s} value={s}>{WIDGET_SIZE_LABEL[s]}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onHide}><FiEyeOff aria-hidden /> Απόκρυψη</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="min-w-0 flex-1 px-3 pb-3">{children}</div>
    </section>
  );
}

export function WidgetSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Φόρτωση…" className="animate-pulse space-y-2 py-1">
      <div className="h-6 w-1/3 rounded bg-muted" />
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-3.5 rounded bg-muted" style={{ width: `${90 - i * 12}%` }} />)}
    </div>
  );
}
