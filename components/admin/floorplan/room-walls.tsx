'use client';

import * as React from 'react';
import { FiChevronDown, FiMinus, FiPlus, FiX } from 'react-icons/fi';
import { DoorOpen, PanelsTopLeft, SquareDashed } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  HEIGHT_PRESETS, OPENING_PRESETS, openingArea, parseMeters, wallArea,
  type Opening, type OpeningKind, type RoomWalls,
} from '@/lib/floorplan/walls';

const nf = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfShort = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 });
const uid = () => Math.random().toString(36).slice(2, 10);

const KIND_ICON: Record<OpeningKind, React.ReactNode> = {
  door: <DoorOpen className="size-3.5" aria-hidden />,
  window: <PanelsTopLeft className="size-3.5" aria-hidden />,
  other: <SquareDashed className="size-3.5" aria-hidden />,
};

/**
 * Αριθμητικό πεδίο σε μέτρα που δέχεται «2,6» όσο πληκτρολογείς: κρατά το κείμενο τοπικά και
 * στέλνει τιμή μόνο όταν είναι έγκυρη. Η εξωτερική τιμή επανέρχεται όταν αλλάζει απ' έξω.
 */
export function MetersInput({ value, onValue, label, className, min = 0.01 }: { value: number; onValue: (n: number) => void; label: string; className?: string; min?: number }) {
  const [text, setText] = React.useState(() => nfShort.format(value));
  const [prev, setPrev] = React.useState(value);
  if (value !== prev) { setPrev(value); if (parseMeters(text) !== value) setText(nfShort.format(value)); }
  const n = parseMeters(text);
  const bad = !(Number.isFinite(n) && n >= min);
  return (
    <input
      inputMode="decimal" aria-label={label} aria-invalid={bad || undefined} value={text}
      onChange={(e) => { setText(e.target.value); const v = parseMeters(e.target.value); if (Number.isFinite(v) && v >= min) onValue(v); }}
      onBlur={() => { if (bad) setText(nfShort.format(value)); }}
      className={cn(
        'h-7 w-14 rounded-md border border-input bg-background px-1.5 text-center font-mono text-(length:--fs-12) tabular-nums outline-hidden focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
        bad && 'border-destructive',
        className,
      )}
    />
  );
}

/** Κουμπί «Τοίχοι» στη γραμμή του χώρου: ανοίγει/κλείνει την κάρτα και δείχνει τα m² όταν είναι ενεργό. */
export function WallsToggle({ walls, perimeterM, color, open, onToggle }: { walls: RoomWalls | undefined; perimeterM: number | null; color: string; open: boolean; onToggle: () => void }) {
  const on = !!walls?.on;
  const net = on && perimeterM != null ? wallArea(perimeterM, walls!).net : null;
  return (
    <button
      type="button" aria-pressed={on} aria-expanded={on ? open : undefined} onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={cn(
        'mt-1 flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md border px-2 text-(length:--fs-11) font-medium transition-colors',
        on ? 'text-foreground' : 'border-dashed border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
      )}
      style={on ? { borderColor: `color-mix(in oklab, ${color} 55%, var(--border))`, background: `color-mix(in oklab, ${color} 10%, var(--background))` } : undefined}
    >
      <span style={on ? { color } : undefined}><WallGlyph /></span>
      {on ? (
        <>
          <span>Τοίχοι</span>
          <span className="min-w-0 truncate text-muted-foreground">· {nfShort.format(walls!.heightM)} m{walls!.openings.length ? ` · ${walls!.openings.reduce((s, o) => s + o.count, 0)} ανοίγμ.` : ''}</span>
          <span className="ml-auto shrink-0 whitespace-nowrap font-mono font-semibold tabular-nums">{net == null ? '—' : `${nfShort.format(net)} m²`}</span>
          <FiChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
        </>
      ) : (
        <><FiPlus className="size-3" aria-hidden /> Πλακάκι και στους τοίχους</>
      )}
    </button>
  );
}

