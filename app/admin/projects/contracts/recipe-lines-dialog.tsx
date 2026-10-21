'use client';

import * as React from 'react';
import Link from 'next/link';
import { FiLayers, FiLoader } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RECIPE_KIND_META, parseDecimal, recipeToOfferLines, type OfferLine, type OfferLineMode } from '@/lib/install-recipes-core';
import type { RecipeView } from '@/lib/install-recipes';
import { listRecipesAction } from '../../recipes/actions';

const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const qtyFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 3 });

const MODES: { key: OfferLineMode; label: string; hint: string }[] = [
  { key: 'detailed', label: 'Αναλυτικά', hint: 'Κάθε υλικό και η εργασία σε δική τους γραμμή' },
  { key: 'bundled', label: 'Μία γραμμή ανά m²', hint: '«Προμήθεια & τοποθέτηση» με τιμή ανά m²' },
];

/**
 * «Από συνταγή τοποθέτησης» στις γραμμές προσφοράς/σύμβασης: συνταγή + m² + περιθώριο →
 * γραμμές που μπαίνουν στη φόρμα (ΔΕΝ αποθηκεύονται μέχρι το «Αποθήκευση» της σύμβασης).
 */
export function RecipeLinesDialog({ open, onOpenChange, onAdd }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (lines: OfferLine[], recipeName: string) => void;
}) {
  const [recipes, setRecipes] = React.useState<RecipeView[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [recipeId, setRecipeId] = React.useState('');
  const [sqm, setSqm] = React.useState('');
  const [markup, setMarkup] = React.useState('');
  const [mode, setMode] = React.useState<OfferLineMode>('detailed');

  // Επαναφορά στο άνοιγμα (adjust-state-while-rendering)· η φόρτωση στο effect.
  const [prevOpen, setPrevOpen] = React.useState(false);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) { setRecipeId(''); setSqm(''); setLoadError(null); }
  }
  React.useEffect(() => {
    if (!open) return;
    let ignore = false;
    listRecipesAction()
      .then((r) => { if (ignore) return; if (r.ok) setRecipes(r.data); else setLoadError(r.message); })
      .catch(() => { if (!ignore) setLoadError('Οι συνταγές δεν φορτώθηκαν — δοκιμάστε ξανά.'); });
    return () => { ignore = true; };
  }, [open]);

  const recipe = recipes?.find((r) => r.id === recipeId) ?? null;
  const sqmN = parseDecimal(sqm);
  const sqmOk = Number.isFinite(sqmN) && sqmN > 0;
  const markupN = markup.trim() === '' ? 0 : parseDecimal(markup);
  const markupOk = Number.isFinite(markupN) && markupN >= 0 && markupN <= 1000;
  const lines = recipe && sqmOk && markupOk ? recipeToOfferLines(recipe, sqmN, { markupPct: markupN, mode }) : [];
  const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipe || !lines.length) return;
    onAdd(lines, recipe.name);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader className="px-5 pt-4 pb-3">
            <DialogTitle className="text-(length:--fs-16)">Γραμμές από συνταγή τοποθέτησης</DialogTitle>
            <DialogDescription className="text-(length:--fs-12)">
              Οι γραμμές μπαίνουν στη φόρμα — ελέγξτε τες και πατήστε «Αποθήκευση». Οι τιμές της συνταγής είναι κόστος· το περιθώριο τις προσαυξάνει για τον πελάτη.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {loadError ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12) text-destructive">{loadError}</p>
            ) : !recipes ? (
              <p className="flex items-center gap-2 text-(length:--fs-12) text-muted-foreground"><FiLoader className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Φόρτωση συνταγών…</p>
            ) : recipes.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-6 text-center text-(length:--fs-12) text-muted-foreground">
                <FiLayers className="mx-auto mb-2 size-6 opacity-60" aria-hidden />
                Δεν υπάρχουν συνταγές. <Link href="/admin/recipes/new" className="font-medium text-foreground underline">Δημιουργία συνταγής</Link>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="rl-recipe" className="mb-1 block text-(length:--fs-12)">Συνταγή <span className="text-destructive">*</span></Label>
                  <select
                    id="rl-recipe" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}
                    className="h-9 w-full cursor-pointer rounded-lg border border-input bg-background px-2 text-(length:--fs-13) outline-hidden focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">— Διαλέξτε —</option>
                    {(['TILE', 'STONE', 'CEMENT_MORTAR'] as const).map((k) => {
                      const group = recipes.filter((r) => r.kind === k);
                      return group.length ? (
                        <optgroup key={k} label={RECIPE_KIND_META[k].plural}>
                          {group.map((r) => <option key={r.id} value={r.id}>{r.name} · κόστος {eur.format(r.cost.total)}/m²</option>)}
                        </optgroup>
                      ) : null;
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="rl-sqm" className="mb-1 block text-(length:--fs-12)">Τετραγωνικά (m²) <span className="text-destructive">*</span></Label>
                    <Input id="rl-sqm" inputMode="decimal" autoComplete="off" value={sqm} onChange={(e) => setSqm(e.target.value)} placeholder="π.χ. 85" className="tabular-nums" aria-invalid={sqm.trim() !== '' && !sqmOk} />
                  </div>
                  <div>
                    <Label htmlFor="rl-markup" className="mb-1 block text-(length:--fs-12)">Περιθώριο (%)</Label>
                    <Input id="rl-markup" inputMode="decimal" autoComplete="off" value={markup} onChange={(e) => setMarkup(e.target.value)} placeholder="0" className="tabular-nums" aria-invalid={!markupOk} />
                  </div>
                </div>

                <div role="radiogroup" aria-label="Μορφή γραμμών" className="grid gap-2 sm:grid-cols-2">
                  {MODES.map((m) => (
                    <button
                      key={m.key} type="button" role="radio" aria-checked={mode === m.key} onClick={() => setMode(m.key)}
                      className={cn('cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors', mode === m.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50')}
                    >
                      <span className="block text-(length:--fs-13) font-medium">{m.label}</span>
                      <span className="block text-(length:--fs-11) text-muted-foreground">{m.hint}</span>
                    </button>
                  ))}
                </div>

                {lines.length > 0 && (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-(length:--fs-12)">
                      <thead className="bg-muted/40 text-left text-(length:--fs-11) text-muted-foreground">
                        <tr><th className="px-2.5 py-1.5 font-medium">Γραμμή</th><th className="px-2.5 py-1.5 text-right font-medium">Ποσότητα</th><th className="px-2.5 py-1.5 text-right font-medium">Τιμή</th><th className="px-2.5 py-1.5 text-right font-medium">Αξία</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {lines.map((l, i) => (
                          <tr key={i}>
                            <td className="max-w-0 truncate px-2.5 py-1.5" title={l.name}>{l.name}</td>
                            <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{qtyFmt.format(l.qty)}{l.unit ? ` ${l.unit}` : ''}</td>
                            <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{eur.format(l.unitPrice)}</td>
                            <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{eur.format(l.qty * l.unitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border font-semibold"><td className="px-2.5 py-1.5" colSpan={3}>Σύνολο προ ΦΠΑ ({lines.length} γραμμές)</td><td className="px-2.5 py-1.5 text-right tabular-nums">{eur.format(total)}</td></tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                {recipe && sqmOk && lines.length === 0 && <p className="text-(length:--fs-12) text-muted-foreground">Η συνταγή δεν έχει τιμές ή υλικά για να βγουν γραμμές.</p>}
                {recipe && <p className="text-(length:--fs-11) text-muted-foreground">Οι ποσότητες περιλαμβάνουν τη φύρα. Η γραμμή εργασίας μπορεί μετά να ανατεθεί σε συνεργείο.</p>}
              </>
            )}
          </DialogBody>

          <DialogFooter className="m-0 border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Άκυρο</Button>
            <Button type="submit" disabled={!recipe || !lines.length}>Προσθήκη {lines.length ? `${lines.length} γραμμών` : 'γραμμών'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
