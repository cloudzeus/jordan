'use client';

import * as React from 'react';
import Link from 'next/link';
import { FiAlertTriangle, FiLayers, FiLoader, FiTool, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RegistrySearch } from '@/components/admin/registry-search';
import { RECIPE_KIND_META, parseDecimal, recipeForArea } from '@/lib/install-recipes-core';
import type { RecipeView } from '@/lib/install-recipes';
import { emitProjectRefresh } from './project-events';

const TONE = '#4338CA';
const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const qtyFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 3 });

/** Η μονάδα του κύριου υλικού μοιάζει με τετραγωνικά; Αλλιώς η ποσότητα (σε m²) θέλει έλεγχο. */
const isSqmUnit = (u: string | null) => !u || /m2|m²|τ\.?\s?μ|τετρ/i.test(u);

type Labor = { mtrl: number; code: string; name: string } | null;

/**
 * «Προσθήκη από συνταγή»: συνταγή τοποθέτησης + τετραγωνικά → γραμμές στον ΠΡΟΫΠΟΛΟΓΙΣΜΟ του
 * έργου (κύριο υλικό, βοηθητικά υλικά με φύρα, εργατικά ως υπηρεσία). Μόνο δική μας βάση.
 */
export function ApplyRecipeDialog({ open, onOpenChange, prjc, projectLabel }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prjc: number;
  projectLabel: string;
}) {
  const [recipes, setRecipes] = React.useState<RecipeView[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [recipeId, setRecipeId] = React.useState('');
  const [sqm, setSqm] = React.useState('');
  const [labor, setLabor] = React.useState<Labor>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setRecipeId(''); setSqm(''); setLabor(null); setError(null);
    let ignore = false;
    setLoadError(null);
    fetch('/api/admin/recipes', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 403) throw new Error('Δεν έχετε δικαίωμα προβολής συνταγών (recipes.read).');
        if (!res.ok) throw new Error('Οι συνταγές δεν φορτώθηκαν — δοκιμάστε ξανά.');
        return (await res.json()).recipes as RecipeView[];
      })
      .then((r) => { if (!ignore) setRecipes(r); })
      .catch((e: Error) => { if (!ignore) setLoadError(e.message); });
    return () => { ignore = true; };
  }, [open]);

  const recipe = recipes?.find((r) => r.id === recipeId) ?? null;
  const choose = (id: string) => {
    setRecipeId(id);
    setLabor(recipes?.find((r) => r.id === id)?.labor ?? null);
  };

  const sqmN = parseDecimal(sqm);
  const sqmOk = Number.isFinite(sqmN) && sqmN > 0;
  const preview = recipe && sqmOk ? recipeForArea({ ...recipe, lines: recipe.lines }, sqmN) : null;
  // Οι γραμμές που θα γραφτούν πραγματικά: το κύριο υλικό μόνο αν η συνταγή έχει είδος, τα εργατικά μόνο με υπηρεσία.
  const rows = preview && recipe ? [
    ...(recipe.mtrl ? [preview.rows[0]] : []),
    ...preview.rows.slice(1),
    ...(labor && recipe.laborCostPerSqm > 0 ? [{ key: 'labor', name: labor.name, unit: 'm²', qty: sqmN, cost: preview.labor }] : []),
  ] : [];
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const laborSkipped = !!recipe && recipe.laborCostPerSqm > 0 && !labor;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipe || !sqmOk) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${prjc}/budget/recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: recipe.id, sqm: sqmN, laborMtrl: labor?.mtrl ?? null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Αποτυχία προσθήκης');
      toast.success(`Προστέθηκαν ${body.lines} γραμμές από «${recipe.name}» (${eur.format(body.value)})`);
      emitProjectRefresh(prjc, 'budget');
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader className="px-5 pt-4 pb-3">
            <DialogTitle className="text-[length:var(--fs-16)]">Προσθήκη από συνταγή</DialogTitle>
            <DialogDescription className="text-[length:var(--fs-12)]">
              Έργο <span className="font-medium text-foreground">{projectLabel}</span>. Τα υλικά και τα εργατικά της συνταγής μπαίνουν στον προϋπολογισμό — το SoftOne δεν αλλάζει.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {loadError ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)] text-destructive">{loadError}</p>
            ) : !recipes ? (
              <p className="flex items-center gap-2 text-[length:var(--fs-12)] text-muted-foreground"><FiLoader className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Φόρτωση συνταγών…</p>
            ) : recipes.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-6 text-center text-[length:var(--fs-12)] text-muted-foreground">
                <FiLayers className="mx-auto mb-2 size-6 opacity-60" aria-hidden />
                Δεν υπάρχουν συνταγές. <Link href="/admin/recipes/new" className="font-medium text-foreground underline">Δημιουργία συνταγής</Link>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                  <div>
                    <Label htmlFor="apply-recipe" className="mb-1 block text-[length:var(--fs-12)]">Συνταγή <span className="text-destructive">*</span></Label>
                    <select
                      id="apply-recipe" value={recipeId} onChange={(e) => choose(e.target.value)}
                      className="h-9 w-full cursor-pointer rounded-lg border border-input bg-background px-2 text-[length:var(--fs-13)] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">— Διαλέξτε —</option>
                      {(['TILE', 'STONE', 'CEMENT_MORTAR'] as const).map((k) => {
                        const group = recipes.filter((r) => r.kind === k);
                        return group.length ? (
                          <optgroup key={k} label={RECIPE_KIND_META[k].plural}>
                            {group.map((r) => <option key={r.id} value={r.id}>{r.name} · {eur.format(r.cost.total)}/m²</option>)}
                          </optgroup>
                        ) : null;
                      })}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="apply-sqm" className="mb-1 block text-[length:var(--fs-12)]">Τετραγωνικά (m²) <span className="text-destructive">*</span></Label>
                    <Input id="apply-sqm" inputMode="decimal" autoComplete="off" value={sqm} onChange={(e) => setSqm(e.target.value)} placeholder="π.χ. 85" className="tabular-nums" aria-invalid={sqm.trim() !== '' && !sqmOk} />
                  </div>
                </div>

                {recipe && recipe.laborCostPerSqm > 0 && (
                  <div>
                    <Label htmlFor="apply-labor" className="mb-1 block text-[length:var(--fs-12)]">Υπηρεσία εργατικών ({eur.format(recipe.laborCostPerSqm)}/m²)</Label>
                    {labor ? (
                      <div className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
                        <FiTool className="size-4 shrink-0" style={{ color: '#7C3AED' }} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[length:var(--fs-13)] font-medium">{labor.name}</p>
                          <p className="font-mono text-[length:var(--fs-11)] text-muted-foreground">{labor.code}</p>
                        </div>
                        <button type="button" onClick={() => setLabor(null)} className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Χωρίς εργατικά / αλλαγή υπηρεσίας">
                          <FiX className="size-4" aria-hidden />
                        </button>
                      </div>
                    ) : (
                      <RegistrySearch id="apply-labor" kind="service" onPick={(p) => setLabor({ mtrl: p.id, code: p.code, name: p.name })} label="" />
                    )}
                    {laborSkipped && <p className="mt-1 text-[length:var(--fs-11)] text-amber-700 dark:text-amber-400">Χωρίς υπηρεσία τα εργατικά δεν μπαίνουν στον προϋπολογισμό.</p>}
                  </div>
                )}

                {recipe && !isSqmUnit(recipe.mtrlUnit) && (
                  <p className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[length:var(--fs-12)] text-amber-800 dark:text-amber-300">
                    <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    Το κύριο υλικό μετριέται σε «{recipe.mtrlUnit}», ενώ η ποσότητα υπολογίζεται σε m². Ελέγξτε τη γραμμή μετά την προσθήκη.
                  </p>
                )}

                {rows.length > 0 && (
                  <div className="overflow-hidden rounded-lg border" style={{ borderColor: `color-mix(in srgb, ${TONE} 30%, var(--border))` }}>
                    <table className="w-full text-[length:var(--fs-12)]">
                      <thead className="bg-muted/40 text-left text-[length:var(--fs-11)] text-muted-foreground">
                        <tr><th className="px-2.5 py-1.5 font-medium">Γραμμή</th><th className="px-2.5 py-1.5 text-right font-medium">Ποσότητα</th><th className="px-2.5 py-1.5 text-right font-medium">Αξία</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.map((r) => (
                          <tr key={r.key}>
                            <td className="max-w-0 truncate px-2.5 py-1.5" title={r.name}>{r.name}</td>
                            <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{qtyFmt.format(r.qty)}{r.unit ? ` ${r.unit}` : ''}</td>
                            <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{eur.format(r.cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border font-semibold"><td className="px-2.5 py-1.5">Σύνολο ({rows.length} γραμμές)</td><td /><td className="px-2.5 py-1.5 text-right tabular-nums">{eur.format(total)}</td></tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                {recipe && !recipe.mtrl && <p className="text-[length:var(--fs-11)] text-muted-foreground">Γενική συνταγή: το κύριο υλικό δεν μπαίνει — προσθέστε το χωριστά με «Προσθήκη υλικού».</p>}
                {recipe && <p className="text-[length:var(--fs-11)] text-muted-foreground">Οι ποσότητες περιλαμβάνουν τη φύρα. Κάθε γραμμή σημειώνεται «Συνταγή … · m²» και αφαιρείται όπως κάθε γραμμή προϋπολογισμού.</p>}
              </>
            )}
            {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)] text-destructive">{error}</p>}
          </DialogBody>

          <DialogFooter className="m-0 border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
            <Button type="submit" disabled={busy || !recipe || !sqmOk || rows.length === 0} style={{ backgroundColor: TONE }} className="text-white hover:opacity-90">
              {busy && <FiLoader className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
              {busy ? 'Προσθήκη…' : 'Προσθήκη στον προϋπολογισμό'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
