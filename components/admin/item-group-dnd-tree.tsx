'use client';

// Επεξεργαστής ομάδων ειδών/υπηρεσιών: σύρε για αναδιάταξη ή για να κάνεις μια ομάδα υπο-ομάδα άλλης — ο
// κωδικός ιεραρχίας ξαναϋπολογίζεται μόνος. Κάθε ομάδα δείχνει σε μια εμπορική κατηγορία (προεπιλογή σε νέα
// είδη). Αναζήτηση σε ομάδες ΚΑΙ μέλη (read-only όσο ψάχνεις). ΟΛΑ στη βάση μας — τίποτα δεν γράφεται στο SoftOne.
import * as React from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, MeasuringStrategy,
  PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  FiChevronRight, FiLoader, FiCheck, FiPackage, FiTool, FiSearch, FiMoreVertical, FiLink, FiX,
  FiPlusSquare, FiMinusSquare, FiCheckCircle, FiCircle,
} from 'react-icons/fi';
import { LuGripVertical } from 'react-icons/lu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { INDENT, buildTree, flattenTree, getProjection, applyMove, flattenPositions, type DndFlat } from '@/lib/dnd-tree';
import type { ItemGroupBoard, ItemGroupBoardNode, CategoryOption } from '@/lib/classification-trees';

type Flat = DndFlat<ItemGroupBoardNode>;
const fmt = (n: number) => n.toLocaleString('el-GR');
const MEMBER_PREVIEW = 40;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('el');

// ── Μικρά κομμάτια σειράς ─────────────────────────────────────────────────────

function Counts({ c }: { c: ItemGroupBoardNode['counts'] }) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-(length:--fs-11) tabular-nums">
      {c.applied > 0 && (
        <span title="Ανατεθειμένα στο SoftOne" className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <FiCheckCircle aria-hidden className="size-3" />{fmt(c.applied)}
        </span>
      )}
      {c.proposed > 0 && (
        <span title="Σε πρόταση (μόνο στην εφαρμογή)" className="inline-flex items-center gap-1 text-muted-foreground">
          <FiCircle aria-hidden className="size-3" />{fmt(c.proposed)}
        </span>
      )}
      {c.review > 0 && (
        <span title="Θέλουν έλεγχο" className="rounded-full bg-amber-100 px-1.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">{fmt(c.review)}</span>
      )}
      {c.applied + c.proposed === 0 && <span className="text-muted-foreground/40">0</span>}
    </span>
  );
}

function SoftoneTag({ id }: { id: number | null }) {
  return id != null ? (
    <span title={`MTRGROUP = ${id} στο SoftOne`} className="hidden shrink-0 rounded-full border border-emerald-300 px-1.5 text-(length:--fs-11) text-emerald-700 sm:inline dark:border-emerald-800 dark:text-emerald-400">
      SoftOne #{id}
    </span>
  ) : (
    <span title="Δεν έχει δημιουργηθεί ακόμα στο SoftOne" className="hidden shrink-0 rounded-full border border-dashed border-amber-400 px-1.5 text-(length:--fs-11) text-amber-700 sm:inline dark:text-amber-300">
      μόνο εφαρμογή
    </span>
  );
}

