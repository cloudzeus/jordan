'use client';

// Κάτοψη → προσφορά: υλικό/συνταγή ανά χώρο και το βήμα «Προσφορά» του εργαλείου διαστασιολόγησης.
import * as React from 'react';
import Link from 'next/link';
import { FiCheck, FiFilePlus, FiLayers, FiLoader, FiPackage, FiX } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { RegistrySearch } from '@/components/admin/registry-search';
import { RECIPE_KIND_META, RECIPE_KINDS } from '@/lib/install-recipes-core';
import type { RecipeView } from '@/lib/install-recipes';

export type RoomMaterial =
  | { type: 'recipe'; recipeId: string; label: string }
  | { type: 'item'; mtrl: number; code: string; label: string };

const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });

/** Ετικέτα υλικού κάτω από το όνομα του χώρου. */
export function MaterialChip({ material }: { material: RoomMaterial | null }) {
  if (!material) return <span className="text-[length:var(--fs-11)] text-muted-foreground">Χωρίς υλικό</span>;
  const recipe = material.type === 'recipe';
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[length:var(--fs-11)] font-medium"
      style={recipe ? { background: '#ECFEFF', color: '#0E7490' } : { background: '#FFF7ED', color: '#9A3412' }}
      title={recipe ? 'Συνταγή τοποθέτησης' : 'Είδος χωρίς συνταγή'}
    >
      {recipe ? <FiLayers className="size-3 shrink-0" aria-hidden /> : <FiPackage className="size-3 shrink-0" aria-hidden />}
      <span className="truncate">{material.label}</span>
    </span>
  );
}

/**
 * Υλικό του επιλεγμένου χώρου: συνταγή τοποθέτησης ή είδος από το μητρώο. Αν το είδος έχει συνταγή
 * (ίδιο κύριο υλικό), χρησιμοποιείται η συνταγή ώστε να μπουν και τα βοηθητικά και η εργασία.
 */
export function RoomMaterialEditor({ roomName, value, recipes, recipesError, onChange, onApplyAll, canApplyAll }: {
  roomName: string;
  value: RoomMaterial | null;
  recipes: RecipeView[] | null;
  recipesError: string | null;
  onChange: (m: RoomMaterial | null, note?: string) => void;
  onApplyAll: () => void;
  canApplyAll: boolean;
}) {
  const recipeLabel = (r: RecipeView) => r.mtrlName || r.name;
  return (
    <div className="relative z-20 space-y-2 rounded-lg border border-border bg-background p-2">
      <p className="text-[length:var(--fs-12)] font-medium">Υλικό για «{roomName}»</p>
      {recipesError ? (
        <p className="text-[length:var(--fs-11)] text-muted-foreground">{recipesError}</p>
      ) : !recipes ? (
        <p className="flex items-center gap-1.5 text-[length:var(--fs-11)] text-muted-foreground"><FiLoader className="size-3 animate-spin" aria-hidden /> Φόρτωση συνταγών…</p>
      ) : (
        <div>
          <label htmlFor="fp-recipe" className="mb-1 block text-[length:var(--fs-11)] text-muted-foreground">Συνταγή τοποθέτησης</label>
          <select
            id="fp-recipe"
            value={value?.type === 'recipe' ? value.recipeId : ''}
            onChange={(e) => {
              const r = recipes.find((x) => x.id === e.target.value);
              onChange(r ? { type: 'recipe', recipeId: r.id, label: recipeLabel(r) } : value?.type === 'recipe' ? null : value);
            }}
            className="h-8 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-[length:var(--fs-12)] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">{recipes.length ? '— Διαλέξτε συνταγή —' : 'Δεν υπάρχουν συνταγές'}</option>
            {RECIPE_KINDS.map((k) => {
              const group = recipes.filter((r) => r.kind === k);
              return group.length ? (
                <optgroup key={k} label={RECIPE_KIND_META[k].plural}>
                  {group.map((r) => <option key={r.id} value={r.id}>{r.name} · {eur.format(r.cost.total)}/m²</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
        </div>
      )}
      <div>
        <RegistrySearch
          kind="product" id="fp-item" label="…ή είδος από το μητρώο"
          onPick={(p) => {
            const r = recipes?.find((x) => x.mtrl === p.id);
            if (r) onChange({ type: 'recipe', recipeId: r.id, label: recipeLabel(r) }, `Το υλικό έχει συνταγή — χρησιμοποιείται η «${r.name}» (με βοηθητικά και εργασία).`);
            else onChange({ type: 'item', mtrl: p.id, code: p.code, label: p.name });
          }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <MaterialChip material={value} />
        <span className="flex gap-1">
          {value && canApplyAll && (
            <Button size="xs" variant="ghost" onClick={onApplyAll} title="Το ίδιο υλικό σε όσους χώρους δεν έχουν">Σε όλους τους υπόλοιπους</Button>
          )}
          {value && <Button size="xs" variant="ghost" onClick={() => onChange(null)} aria-label="Αφαίρεση υλικού"><FiX aria-hidden /> Αφαίρεση</Button>}
        </span>
      </div>
    </div>
  );
}

/** Βήμα «Προσφορά»: σύνοψη και άνοιγμα του modal με τα στοιχεία και την προεπισκόπηση. */
export function OfferStepBody({ withMaterial, total, ready, onOpen, created }: {
  withMaterial: number;
  total: number;
  ready: boolean;
  onOpen: () => void;
  created: string | null;
}) {
  return (
    <>
      <p className="text-muted-foreground">
        {withMaterial === 0
          ? 'Διάλεξε χώρο στη λίστα και όρισε υλικό ή συνταγή.'
          : <>Υλικό σε <b className="text-foreground">{withMaterial}</b> από {total} χώρους · οι υπόλοιποι αναφέρονται μόνο στην περίληψη.</>}
      </p>
      <Button size="sm" className="w-full" disabled={!ready || !withMaterial} onClick={onOpen}>
        <FiFilePlus aria-hidden /> Δημιουργία προσφοράς…
      </Button>
      {created && (
        <Link href={`/admin/projects/contracts/${created}`} className="flex items-center gap-1.5 font-medium text-emerald-700 underline-offset-2 hover:underline">
          <FiCheck aria-hidden /> Η προσφορά δημιουργήθηκε — άνοιγμα
        </Link>
      )}
    </>
  );
}
