'use client';

import * as React from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, MeasuringStrategy,
  PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FiChevronRight, FiLoader, FiCheck, FiPackage, FiTool } from 'react-icons/fi';
import { LuGripVertical } from 'react-icons/lu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { CatHierarchy, CatHierarchyNode } from '@/lib/category-hierarchy';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TreeItem extends CatHierarchyNode {
  children: TreeItem[];
  depth: number;
  parentId: string | null;
}

interface FlatItem {
  id: string;
  sodtype: number;
  code: number;
  shortCode: string | null;
  name: string;
  sohCode: string;
  isActive: boolean;
  itemCount: number;
  depth: number;
  parentId: string | null;
  childCount: number;
}

// ── Tree utilities ─────────────────────────────────────────────────────────────

const INDENT = 28;

function parentSoh(soh: string): string | null {
  const i = soh.lastIndexOf('.');
  return i > 0 ? soh.slice(0, i) : null;
}

function buildTree(nodes: CatHierarchyNode[]): TreeItem[] {
  const byId = new Map<string, TreeItem>();
  const bySoh = new Map<string, TreeItem>();
  for (const n of nodes) {
    const item: TreeItem = { ...n, children: [], depth: 0, parentId: null };
    byId.set(n.id, item);
    bySoh.set(n.sohCode, item);
  }
  const roots: TreeItem[] = [];
  for (const item of byId.values()) {
    const ps = parentSoh(item.sohCode);
    const parent = ps ? bySoh.get(ps) : null;
    if (parent) {
      item.parentId = parent.id;
      item.depth = parent.depth + 1;
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  }
  const setDepth = (items: TreeItem[], d: number) => {
    for (const i of items) { i.depth = d; setDepth(i.children, d + 1); }
  };
  setDepth(roots, 0);
  return roots;
}

function flattenTree(items: TreeItem[], collapsed: Set<string>): FlatItem[] {
  const out: FlatItem[] = [];
  const walk = (list: TreeItem[]) => {
    for (const item of list) {
      out.push({
        id: item.id, sodtype: item.sodtype, code: item.code, shortCode: item.shortCode,
        name: item.name, sohCode: item.sohCode, isActive: item.isActive, itemCount: item.itemCount,
        depth: item.depth, parentId: item.parentId, childCount: item.children.length,
      });
      if (!collapsed.has(item.id)) walk(item.children);
    }
  };
  walk(items);
  return out;
}

function getProjection(
  flatItems: FlatItem[],
  activeId: string,
  overId: string,
  dragOffsetX: number,
): { depth: number; parentId: string | null } {
  const itemsWithoutActive = flatItems.filter((i) => i.id !== activeId);
  const overIndex = itemsWithoutActive.findIndex((i) => i.id === overId);
  if (overIndex < 0) return { depth: 0, parentId: null };

  const activeItem = flatItems.find((i) => i.id === activeId);
  const projectedDepth = (activeItem?.depth ?? 0) + Math.round(dragOffsetX / INDENT);
  const prevItem = itemsWithoutActive[overIndex - 1];
  const maxDepth = prevItem ? prevItem.depth + 1 : 0;
  const nextItem = itemsWithoutActive[overIndex];
  const minDepth = nextItem ? nextItem.depth : 0;

  let depth = Math.max(minDepth, Math.min(projectedDepth, maxDepth));
  depth = Math.max(0, depth);

  let parentId: string | null = null;
  if (depth > 0) {
    for (let i = overIndex - 1; i >= 0; i--) {
      if (itemsWithoutActive[i].depth === depth - 1) {
        parentId = itemsWithoutActive[i].id;
        break;
      }
    }
  }
  return { depth, parentId };
}

function rebuildSohCodes(tree: TreeItem[], prefix = ''): { id: string; sohCode: string }[] {
  const out: { id: string; sohCode: string }[] = [];
  tree.forEach((item, idx) => {
    const seg = String(idx + 1).padStart(prefix ? 2 : 1, '0');
    const soh = prefix ? `${prefix}.${seg}` : seg;
    out.push({ id: item.id, sohCode: soh });
    out.push(...rebuildSohCodes(item.children, soh));
  });
  return out;
}

function applyMove(
  flatItems: FlatItem[],
  activeId: string,
  overId: string,
  projection: { depth: number; parentId: string | null },
): TreeItem[] {
  const allNodes = flatItems.map((f): CatHierarchyNode => ({
    id: f.id, sodtype: f.sodtype, code: f.code, shortCode: f.shortCode,
    name: f.name, sohCode: f.sohCode, isActive: f.isActive, itemCount: f.itemCount,
  }));
  const tree = buildTree(allNodes);

  const removeFromTree = (items: TreeItem[]): TreeItem | null => {
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === activeId) return items.splice(i, 1)[0];
      const found = removeFromTree(items[i].children);
      if (found) return found;
    }
    return null;
  };
  const active = removeFromTree(tree);
  if (!active) return tree;

  const insertInto = (items: TreeItem[], parentId: string | null): boolean => {
    if (parentId === null) {
      const overIdx = items.findIndex((i) => i.id === overId);
      const idx = overIdx >= 0 ? overIdx : items.length;
      items.splice(idx, 0, active);
      return true;
    }
    for (const item of items) {
      if (item.id === parentId) {
        const overIdx = item.children.findIndex((i) => i.id === overId);
        const idx = overIdx >= 0 ? overIdx : item.children.length;
        item.children.splice(idx, 0, active);
        return true;
      }
      if (insertInto(item.children, parentId)) return true;
    }
    return false;
  };
  if (!insertInto(tree, projection.parentId)) {
    tree.push(active);
  }
  return tree;
}

