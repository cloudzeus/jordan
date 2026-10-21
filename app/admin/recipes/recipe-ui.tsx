'use client';

import * as React from 'react';
import { FiPackage, FiX } from 'react-icons/fi';
import { RECIPE_KIND_META, type RecipeKind } from '@/lib/install-recipes-core';
import type { RecipeItemInfo } from '@/lib/install-recipes';
import { recipeItemInfoAction } from './actions';

export const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n: number, d = 3) => n.toLocaleString('el-GR', { maximumFractionDigits: d });

export function KindBadge({ kind }: { kind: RecipeKind }) {
  const m = RECIPE_KIND_META[kind];
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-(length:--fs-11) font-medium"
      style={{ color: m.color, backgroundColor: `color-mix(in srgb, ${m.color} 12%, transparent)` }}
    >
      {m.label}
    </span>
  );
}

/** Επιλεγμένο είδος μητρώου με κουμπί αλλαγής. */
export function PickedItem({ code, name, unit, tone, onClear, disabled }: {
  code: string; name: string; unit?: string | null; tone: string; onClear?: () => void; disabled?: boolean;
}) {
  return (
    <div
      className="flex min-h-10 items-center gap-2 rounded-lg border px-2.5 py-1.5"
      style={{ borderColor: `color-mix(in srgb, ${tone} 35%, var(--border))`, backgroundColor: `color-mix(in srgb, ${tone} 7%, var(--background))` }}
    >
      <FiPackage className="size-4 shrink-0" style={{ color: tone }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-(length:--fs-13) font-medium text-foreground">{name}</p>
        <p className="font-mono text-(length:--fs-11) text-muted-foreground">{code}{unit ? ` · ${unit}` : ''}</p>
      </div>
      {onClear && !disabled && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Αλλαγή υλικού"
        >
          <FiX className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Μονάδα + τελευταία τιμή αγοράς για τα είδη (μία κλήση για πολλά). */
export async function fetchItemInfo(mtrls: number[]): Promise<Record<number, RecipeItemInfo>> {
  if (!mtrls.length) return {};
  try {
    return await recipeItemInfoAction(mtrls);
  } catch {
    return {};
  }
}
