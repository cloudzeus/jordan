'use client';

// Επιλογή τελικού δαπέδου για έναν χώρο: τύπος (πλακάκι / πέτρα / τσιμεντοκονία / άλλο) με οπτική υφή,
// είδος από το μητρώο (αναζήτηση στενεμένη στην ομάδα του τύπου), διάταξη/φινίρισμα, φύρα, σοβατεπί,
// σημειώσεις. Κοινό για τη διαστασιολόγηση κάτοψης και την καρτέλα «Χώροι & δάπεδα» του έργου.
import * as React from 'react';
import { FiCheck, FiX } from 'react-icons/fi';
import { RegistrySearch } from '@/components/admin/registry-search';
import { FINISHES, FINISH_BY_KEY, type FinishKey, type FinishMeta } from '@/lib/project-rooms-core';
import { ITEM_GROUP_BY_KEY } from '@/lib/item-groups';

export type FinishDraft = {
  finish: FinishKey | null;
  mtrl: number | null;
  itemCode: string | null;
  itemName: string | null;
  itemUnit: string | null;
  wastePct: number;
  skirting: boolean;
  pattern: string | null;
  notes: string | null;
  thumbUrl?: string | null;
};
export const emptyFinish = (): FinishDraft => ({ finish: null, mtrl: null, itemCode: null, itemName: null, itemUnit: null, wastePct: 10, skirting: false, pattern: null, notes: null, thumbUrl: null });

/** Μικρό δείγμα υφής ανά τύπο — καθαρό CSS (inline), χωρίς εικόνες. */
export function FinishSwatch({ f, className = 'size-9' }: { f: FinishMeta; className?: string }) {
  const bg: React.CSSProperties =
    f.key === 'TILE'
      ? { backgroundColor: f.soft, backgroundImage: `linear-gradient(${f.color}55 1.5px, transparent 1.5px), linear-gradient(90deg, ${f.color}55 1.5px, transparent 1.5px)`, backgroundSize: '33.4% 33.4%', backgroundPosition: '-1px -1px' }
      : f.key === 'STONE'
        ? { backgroundColor: '#F5E9D3', backgroundImage: 'radial-gradient(ellipse at 20% 30%, #E7D3AE 0 18%, transparent 19%), radial-gradient(ellipse at 75% 70%, #DCC395 0 14%, transparent 15%), linear-gradient(115deg, transparent 40%, #C9A86A66 41%, transparent 46%), linear-gradient(160deg, #EFE0C2, #E3CC9F)' }
        : f.key === 'SCREED'
          ? { backgroundColor: '#CBD5E1', backgroundImage: 'radial-gradient(#94A3B8 0.8px, transparent 0.9px), radial-gradient(#E2E8F0 0.8px, transparent 0.9px), linear-gradient(135deg, #CBD5E1, #B6C2D1)', backgroundSize: '6px 6px, 9px 9px, 100% 100%', backgroundPosition: '0 0, 3px 4px, 0 0' }
          : { backgroundColor: f.soft, backgroundImage: `repeating-linear-gradient(45deg, ${f.color}33 0 4px, transparent 4px 9px)` };
  return <span aria-hidden className={`inline-block shrink-0 rounded-md border border-black/10 ${className}`} style={bg} />;
}

const num = (s: string) => { const v = Number(s.replace(',', '.')); return Number.isFinite(v) ? v : null; };