// ── Row component ──────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('el-GR');

function SortableRow({
  item, collapsed, onToggle, isOverlay, projected,
}: {
  item: FlatItem;
  collapsed: boolean;
  onToggle: (id: string) => void;
  isOverlay?: boolean;
  projected?: { depth: number } | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isSorting } = useSortable({ id: item.id });
  const depth = projected ? projected.depth : item.depth;
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isSorting ? transition : undefined,
    paddingLeft: `calc(${depth} * ${INDENT}px + 0.5rem)`,
    ...(isOverlay ? {} : {}),
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex min-h-10 items-center gap-1.5 rounded-md pr-2',
        isDragging && !isOverlay && 'opacity-30',
        isOverlay && 'rounded-lg border border-primary/30 bg-card shadow-lg',
      )}
    >
      <button
        type="button"
        className="inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
        aria-label={`Σύρε «${item.name}» για αλλαγή θέσης`}
        {...attributes}
        {...listeners}
      >
        <LuGripVertical className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => item.childCount > 0 && onToggle(item.id)}
        disabled={item.childCount === 0}
        className={cn('grid size-5 shrink-0 place-items-center rounded text-muted-foreground', item.childCount > 0 ? 'cursor-pointer hover:bg-muted hover:text-foreground' : 'opacity-0')}
      >
        <FiChevronRight aria-hidden className={cn('size-3 transition-transform motion-reduce:transition-none', !collapsed && item.childCount > 0 && 'rotate-90')} />
      </button>
      <span className="w-12 shrink-0 font-mono text-(length:--fs-11) text-muted-foreground tabular-nums">{item.sohCode}</span>
      {item.shortCode && (
        <span className="shrink-0 rounded bg-sisyphus-50 px-1 font-mono text-(length:--fs-11) text-sisyphus-600 dark:bg-sisyphus-500/15">{item.shortCode}</span>
      )}
      <span className={cn('min-w-0 flex-1 truncate text-(length:--fs-13)', item.depth === 0 && 'font-medium')}>{item.name}</span>
      <span className="shrink-0 text-(length:--fs-11) tabular-nums text-muted-foreground" title={`${item.itemCount} ${item.sodtype === 52 ? 'υπηρεσίες' : 'είδη'}`}>
        {item.itemCount > 0 ? fmt(item.itemCount) : <span className="opacity-40">0</span>}
      </span>
    </li>
  );
}

// ── Static row (no DnD – read-only fallback) ───────────────────────────────────

function StaticRow({ item, collapsed, onToggle }: { item: FlatItem; collapsed: boolean; onToggle: (id: string) => void }) {
  return (
    <li
      className="group flex min-h-10 items-center gap-1.5 rounded-md pr-2"
      style={{ paddingLeft: `calc(${item.depth} * ${INDENT}px + 0.5rem)` }}
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground/30">
        <LuGripVertical className="size-3.5" aria-hidden />
      </span>
      <button
        type="button"
        onClick={() => item.childCount > 0 && onToggle(item.id)}
        disabled={item.childCount === 0}
        className={cn('grid size-5 shrink-0 place-items-center rounded text-muted-foreground', item.childCount > 0 ? 'cursor-pointer hover:bg-muted hover:text-foreground' : 'opacity-0')}
      >
        <FiChevronRight aria-hidden className={cn('size-3 transition-transform motion-reduce:transition-none', !collapsed && item.childCount > 0 && 'rotate-90')} />
      </button>
      <span className="w-12 shrink-0 font-mono text-(length:--fs-11) text-muted-foreground tabular-nums">{item.sohCode}</span>
      {item.shortCode && (
        <span className="shrink-0 rounded bg-sisyphus-50 px-1 font-mono text-(length:--fs-11) text-sisyphus-600 dark:bg-sisyphus-500/15">{item.shortCode}</span>
      )}
      <span className={cn('min-w-0 flex-1 truncate text-(length:--fs-13)', item.depth === 0 && 'font-medium')}>{item.name}</span>
      <span className="shrink-0 text-(length:--fs-11) tabular-nums text-muted-foreground">
        {item.itemCount > 0 ? fmt(item.itemCount) : <span className="opacity-40">0</span>}
      </span>
    </li>
  );
}

