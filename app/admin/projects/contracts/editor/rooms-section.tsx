'use client';

// «Κάτοψη & χώροι» στη φόρμα προσφοράς: ανέβασμα/χαρτογράφηση κάτοψης (το ίδιο εργαλείο με το έργο),
// πίνακας χώρων με υλικό ή συνταγή ανά χώρο και κόστος κάθε χώρου — οι γραμμές του χώρου
// ξαναϋπολογίζονται αυτόματα όταν αλλάζει το υλικό.
import * as React from 'react';
import dynamic from 'next/dynamic';
import { FiChevronDown, FiEdit3, FiLayers, FiMoreVertical, FiRefreshCw, FiSquare, FiUploadCloud, FiX } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MaterialChip, RoomMaterialEditor, type RoomMaterial } from '@/components/admin/floorplan/offer-panel';
import type { FloorPlanOwner } from '@/components/admin/floorplan/floor-plan-dialog';
import type { PlanRoom } from '@/lib/floorplan/saved';
import type { OfferLineMode } from '@/lib/install-recipes-core';
import type { RecipeView } from '@/lib/install-recipes';
import { eur } from '@/lib/contracts/core';
import { cn } from '@/lib/utils';

// three.js + pdfjs φορτώνονται μόνο όταν ανοίξει το εργαλείο.
const FloorPlanDialog = dynamic(() => import('@/components/admin/floorplan/floor-plan-dialog').then((m) => m.FloorPlanDialog), { ssr: false });

const m2 = (n: number) => `${n.toLocaleString('el-GR', { maximumFractionDigits: 1 })} m²`;
const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';

export type EditorRoom = PlanRoom;