/** ⋮ ενέργειες — σύνδεση εμπορικής κατηγορίας (ΤΟΠΙΚΟ, προεπιλογή σε νέα είδη). */
function RowActions({ node, options, onPick }: {
  node: ItemGroupBoardNode; options: CategoryOption[]; onPick: (code: number | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Ενέργειες για «${node.name}»`}
        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground/70 hover:bg-muted hover:text-foreground"
      >
        <FiMoreVertical aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center gap-1.5 text-(length:--fs-11) text-muted-foreground">
          <FiLink aria-hidden className="size-3" /> Εμπορική κατηγορία
        </DropdownMenuLabel>
        {options.length === 0 && (
          <p className="px-2 py-1.5 text-(length:--fs-11) text-muted-foreground">Καμία εμπορική κατηγορία ακόμα</p>
        )}
        {options.map((o) => (
          <DropdownMenuItem key={o.code} onSelect={() => onPick(o.code)} className="cursor-pointer justify-between gap-2 text-(length:--fs-12)">
            <span className="truncate">{o.name}</span>
            {node.categoryCode === o.code && <FiCheck aria-hidden className="size-3.5 shrink-0 text-emerald-600" />}
          </DropdownMenuItem>
        ))}
        {node.categoryCode != null && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onPick(null)} className="cursor-pointer gap-2 text-(length:--fs-12) text-muted-foreground">
              <FiX aria-hidden className="size-3.5" /> Καμία σύνδεση
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Το περιεχόμενο μιας σειράς, κοινό για DnD και στατική προβολή. */
function RowBody({ node, depth, childCount, collapsed, onToggle, options, onPick }: {
  node: ItemGroupBoardNode; depth: number; childCount: number; collapsed: boolean;
  onToggle?: () => void; options: CategoryOption[]; onPick?: (code: number | null) => void;
}) {
  const expandable = childCount > 0;
  return (
    <>
      <button
        type="button" onClick={onToggle} disabled={!expandable}
        aria-label={expandable ? (collapsed ? `Ανάπτυξη ${node.name}` : `Σύμπτυξη ${node.name}`) : undefined}
        className={cn('grid size-5 shrink-0 place-items-center rounded text-muted-foreground', expandable ? 'cursor-pointer hover:bg-muted hover:text-foreground' : 'opacity-0')}
      >
        <FiChevronRight aria-hidden className={cn('size-3 transition-transform motion-reduce:transition-none', !collapsed && expandable && 'rotate-90')} />
      </button>
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: node.color }} aria-hidden />
      <span className="w-10 shrink-0 font-mono text-(length:--fs-11) text-muted-foreground tabular-nums">{node.sohCode}</span>
      <span className="shrink-0 rounded bg-sisyphus-50 px-1 font-mono text-(length:--fs-11) text-sisyphus-600 dark:bg-sisyphus-500/15">{node.code}</span>
      <span className={cn('min-w-0 flex-1 truncate text-(length:--fs-13)', depth === 0 && 'font-medium')} title={node.description ?? undefined}>{node.name}</span>
      {node.categoryName ? (
        <span title={`Εμπορική κατηγορία: ${node.categoryName} — προεπιλογή σε νέα είδη (όχι στο SoftOne)`}
          className="hidden shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 text-(length:--fs-11) text-muted-foreground md:inline-flex">
          <span className="size-1.5 rounded-full bg-slate-400" aria-hidden />{node.categoryName}
        </span>
      ) : (
        <span className="hidden shrink-0 rounded-full border border-dashed border-border px-2 text-(length:--fs-11) text-muted-foreground/60 md:inline">+ εμπ. κατηγορία</span>
      )}
      <SoftoneTag id={node.softoneId} />
      <Counts c={node.counts} />
      {onPick && <RowActions node={node} options={options} onPick={onPick} />}
    </>
  );
}

// ── Σειρά DnD ─────────────────────────────────────────────────────────────────

function SortableRow({ item, collapsed, onToggle, options, onPick, isOverlay, projected }: {
  item: Flat; collapsed: boolean; onToggle: (id: string) => void; options: CategoryOption[];
  onPick: (id: string, code: number | null) => void; isOverlay?: boolean; projected?: { depth: number } | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isSorting } = useSortable({ id: item.id });
  const depth = projected ? projected.depth : item.depth;
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isSorting ? transition : undefined,
    paddingLeft: `calc(${depth} * ${INDENT}px + 0.5rem)`,
  };
  return (
    <li
      ref={setNodeRef} style={style}
      className={cn('group flex min-h-10 items-center gap-1.5 rounded-md pr-1.5',
        isDragging && !isOverlay && 'opacity-30',
        isOverlay && 'rounded-lg border border-primary/30 bg-card shadow-lg')}
    >
      <button
        type="button"
        className="inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
        aria-label={`Σύρε «${item.name}» για αλλαγή θέσης`} {...attributes} {...listeners}
      >
        <LuGripVertical className="size-3.5" aria-hidden />
      </button>
      <RowBody node={item} depth={item.depth} childCount={item.childCount} collapsed={collapsed}
        onToggle={() => item.childCount > 0 && onToggle(item.id)} options={options} onPick={(c) => onPick(item.id, c)} />
    </li>
  );
}

// ── Στατική σειρά (αναζήτηση / χωρίς δικαίωμα) ─────────────────────────────────

function StaticRow({ node, depth, childCount, collapsed, onToggle, options, onPick, canManage }: {
  node: ItemGroupBoardNode; depth: number; childCount: number; collapsed: boolean; onToggle: () => void;
  options: CategoryOption[]; onPick?: (id: string, code: number | null) => void; canManage: boolean;
}) {
  return (
    <li className="group flex min-h-10 items-center gap-1.5 rounded-md pr-1.5" style={{ paddingLeft: `calc(${depth} * ${INDENT}px + 0.5rem)` }}>
      <span className="inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground/25"><LuGripVertical className="size-3.5" aria-hidden /></span>
      <RowBody node={node} depth={depth} childCount={childCount} collapsed={collapsed} onToggle={onToggle} options={options}
        onPick={canManage && onPick ? (c) => onPick(node.id, c) : undefined} />
    </li>
  );
}

function Members({ node }: { node: ItemGroupBoardNode }) {
  if (!node.members.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5 pb-2" style={{ paddingLeft: `calc(${INDENT}px + 3.25rem)` }}>
      {node.members.slice(0, MEMBER_PREVIEW).map((m, i) => (
        <li key={`${m.code}-${i}`} title={`${m.code} · ${m.status === 'APPLIED' ? 'ανατεθειμένο' : 'πρόταση'}${m.review ? ' · θέλει έλεγχο' : ''}`}
          className={cn('max-w-[18rem] truncate rounded border px-1.5 py-0.5 text-(length:--fs-11)',
            m.status === 'APPLIED' ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-border bg-card',
            m.review && 'border-amber-300')}>
          {m.name}
        </li>
      ))}
      {node.members.length > MEMBER_PREVIEW && (
        <li className="px-1.5 py-0.5 text-(length:--fs-11) text-muted-foreground">+{fmt(node.members.length - MEMBER_PREVIEW)} ακόμα — χρησιμοποίησε την αναζήτηση</li>
      )}
    </ul>
  );
}

// ── Κύριο component ───────────────────────────────────────────────────────────

export function ItemGroupDndTree({ board, canManage }: { board: ItemGroupBoard; canManage: boolean }) {
  const [nodes, setNodes] = React.useState(board.nodes);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const [offsetX, setOffsetX] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [mounted, setMounted] = React.useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { setMounted(true); }, []);

  const dq = React.useDeferredValue(q);
  const searching = dq.trim().length > 0;

  const tree = React.useMemo(() => buildTree(nodes), [nodes]);
  const flat = React.useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);
  const ids = React.useMemo(() => flat.map((f) => f.id), [flat]);

  // Αναζήτηση: επίπεδη λίστα όσων ταιριάζουν (όνομα/σύντμηση/μέλος), κατά κωδικό ιεραρχίας.
  const matched = React.useMemo(() => {
    if (!searching) return [];
    const needle = fold(dq);
    return [...nodes]
      .filter((n) => fold(`${n.code} ${n.name}`).includes(needle) || n.members.some((m) => fold(`${m.code} ${m.name}`).includes(needle)))
      .sort((a, b) => a.sohCode.localeCompare(b.sohCode, undefined, { numeric: true }));
  }, [nodes, dq, searching]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const projected = activeId && overId ? getProjection(flat, activeId, overId, offsetX) : null;
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const handleDragEnd = async (e: DragEndEvent) => {
    const oid = overId; const proj = projected;
    setActiveId(null); setOverId(null); setOffsetX(0);
    if (!e.over || !oid || !proj || String(e.active.id) === oid) return;

    const newTree = applyMove(flat, String(e.active.id), oid, proj);
    const positions = flattenPositions(newTree);
    const sohById = new Map(positions.map((p) => [p.id, p.sohCode]));
    const orderIndex = new Map(positions.map((p, i) => [p.id, i]));
    const changed = positions.some((p) => nodes.find((n) => n.id === p.id)?.sohCode !== p.sohCode);
    if (!changed) return;

    const prev = nodes;
    const updated = nodes
      .map((n) => ({ ...n, sohCode: sohById.get(n.id) ?? n.sohCode }))
      .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
    setNodes(updated);

    setSaving(true);
    try {
      const res = await fetch('/api/admin/classifications/item-groups/reorder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: positions.map((p) => ({
          id: Number(p.id), sohCode: p.sohCode, parentId: p.parentId != null ? Number(p.parentId) : null, level: p.level, order: p.order,
        })) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.message ?? 'Η αναδιάταξη απέτυχε');
        setNodes(prev);
      } else { setDirty(true); }
    } catch {
      toast.error('Σφάλμα δικτύου — δοκίμασε ξανά');
      setNodes(prev);
    } finally { setSaving(false); }
  };

  const setCategory = async (id: string, code: number | null) => {
    const target = nodes.find((n) => n.id === id);
    if (!target || target.categoryCode === code) return;
    const prev = nodes;
    const name = code != null ? board.categoryOptions.find((o) => o.code === code)?.name ?? null : null;
    setNodes((s) => s.map((n) => (n.id === id ? { ...n, categoryCode: code, categoryName: name } : n)));
    try {
      const res = await fetch('/api/admin/classifications/item-groups/category', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(id), categoryCode: code }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.message ?? 'Η σύνδεση απέτυχε'); setNodes(prev); }
      else { setDirty(true); toast.success(code != null ? `Συνδέθηκε με «${name}»` : 'Αφαιρέθηκε η σύνδεση'); }
    } catch { toast.error('Σφάλμα δικτύου — δοκίμασε ξανά'); setNodes(prev); }
  };

  const activeItem = activeId ? flat.find((f) => f.id === activeId) : null;
  const SodIcon = board.sodtype === 52 ? FiTool : FiPackage;
  const canDnd = mounted && canManage && !searching;

  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <SodIcon className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="flex-1 text-(length:--fs-14) font-semibold">{board.label}</h3>
        {saving && <span className="inline-flex items-center gap-1.5 text-(length:--fs-11) text-muted-foreground"><FiLoader className="size-3 animate-spin" aria-hidden /> Αποθήκευση…</span>}
        {!saving && dirty && <span className="inline-flex items-center gap-1 text-(length:--fs-11) text-emerald-600"><FiCheck className="size-3" aria-hidden /> Ενημερωμένο</span>}
        <span className="text-(length:--fs-11) tabular-nums text-muted-foreground">{board.nodes.length} ομάδες</span>
      </header>

      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <FiSearch aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση ομάδας ή είδους" className="h-8 pl-8 text-(length:--fs-13)" aria-label={`Αναζήτηση στο ${board.label}`} />
        </div>
        <button type="button" onClick={() => setCollapsed(new Set())} title="Ανάπτυξη όλων" className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground">
          <FiPlusSquare aria-hidden className="size-4" /><span className="sr-only">Ανάπτυξη όλων</span>
        </button>
        <button type="button" onClick={() => setCollapsed(new Set(nodes.filter((n) => nodes.some((c) => c.sohCode.startsWith(`${n.sohCode}.`))).map((n) => n.id)))} title="Σύμπτυξη όλων" className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground">
          <FiMinusSquare aria-hidden className="size-4" /><span className="sr-only">Σύμπτυξη όλων</span>
        </button>
      </div>

      {nodes.length === 0 ? (
        <p className="px-3 py-8 text-center text-(length:--fs-12) text-muted-foreground">Δεν υπάρχουν ομάδες ακόμα.</p>
      ) : searching ? (
        matched.length === 0 ? (
          <p className="px-3 py-6 text-center text-(length:--fs-12) text-muted-foreground">Κανένα αποτέλεσμα.</p>
        ) : (
          <ul className="overflow-x-auto px-1 py-1">
            {matched.map((n) => (
              <React.Fragment key={n.id}>
                <StaticRow node={n} depth={0} childCount={0} collapsed onToggle={() => {}} options={board.categoryOptions} onPick={setCategory} canManage={canManage} />
                <Members node={n} />
              </React.Fragment>
            ))}
          </ul>
        )
      ) : !canDnd ? (
        <ul className="overflow-x-auto px-1 py-1">
          {flat.map((item) => (
            <StaticRow key={item.id} node={item} depth={item.depth} childCount={item.childCount} collapsed={collapsed.has(item.id)}
              onToggle={() => item.childCount > 0 && toggle(item.id)} options={board.categoryOptions} onPick={setCategory} canManage={canManage} />
          ))}
        </ul>
      ) : (
        <DndContext
          sensors={sensors} collisionDetection={closestCenter}
          onDragStart={(e: DragStartEvent) => { setActiveId(String(e.active.id)); setOverId(String(e.active.id)); setOffsetX(0); }}
          onDragMove={(e) => { setOffsetX(e.delta.x); if (e.over) setOverId(String(e.over.id)); }}
          onDragOver={(e) => { setOffsetX(e.delta.x); if (e.over) setOverId(String(e.over.id)); }}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setActiveId(null); setOverId(null); setOffsetX(0); }}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="overflow-x-auto px-1 py-1">
              {flat.map((item) => (
                <SortableRow key={item.id} item={item} collapsed={collapsed.has(item.id)} onToggle={toggle}
                  options={board.categoryOptions} onPick={setCategory} projected={activeId === item.id && projected ? projected : null} />
              ))}
            </ul>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeItem && (
              <ul className="pointer-events-none list-none">
                <SortableRow item={activeItem} collapsed={false} onToggle={() => {}} options={board.categoryOptions} onPick={() => {}} isOverlay projected={projected} />
              </ul>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </section>
  );
}