// ── Main tree component ────────────────────────────────────────────────────────

export function CategoryDndTree({ hierarchy, canManage }: { hierarchy: CatHierarchy; canManage: boolean }) {
  const [nodes, setNodes] = React.useState(hierarchy.nodes);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const [offsetX, setOffsetX] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { setMounted(true); }, []);

  const tree = React.useMemo(() => buildTree(nodes), [nodes]);
  const flat = React.useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);
  const ids = React.useMemo(() => flat.map((f) => f.id), [flat]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const projected = activeId && overId
    ? getProjection(flat, activeId, overId, offsetX)
    : null;

  const toggle = (id: string) => setCollapsed((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setOverId(String(e.active.id));
    setOffsetX(0);
  };

  const handleDragMove = (e: { delta: { x: number }; over: { id: string | number } | null }) => {
    setOffsetX(e.delta.x);
    if (e.over) setOverId(String(e.over.id));
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const oid = overId;
    const proj = projected;
    setActiveId(null);
    setOverId(null);
    setOffsetX(0);
    if (!e.over || !oid || !proj || String(e.active.id) === oid) return;

    const newTree = applyMove(flat, String(e.active.id), oid, proj);
    const newCodes = rebuildSohCodes(newTree);

    const changed = newCodes.filter((nc) => {
      const orig = nodes.find((n) => n.id === nc.id);
      return orig && orig.sohCode !== nc.sohCode;
    });
    if (!changed.length) return;

    const updated = nodes.map((n) => {
      const nc = newCodes.find((c) => c.id === n.id);
      return nc ? { ...n, sohCode: nc.sohCode } : n;
    });
    setNodes(updated);

    setSaving(true);
    try {
      const updates = changed.map((c) => {
        const [s, cd] = c.id.split(':').map(Number);
        return { sodtype: s as 51 | 52, code: cd, sohCode: c.sohCode };
      });
      const res = await fetch('/api/admin/classifications/categories/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) {
        toast.error(d.message ?? 'Η αναδιάταξη απέτυχε');
        setNodes(hierarchy.nodes);
      } else if (res.status === 207) {
        toast.warning(`${d.results?.filter((r: { ok: boolean }) => !r.ok).length} κατηγορίες δεν ενημερώθηκαν στο SoftOne`);
      } else {
        toast.success(`Ενημερώθηκαν ${changed.length} κωδικοί ιεραρχίας`);
      }
    } catch {
      toast.error('Σφάλμα δικτύου — δοκίμασε ξανά');
      setNodes(hierarchy.nodes);
    } finally {
      setSaving(false);
    }
  };

  const activeItem = activeId ? flat.find((f) => f.id === activeId) : null;
  const SodIcon = hierarchy.sodtype === 52 ? FiTool : FiPackage;

  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <SodIcon className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="flex-1 text-(length:--fs-14) font-semibold">{hierarchy.label}</h3>
        {saving && (
          <span className="inline-flex items-center gap-1.5 text-(length:--fs-11) text-muted-foreground">
            <FiLoader className="size-3 animate-spin" aria-hidden /> Αποθήκευση…
          </span>
        )}
        {!saving && nodes !== hierarchy.nodes && (
          <span className="inline-flex items-center gap-1 text-(length:--fs-11) text-emerald-600">
            <FiCheck className="size-3" aria-hidden /> Ενημερωμένο
          </span>
        )}
        <span className="text-(length:--fs-11) tabular-nums text-muted-foreground">{hierarchy.nodes.length} κατηγορίες</span>
      </header>

      {hierarchy.nodes.length === 0 ? (
        <p className="px-3 py-8 text-center text-(length:--fs-12) text-muted-foreground">Δεν υπάρχουν ενεργές κατηγορίες.</p>
      ) : !mounted || !canManage ? (
        <ul className="overflow-x-auto px-1 py-1">
          {flat.map((item) => (
            <StaticRow key={item.id} item={item} collapsed={collapsed.has(item.id)} onToggle={toggle} />
          ))}
        </ul>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragOver={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setActiveId(null); setOverId(null); setOffsetX(0); }}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="overflow-x-auto px-1 py-1">
              {flat.map((item) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  collapsed={collapsed.has(item.id)}
                  onToggle={toggle}
                  projected={activeId === item.id && projected ? projected : null}
                />
              ))}
            </ul>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeItem && (
              <ul className="pointer-events-none list-none">
                <SortableRow item={activeItem} collapsed={false} onToggle={() => {}} isOverlay projected={projected} />
              </ul>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </section>
  );
}
