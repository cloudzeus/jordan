'use client';

import * as React from 'react';
import { useDropzone } from 'react-dropzone';
import {
  FiImage, FiFilm, FiGlobe, FiStar, FiEdit3, FiArrowLeft, FiArrowRight, FiExternalLink, FiCopy, FiTrash2,
  FiMoreVertical, FiUploadCloud, FiAlertTriangle, FiRefreshCw, FiArchive,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { confirmAction } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ItemMediaDTO } from '@/lib/item-media/service';
import type { ItemStock } from '@/lib/item-stock';
import { UploadProgressDialog, type MediaKind } from './upload-progress-dialog';
import { ImageEditorDialog } from './image-editor-dialog';

const KINDS: { kind: MediaKind; tab: string; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; tone: string; accept: Record<string, string[]>; hint: string }[] = [
  { kind: 'IMAGE', tab: 'images', label: 'Φωτογραφίες', icon: FiImage, tone: '#0369A1',
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff', '.heic', '.heif'] },
    hint: 'JPG, PNG, WebP, HEIC · έως 40 MB · γίνονται τετράγωνες 1920×1920 WebP' },
  { kind: 'VIDEO', tab: 'videos', label: 'Βίντεο', icon: FiFilm, tone: '#7C3AED',
    accept: { 'video/mp4': ['.mp4'], 'video/webm': ['.webm'], 'video/quicktime': ['.mov'] },
    hint: 'MP4, WebM, MOV · έως 500 MB' },
  { kind: 'PANORAMA', tab: 'panoramas', label: '360°', icon: FiGlobe, tone: '#047857',
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'] },
    hint: 'Πανόραμα equirectangular (αναλογία 2:1) · έως 80 MB' },
];

const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';

function MediaCard({
  m, index, count, canManage, onPrimary, onEdit, onMove, onDelete,
}: {
  m: ItemMediaDTO; index: number; count: number; canManage: boolean;
  onPrimary: () => void; onEdit: () => void; onMove: (dir: -1 | 1) => void; onDelete: () => void;
}) {
  const copy = () => navigator.clipboard.writeText(m.url).then(() => toast.success('Αντιγράφηκε το URL'), () => toast.error('Δεν επετράπη η αντιγραφή'));
  return (
    <figure
      className={cn(
        'group relative overflow-hidden rounded-md border bg-background transition-shadow duration-150 hover:shadow-md',
        m.isPrimary ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-border',
      )}
    >
      <div className={cn('relative bg-muted', m.kind === 'PANORAMA' ? 'aspect-[2/1]' : 'aspect-square')}>
        {m.kind === 'VIDEO' ? (
          <video src={`${m.url}#t=0.5`} preload="metadata" muted playsInline controls className="size-full object-contain" aria-label={m.name} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.thumbUrl ?? m.url} alt={m.name} loading="lazy" className="size-full object-cover" />
        )}
        {m.isPrimary && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[length:var(--fs-10)] font-semibold text-amber-950 shadow-sm">
            <FiStar className="size-3 fill-current" aria-hidden /> Κύρια
          </span>
        )}
        {m.kind === 'PANORAMA' && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-700 px-2 py-0.5 text-[length:var(--fs-10)] font-semibold text-white">360°</span>
        )}
        {/* Οι ενέργειες ζουν ΠΑΝΤΑ σε dropdown (κανόνας του project). */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="absolute right-1.5 top-1.5 inline-flex size-8 cursor-pointer items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors duration-150 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-background"
            aria-label={`Ενέργειες για ${m.name}`}
          >
            <FiMoreVertical className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canManage && m.kind === 'IMAGE' && !m.isPrimary && (
              <DropdownMenuItem className={ITEM} onSelect={onPrimary}>
                <FiStar className="size-3.5 text-amber-500" aria-hidden /> Ορισμός ως κύρια
              </DropdownMenuItem>
            )}
            {canManage && m.kind === 'IMAGE' && (
              <DropdownMenuItem className={ITEM} onSelect={onEdit}>
                <FiEdit3 className="size-3.5" aria-hidden /> Επεξεργασία στον καμβά
              </DropdownMenuItem>
            )}
            {canManage && count > 1 && (
              <>
                <DropdownMenuItem className={ITEM} disabled={index === 0} onSelect={() => onMove(-1)}>
                  <FiArrowLeft className="size-3.5" aria-hidden /> Μετακίνηση νωρίτερα
                </DropdownMenuItem>
                <DropdownMenuItem className={ITEM} disabled={index === count - 1} onSelect={() => onMove(1)}>
                  <FiArrowRight className="size-3.5" aria-hidden /> Μετακίνηση αργότερα
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem className={ITEM} onSelect={() => window.open(m.url, '_blank', 'noopener')}>
              <FiExternalLink className="size-3.5" aria-hidden /> Άνοιγμα σε νέα καρτέλα
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} onSelect={copy}>
              <FiCopy className="size-3.5" aria-hidden /> Αντιγραφή URL
            </DropdownMenuItem>
            {canManage && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className={ITEM} onSelect={onDelete}>
                  <FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <figcaption className="flex items-center gap-1 px-2 py-1">
        <span className="min-w-0 flex-1 truncate text-[length:var(--fs-11)] text-foreground" title={m.name}>{m.name}</span>
        <span className="shrink-0 text-[length:var(--fs-10)] tabular-nums text-muted-foreground">{fmtSize(m.size)}</span>
      </figcaption>
    </figure>
  );
}

