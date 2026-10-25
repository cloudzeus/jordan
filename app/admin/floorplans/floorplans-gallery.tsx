'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FiBox, FiBriefcase, FiDownload, FiEdit2, FiExternalLink, FiFileText, FiGrid, FiImage, FiMap, FiMoreVertical, FiSearch, FiUser,
} from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FloorPlanCard } from '@/lib/floorplan/plans';
import type { FloorPlanOwner } from '@/components/admin/floorplan/floor-plan-dialog';

// three.js + pdfjs φορτώνονται μόνο όταν ανοίξει το εργαλείο.
const FloorPlanDialog = dynamic(() => import('@/components/admin/floorplan/floor-plan-dialog').then((m) => m.FloorPlanDialog), { ssr: false });

type Filter = 'all' | 'project' | 'customer' | '3d';
type Sort = 'recent' | 'area' | 'title';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Όλες' }, { key: 'project', label: 'Έργων' }, { key: 'customer', label: 'Πελατών' }, { key: '3d', label: 'Με 3D' },
];
const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const fmt = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 1 });
const imgUrl = (p: FloorPlanCard, v: 'annotated' | 'plan' | '3d' | 'source') => `/api/admin/floorplans/${p.id}/image?v=${v}&t=${encodeURIComponent(p.updatedAt)}`;

export function FloorPlansGallery({ plans, canSave, canOffer }: { plans: FloorPlanCard[]; canSave: boolean; canOffer: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>('all');
  const [sort, setSort] = React.useState<Sort>('recent');
  const [editing, setEditing] = React.useState<FloorPlanCard | null>(null);

  const needle = q.trim().toLowerCase();
  const shown = plans
    .filter((p) => filter === 'all' || (filter === 'project' ? p.prjc != null : filter === 'customer' ? p.prjc == null : p.has3d))
    .filter((p) => !needle || [p.title, p.projectLabel, p.customerName, p.source, ...p.rooms].some((s) => s?.toLowerCase().includes(needle)))
    .sort((a, b) => (sort === 'area' ? b.floorM2 - a.floorM2 : sort === 'title' ? a.title.localeCompare(b.title, 'el') : b.updatedAt.localeCompare(a.updatedAt)));

  const owner: FloorPlanOwner | null = editing ? (editing.prjc != null ? { prjc: editing.prjc } : editing.trdr != null ? { trdr: editing.trdr } : editing.prospectId != null ? { prospect: editing.prospectId } : null) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Τίτλος, έργο, πελάτης ή χώρος…" aria-label="Αναζήτηση κατόψεων" className="h-10 pl-8" />
        </div>
        <div role="radiogroup" aria-label="Φίλτρο" className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} onClick={() => setFilter(f.key)}
              className={cn('min-h-8 cursor-pointer rounded-md px-3 text-(length:--fs-12) font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150',
                filter === f.key ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
              {f.label}
            </button>
          ))}
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="h-10 w-48" aria-label="Ταξινόμηση"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Πιο πρόσφατες</SelectItem>
            <SelectItem value="area">Μεγαλύτερο εμβαδό</SelectItem>
            <SelectItem value="title">Αλφαβητικά</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-(length:--fs-12) tabular-nums text-muted-foreground" aria-live="polite">{shown.length} από {plans.length}</span>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <FiMap className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-(length:--fs-14) font-medium">{plans.length ? 'Καμία κάτοψη με αυτά τα κριτήρια' : 'Δεν υπάρχουν ακόμη κατόψεις'}</p>
          <p className="max-w-md text-(length:--fs-12) text-muted-foreground">
            {plans.length ? 'Αλλάξτε την αναζήτηση ή το φίλτρο.' : 'Μια κάτοψη αναλύεται από το μενού ⋮ ενός έργου («Διαστασιολόγηση κάτοψης») ή από την προσφορά πελάτη· μετά την αποθήκευση εμφανίζεται εδώ.'}
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((p) => <PlanCard key={p.id} plan={p} onEdit={() => setEditing(p)} />)}
        </ul>
      )}

      {editing && owner && (
        <FloorPlanDialog
          owner={owner} projectLabel={editing.projectLabel ?? editing.customerName ?? editing.title}
          canSave={canSave} canOffer={canOffer} initialPlanId={editing.id}
          open onOpenChange={(o) => { if (!o) { setEditing(null); router.refresh(); } }}
        />
      )}
    </div>
  );
}

