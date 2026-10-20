'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiCopy, FiEdit2, FiLayers, FiMoreVertical, FiSearch, FiTrash2 } from 'react-icons/fi';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { RECIPE_KINDS, RECIPE_KIND_META, type RecipeKind } from '@/lib/install-recipes-core';
import type { RecipeView } from '@/lib/install-recipes';
import { CopyRecipeDialog } from './copy-recipe-dialog';
import { KindBadge, eur, num } from './recipe-ui';

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';

export function RecipesList({ recipes, canManage }: { recipes: RecipeView[]; canManage: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [kind, setKind] = React.useState<RecipeKind | 'ALL'>('ALL');
  const [copy, setCopy] = React.useState<RecipeView | null>(null);

  const s = q.trim().toLowerCase();
  const shown = recipes.filter((r) => (kind === 'ALL' || r.kind === kind)
    && (!s || [r.name, r.mtrlName, r.mtrlCode, r.description, ...r.lines.map((l) => l.name)].some((v) => v?.toLowerCase().includes(s))));

  const remove = async (r: RecipeView) => {
    if (!(await confirmAction({ message: `Διαγραφή της συνταγής «${r.name}»;\nΔεν αναιρείται. Τα αντίγραφά της δεν επηρεάζονται.`, destructive: true }))) return;
    const res = await fetch(`/api/admin/recipes/${r.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Η συνταγή διαγράφηκε'); router.refresh(); } else toast.error((await res.json().catch(() => ({}))).message ?? 'Η διαγραφή απέτυχε');
  };

  const tabs: { key: RecipeKind | 'ALL'; label: string; count: number }[] = [
    { key: 'ALL', label: 'Όλες', count: recipes.length },
    ...RECIPE_KINDS.map((k) => ({ key: k, label: RECIPE_KIND_META[k].plural, count: recipes.filter((r) => r.kind === k).length })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση: συνταγή, υλικό, κωδικός…" className="h-9 pl-8 text-(length:--fs-13)" aria-label="Αναζήτηση συνταγών" />
        </div>
        <div role="tablist" aria-label="Κατηγορία" className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={kind === t.key} onClick={() => setKind(t.key)}
              className={cn('min-h-9 shrink-0 cursor-pointer rounded-md px-3 text-(length:--fs-12) font-medium transition-colors', kind === t.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}>
              {t.label} <span className="tabular-nums opacity-60">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <FiLayers className="mx-auto mb-3 size-8 text-muted-foreground/60" aria-hidden />
          <p className="text-(length:--fs-14) font-medium">{recipes.length ? 'Καμία συνταγή με αυτά τα κριτήρια' : 'Δεν υπάρχουν ακόμη συνταγές'}</p>
          <p className="mt-1 text-(length:--fs-12) text-muted-foreground">
            {canManage ? 'Πατήστε «Νέα συνταγή»: υλικό, υλικά ανά m² με φύρα και εργατικό κόστος ανά m².' : 'Ο διαχειριστής δεν έχει δημιουργήσει ακόμη συνταγές.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {shown.map((r) => (
            <li key={r.id} className="group relative flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/40 sm:px-4">
              <Link href={`/admin/recipes/${r.id}`} className="absolute inset-0" aria-label={`Άνοιγμα συνταγής ${r.name}`} />
              <span className="hidden h-10 w-1 shrink-0 rounded-full sm:block" style={{ backgroundColor: RECIPE_KIND_META[r.kind].color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <KindBadge kind={r.kind} />
                  {r.copiedFrom && <span className="text-(length:--fs-11) text-muted-foreground">αντίγραφο από «{r.copiedFrom.name}»</span>}
                </div>
                <p className="mt-0.5 truncate text-(length:--fs-14) font-medium">{r.name}</p>
                <p className="truncate text-(length:--fs-12) text-muted-foreground">
                  {r.mtrlName ? `${r.mtrlCode} · ${r.mtrlName}` : 'Γενική συνταγή'} · {r.lines.length} υλικά · φύρα {num(r.wastePct, 2)}% · εργατικά {eur.format(r.laborCostPerSqm)}/m²
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-(length:--fs-15) font-semibold tabular-nums">{eur.format(r.cost.total)}</p>
                <p className="text-(length:--fs-11) text-muted-foreground">ανά m²</p>
              </div>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="relative z-10 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ενέργειες για «${r.name}»`}>
                    <FiMoreVertical className="size-4" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem className={ITEM} onSelect={() => router.push(`/admin/recipes/${r.id}`)}><FiEdit2 className="size-3.5" aria-hidden /> Επεξεργασία</DropdownMenuItem>
                    <DropdownMenuItem className={ITEM} onSelect={() => setCopy(r)}><FiCopy className="size-3.5" aria-hidden /> Αντιγραφή για ομοειδές…</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className={`${ITEM} text-destructive focus:text-destructive`} onSelect={() => void remove(r)}><FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή…</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}
      <CopyRecipeDialog recipe={copy} onClose={() => setCopy(null)} />
    </div>
  );
}