function DropZone({ kind, onFiles, disabled }: { kind: (typeof KINDS)[number]; onFiles: (files: File[]) => void; disabled?: boolean }) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: kind.accept, multiple: true, noClick: true, disabled, onDrop: (accepted, rejected) => {
      if (rejected.length) toast.error(`${rejected.length} αρχεία απορρίφθηκαν: μη αποδεκτός τύπος για ${kind.label.toLowerCase()}.`);
      if (accepted.length) onFiles(accepted);
    },
  });
  const Icon = kind.icon;
  return (
    <div
      {...getRootProps()}
      className={cn('flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 transition-colors duration-150', isDragActive && 'border-solid')}
      style={{ borderColor: isDragActive ? kind.tone : soft(kind.tone, 40), backgroundColor: isDragActive ? soft(kind.tone, 10) : undefined }}
    >
      <input {...getInputProps()} aria-label={`Επιλογή αρχείων: ${kind.label}`} />
      <Icon className="size-4 shrink-0" style={{ color: kind.tone }} aria-hidden />
      <span className="min-w-0 flex-1 text-[length:var(--fs-12)] text-muted-foreground">
        {isDragActive ? 'Άφησε τα αρχεία εδώ…' : <>Σύρε αρχεία εδώ ή <span className="font-medium text-foreground">επίλεξε πολλά μαζί</span>. {kind.hint}</>}
      </span>
      <button
        type="button" onClick={open} disabled={disabled}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[length:var(--fs-12)] font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: kind.tone }}
      >
        <FiUploadCloud className="size-3.5" aria-hidden /> Μεταφόρτωση
      </button>
    </div>
  );
}

const qtyFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 3 });
const STOCK_TONE = '#0F766E';

