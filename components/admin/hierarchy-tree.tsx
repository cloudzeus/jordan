'use client';

// Ιεραρχία κατηγοριοποίησης (κωδικός ιεραρχίας SOHCODE): δέντρο με εσοχές, ανάπτυξη/σύμπτυξη, αναζήτηση σε
// κατηγορίες ΚΑΙ μέλη, κατάσταση στο SoftOne ανά κόμβο και πλήθη (ανατεθειμένα / σε πρόταση / για έλεγχο).
import * as React from 'react';
import { FiChevronRight, FiCheckCircle, FiCircle, FiMinusSquare, FiPlusSquare, FiSearch } from 'react-icons/fi';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { allIds, buildTree, filterTree, type TreeOf } from '@/lib/tree-view';
import type { ClassTree, TreeNode } from '@/lib/classification-trees';

type N = TreeOf<TreeNode>;
const MEMBER_PREVIEW = 40;
const fmt = (n: number) => n.toLocaleString('el-GR');

function Counts({ c, dim }: { c: N['total']; dim?: boolean }) {
  return (
    <span className={cn('flex shrink-0 items-center gap-2 text-[length:var(--fs-12)] tabular-nums', dim && 'opacity-70')}>
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
        <span title="Θέλουν έλεγχο" className="rounded-full bg-amber-100 px-1.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">{fmt(c.review)} έλεγχος</span>
      )}
      {c.applied + c.proposed === 0 && <span className="text-muted-foreground/50">—</span>}
    </span>
  );
}

