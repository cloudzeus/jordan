'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiLoader } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RegistrySearch, type RegistryPick } from '@/components/admin/registry-search';
import { RECIPE_KIND_META, parseDecimal, toInput } from '@/lib/install-recipes-core';
import type { RecipeView } from '@/lib/install-recipes';
import { PickedItem, eur, fetchItemInfo } from './recipe-ui';

type Item = { mtrl: number; code: string; name: string; unit: string | null };

/**
 * Αντιγραφή συνταγής για ομοειδές υλικό: ίδια κατηγορία, βοηθητικά υλικά, φύρες και εργατικά —
 * νέο όνομα και (προαιρετικά) άλλο κύριο υλικό με τη δική του τιμή. Μετά ανοίγει το αντίγραφο.
 */
export function CopyRecipeDialog({ recipe, onClose }: { recipe: RecipeView | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [main, setMain] = React.useState<Item | null>(null);
  const [price, setPrice] = React.useState('');
  const [lastBuy, setLastBuy] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!recipe) return;
    setName(`${recipe.name} (αντίγραφο)`);
    setMain(null); setPrice(toInput(recipe.materialPrice)); setLastBuy(null); setError(null);
  }, [recipe]);

  if (!recipe) return null;
  const tone = RECIPE_KIND_META[recipe.kind].color;

  const pick = async (p: RegistryPick) => {
    setMain({ mtrl: p.id, code: p.code, name: p.name, unit: null });
    setName(`Τοποθέτηση ${p.name}`);
    setPrice('');
    const info = (await fetchItemInfo([p.id]))[p.id];
    setMain((m) => (m && m.mtrl === p.id ? { ...m, unit: info?.unit ?? null } : m));
    const lp = info?.lastPurchase?.unitCost ?? null;
    setLastBuy(lp);
    if (lp != null) setPrice((cur) => (cur.trim() === '' ? toInput(lp) : cur));
  };

  const priceN = price.trim() === '' ? 0 : parseDecimal(price);
  const priceErr = !Number.isFinite(priceN) || priceN < 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || priceErr) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/recipes/${recipe.id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), mtrl: main?.mtrl ?? null, materialPrice: priceN }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Η αντιγραφή απέτυχε');
      toast.success('Δημιουργήθηκε αντίγραφο — ελέγξτε ποσότητες και τιμές');
      onClose();
      router.push(`/admin/recipes/${body.recipe.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader className="px-5 pt-4 pb-3">
            <DialogTitle className="text-[length:var(--fs-16)]">Αντιγραφή για ομοειδές υλικό</DialogTitle>
            <DialogDescription className="text-[length:var(--fs-12)]">
              Από «<span className="font-medium text-foreground">{recipe.name}</span>»: {recipe.lines.length} υλικά, φύρα {toInput(recipe.wastePct, 2) || '0'}% και εργατικά {eur.format(recipe.laborCostPerSqm)}/m² — κατηγορία {RECIPE_KIND_META[recipe.kind].label.toLowerCase()}.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="copy-main" className="mb-1 block text-[length:var(--fs-12)]">Νέο κύριο υλικό</Label>
              {main ? (
                <PickedItem code={main.code} name={main.name} unit={main.unit} tone={tone} onClear={() => { setMain(null); setLastBuy(null); setPrice(toInput(recipe.materialPrice)); }} />
              ) : (
                <>
                  <RegistrySearch id="copy-main" kind="product" onPick={pick} label="" />
                  <p className="mt-1 text-[length:var(--fs-11)] text-muted-foreground">
                    {recipe.mtrlName ? <>Αν δεν διαλέξετε, κρατιέται το ίδιο: <span className="text-foreground">{recipe.mtrlName}</span>.</> : 'Αν δεν διαλέξετε, η συνταγή μένει γενική.'}
                  </p>
                </>
              )}
            </div>
            <div>
              <Label htmlFor="copy-name" className="mb-1 block text-[length:var(--fs-12)]">Όνομα <span className="text-destructive">*</span></Label>
              <Input id="copy-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
            </div>
            <div>
              <Label htmlFor="copy-price" className="mb-1 block text-[length:var(--fs-12)]">Τιμή κύριου υλικού (€/m²)</Label>
              <Input id="copy-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" className="tabular-nums" aria-invalid={priceErr} />
              {priceErr && <p role="alert" className="mt-1 text-[length:var(--fs-11)] text-destructive">Αριθμός ≥ 0.</p>}
              {lastBuy != null && <p className="mt-1 text-[length:var(--fs-11)] text-muted-foreground">Τελευταία αγορά: {eur.format(lastBuy)}{main?.unit ? ` / ${main.unit}` : ''}</p>}
            </div>
            {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)] text-destructive">{error}</p>}
          </DialogBody>
          <DialogFooter className="m-0 border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Άκυρο</Button>
            <Button type="submit" disabled={busy || !name.trim() || priceErr} className="text-white hover:opacity-90" style={{ backgroundColor: tone }}>
              {busy && <FiLoader className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
              {busy ? 'Αντιγραφή…' : 'Δημιουργία αντιγράφου'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
