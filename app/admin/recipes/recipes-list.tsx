'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  FiBox, FiChevronDown, FiCopy, FiDollarSign, FiEdit2, FiLayers, FiLoader,
  FiMoreVertical, FiPenTool, FiSave, FiSearch, FiSliders, FiTrash2,
} from 'react-icons/fi';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { RECIPE_KINDS, RECIPE_KIND_META, lineCostPerSqm, parseDecimal, toInput, type RecipeKind } from '@/lib/install-recipes-core';
import type { RecipeView } from '@/lib/install-recipes';
import { CopyRecipeDialog } from './copy-recipe-dialog';
import { KindBadge, eur, num } from './recipe-ui';
import { deleteRecipeAction, saveRecipeAction } from './actions';

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const field = 'h-8 w-[110px] tabular-nums text-right text-(length:--fs-13)';

export function RecipesList({ recipes, canManage }: { recipes: RecipeView[]; canManage: boolean }) {
  const [q, setQ] = React.useState('');
  const [kind, setKind] = React.useState<RecipeKind | 'ALL'>('ALL');
  const [copy, setCopy] = React.useState<RecipeView | null>(null);
  const [open, setOpen] = React.useState<Set<string>>(() => new Set());

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const s = q.trim().toLowerCase();
  const shown = recipes.filter((r) => (kind === 'ALL' || r.kind === kind)
    && (!s || [r.name, r.mtrlName, r.mtrlCode, r.description, ...r.lines.map((l) => l.name)].some((v) => v?.toLowerCase().includes(s))));

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
            {canManage ? 'Πατήστε «Νέα συνταγή»: ένας οδηγός βήμα-βήμα — υλικό, υλικά ανά m² με φύρα και εργατικό κόστος.' : 'Ο διαχειριστής δεν έχει δημιουργήσει ακόμη συνταγές.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {shown.map((r) => {
            const isOpen = open.has(r.id);
            return (
              <li key={r.id}>
                <div className="group relative flex items-center gap-2 px-2 py-2.5 transition-colors hover:bg-muted/40 sm:px-3">
                  <button
                    type="button" onClick={() => toggle(r.id)} aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                    aria-label={`${isOpen ? 'Σύμπτυξη' : 'Ανάπτυξη'} λεπτομερειών: ${r.name}`}
                  >
                    <FiChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-200', isOpen ? 'rotate-0' : '-rotate-90')} aria-hidden />
                    <span className="hidden h-10 w-1 shrink-0 rounded-full sm:block" style={{ backgroundColor: RECIPE_KIND_META[r.kind].color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <KindBadge kind={r.kind} />
                        {r.components.length > 0 && <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-(length:--fs-11) font-semibold text-violet-700">Σύνθετη · {r.components.length} στάδια</span>}
                        {r.copiedFrom && <span className="text-(length:--fs-11) text-muted-foreground">αντίγραφο από «{r.copiedFrom.name}»</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-(length:--fs-14) font-medium">{r.name}</span>
                      <span className="block truncate text-(length:--fs-12) text-muted-foreground">
                        {r.components.length > 0
                          ? r.components.map((c) => c.name).join(' → ')
                          : `${r.mtrlName ? `${r.mtrlCode} · ${r.mtrlName}` : 'Γενική συνταγή'} · ${r.lines.length} υλικά · φύρα ${num(r.wastePct, 2)}% · εργατικά ${eur.format(r.laborCostPerSqm)}/m²`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-(length:--fs-15) font-semibold tabular-nums">{eur.format(r.cost.total)}</span>
                      <span className="block text-(length:--fs-11) text-muted-foreground">ανά m²</span>
                    </span>
                  </button>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="relative z-10 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ενέργειες για «${r.name}»`}>
                        <FiMoreVertical className="size-4" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem className={ITEM} asChild><Link href={`/admin/recipes/${r.id}`}><FiEdit2 className="size-3.5" aria-hidden /> Πλήρης επεξεργασία</Link></DropdownMenuItem>
                        <DropdownMenuItem className={ITEM} onSelect={() => setCopy(r)}><FiCopy className="size-3.5" aria-hidden /> Αντιγραφή για ομοειδές…</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className={`${ITEM} text-destructive focus:text-destructive`} onSelect={() => void remove(r)}><FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή…</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {isOpen && <RecipeDetail recipe={r} canManage={canManage} onCopy={() => setCopy(r)} />}
              </li>
            );
          })}
        </ul>
      )}
      <CopyRecipeDialog recipe={copy} onClose={() => setCopy(null)} />
    </div>
  );
}

