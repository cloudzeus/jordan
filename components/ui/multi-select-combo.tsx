'use client';

// Multi-select combo με αναζήτηση και ομάδες επιλογών: επιλογή πολλών τιμών με checkbox, «επιλογή όλης της
// ομάδας» από την κεφαλίδα της, καθαρισμός. Το κουμπί δείχνει την πρώτη επιλογή και «+N».
import * as React from 'react';
import { FiCheck, FiChevronDown, FiSearch, FiX } from 'react-icons/fi';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface MultiOption { value: string; label: string; count?: number; color?: string }
export interface MultiGroup { label: string; color?: string; options: MultiOption[] }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('el');

export function MultiSelectCombo({ id, label, groups, value, onChange, placeholder = 'Όλες', className }: {
  id?: string; label: string; groups: MultiGroup[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string; className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const selected = new Set(value);
  const all = groups.flatMap((g) => g.options);
  const first = all.find((o) => selected.has(o.value));
  const term = fold(q.trim());
  const shown = groups
    .map((g) => ({ ...g, options: term ? g.options.filter((o) => fold(o.label).includes(term) || fold(g.label).includes(term)) : g.options }))
    .filter((g) => g.options.length);

  const toggle = (v: string) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const toggleGroup = (g: MultiGroup) => {
    const vals = g.options.map((o) => o.value);
    const allOn = vals.every((v) => selected.has(v));
    onChange(allOn ? value.filter((v) => !vals.includes(v)) : [...new Set([...value, ...vals])]);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <PopoverTrigger asChild>
        <button
          id={id} type="button" aria-label={label}
          className={cn('inline-flex h-8 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-[length:var(--fs-13)] hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value.length > 0 && 'border-sisyphus-500/60', className)}
        >
          <span className="shrink-0 text-muted-foreground">{label}:</span>
          {first ? (
            <span className="flex min-w-0 items-center gap-1">
              {first.color && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: first.color }} />}
              <span className="truncate font-medium">{first.label}</span>
              {value.length > 1 && <span className="shrink-0 rounded bg-muted px-1 text-[length:var(--fs-11)] tabular-nums">+{value.length - 1}</span>}
            </span>
          ) : <span className="truncate text-muted-foreground">{placeholder}</span>}
          {value.length > 0 ? (
            <span role="button" tabIndex={-1} aria-label="Καθαρισμός" onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className="ml-0.5 grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
              <FiX className="size-3" aria-hidden />
            </span>
          ) : <FiChevronDown aria-hidden className="size-3.5 shrink-0 opacity-60" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="relative border-b border-border p-1.5">
          <FiSearch aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση…" aria-label={`Αναζήτηση: ${label}`}
            className="h-8 w-full rounded-md bg-transparent pl-7 pr-2 text-[length:var(--fs-13)] outline-none focus-visible:bg-muted/40" />
        </div>
        <div className="max-h-80 overflow-y-auto p-1" role="listbox" aria-multiselectable="true" aria-label={label}>
          {shown.length === 0 && <p className="px-2 py-4 text-center text-[length:var(--fs-12)] text-muted-foreground">Καμία επιλογή.</p>}
          {shown.map((g) => {
            const vals = g.options.map((o) => o.value);
            const on = vals.filter((v) => selected.has(v)).length;
            return (
              <div key={g.label} className="py-0.5">
                <button type="button" onClick={() => toggleGroup(g)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-[length:var(--fs-11)] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/60">
                  {g.color && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: g.color }} />}
                  <span className="flex-1 truncate">{g.label}</span>
                  <span className="font-normal normal-case tracking-normal">{on === vals.length ? 'αποεπιλογή' : 'όλες'}</span>
                </button>
                {g.options.map((o) => {
                  const isOn = selected.has(o.value);
                  return (
                    <button key={o.value} type="button" role="option" aria-selected={isOn} onClick={() => toggle(o.value)}
                      className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[length:var(--fs-13)] hover:bg-muted/60">
                      <span aria-hidden className={cn('grid size-4 shrink-0 place-items-center rounded border', isOn ? 'border-sisyphus-500 bg-sisyphus-500 text-white' : 'border-input')}>
                        {isOn && <FiCheck className="size-3" />}
                      </span>
                      {o.color && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: o.color }} />}
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.count != null && <span className="shrink-0 text-[length:var(--fs-11)] tabular-nums text-muted-foreground">{o.count.toLocaleString('el-GR')}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        {value.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-2.5 py-1.5 text-[length:var(--fs-12)]">
            <span className="text-muted-foreground">{value.length} επιλεγμένες</span>
            <button type="button" onClick={() => onChange([])} className="cursor-pointer font-medium text-sisyphus-600 hover:underline">Καθαρισμός</button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
