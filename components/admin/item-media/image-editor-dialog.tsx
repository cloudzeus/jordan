'use client';

import * as React from 'react';
import {
  FiRotateCcw, FiRotateCw, FiMaximize, FiMinimize, FiCrosshair, FiZoomIn, FiZoomOut, FiLoader, FiMove,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Segmented } from '@/components/admin/form-kit';
import {
  CANVAS, DEFAULT_TRANSFORM, MAX_ZOOM, MIN_ZOOM, fillZoom, placement, type ImageTransform, type Rotation,
} from '@/lib/item-media/transform';
import type { ItemMediaDTO } from '@/lib/item-media/service';

const TOOL = 'inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2 text-(length:--fs-11) font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Επεξεργασία φωτογραφίας πάνω στον καμβά 1920×1920. Η προεπισκόπηση χρησιμοποιεί ΤΗΝ ΙΔΙΑ
 * `placement` με τον server (lib/item-media/transform), άρα ό,τι φαίνεται είναι ό,τι παράγεται.
 * Πηγή είναι το ΠΡΩΤΟΤΥΠΟ (originalUrl), όχι το ήδη κομμένο τετράγωνο.
 */
export function ImageEditorDialog({
  mtrl, media, open, onOpenChange, onSaved,
}: {
  mtrl: number;
  media: ItemMediaDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (m: ItemMediaDTO) => void;
}) {
  const [t, setT] = React.useState<ImageTransform>(DEFAULT_TRANSFORM);
  const [busy, setBusy] = React.useState(false);
  const [box, setBox] = React.useState(480);
  const [dragging, setDragging] = React.useState(false);
  // Callback ref (όχι useRef): ο καμβάς μπαίνει στο DOM ΜΕΤΑ το άνοιγμα του Dialog (portal +
  // animation), άρα ο παρατηρητής μεγέθους πρέπει να δένεται όταν εμφανιστεί το στοιχείο.
  const [stageEl, setStageEl] = React.useState<HTMLDivElement | null>(null);
  const drag = React.useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  React.useEffect(() => { if (open && media) setT(media.transform ?? DEFAULT_TRANSFORM); }, [open, media]);

  // Το μέγεθος του καμβά στην οθόνη (τετράγωνο που χωρά στο παράθυρο) — η κλίμακα προεπισκόπησης.
  React.useEffect(() => {
    if (!stageEl) return;
    const update = () => setBox(stageEl.clientWidth || 480);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl]);

  if (!media) return null;
  const ow = media.originalWidth ?? CANVAS;
  const oh = media.originalHeight ?? CANVAS;
  const k = box / CANVAS;
  const p = placement(ow, oh, t);
  const rot90 = t.rotate === 90 || t.rotate === 270;

  const set = (patch: Partial<ImageTransform>) => setT((cur) => ({ ...cur, ...patch }));
  const zoomTo = (z: number) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100)) });
  const rotate = (dir: 1 | -1) => set({ rotate: (((t.rotate + dir * 90) % 360) + 360) % 360 as Rotation });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    set({ x: Math.round(d.x + (e.clientX - d.px) / k), y: Math.round(d.y + (e.clientY - d.py) / k) });
  };
  const onPointerUp = () => { drag.current = null; setDragging(false); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 50 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (m) { e.preventDefault(); set({ x: t.x + m[0], y: t.y + m[1] }); }
    if (e.key === '+' || e.key === '=') zoomTo(t.zoom * 1.1);
    if (e.key === '-') zoomTo(t.zoom / 1.1);
  };
  const onWheel = (e: React.WheelEvent) => { zoomTo(t.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06)); };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/items/${mtrl}/media/${media.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transform: t }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Η αποθήκευση απέτυχε');
      toast.success('Η φωτογραφία ενημερώθηκε (1920×1920 WebP)');
      onSaved(body.media);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Σύγκριση ΤΙΜΩΝ (όχι JSON κειμένου — η σειρά των κλειδιών δεν είναι εγγυημένη).
  const base = media.transform ?? DEFAULT_TRANSFORM;
  const changed = t.zoom !== base.zoom || t.x !== base.x || t.y !== base.y || t.rotate !== base.rotate || t.background !== base.background;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[96dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-4 py-2.5 pr-12">
          <DialogTitle className="text-(length:--fs-15)">Επεξεργασία φωτογραφίας</DialogTitle>
          <DialogDescription className="truncate text-(length:--fs-11)">
            {media.name} · πρωτότυπο {ow}×{oh} · αποθήκευση ως 1920×1920 WebP
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 py-3">
          {/* Ο καμβάς: τετράγωνο που χωρά στο ύψος του παραθύρου. */}
          <div className="mx-auto w-full max-w-[min(100%,60dvh)]">
            <div
              ref={setStageEl}
              role="application"
              aria-label="Καμβάς 1920×1920 — σύρε για μετακίνηση, βελάκια για ακρίβεια, + και − για zoom"
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
              onWheel={onWheel}
              className={cn(
                'relative aspect-square w-full touch-none select-none overflow-hidden rounded-md border border-border outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                dragging ? 'cursor-grabbing' : 'cursor-grab',
              )}
              style={t.background === 'white'
                ? { backgroundColor: '#ffffff' }
                : { backgroundImage: 'repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%)', backgroundSize: '16px 16px' }}
            >
              <div
                className="absolute"
                style={{ left: p.left * k, top: p.top * k, width: p.width * k, height: p.height * k }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={media.originalUrl ?? media.url}
                  alt={media.name}
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                  style={{
                    width: (rot90 ? p.height : p.width) * k,
                    height: (rot90 ? p.width : p.height) * k,
                    transform: `translate(-50%, -50%) rotate(${t.rotate}deg)`,
                  }}
                />
              </div>
              {/* Οδηγοί κέντρου όσο σέρνεται η φωτογραφία. */}
              {dragging && (
                <>
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-sisyphus-500/60" />
                  <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-sisyphus-500/60" />
                </>
              )}
            </div>
          </div>

          <div className="mx-auto mt-3 flex max-w-xl flex-wrap items-center justify-center gap-1.5">
            <button type="button" className={TOOL} onClick={() => rotate(-1)} aria-label="Περιστροφή αριστερά"><FiRotateCcw className="size-3.5" aria-hidden /> 90°</button>
            <button type="button" className={TOOL} onClick={() => rotate(1)} aria-label="Περιστροφή δεξιά"><FiRotateCw className="size-3.5" aria-hidden /> 90°</button>
            <button type="button" className={TOOL} onClick={() => set({ zoom: 1, x: 0, y: 0 })}><FiMinimize className="size-3.5" aria-hidden /> Προσαρμογή</button>
            <button type="button" className={TOOL} onClick={() => set({ zoom: fillZoom(ow, oh, t.rotate), x: 0, y: 0 })}><FiMaximize className="size-3.5" aria-hidden /> Γέμισμα</button>
            <button type="button" className={TOOL} onClick={() => set({ x: 0, y: 0 })}><FiCrosshair className="size-3.5" aria-hidden /> Κέντρο</button>
            <Segmented
              ariaLabel="Φόντο" value={t.background} onChange={(v) => set({ background: v })}
              options={[{ value: 'white', label: 'Λευκό' }, { value: 'transparent', label: 'Διάφανο' }]}
            />
          </div>

          <div className="mx-auto mt-2 flex max-w-xl items-center gap-2">
            <button type="button" className={cn(TOOL, 'px-1.5')} onClick={() => zoomTo(t.zoom / 1.1)} aria-label="Σμίκρυνση"><FiZoomOut className="size-3.5" aria-hidden /></button>
            <input
              type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={t.zoom}
              onChange={(e) => zoomTo(Number(e.target.value))}
              aria-label="Zoom" className="h-2 flex-1 cursor-pointer accent-sisyphus-500"
            />
            <button type="button" className={cn(TOOL, 'px-1.5')} onClick={() => zoomTo(t.zoom * 1.1)} aria-label="Μεγέθυνση"><FiZoomIn className="size-3.5" aria-hidden /></button>
            <span className="w-12 text-right text-(length:--fs-11) tabular-nums text-muted-foreground">{Math.round(t.zoom * 100)}%</span>
          </div>
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-(length:--fs-11) text-muted-foreground">
            <FiMove className="size-3" aria-hidden /> Σύρε τη φωτογραφία ή χρησιμοποίησε τα βελάκια (Shift για μεγαλύτερο βήμα).
          </p>
        </div>

        <DialogFooter className="mx-0 mb-0 gap-2 border-t border-border bg-card px-4 py-2.5">
          <Button variant="ghost" className="mr-auto" onClick={() => setT(DEFAULT_TRANSFORM)} disabled={busy}>Επαναφορά</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button onClick={save} disabled={busy || !changed}>
            {busy && <FiLoader className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
            {busy ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