async function remove(r: RecipeView) {
  if (!(await confirmAction({ message: `Διαγραφή της συνταγής «${r.name}»;\nΔεν αναιρείται. Τα αντίγραφά της δεν επηρεάζονται.`, destructive: true }))) return;
  const res = await deleteRecipeAction(r.id);
  if (res.ok) toast.success('Η συνταγή διαγράφηκε'); else toast.error(res.message);
}

/** Αναπτυσσόμενη λεπτομέρεια: 3 καρτέλες — Υλικά, Κόστος, Γρήγορη Διόρθωση. */
function RecipeDetail({ recipe: r, canManage, onCopy }: { recipe: RecipeView; canManage: boolean; onCopy: () => void }) {
  const tone = RECIPE_KIND_META[r.kind].color;
  const isComposite = r.components.length > 0;
  const [tab, setTab] = React.useState<'materials' | 'cost' | 'edit'>('materials');

  const detailTabs: { key: typeof tab; label: string; icon: React.ReactNode }[] = [
    { key: 'materials', label: isComposite ? 'Στάδια' : 'Υλικά ανά m²', icon: <FiBox className="size-3.5" aria-hidden /> },
    { key: 'cost', label: 'Ανάλυση κόστους', icon: <FiDollarSign className="size-3.5" aria-hidden /> },
    ...(canManage && !isComposite ? [{ key: 'edit' as const, label: 'Γρήγορη διόρθωση', icon: <FiPenTool className="size-3.5" aria-hidden /> }] : []),
  ];

  return (
    <div className="border-t border-dashed border-border bg-muted/20 px-3 pb-4 pt-3 sm:pl-12">
      {/* Tab navigation */}
      <div className="mb-3 flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Λεπτομέρειες συνταγής">
        {detailTabs.map((t) => (
          <button key={t.key} role="tab" type="button" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-(length:--fs-12) font-medium transition-colors',
              tab === t.key ? 'bg-foreground text-background shadow-xs' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Materials tab */}
      {tab === 'materials' && (
        <div className="rounded-lg border border-border bg-card p-3">
          {isComposite ? (
            <ul className="divide-y divide-border">
              {r.components.map((c, i) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-(length:--fs-12)">
                  <span className="min-w-0 flex-1">
                    <span className="mr-2 inline-flex size-5 items-center justify-center rounded bg-foreground text-(length:--fs-10) font-bold text-background">{i + 1}</span>
                    {c.name}
                    <span className="ml-1.5 text-muted-foreground">· {RECIPE_KIND_META[c.kind].label}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums" style={{ color: RECIPE_KIND_META[c.kind].color }}>{eur.format(c.cost.total)}/m²</span>
                </li>
              ))}
            </ul>
          ) : r.lines.length ? (
            <>
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_90px_90px] gap-1 text-(length:--fs-10) font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Υλικό</span>
                <span className="text-right">Ποσότητα/m²</span>
                <span className="text-right">Κόστος/m²</span>
              </div>
              <ul className="divide-y divide-border">
                {r.lines.map((l) => (
                  <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_90px_90px] items-center gap-1 py-1.5 text-(length:--fs-12)">
                    <span className="min-w-0 truncate">{l.name}</span>
                    <span className="text-right tabular-nums text-muted-foreground">{num(l.qtyPerSqm)}{l.unit ? ` ${l.unit}` : ''}{l.wastePct ? <span className="text-(length:--fs-10)"> +{num(l.wastePct, 1)}%</span> : ''}</span>
                    <span className="text-right tabular-nums font-medium">{eur.format(lineCostPerSqm(l))}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="py-2 text-(length:--fs-12) text-muted-foreground">Χωρίς βοηθητικά υλικά.</p>}
          {r.description && <p className="mt-2 border-t border-border pt-2 text-(length:--fs-12) italic text-muted-foreground">{r.description}</p>}
        </div>
      )}

      {/* Cost tab */}
      {tab === 'cost' && (
        <div className="rounded-lg border border-border bg-card p-3">
          <dl className="space-y-1.5 text-(length:--fs-13)">
            {isComposite ? (<>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Υλικά (στάδια)</dt><dd className="tabular-nums font-medium">{eur.format(r.cost.material + r.cost.accessories)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Εργατικά (στάδια)</dt><dd className="tabular-nums font-medium">{eur.format(r.cost.labor)}</dd></div>
            </>) : (<>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Κύριο υλικό{r.wastePct ? ` (+${num(r.wastePct, 2)}%)` : ''}</dt><dd className="tabular-nums font-medium">{eur.format(r.cost.material)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Βοηθητικά υλικά</dt><dd className="tabular-nums font-medium">{eur.format(r.cost.accessories)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Εργατικά</dt><dd className="tabular-nums font-medium">{eur.format(r.cost.labor)}</dd></div>
            </>)}
            <div className="flex justify-between gap-2 border-t border-border pt-2 text-(length:--fs-15) font-semibold" style={{ color: tone }}><dt>Σύνολο</dt><dd className="tabular-nums">{eur.format(r.cost.total)}</dd></div>
          </dl>
          {!isComposite && !r.labor && r.laborCostPerSqm > 0 && <p className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-(length:--fs-11) text-amber-900">⚠ Χωρίς υπηρεσία εργατικών — δεν περνούν στον προϋπολογισμό έργου.</p>}
        </div>
      )}

      {/* Quick edit tab */}
      {tab === 'edit' && canManage && !isComposite && <QuickEdit recipe={r} tone={tone} onDone={() => setTab('materials')} />}

      {/* Action buttons */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" className="h-8 gap-1.5 text-(length:--fs-12)"><Link href={`/admin/recipes/${r.id}`}><FiEdit2 className="size-3.5" aria-hidden /> {isComposite ? 'Επεξεργασία σταδίων' : 'Πλήρης επεξεργασία'}</Link></Button>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-(length:--fs-12)" onClick={onCopy}><FiCopy className="size-3.5" aria-hidden /> Αντιγραφή{isComposite ? '' : ' για ομοειδές'}</Button>
      </div>
    </div>
  );
}

/** Γρήγορη διόρθωση τιμής/φύρας/εργατικών χωρίς να φύγεις από τη λίστα. */
function QuickEdit({ recipe: r, tone, onDone }: { recipe: RecipeView; tone: string; onDone: () => void }) {
  const [price, setPrice] = React.useState(toInput(r.materialPrice));
  const [waste, setWaste] = React.useState(toInput(r.wastePct, 2));
  const [labor, setLabor] = React.useState(toInput(r.laborCostPerSqm));
  const [busy, setBusy] = React.useState(false);

  const priceN = parseDecimal(price), wasteN = parseDecimal(waste), laborN = parseDecimal(labor);
  const invalid = !Number.isFinite(priceN) || priceN < 0 || !Number.isFinite(wasteN) || wasteN < 0 || wasteN > 100 || !Number.isFinite(laborN) || laborN < 0;

  const save = async () => {
    if (invalid) return;
    setBusy(true);
    try {
      const res = await saveRecipeAction(r.id, {
        name: r.name, kind: r.kind, description: r.description, mtrl: r.mtrl,
        materialPrice: priceN, wastePct: wasteN, laborCostPerSqm: laborN, laborMtrl: r.labor?.mtrl ?? null,
        lines: r.lines.map((l) => ({ mtrl: l.mtrl, qtyPerSqm: l.qtyPerSqm, wastePct: l.wastePct, unitPrice: l.unitPrice, notes: l.notes })),
      });
      if (!res.ok) throw new Error(res.message);
      toast.success('Η συνταγή ενημερώθηκε');
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-3 flex items-center gap-1.5 text-(length:--fs-12) font-medium text-foreground">
        <FiSliders className="size-3.5" aria-hidden /> Αλλαγή τιμών — τα υλικά ανά m² δεν αλλάζουν εδώ
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor={`qe-p-${r.id}`} className="mb-1 block text-(length:--fs-11) text-muted-foreground">Τιμή υλικού (€/m²)</Label>
          <Input id={`qe-p-${r.id}`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={field} />
        </div>
        <div>
          <Label htmlFor={`qe-w-${r.id}`} className="mb-1 block text-(length:--fs-11) text-muted-foreground">Φύρα (%)</Label>
          <Input id={`qe-w-${r.id}`} inputMode="decimal" value={waste} onChange={(e) => setWaste(e.target.value)} className={field} />
        </div>
        <div>
          <Label htmlFor={`qe-l-${r.id}`} className="mb-1 block text-(length:--fs-11) text-muted-foreground">Εργατικά (€/m²)</Label>
          <Input id={`qe-l-${r.id}`} inputMode="decimal" value={labor} onChange={(e) => setLabor(e.target.value)} className={field} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-(length:--fs-12)" onClick={onDone} disabled={busy}>Άκυρο</Button>
          <Button type="button" size="sm" className="h-8 gap-1.5 text-(length:--fs-12) text-white hover:opacity-90" style={{ backgroundColor: tone }} onClick={() => void save()} disabled={busy || invalid}>
            {busy ? <FiLoader className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <FiSave className="size-3.5" aria-hidden />} Αποθήκευση
          </Button>
        </div>
      </div>
    </div>
  );
}