/** Υπόλοιπα του είδους ανά αποθήκη + σύνολο. «Ανανέωση» = ζωντανή ανάγνωση από το SoftOne. */
export function StockStrip({ mtrl }: { mtrl: number }) {
  const [data, setData] = React.useState<ItemStock | null>(null);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async (live: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/items/${mtrl}/stock${live ? '?live=1' : ''}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Αποτυχία ανάγνωσης υπολοίπων');
      setData(body);
      if (live) toast.success('Τα υπόλοιπα ανανεώθηκαν από το SoftOne');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [mtrl]);
  React.useEffect(() => { void load(false); }, [load]);

  if (!data) return <div className="h-14 animate-pulse rounded-md bg-muted motion-reduce:animate-none" aria-busy="true" aria-label="Φόρτωση υπολοίπων" />;
  const unit = data.unit ? ` ${data.unit}` : '';
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {data.warehouses.map((w) => (
        <div key={w.whouse} className="min-w-[8.5rem] flex-1 rounded-md border border-border bg-background px-3 py-1.5 sm:flex-none">
          <p className="flex items-center gap-1 truncate text-[length:var(--fs-11)] font-medium text-muted-foreground" title={w.name}>
            <FiArchive className="size-3 shrink-0" aria-hidden /> {w.name}
          </p>
          <p className={cn('text-[length:var(--fs-14)] font-semibold tabular-nums', w.qty < 0 ? 'text-destructive' : w.qty === 0 ? 'text-muted-foreground' : 'text-foreground')}>
            {qtyFmt.format(w.qty)}<span className="text-[length:var(--fs-11)] font-normal text-muted-foreground">{unit}</span>
          </p>
        </div>
      ))}
      <div
        className="min-w-[8.5rem] flex-1 rounded-md border px-3 py-1.5 sm:flex-none"
        style={{ backgroundColor: soft(STOCK_TONE, 8), borderColor: soft(STOCK_TONE, 30), boxShadow: `inset 3px 0 0 ${STOCK_TONE}` }}
      >
        <p className="text-[length:var(--fs-11)] font-semibold" style={{ color: STOCK_TONE }}>Σύνολο</p>
        <p className={cn('text-[length:var(--fs-14)] font-bold tabular-nums', data.total < 0 ? 'text-destructive' : 'text-foreground')}>
          {qtyFmt.format(data.total)}<span className="text-[length:var(--fs-11)] font-normal text-muted-foreground">{unit}</span>
        </p>
      </div>
      <button
        type="button" onClick={() => load(true)} disabled={busy}
        className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1 self-start rounded-md px-2 text-[length:var(--fs-11)] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-50"
        title={data.syncedAt ? `Χρήση ${data.fiscPrd ?? '—'} · ενημέρωση ${new Date(data.syncedAt).toLocaleString('el-GR')}` : 'Χωρίς συγχρονισμό'}
      >
        <FiRefreshCw className={cn('size-3.5', busy && 'animate-spin motion-reduce:animate-none')} aria-hidden /> Ανανέωση υπολοίπων
      </button>
    </div>
  );
}

const TRIGGER = cn(
  '!h-full flex-none cursor-pointer gap-1 rounded-none px-1.5 text-[length:var(--fs-12)] text-muted-foreground sm:gap-1.5 sm:px-2.5',
  'hover:text-foreground data-[state=active]:font-semibold data-[state=active]:!text-[color:var(--tab-tone)]',
  'after:bg-[var(--tab-tone)] after:!h-[2px] after:!bottom-0',
);