function PlanCard({ plan: p, onEdit }: { plan: FloorPlanCard; onEdit: () => void }) {
  const [view, setView] = React.useState<'2d' | '3d'>('2d');
  const [broken, setBroken] = React.useState<Record<string, boolean>>({});
  const src = view === '3d' ? imgUrl(p, '3d') : imgUrl(p, p.hasAnnotated ? 'annotated' : 'plan');
  const hasImage = view === '3d' ? p.has3d : p.hasAnnotated || p.hasPlan;
  const extraRooms = p.rooms.length - 4;

  return (
    <li className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs motion-safe:transition-shadow motion-safe:duration-200 hover:shadow-card">
      <div className="relative aspect-[4/3] border-b border-border bg-muted/50">
        <button type="button" onClick={onEdit} aria-label={`Επεξεργασία της κάτοψης «${p.title}»`}
          className="absolute inset-0 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          {hasImage && !broken[src] ? (
            <img src={src} alt={view === '3d' ? `Προβολή 3D: ${p.title}` : `Κάτοψη με χώρους: ${p.title}`} loading="lazy" decoding="async"
              onError={() => setBroken((b) => ({ ...b, [src]: true }))}
              className="size-full object-contain p-2 motion-safe:transition-transform motion-safe:duration-300 group-hover:scale-[1.02]" />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
              <FiImage className="size-6" aria-hidden />
              <span className="text-(length:--fs-12)">Χωρίς εικόνα</span>
            </span>
          )}
        </button>
        {p.has3d && (
          <div role="radiogroup" aria-label="Προβολή" className="absolute left-2 top-2 inline-flex gap-0.5 rounded-md border border-border bg-background/90 p-0.5 shadow-xs backdrop-blur-sm">
            {(['2d', '3d'] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}
                className={cn('inline-flex min-h-7 cursor-pointer items-center gap-1 rounded px-2 text-(length:--fs-11) font-semibold uppercase focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                  view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {v === '2d' ? <FiGrid className="size-3" aria-hidden /> : <FiBox className="size-3" aria-hidden />}{v}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-(length:--fs-14) font-semibold" title={p.title}>{p.title}</h2>
            <p className="flex min-w-0 items-center gap-1 text-(length:--fs-12) text-muted-foreground">
              {p.prjc != null ? <FiBriefcase className="size-3 shrink-0" aria-hidden /> : <FiUser className="size-3 shrink-0" aria-hidden />}
              <span className="truncate" title={p.projectLabel ?? p.customerName ?? undefined}>{p.projectLabel ?? p.customerName ?? 'Χωρίς κάτοχο'}</span>
              {p.prospectId != null && <span className="shrink-0 rounded bg-amber-50 px-1 text-(length:--fs-11) font-medium text-amber-900 ring-1 ring-amber-200">δυνητικός</span>}
            </p>
          </div>
          <PlanActions plan={p} onEdit={onEdit} />
        </div>

        <dl className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 px-2 py-1.5 text-center">
          <Metric label="Δάπεδο" value={`${fmt(p.floorM2)} m²`} />
          <Metric label="Τοίχοι" value={`${fmt(p.wallsM2)} m²`} />
          <Metric label="Χώροι" value={String(p.roomCount)} />
        </dl>

        {p.rooms.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Χώροι">
            {p.rooms.slice(0, 4).map((r, i) => (
              <li key={`${r}-${i}`} className="max-w-40 truncate rounded-full border border-border px-2 py-0.5 text-(length:--fs-11) text-muted-foreground">{r}</li>
            ))}
            {extraRooms > 0 && <li className="rounded-full px-1.5 py-0.5 text-(length:--fs-11) text-muted-foreground">+{extraRooms}</li>}
          </ul>
        )}

        <div className="mt-auto flex items-center gap-2 pt-1 text-(length:--fs-11) text-muted-foreground">
          {p.contracts.length > 0 && (
            <span className="inline-flex items-center gap-1"><FiFileText className="size-3" aria-hidden />{p.contracts.length === 1 ? `Σύμβαση #${p.contracts[0].number}` : `${p.contracts.length} συμβάσεις`}</span>
          )}
          <span className="ml-auto tabular-nums">{new Date(p.updatedAt).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-(length:--fs-11) text-muted-foreground">{label}</dt>
      <dd className="truncate text-(length:--fs-13) font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function PlanActions({ plan: p, onEdit }: { plan: FloorPlanCard; onEdit: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Ενέργειες για «${p.title}»`}>
        <FiMoreVertical className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem className={ITEM} onSelect={onEdit}><FiEdit2 className="size-3.5" aria-hidden /> Επεξεργασία (2D / 3D)</DropdownMenuItem>
        <DropdownMenuSeparator />
        {p.hasAnnotated && <DropdownMenuItem className={ITEM} asChild><a href={imgUrl(p, 'annotated')} target="_blank" rel="noopener noreferrer"><FiImage className="size-3.5" aria-hidden /> Κάτοψη με χώρους</a></DropdownMenuItem>}
        {p.has3d && <DropdownMenuItem className={ITEM} asChild><a href={imgUrl(p, '3d')} target="_blank" rel="noopener noreferrer"><FiBox className="size-3.5" aria-hidden /> Εικόνα 3D</a></DropdownMenuItem>}
        {p.hasSource && <DropdownMenuItem className={ITEM} asChild><a href={imgUrl(p, 'source')}><FiDownload className="size-3.5" aria-hidden /> Λήψη πρωτότυπου σχεδίου</a></DropdownMenuItem>}
        {(p.prjc != null || p.contracts.length > 0) && <DropdownMenuSeparator />}
        {p.prjc != null && <DropdownMenuItem className={ITEM} asChild><Link href={`/admin/projects/${p.prjc}`}><FiExternalLink className="size-3.5" aria-hidden /> Καρτέλα έργου</Link></DropdownMenuItem>}
        {p.contracts.map((c) => (
          <DropdownMenuItem key={c.id} className={ITEM} asChild>
            <Link href={`/admin/projects/contracts/${c.id}`}><FiFileText className="size-3.5" aria-hidden /><span className="truncate">#{c.number} · {c.title}</span></Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