function Row({ n, open, toggle, field }: { n: N; open: Set<number>; toggle: (id: number) => void; field: string }) {
  const hasKids = n.children.length > 0;
  const hasMembers = (n.members?.length ?? 0) > 0;
  const expandable = hasKids || hasMembers;
  const isOpen = open.has(n.id);
  return (
    <li>
      <div
        className={cn('group flex min-h-9 items-center gap-2 rounded-md py-1 pr-2 hover:bg-muted/50', n.depth === 0 && 'font-medium')}
        style={{ paddingLeft: `calc(${n.depth} * 1.25rem + 0.25rem)` }}
      >
        <button
          type="button" onClick={() => expandable && toggle(n.id)} disabled={!expandable}
          aria-expanded={expandable ? isOpen : undefined} aria-label={expandable ? (isOpen ? `Σύμπτυξη ${n.name}` : `Ανάπτυξη ${n.name}`) : undefined}
          className={cn('grid size-6 shrink-0 place-items-center rounded text-muted-foreground', expandable ? 'cursor-pointer hover:bg-muted hover:text-foreground' : 'opacity-0')}
        >
          <FiChevronRight aria-hidden className={cn('size-3.5 transition-transform motion-reduce:transition-none', isOpen && 'rotate-90')} />
        </button>
        <span className="w-14 shrink-0 font-mono text-[length:var(--fs-12)] text-muted-foreground">{n.soh}</span>
        <span className="shrink-0 rounded bg-sisyphus-50 px-1.5 font-mono text-[length:var(--fs-11)] text-sisyphus-600 dark:bg-sisyphus-500/15">{n.code}</span>
        <span className="min-w-0 flex-1 truncate" title={n.description ?? undefined}>{n.name}</span>
        {n.softoneId != null ? (
          <span title={`${field} = ${n.softoneId} στο SoftOne`} className="hidden shrink-0 rounded-full border border-emerald-300 px-1.5 text-[length:var(--fs-11)] text-emerald-700 sm:inline dark:border-emerald-800 dark:text-emerald-400">
            SoftOne #{n.softoneId}
          </span>
        ) : (
          <span title="Δεν έχει δημιουργηθεί ακόμα στο SoftOne" className="hidden shrink-0 rounded-full border border-dashed border-amber-400 px-1.5 text-[length:var(--fs-11)] text-amber-700 sm:inline dark:text-amber-300">
            μόνο εφαρμογή
          </span>
        )}
        <Counts c={hasKids ? n.total : n.counts} dim={hasKids} />
      </div>
      {isOpen && (
        <>
          {hasMembers && (
            <div className="pb-2" style={{ paddingLeft: `calc(${n.depth + 1} * 1.25rem + 2.25rem)` }}>
              <ul className="flex flex-wrap gap-1.5">
                {n.members!.slice(0, MEMBER_PREVIEW).map((m, i) => (
                  <li key={`${m.code}-${i}`} title={`${m.code} · ${m.status === 'APPLIED' ? 'ανατεθειμένο' : 'πρόταση'}${m.review ? ' · θέλει έλεγχο' : ''}`}
                    className={cn('max-w-[18rem] truncate rounded border px-1.5 py-0.5 text-[length:var(--fs-11)]',
                      m.status === 'APPLIED' ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-border bg-card',
                      m.review && 'border-amber-300')}>
                    {m.name}
                  </li>
                ))}
                {n.members!.length > MEMBER_PREVIEW && (
                  <li className="px-1.5 py-0.5 text-[length:var(--fs-11)] text-muted-foreground">+{fmt(n.members!.length - MEMBER_PREVIEW)} ακόμα — χρησιμοποίησε την αναζήτηση</li>
                )}
              </ul>
            </div>
          )}
          {hasKids && (
            <ul>
              {n.children.map((c) => <Row key={c.id} n={c} open={open} toggle={toggle} field={field} />)}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

export function HierarchyTree({ tree }: { tree: ClassTree }) {
  const full = React.useMemo(() => buildTree(tree.nodes), [tree.nodes]);
  const [q, setQ] = React.useState('');
  const dq = React.useDeferredValue(q);
  const shown = React.useMemo(() => filterTree(full, dq), [full, dq]);
  // Αρχικά ανοιχτά τα δύο πρώτα επίπεδα· με αναζήτηση ανοίγουν όλα τα αποτελέσματα.
  const [open, setOpen] = React.useState<Set<number>>(() => new Set(full.flatMap((n) => [n.id, ...n.children.filter((c) => c.children.length).map((c) => c.id)])));
  const effectiveOpen = dq.trim() ? new Set(allIds(shown)) : open;
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const total = full.reduce((a, n) => ({ applied: a.applied + n.total.applied, proposed: a.proposed + n.total.proposed, review: a.review + n.total.review }), { applied: 0, proposed: 0, review: 0 });
  const inSoftone = tree.nodes.filter((n) => n.softoneId != null).length;

  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[length:var(--fs-14)] font-semibold">{tree.subtitle}</h3>
          <p className="text-[length:var(--fs-11)] text-muted-foreground">
            SoftOne · <span className="font-mono">{tree.softoneField}</span> · {tree.nodes.length} κόμβοι, {inSoftone} στο SoftOne
          </p>
        </div>
        <Counts c={total} />
      </header>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <FiSearch aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input id={`ht-q-${tree.key}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση κατηγορίας ή μέλους…"
            className="h-8 pl-8 text-[length:var(--fs-13)]" aria-label={`Αναζήτηση στο δέντρο ${tree.subtitle}`} />
        </div>
        <button type="button" onClick={() => setOpen(new Set(allIds(full)))} title="Ανάπτυξη όλων"
          className="grid size-8 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground">
          <FiPlusSquare aria-hidden className="size-4" /><span className="sr-only">Ανάπτυξη όλων</span>
        </button>
        <button type="button" onClick={() => setOpen(new Set())} title="Σύμπτυξη όλων"
          className="grid size-8 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground">
          <FiMinusSquare aria-hidden className="size-4" /><span className="sr-only">Σύμπτυξη όλων</span>
        </button>
      </div>
      <div className="overflow-x-auto px-1 py-1.5">
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-[length:var(--fs-12)] text-muted-foreground">
            {tree.nodes.length === 0 ? 'Δεν έχει οριστεί ιεραρχία ακόμα.' : 'Κανένα αποτέλεσμα.'}
          </p>
        ) : (
          <ul className="min-w-[30rem]">
            {shown.map((n) => <Row key={n.id} n={n} open={effectiveOpen} toggle={toggle} field={tree.softoneField} />)}
          </ul>
        )}
      </div>
    </section>
  );
}
