'use client';

// Προεπισκόπηση αρχείων σε modal — κοινή για όλη τη διαχείριση: εικόνες σε πλήρες μέγεθος, PDF μέσα στο
// παράθυρο, για τα υπόλοιπα (CAD, Excel, Word, HEIC) καθαρό μήνυμα + λήψη. Επόμενο/προηγούμενο με βέλη ή ← →.
import * as React from 'react';
import { FiChevronLeft, FiChevronRight, FiDownload, FiExternalLink, FiFile } from 'react-icons/fi';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type PreviewItem = {
  /** URL του αρχείου (για εικόνες/PDF). */
  src: string;
  name: string;
  kind: 'image' | 'pdf' | 'other';
  /** Λήψη (αν διαφέρει από το src). */
  downloadHref?: string;
  /** Μία γραμμή κάτω από τον τίτλο (π.χ. φάκελος · μέγεθος · ημερομηνία). */
  caption?: string | null;
};

/** Είδος προεπισκόπησης από το όνομα/επέκταση (HEIC δεν εμφανίζεται στους περισσότερους browsers). */
export function previewKind(nameOrExt: string): PreviewItem['kind'] {
  const ext = nameOrExt.toLowerCase().split('.').pop() ?? '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

/** Αρχεία της εφαρμογής (EntityFile) — εικόνα από το ίδιο URL, PDF inline. */
export const entityPreview = (id: string, name: string, caption?: string | null): PreviewItem => {
  const src = `/api/admin/entity-files/file/${id}`;
  const kind = previewKind(name);
  return { src: kind === 'pdf' ? `${src}?inline=1` : src, downloadHref: src, name, kind, caption };
};
/** Φωτογραφίες χωρίς γνωστό όνομα (σημειώσεις, συσκευές, παραδόσεις) — είναι πάντα εικόνες. */
export const photoPreviews = (ids: string[], label: string): PreviewItem[] =>
  ids.map((id, i) => ({ src: `/api/admin/entity-files/file/${id}`, name: ids.length > 1 ? `${label} · ${i + 1}/${ids.length}` : label, kind: 'image' }));

export function FilePreview({ items, index, onClose }: { items: PreviewItem[]; index: number | null; onClose: () => void }) {
  const [i, setI] = React.useState(index ?? 0);
  const [prev, setPrev] = React.useState(index);
  if (prev !== index) { setPrev(index); if (index != null) setI(index); }
  const open = index != null && items.length > 0;
  const it = items[Math.min(i, items.length - 1)];
  const go = React.useCallback((d: number) => setI((x) => (x + d + items.length) % items.length), [items.length]);
  React.useEffect(() => {
    if (!open || items.length < 2) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items.length, go]);
  if (!it) return null;
  const btn = 'inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[88dvh] w-[min(72rem,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 pr-12">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-(length:--fs-13) font-semibold">{it.name}</DialogTitle>
            <DialogDescription className="truncate text-(length:--fs-11)">
              {items.length > 1 ? `${i + 1} από ${items.length}` : 'Προεπισκόπηση'}{it.caption ? ` · ${it.caption}` : ''}
            </DialogDescription>
          </div>
          {it.kind !== 'other' && <a href={it.src} target="_blank" rel="noopener noreferrer" className={btn} title="Άνοιγμα σε νέα καρτέλα" aria-label="Άνοιγμα σε νέα καρτέλα"><FiExternalLink className="size-4" /></a>}
          <a href={it.downloadHref ?? it.src} download className={btn} title="Λήψη" aria-label="Λήψη"><FiDownload className="size-4" /></a>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/40">
          {it.kind === 'image' && (
            // Απλό <img>: ιδιωτικό αρχείο μέσω API, όχι next/image.
            <img key={it.src} src={it.src} alt={it.name} className="max-h-full max-w-full object-contain" />
          )}
          {it.kind === 'pdf' && <iframe key={it.src} src={it.src} title={it.name} className="h-full w-full bg-white" />}
          {it.kind === 'other' && (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <FiFile className="size-10 text-muted-foreground" aria-hidden />
              <p className="text-(length:--fs-13)">Αυτό το είδος αρχείου δεν προβάλλεται στον browser.</p>
              <a href={it.downloadHref ?? it.src} download className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-(length:--fs-13) font-medium text-primary-foreground hover:bg-primary/90"><FiDownload className="size-4" />Λήψη</a>
            </div>
          )}
          {items.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Προηγούμενο" className={cn('absolute left-2 top-1/2 -translate-y-1/2 inline-flex size-10 cursor-pointer items-center justify-center rounded-full bg-background/90 shadow-md ring-1 ring-border hover:bg-background')}><FiChevronLeft className="size-5" /></button>
              <button type="button" onClick={() => go(1)} aria-label="Επόμενο" className={cn('absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-10 cursor-pointer items-center justify-center rounded-full bg-background/90 shadow-md ring-1 ring-border hover:bg-background')}><FiChevronRight className="size-5" /></button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Χρήση: `const pv = useFilePreview(); … onClick={() => pv.open(items, i)} … {pv.element}` */
export function useFilePreview() {
  const [state, setState] = React.useState<{ items: PreviewItem[]; index: number } | null>(null);
  return {
    open: (items: PreviewItem[], index = 0) => setState({ items, index }),
    element: <FilePreview items={state?.items ?? []} index={state?.index ?? null} onClose={() => setState(null)} />,
  };
}