export function RoomFinishFields({ value, onChange, disabled = false, idPrefix, compact = false }: {
  value: FinishDraft;
  onChange: (patch: Partial<FinishDraft>) => void;
  disabled?: boolean;
  idPrefix: string;
  /** Στενό πάνελ (π.χ. διαστασιολόγηση κάτοψης): οι τύποι σε 2 στήλες σε κάθε πλάτος οθόνης. */
  compact?: boolean;
}) {
  const meta = value.finish ? FINISH_BY_KEY.get(value.finish) ?? null : null;
  const [onlyGroup, setOnlyGroup] = React.useState(true);
  const group = meta?.group ?? null;
  const groupName = group ? ITEM_GROUP_BY_KEY.get(group)?.name ?? group : null;

  const pick = (f: FinishMeta) => {
    if (disabled) return;
    const prev = meta;
    onChange({
      finish: f.key,
      // Αλλαγή τύπου ⇒ το είδος του προηγούμενου τύπου δεν ισχύει πια.
      ...(prev && prev.key !== f.key ? { mtrl: null, itemCode: null, itemName: null, itemUnit: null, thumbUrl: null } : {}),
      // Η φύρα ακολουθεί τον τύπο, εκτός αν ο χρήστης την έχει αλλάξει.
      ...(!prev || value.wastePct === prev.waste ? { wastePct: f.waste } : {}),
      ...(!f.skirting ? { skirting: false } : {}),
    });
  };

  return (
    <div className="space-y-2.5">
      <div role="radiogroup" aria-label="Τελικό δάπεδο" className={`grid grid-cols-2 gap-1.5 ${compact ? '' : 'sm:grid-cols-4'}`}>
        {FINISHES.map((f) => {
          const on = value.finish === f.key;
          return (
            <button
              key={f.key} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => pick(f)}
              className="relative flex cursor-pointer items-center gap-2 rounded-lg border bg-background p-1.5 pr-2 text-left text-[length:var(--fs-12)] font-medium transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              style={on ? { borderColor: f.color, boxShadow: `0 0 0 2px ${f.color}26` } : { borderColor: 'var(--border)' }}
            >
              <FinishSwatch f={f} className="size-8" />
              <span className={`min-w-0 truncate ${compact ? 'text-[11px]' : ''}`} style={on ? { color: f.color } : undefined}>{f.label}</span>
              {on && <FiCheck className="absolute right-1.5 top-1.5 size-3" style={{ color: f.color }} aria-hidden />}
            </button>
          );
        })}
      </div>

      {meta && (
        <>
          {/* Είδος από το μητρώο */}
          {value.itemName ? (
            <div className="flex items-center gap-2 rounded-lg border p-1.5" style={{ borderColor: `${meta.color}55`, background: `${meta.soft}66` }}>
              {value.thumbUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={value.thumbUrl} alt="" className="size-9 shrink-0 rounded-md object-cover" />
                : <FinishSwatch f={meta} />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[length:var(--fs-12)] font-medium">{value.itemName}</p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">{[value.itemCode, value.itemUnit].filter(Boolean).join(' · ') || 'ελεύθερη περιγραφή'}</p>
              </div>
              {!disabled && (
                <button type="button" aria-label="Αφαίρεση υλικού" onClick={() => onChange({ mtrl: null, itemCode: null, itemName: null, itemUnit: null, thumbUrl: null })}
                  className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                  <FiX className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          ) : !disabled && (
            <div>
              <RegistrySearch
                kind="product" id={`${idPrefix}-item`} label={`Υλικό (${meta.label.toLowerCase()})`} group={onlyGroup ? group : null}
                onPick={(p) => onChange({ mtrl: p.id, itemCode: p.code, itemName: p.name, itemUnit: null, thumbUrl: null })}
              />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[length:var(--fs-11)] text-muted-foreground">
                {groupName && (
                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={onlyGroup} onChange={(e) => setOnlyGroup(e.target.checked)} className="size-3.5 accent-[var(--primary)]" />
                    μόνο «{groupName}»
                  </label>
                )}
                <button type="button" className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => onChange({ itemName: `${meta.label} δαπέδου`, mtrl: null, itemCode: null })}>
                  χωρίς είδος μητρώου
                </button>
              </div>
            </div>
          )}

          <div>
            <label htmlFor={`${idPrefix}-pattern`} className="mb-1 block text-[length:var(--fs-11)] text-muted-foreground">Διάταξη / φινίρισμα</label>
            <input
              id={`${idPrefix}-pattern`} value={value.pattern ?? ''} disabled={disabled} placeholder={meta.patternHint}
              onChange={(e) => onChange({ pattern: e.target.value || null })}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-[length:var(--fs-12)] outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-24">
              <label htmlFor={`${idPrefix}-waste`} className="mb-1 block text-[length:var(--fs-11)] text-muted-foreground">Φύρα</label>
              <div className="relative">
                <input
                  id={`${idPrefix}-waste`} inputMode="decimal" disabled={disabled} defaultValue={String(value.wastePct).replace('.', ',')} key={`${value.finish}-${value.wastePct}`}
                  onBlur={(e) => { const v = num(e.target.value); if (v != null && v >= 0 && v <= 100) onChange({ wastePct: v }); }}
                  className="h-8 w-full rounded-lg border border-input bg-transparent pl-2.5 pr-6 font-mono text-[length:var(--fs-12)] tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[length:var(--fs-11)] text-muted-foreground">%</span>
              </div>
            </div>
            {meta.skirting && (
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 text-[length:var(--fs-12)]">
                <input type="checkbox" checked={value.skirting} disabled={disabled} onChange={(e) => onChange({ skirting: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                Σοβατεπί στην περίμετρο
              </label>
            )}
          </div>

          <div>
            <label htmlFor={`${idPrefix}-notes`} className="mb-1 block text-[length:var(--fs-11)] text-muted-foreground">Σημειώσεις για προδιαγραφές / εργολάβο</label>
            <textarea
              id={`${idPrefix}-notes`} rows={2} value={value.notes ?? ''} disabled={disabled} placeholder="π.χ. ρύσεις προς σιφώνι, κατώφλι στην είσοδο, προστασία μετά την τοποθέτηση"
              onChange={(e) => onChange({ notes: e.target.value || null })}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-[length:var(--fs-12)] outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </>
      )}
    </div>
  );
}