/** Μικρό εικονίδιο «τοίχος σε τομή»: δάπεδο + δύο τοίχοι με πλακάκια. */
function WallGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M2 2v12h12V2" />
      <path d="M2 6h3M2 10h3M11 6h3M11 10h3" opacity="0.7" />
    </svg>
  );
}

/**
 * Κάρτα «Πλακάκι στους τοίχους» κάτω από τον χώρο: ύψος (γρήγορες επιλογές), ανοίγματα με ένα κλικ
 * και ζωντανή «γραμμή υπολογισμού» περίμετρος × ύψος − ανοίγματα = m² τοίχων.
 */
export function RoomWallsPanel({ walls, perimeterM, color, onChange }: { walls: RoomWalls; perimeterM: number | null; color: string; onChange: (w: RoomWalls) => void }) {
  const calc = perimeterM == null ? null : wallArea(perimeterM, walls);
  const set = (patch: Partial<RoomWalls>) => onChange({ ...walls, ...patch });
  const setOpening = (id: string, patch: Partial<Opening>) => set({ openings: walls.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const addOpening = (kind: OpeningKind) => {
    const p = OPENING_PRESETS[kind];
    set({ openings: [...walls.openings, { id: uid(), kind, w: p.w, h: p.h, sill: p.sill, count: 1 }] });
  };

  return (
    <div
      className="mt-1.5 space-y-2.5 rounded-lg border p-2.5"
      style={{ borderColor: `color-mix(in oklab, ${color} 45%, var(--border))`, background: `color-mix(in oklab, ${color} 6%, var(--background))` }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Ύψος */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ύψος πλακιδίων</p>
        <div className="flex flex-wrap items-center gap-1">
          {HEIGHT_PRESETS.map((h) => {
            const active = Math.abs(walls.heightM - h) < 0.001;
            return (
              <button
                key={h} type="button" aria-pressed={active} onClick={() => set({ heightM: h })}
                className={cn(
                  'h-7 cursor-pointer rounded-md border px-2 font-mono text-(length:--fs-12) tabular-nums transition-colors',
                  active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:border-foreground/40',
                )}
              >
                {nfShort.format(h)}
              </button>
            );
          })}
          <span className="inline-flex items-center gap-0.5">
            <MetersInput value={walls.heightM} onValue={(h) => set({ heightM: h })} label="Ύψος πλακιδίων σε μέτρα" className="w-12" />
            <span className="text-[10px] text-muted-foreground">m</span>
          </span>
        </div>
      </div>

      {/* Ανοίγματα */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ανοίγματα χωρίς πλακάκι</p>
        {walls.openings.length > 0 && (
          <ul className="mb-1.5 space-y-1">
            {walls.openings.map((o) => (
              <li key={o.id} className="rounded-md bg-background px-1.5 py-1 ring-1 ring-border">
                <div className="flex items-center gap-1">
                  <span className="inline-flex items-center gap-1 text-(length:--fs-11) font-medium">{KIND_ICON[o.kind]} {OPENING_PRESETS[o.kind].label}</span>
                  {o.at && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground" title="Σχεδιάστηκε πάνω στο σχέδιο — το πλάτος είναι μετρημένο">στο σχέδιο</span>}
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">−{nfShort.format(openingArea(o, walls.heightM))} m²</span>
                  <button type="button" aria-label={`Αφαίρεση ${OPENING_PRESETS[o.kind].label.toLowerCase()}`} onClick={() => set({ openings: walls.openings.filter((x) => x.id !== o.id) })} className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <FiX className="size-3.5" aria-hidden />
                  </button>
                </div>
                <div className="mt-0.5 flex items-center gap-1">
                <MetersInput value={o.w} onValue={(w) => setOpening(o.id, { w })} label={`Πλάτος ${OPENING_PRESETS[o.kind].label.toLowerCase()} σε μέτρα`} className="w-12" />
                <span className="text-[10px] text-muted-foreground" aria-hidden>×</span>
                <MetersInput value={o.h} onValue={(h) => setOpening(o.id, { h })} label={`Ύψος ${OPENING_PRESETS[o.kind].label.toLowerCase()} σε μέτρα`} className="w-12" />
                <span className="text-[10px] text-muted-foreground">m</span>
                {o.kind !== 'door' && (
                  <span className="inline-flex items-center gap-0.5" title="Ύψος ποδιάς από το δάπεδο">
                    <span className="text-[10px] text-muted-foreground">ποδιά</span>
                    <MetersInput value={o.sill ?? 0} min={0} onValue={(sill) => setOpening(o.id, { sill })} label={`Ποδιά ${OPENING_PRESETS[o.kind].label.toLowerCase()} σε μέτρα`} className="w-11" />
                  </span>
                )}
                <span className="ml-auto inline-flex items-center rounded-md ring-1 ring-border">
                  <button type="button" aria-label="Λιγότερα" disabled={o.count <= 1} onClick={() => setOpening(o.id, { count: o.count - 1 })} className="inline-flex size-6 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-30">
                    <FiMinus className="size-3" aria-hidden />
                  </button>
                  <span className="w-5 text-center font-mono text-(length:--fs-11) tabular-nums" aria-label={`Πλήθος ${o.count}`}>{o.count}</span>
                  <button type="button" aria-label="Περισσότερα" onClick={() => setOpening(o.id, { count: o.count + 1 })} className="inline-flex size-6 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground">
                    <FiPlus className="size-3" aria-hidden />
                  </button>
                </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-3 gap-1">
          {(Object.keys(OPENING_PRESETS) as OpeningKind[]).map((k) => (
            <button
              key={k} type="button" onClick={() => addOpening(k)}
              title={`Προσθήκη: ${OPENING_PRESETS[k].label.toLowerCase()} ${nfShort.format(OPENING_PRESETS[k].w)} × ${nfShort.format(OPENING_PRESETS[k].h)} m`}
              className="flex cursor-pointer flex-col items-center gap-0.5 rounded-md border border-dashed border-border bg-background px-1 py-1.5 text-(length:--fs-11) font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              <span className="inline-flex items-center gap-1"><FiPlus className="size-3" aria-hidden />{KIND_ICON[k]}</span>
              {OPENING_PRESETS[k].label}
            </button>
          ))}
        </div>
      </div>

      {/* Γραμμή υπολογισμού — «σχέδιο» με τα νούμερα στη σειρά που τα σκέφτεται ο τεχνίτης */}
      <div className="rounded-md px-2.5 py-2 font-mono text-[11px] leading-relaxed text-slate-300" style={{ background: '#0B1220' }} aria-live="polite">
        {calc == null ? (
          <span className="text-slate-400">Όρισε πρώτα την κλίμακα για να βγουν m².</span>
        ) : (
          <>
            <span className="tabular-nums">{nfShort.format(perimeterM!)} m</span>
            <span className="text-slate-500"> περίμ. × </span>
            <span className="tabular-nums">{nfShort.format(walls.heightM)} m</span>
            <span className="text-slate-500"> = </span>
            <span className="tabular-nums">{nf.format(calc.gross)}</span>
            {calc.openings > 0 && (<><span className="text-slate-500"> − </span><span className="tabular-nums">{nf.format(calc.openings)}</span><span className="text-slate-500"> ανοίγμ.</span></>)}
            <span className="mt-1 flex items-baseline justify-between border-t border-white/10 pt-1">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-slate-400">Τοίχοι</span>
              <span className="text-[15px] font-semibold tabular-nums" style={{ color: '#22D3EE' }}>{nf.format(calc.net)}<span className="ml-1 text-[11px] text-slate-400">m²</span></span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