/** Πολυμέσα ενός είδους: tabs Φωτογραφίες / Βίντεο / 360°, μεταφόρτωση πολλών αρχείων, editor. */
export function ItemMediaPanel({ mtrl, canManage, showStock = false }: { mtrl: number; canManage: boolean; showStock?: boolean }) {
  const [media, setMedia] = React.useState<ItemMediaDTO[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [upload, setUpload] = React.useState<{ kind: MediaKind; files: File[] } | null>(null);
  const [editing, setEditing] = React.useState<ItemMediaDTO | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/items/${mtrl}/media`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Αποτυχία φόρτωσης');
      setMedia(body.media); setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [mtrl]);
  React.useEffect(() => { void load(); }, [load]);

  const call = async (url: string, init: RequestInit, ok: string) => {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.message || 'Η ενέργεια απέτυχε'); return; }
    toast.success(ok);
    await load();
  };

  const move = async (list: ItemMediaDTO[], idx: number, dir: -1 | 1) => {
    const ids = list.map((m) => m.id);
    const j = idx + dir;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    await call(`/api/admin/items/${mtrl}/media/order`, { method: 'PUT', body: JSON.stringify({ kind: list[0].kind, ids }) }, 'Η σειρά άλλαξε');
  };

  const remove = async (m: ItemMediaDTO) => {
    const ok = await confirmAction({
      title: 'Διαγραφή αρχείου',
      message: `Να διαγραφεί «${m.name}»; Σβήνεται και από το Bunny CDN.${m.isPrimary ? ' Κύρια θα γίνει η επόμενη φωτογραφία.' : ''}`,
      confirmLabel: 'Διαγραφή', destructive: true,
    });
    if (ok) await call(`/api/admin/items/${mtrl}/media/${m.id}`, { method: 'DELETE' }, 'Το αρχείο διαγράφηκε');
  };

  if (error && !media) {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)]">
        <FiAlertTriangle className="size-4 text-destructive" aria-hidden /><span className="flex-1">{error}</span>
        <button type="button" onClick={load} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2.5 hover:bg-muted">
          <FiRefreshCw className="size-3.5" aria-hidden /> Δοκιμή ξανά
        </button>
      </div>
    );
  }
  if (!media) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7" aria-busy="true" aria-label="Φόρτωση">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-md bg-muted motion-reduce:animate-none" />)}
      </div>
    );
  }

  const byKind = (k: MediaKind) => media.filter((m) => m.kind === k);

  return (
    <>
      {showStock && <div className="mb-3"><StockStrip mtrl={mtrl} /></div>}
      <Tabs defaultValue="images" className="gap-2">
        <TabsList variant="line" className="h-8 w-full justify-start gap-0 overflow-x-auto overflow-y-hidden border-b border-border p-0">
          {KINDS.map((k) => {
            const Icon = k.icon;
            const n = byKind(k.kind).length;
            return (
              <TabsTrigger key={k.kind} value={k.tab} className={TRIGGER} style={{ ['--tab-tone' as string]: k.tone }}>
                <Icon className="hidden size-3.5 sm:inline" aria-hidden /> {k.label}
                <span className="rounded-full px-1.5 text-[length:var(--fs-10)] font-semibold tabular-nums leading-4" style={{ color: k.tone, backgroundColor: soft(k.tone, 14) }}>{n}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {KINDS.map((k) => {
          const list = byKind(k.kind);
          return (
            <TabsContent key={k.kind} value={k.tab} className="space-y-2">
              {canManage && <DropZone kind={k} onFiles={(files) => setUpload({ kind: k.kind, files })} disabled={!!upload} />}
              {list.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-[length:var(--fs-12)] text-muted-foreground">
                  Δεν υπάρχουν {k.label.toLowerCase() === '360°' ? 'πανοράματα 360°' : k.label.toLowerCase()} για αυτό το είδος.
                </p>
              ) : (
                <div className={cn('grid gap-2', k.kind === 'PANORAMA' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6')}>
                  {list.map((m, i) => (
                    <MediaCard
                      key={m.id} m={m} index={i} count={list.length} canManage={canManage}
                      onPrimary={() => call(`/api/admin/items/${mtrl}/media/${m.id}`, { method: 'PATCH', body: JSON.stringify({ primary: true }) }, 'Ορίστηκε ως κύρια φωτογραφία')}
                      onEdit={() => setEditing(m)}
                      onMove={(dir) => move(list, i, dir)}
                      onDelete={() => remove(m)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {upload && (
        <UploadProgressDialog
          mtrl={mtrl} kind={upload.kind} files={upload.files} open
          onOpenChange={(o) => { if (!o) setUpload(null); }}
          onFinished={load}
        />
      )}
      <ImageEditorDialog
        mtrl={mtrl} media={editing} open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSaved={() => { void load(); }}
      />
    </>
  );
}