export function RoomsSection({
  owner, ownerHint, projectLabel, floorPlan, rooms, costOf, recipes, recipesError, markupPct, mode, readOnly,
  onApplyPlan, onMaterial, onApplyToEmpty, onMarkup, onMode, onRecalc, onUnlink,
}: {
  owner: FloorPlanOwner | null;
  /** Γιατί δεν ανοίγει ακόμη το εργαλείο (π.χ. «Επιλέξτε πρώτα πελάτη»). */
  ownerHint: string | null;
  projectLabel: string;
  floorPlan: { id: string; title: string } | null;
  rooms: EditorRoom[];
  costOf: (roomId: string) => number;
  recipes: RecipeView[] | null;
  recipesError: string | null;
  markupPct: number;
  mode: OfferLineMode;
  readOnly: boolean;
  onApplyPlan: (r: { floorPlanId: string; title: string; rooms: PlanRoom[] }) => void;
  onMaterial: (roomId: string, m: RoomMaterial | null) => void;
  onApplyToEmpty: (m: RoomMaterial) => void;
  onMarkup: (n: number) => void;
  onMode: (m: OfferLineMode) => void;
  onRecalc: () => void;
  onUnlink: () => void;
}) {
  // Το εργαλείο μένει mounted μετά το πρώτο άνοιγμα: κλείσιμο/άνοιγμα δεν χάνει την κάτοψη.
  const [tool, setTool] = React.useState<'closed' | 'open' | 'hidden'>('closed');
  const [editing, setEditing] = React.useState<string | null>(null);
  const [markupText, setMarkupText] = React.useState(markupPct ? String(markupPct).replace('.', ',') : '');
  const floor = rooms.reduce((s, r) => s + r.floorM2, 0);
  const walls = rooms.reduce((s, r) => s + r.wallsM2, 0);
  const priced = rooms.filter((r) => r.material).length;
  const total = rooms.reduce((s, r) => s + costOf(r.id), 0);

  const openTool = () => setTool('open');
  const toolEl = owner && tool !== 'closed' && (
    <FloorPlanDialog
      owner={owner} projectLabel={projectLabel} canOffer onApply={onApplyPlan} initialPlanId={floorPlan?.id ?? null}
      open={tool === 'open'} onOpenChange={(o) => setTool(o ? 'open' : 'hidden')}
    />
  );

  if (!rooms.length) {
    return (
      <>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-7 text-center">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground"><FiSquare className="size-5" aria-hidden /></span>
          <div>
            <p className="text-(length:--fs-14) font-semibold">Ανεβάστε την κάτοψη του χώρου</p>
            <p className="mx-auto mt-0.5 max-w-md text-(length:--fs-12) text-muted-foreground">
              Φωτογραφία ή PDF του σχεδίου· οι χώροι και τα τετραγωνικά βγαίνουν αυτόματα (και με AI). Μετά διαλέγετε υλικό ανά χώρο και βλέπετε αμέσως το ποσό.
            </p>
          </div>
          {!readOnly && (
            <Button type="button" onClick={openTool} disabled={!owner} className="min-h-10 gap-1.5">
              <FiUploadCloud className="size-4" aria-hidden /> Ανέβασμα κάτοψης
            </Button>
          )}
          {!owner && ownerHint && <p className="text-(length:--fs-12) text-muted-foreground">{ownerHint}</p>}
          <p className="text-(length:--fs-11) text-muted-foreground">Προαιρετικό — μπορείτε να προσθέσετε υλικά και χωρίς κάτοψη.</p>
        </div>
        {toolEl}
      </>
    );
  }

  return (
    <>
      {/* Σύνοψη + ρυθμίσεις τιμολόγησης */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-(length:--fs-12)">
          <div><dt className="text-muted-foreground">Χώροι</dt><dd className="text-(length:--fs-14) font-semibold tabular-nums">{rooms.length}</dd></div>
          <div><dt className="text-muted-foreground">Δάπεδο</dt><dd className="text-(length:--fs-14) font-semibold tabular-nums">{m2(floor)}</dd></div>
          {walls > 0 && <div><dt className="text-muted-foreground">Τοίχοι</dt><dd className="text-(length:--fs-14) font-semibold tabular-nums">{m2(walls)}</dd></div>}
          <div><dt className="text-muted-foreground">Κόστος χώρων</dt><dd className="text-(length:--fs-14) font-semibold tabular-nums">{eur(total)}</dd></div>
        </dl>
        {!readOnly && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-(length:--fs-11) text-muted-foreground">
              Περιθώριο συνταγών
              <span className="relative mt-0.5 block">
                <input
                  inputMode="decimal" value={markupText} placeholder="0" aria-label="Περιθώριο συνταγών %"
                  onChange={(e) => { setMarkupText(e.target.value); const n = Number(e.target.value.replace(',', '.')); onMarkup(Number.isFinite(n) && n >= 0 ? n : 0); }}
                  className="h-9 w-20 rounded-md border border-input bg-transparent px-2 pr-6 text-(length:--fs-12) tabular-nums outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-(length:--fs-12)">%</span>
              </span>
            </label>
            <label className="text-(length:--fs-11) text-muted-foreground">
              Γραμμές
              <select value={mode} onChange={(e) => onMode(e.target.value as OfferLineMode)} aria-label="Μορφή γραμμών συνταγής"
                className="mt-0.5 block h-9 cursor-pointer rounded-md border border-input bg-transparent px-2 text-(length:--fs-12) text-foreground">
                <option value="detailed">Αναλυτικά</option>
                <option value="bundled">Μία ανά m²</option>
              </select>
            </label>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={onRecalc} disabled={!priced} title="Ξαναϋπολογίζει τις γραμμές όλων των χώρων με τις τρέχουσες τιμές">
              <FiRefreshCw className="size-3.5" aria-hidden /> Επανυπολογισμός
            </Button>
          </div>
        )}
      </div>

      {priced < rooms.length && !readOnly && (
        <p className="mb-2 rounded-md bg-sky-50 px-3 py-2 text-(length:--fs-12) text-sky-900" role="status">
          {priced === 0 ? 'Επόμενο βήμα: διαλέξτε υλικό ή συνταγή σε κάθε χώρο — οι γραμμές και το ποσό βγαίνουν αυτόματα.' : `${rooms.length - priced} χώρ${rooms.length - priced === 1 ? 'ος' : 'οι'} χωρίς υλικό ακόμη.`}
        </p>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {rooms.map((r) => {
          const cost = costOf(r.id);
          const open = editing === r.id;
          return (
            <li key={r.id} className={cn(open && 'bg-muted/30')}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                <span className="size-3 shrink-0 rounded-sm" style={{ background: r.color }} aria-hidden />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-(length:--fs-13) font-medium">{r.name}</p>
                  <p className="text-(length:--fs-11) tabular-nums text-muted-foreground">
                    δάπεδο {m2(r.floorM2)}{r.wallsM2 > 0 ? ` · τοίχοι ${m2(r.wallsM2)}` : ''}
                  </p>
                </div>
                <div className="min-w-0 basis-48">
                  {readOnly ? <MaterialChip material={r.material} /> : (
                    <button type="button" onClick={() => setEditing(open ? null : r.id)} aria-expanded={open}
                      className="flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input px-2 text-left hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                      {r.material ? <MaterialChip material={r.material} /> : <span className="text-(length:--fs-12) font-medium text-primary">Διαλέξτε υλικό…</span>}
                      <FiChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
                    </button>
                  )}
                </div>
                <span className="w-24 shrink-0 text-right text-(length:--fs-13) font-semibold tabular-nums">{r.material ? eur(cost) : '—'}</span>
                {!readOnly && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ενέργειες για ${r.name}`}>
                      <FiMoreVertical className="size-4" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-56">
                      <DropdownMenuItem className={ITEM} onSelect={() => setEditing(r.id)}><FiLayers className="size-3.5" />Υλικό / συνταγή…</DropdownMenuItem>
                      <DropdownMenuItem className={ITEM} disabled={!r.material || rooms.every((x) => x.id === r.id || x.material)} onSelect={() => r.material && onApplyToEmpty(r.material)}>
                        <FiLayers className="size-3.5" />Ίδιο υλικό στους χώρους χωρίς υλικό
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" className={ITEM} disabled={!r.material} onSelect={() => onMaterial(r.id, null)}><FiX className="size-3.5" />Αφαίρεση υλικού</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {open && !readOnly && (
                <div className="px-3 pb-3">
                  <RoomMaterialEditor
                    roomName={r.name} value={r.material} recipes={recipes} recipesError={recipesError}
                    onChange={(m) => { onMaterial(r.id, m); if (m) setEditing(null); }}
                    canApplyAll={rooms.some((x) => x.id !== r.id && !x.material)}
                    onApplyAll={() => { if (r.material) onApplyToEmpty(r.material); setEditing(null); }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-(length:--fs-11) text-muted-foreground">{floorPlan ? `Χαρτογράφηση «${floorPlan.title}»` : ''} · τα εμβαδά είναι από την κάτοψη.</p>
          <span className="flex gap-1">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={openTool} disabled={!owner}><FiEdit3 className="size-3.5" aria-hidden /> Άνοιγμα κάτοψης</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" aria-label="Περισσότερα για την κάτοψη"><FiMoreVertical className="size-4" aria-hidden /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuItem variant="destructive" className={ITEM} onSelect={onUnlink}><FiX className="size-3.5" />Αποσύνδεση κάτοψης από την προσφορά</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>
      )}
      {toolEl}
    </>
  );
}
