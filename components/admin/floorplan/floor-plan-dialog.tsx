'use client';

// Διαστασιολόγηση κάτοψης έργου — modal σε 3 βήματα:
//   1. Τοίχοι: ανέβασμα εικόνας/PDF, αυτόματη ανίχνευση τοίχων (ρυθμίσεις κατωφλίου/πάχους).
//   2. Κλίμακα: γραμμή γνωστού μήκους (π.χ. μια διάσταση του σχεδίου) → μέτρα ανά pixel.
//   3. Μέτρηση: κλικ μέσα σε χώρο (αυτόματο περίγραμμα) ή χειροκίνητο πολύγωνο· διαχωριστικά για
//      ανοιχτές πόρτες/ενιαίους χώρους. Εμβαδά, περίμετροι, σύνολο, εξαγωγή CSV/PNG ή αποθήκευση
//      στα αρχεία του έργου.
// Όλη η επεξεργασία γίνεται στον browser — τίποτα δεν φεύγει πριν πατηθεί «Αποθήκευση στο έργο».
import * as React from 'react';
import gsap from 'gsap';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import {
  FiUploadCloud, FiLoader, FiCheck, FiMove, FiMousePointer, FiEdit3, FiScissors, FiMaximize, FiBox, FiSquare,
  FiEye, FiEyeOff, FiTrash2, FiCopy, FiDownload, FiSave, FiRefreshCw, FiHelpCircle, FiChevronLeft, FiChevronRight, FiFileText,
} from 'react-icons/fi';
import { Ruler } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  burnLine, detectWalls, labelPoint, measureRoom, pointInPolygon, polygonArea, polygonPerimeter, toGray, toM2, wallRects,
  type Mask, type Pt, type WallResult,
} from '@/lib/floorplan/core';
import { loadPlan, type LoadedPlan } from './load-plan';
import { PlanViewer, type ViewerRoom, type ViewerTool } from './plan-viewer';
import { annotatedPng, download, fmtM, fmtM2, roomsCsv, roomsText, type ExportRoom } from './export';

type Room = { id: string; name: string; color: string; polygon: Pt[]; areaPx: number; perimeterPx: number; manual: boolean };
type Calib = { a: Pt; b: Pt; meters: number };

const PALETTE = ['#38BDF8', '#34D399', '#FBBF24', '#F472B6', '#A78BFA', '#FB923C', '#2DD4BF', '#F87171', '#A3E635', '#60A5FA'];
const WALL_RGB = [34, 211, 238];
// Ενδεικτικό ύψος τοίχων στο 3D: χαμηλό, ώστε να φαίνονται οι χώροι από πάνω (όχι το πραγματικό 2,7 m).
const WALL_VIEW_M = 1.1;
const nf = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 });
const uid = () => Math.random().toString(36).slice(2, 10);

const TOOLS: Array<{ key: ViewerTool; label: string; hint: string; kbd: string; icon: React.ReactNode }> = [
  { key: 'pan', label: 'Μετακίνηση', kbd: 'V', icon: <FiMove />, hint: 'Σύρε για μετακίνηση, ροδέλα για zoom.' },
  { key: 'room', label: 'Χώρος με κλικ', kbd: 'R', icon: <FiMousePointer />, hint: 'Κάνε κλικ μέσα σε έναν χώρο — το περίγραμμα βγαίνει αυτόματα από τους τοίχους.' },
  { key: 'polygon', label: 'Πολύγωνο', kbd: 'P', icon: <FiEdit3 />, hint: 'Κλικ στις γωνίες· διπλό κλικ, Enter ή κλικ στο πρώτο σημείο κλείνει. Shift = ορθές γωνίες.' },
  { key: 'divider', label: 'Διαχωριστικό', kbd: 'D', icon: <FiScissors />, hint: 'Δύο κλικ: μια νοητή γραμμή που κλείνει πόρτες ή χωρίζει ενιαίους χώρους.' },
  { key: 'calibrate', label: 'Κλίμακα', kbd: 'K', icon: <Ruler className="size-4" />, hint: 'Δύο κλικ στα άκρα μιας γνωστής απόστασης (π.χ. μια διάσταση του σχεδίου).' },
];

function maskOverlay(walls: Mask, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let i = 0, j = 0; i < walls.length; i++, j += 4) {
    if (!walls[i]) continue;
    img.data[j] = WALL_RGB[0]; img.data[j + 1] = WALL_RGB[1]; img.data[j + 2] = WALL_RGB[2]; img.data[j + 3] = 150;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children: React.ReactNode }) {
  return (
    <section
      data-fp-step
      className="relative rounded-xl border bg-card p-3 transition-colors"
      style={{ borderColor: active ? 'var(--primary)' : 'var(--border)', boxShadow: active ? '0 0 0 3px color-mix(in oklab, var(--primary) 14%, transparent)' : undefined }}
    >
      <header className="mb-2 flex items-center gap-2">
        <span
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold"
          style={done ? { background: '#10B981', color: '#fff' } : active ? { background: 'var(--primary)', color: 'var(--primary-foreground)' } : { background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          {done ? <FiCheck className="size-3.5" aria-hidden /> : n}
        </span>
        <h3 className="text-[length:var(--fs-13)] font-semibold">{title}</h3>
      </header>
      <div className="space-y-2.5 text-[length:var(--fs-12)]">{children}</div>
    </section>
  );
}

function Range({ label, value, min, max, step = 1, display, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step?: number; display: string; onChange: (v: number) => void; disabled?: boolean;
}) {
  const id = React.useId();
  return (
    <div className={disabled ? 'opacity-50' : undefined}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-muted-foreground">{label}</label>
        <span className="font-mono text-[11px] tabular-nums text-foreground">{display}</span>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[var(--primary)] disabled:cursor-not-allowed"
      />
    </div>
  );
}

export function FloorPlanDialog({ prjc, projectLabel, open, onOpenChange, canSave = false }: {
  prjc: number; projectLabel: string; open: boolean; onOpenChange: (o: boolean) => void;
  /** files.manage: «Αποθήκευση στο έργο» ανεβάζει PNG + CSV στον φάκελο «Κατόψεις». */
  canSave?: boolean;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [plan, setPlan] = React.useState<LoadedPlan | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [thr, setThr] = React.useState<number | null>(null);
  const [thick, setThick] = React.useState<number | null>(null);
  const [walls, setWalls] = React.useState<WallResult | null>(null);
  const [showWalls, setShowWalls] = React.useState(true);
  const [mode3d, setMode3d] = React.useState(false);
  const [tool, setTool] = React.useState<ViewerTool>('calibrate');
  const [draft, setDraft] = React.useState<Pt[]>([]);
  const [dividers, setDividers] = React.useState<Array<[Pt, Pt]>>([]);
  const [calib, setCalib] = React.useState<Calib | null>(null);
  const [calibLine, setCalibLine] = React.useState<[Pt, Pt] | null>(null);
  const [meters, setMeters] = React.useState('');
  const [doorCm, setDoorCm] = React.useState(100);
  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [fitKey, setFitKey] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const totalRef = React.useRef<HTMLSpanElement | null>(null);
  const metersRef = React.useRef<HTMLInputElement | null>(null);

  const w = plan?.analysis.width ?? 0, h = plan?.analysis.height ?? 0;
  const maxDim = Math.max(w, h);
  const gray = React.useMemo(() => (plan ? toGray(plan.analysis.data, w, h) : null), [plan, w, h]);
  const mPerPx = calib ? calib.meters / Math.hypot(calib.b.x - calib.a.x, calib.b.y - calib.a.y) : null;

  // ── Φόρτωση ──────────────────────────────────────────────────────────────────────────
  const reset = () => {
    setWalls(null); setThr(null); setThick(null); setDraft([]); setDividers([]); setCalib(null); setCalibLine(null);
    setMeters(''); setRooms([]); setSelected(null); setMode3d(false); setTool('calibrate'); seq.current = 0;
  };
  const load = React.useCallback(async (f: File, page = 1, keep = false) => {
    setLoading(true);
    try {
      const p = await loadPlan(f, page);
      if (!keep) reset();
      else { setWalls(null); setDraft([]); setDividers([]); setRooms([]); setSelected(null); setCalib(null); setCalibLine(null); }
      setFile(f); setPlan(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Το αρχείο δεν άνοιξε.');
    } finally {
      setLoading(false);
    }
  }, []);
  const dz = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'], 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false, noClick: !!plan, noKeyboard: !!plan,
    onDrop: (fs) => { if (fs[0]) void load(fs[0]); },
    onDropRejected: () => toast.error('Ανέβασε εικόνα (PNG/JPG) ή PDF.'),
  });

  // ── Ανίχνευση τοίχων (καθυστέρηση ώστε να ζωγραφιστεί πρώτα η ένδειξη) ───────────────
  React.useEffect(() => {
    if (!gray) return;
    setAnalyzing(true);
    const t = setTimeout(() => {
      const r = detectWalls(gray, w, h, { threshold: thr, minThickness: thick });
      setWalls(r);
      setAnalyzing(false);
    }, 120);
    return () => clearTimeout(t);
  }, [gray, w, h, thr, thick]);

  const overlay = React.useMemo(() => (walls ? maskOverlay(walls.walls, w, h) : null), [walls, w, h]);
  const rects = React.useMemo(() => (walls && mode3d ? wallRects(walls.walls, w, h, Math.max(2, Math.ceil(maxDim / 450))) : []), [walls, mode3d, w, h, maxDim]);
  const blocked = React.useMemo(() => {
    if (!walls) return null;
    const b = walls.walls.slice();
    for (const [a, c] of dividers) burnLine(b, w, h, a, c, 1);
    return b;
  }, [walls, dividers, w, h]);

  // Είσοδος στο πάνελ: απαλή εμφάνιση βημάτων.
  React.useEffect(() => {
    if (!plan || !railRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tw = gsap.from(railRef.current.querySelectorAll('[data-fp-step]'), { y: 10, opacity: 0, duration: 0.45, stagger: 0.07, ease: 'power2.out' });
    return () => { tw.revert(); };
  }, [plan]);

  // ── Μονάδες ──────────────────────────────────────────────────────────────────────────
  const fmtLen = React.useCallback((px: number) => (mPerPx ? fmtM(px * mPerPx) : `${Math.round(px)} px`), [mPerPx]);
  const areaOf = (r: Room) => (mPerPx ? toM2(r.areaPx, mPerPx) : null);
  const total = rooms.reduce((s, r) => s + (mPerPx ? toM2(r.areaPx, mPerPx) : 0), 0);

  // Σύνολο: «μετρητής» με GSAP όταν αλλάζει.
  const shown = React.useRef({ v: 0 });
  React.useEffect(() => {
    const el = totalRef.current;
    if (!el) return;
    const tw = gsap.to(shown.current, {
      v: total, duration: 0.6, ease: 'power2.out',
      onUpdate: () => { el.textContent = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(shown.current.v); },
    });
    return () => { tw.kill(); };
  }, [total]);

  // ── Ενέργειες ────────────────────────────────────────────────────────────────────────
  const seq = React.useRef(0);
  const addRoom = (polygon: Pt[], areaPx: number, perimeterPx: number, manual: boolean) => {
    const n = ++seq.current;
    const r: Room = { id: uid(), name: `Χώρος ${n}`, color: PALETTE[(n - 1) % PALETTE.length], polygon, areaPx, perimeterPx, manual };
    setRooms((rs) => [...rs, r]);
    setSelected(r.id);
  };

  const finishPolygon = () => {
    if (tool !== 'polygon' || draft.length < 3) return;
    addRoom(draft, polygonArea(draft), polygonPerimeter(draft), true);
    setDraft([]);
  };

  const onPick = (p: Pt) => {
    if (!blocked) return;
    if (tool === 'room') {
      const hit = [...rooms].reverse().find((r) => pointInPolygon(p, r.polygon));
      if (hit) { setSelected(hit.id); return; }
      // Ανοίγματα: δοκιμάζουμε χωρίς κλείσιμο, μετά μισό και ολόκληρο το «μέγιστο άνοιγμα».
      const maxGap = mPerPx ? doorCm / 100 / mPerPx : maxDim * 0.02;
      const res = measureRoom(blocked, w, h, p, [0, maxGap * 0.6, maxGap]);
      if (!res.ok) {
        toast.error(res.reason === 'on-wall'
          ? 'Το κλικ έπεσε πάνω σε τοίχο — κάνε κλικ στο δάπεδο του χώρου.'
          : 'Ο χώρος «διαρρέει» από κάποιο άνοιγμα. Κλείσ’ το με «Διαχωριστικό» ή αύξησε το «Μέγιστο άνοιγμα πόρτας».');
        return;
      }
      addRoom(res.polygon, res.areaPx, res.perimeterPx, false);
      if (res.gapPx > 0) toast.message(`Κλείστηκαν ανοίγματα έως ~${fmtLen(res.gapPx)} για να βρεθεί το περίγραμμα.`);
      return;
    }
    if (tool === 'polygon') {
      if (draft.length >= 3 && Math.hypot(p.x - draft[0].x, p.y - draft[0].y) < maxDim * 0.012) { finishPolygon(); return; }
      setDraft((d) => [...d, p]);
      return;
    }
    if (tool === 'divider') {
      if (!draft.length) setDraft([p]);
      else { setDividers((ds) => [...ds, [draft[0], p]]); setDraft([]); }
      return;
    }
    if (tool === 'calibrate') {
      if (!draft.length) { setDraft([p]); setCalibLine(null); }
      else {
        setCalibLine([draft[0], p]); setDraft([]);
        setTimeout(() => metersRef.current?.focus(), 30);
      }
    }
  };

  const applyCalib = () => {
    const v = Number(meters.replace(',', '.'));
    const line = calibLine ?? (calib ? [calib.a, calib.b] as [Pt, Pt] : null);
    if (!line || !(v > 0)) { toast.error('Σχεδίασε τη γραμμή και δώσε μήκος σε μέτρα.'); return; }
    if (Math.hypot(line[1].x - line[0].x, line[1].y - line[0].y) < 10) { toast.error('Η γραμμή είναι πολύ μικρή — διάλεξε μεγαλύτερη απόσταση για ακρίβεια.'); return; }
    setCalib({ a: line[0], b: line[1], meters: v });
    setCalibLine(null);
    setTool('room');
    toast.success('Η κλίμακα ορίστηκε — κάνε κλικ μέσα στους χώρους.');
  };

  const changeTool = (t: ViewerTool) => { setTool(t); setDraft([]); };

  // Πλήκτρα συντόμευσης (μόνο όταν το modal έχει κάτοψη και δεν γράφουμε σε πεδίο).
  React.useEffect(() => {
    if (!open || !plan) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape' && draft.length) { e.preventDefault(); e.stopPropagation(); setDraft([]); return; }
      if (e.key === 'Enter') { finishPolygon(); return; }
      if (e.key === 'Backspace' && draft.length) { e.preventDefault(); setDraft((d) => d.slice(0, -1)); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { setRooms((rs) => rs.filter((r) => r.id !== selected)); setSelected(null); return; }
      const t = TOOLS.find((x) => x.kbd.toLowerCase() === e.key.toLowerCase());
      if (t && !e.metaKey && !e.ctrlKey) changeTool(t.key);
      if (e.key === '3' && !e.metaKey && !e.ctrlKey) setMode3d((m) => !m);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // ── Εξαγωγή ──────────────────────────────────────────────────────────────────────────
  const exportRooms: ExportRoom[] = rooms.map((r) => ({
    name: r.name, color: r.color, polygon: r.polygon, areaM2: areaOf(r), perimeterM: mPerPx ? r.perimeterPx * mPerPx : null,
  }));
  const baseName = `katopsi-${prjc}-${new Date().toISOString().slice(0, 10)}`;
  const scaleNote = calib ? `Κλίμακα: ${nf.format(calib.meters)} m = ${Math.round(calib.meters / (mPerPx ?? 1))} px · αρχείο ${plan?.name ?? ''}${plan && plan.pages > 1 ? ` (σελ. ${plan.page})` : ''}` : 'Χωρίς κλίμακα';
  const png = () => annotatedPng({ image: plan!.display, w, h, rooms: exportRooms, dividers, title: projectLabel, scaleNote });

  const save = async () => {
    if (!plan || !rooms.length) return;
    setSaving(true);
    try {
      const files: Array<[Blob, string]> = [[await png(), `${baseName}.png`], [roomsCsv(exportRooms), `${baseName}.csv`]];
      for (const [b, name] of files) {
        const fd = new FormData();
        fd.append('file', new File([b], name, { type: b.type }));
        fd.append('subfolder', 'Κατόψεις');
        fd.append('notes', `Διαστασιολόγηση κάτοψης · σύνολο ${fmtM2(total)}`);
        const r = await fetch(`/api/admin/entity-files/projects/${prjc}`, { method: 'POST', body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? 'Η αποθήκευση απέτυχε.');
      }
      toast.success('Αποθηκεύτηκαν PNG και CSV στα αρχεία του έργου (φάκελος «Κατόψεις»).');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Η αποθήκευση απέτυχε.');
    } finally {
      setSaving(false);
    }
  };

  const viewerRooms: ViewerRoom[] = React.useMemo(() => rooms.map((r) => ({
    id: r.id, color: r.color, polygon: r.polygon, label: r.name, anchor: labelPoint(r.polygon),
    sub: mPerPx ? fmtM2(toM2(r.areaPx, mPerPx)) : `${nf.format(r.areaPx)} px²`,
  })), [rooms, mPerPx]);

  const step = !walls ? 1 : !calib ? 2 : 3;
  const activeTool = TOOLS.find((t) => t.key === tool)!;
  const thickCm = walls && mPerPx ? walls.minThickness * mPerPx * 100 : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[calc(100dvh-1rem)] w-full max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[min(92dvh,920px)] sm:max-w-[min(1440px,96vw)]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (draft.length) e.preventDefault(); }}
      >
        {/* Κεφαλίδα */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 pr-12">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md" style={{ background: '#0B1220', color: '#22D3EE' }}>
            <FiSquare className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[length:var(--fs-15)] font-semibold">Διαστασιολόγηση κάτοψης</DialogTitle>
            <DialogDescription className="truncate text-[length:var(--fs-12)] text-muted-foreground">{projectLabel}</DialogDescription>
          </div>
          <a
            href="/wiki/operations/floor-plan-measure" target="_blank" rel="noopener noreferrer"
            className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title="Βοήθεια: Διαστασιολόγηση κάτοψης" aria-label="Βοήθεια: Διαστασιολόγηση κάτοψης"
          >
            <FiHelpCircle className="size-4" />
          </a>
        </div>

        {!plan ? (
          /* ── Κενή κατάσταση: ανέβασμα ── */
          <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: '#0B1220' }}>
            <div
              aria-hidden className="absolute inset-0 opacity-60"
              style={{
                backgroundImage: 'linear-gradient(rgba(34,211,238,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.07) 1px, transparent 1px), linear-gradient(rgba(34,211,238,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.16) 1px, transparent 1px)',
                backgroundSize: '20px 20px, 20px 20px, 100px 100px, 100px 100px',
              }}
            />
            <div className="relative flex h-full items-center justify-center p-4">
              <div
                {...dz.getRootProps()}
                className="group flex w-full max-w-xl cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                style={{ borderColor: dz.isDragActive ? '#22D3EE' : 'rgba(148,163,184,.45)', background: dz.isDragActive ? 'rgba(34,211,238,.08)' : 'rgba(15,23,42,.6)' }}
              >
                <input {...dz.getInputProps()} aria-label="Αρχείο κάτοψης" />
                <span className="inline-flex size-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(34,211,238,.12)', color: '#22D3EE' }}>
                  {loading ? <FiLoader className="size-6 animate-spin" aria-hidden /> : <FiUploadCloud className="size-6" aria-hidden />}
                </span>
                <div>
                  <p className="text-[length:var(--fs-16)] font-semibold text-slate-50">{loading ? 'Άνοιγμα κάτοψης…' : 'Σύρε εδώ την κάτοψη ή πάτησε για επιλογή'}</p>
                  <p className="mt-1 text-[length:var(--fs-12)] text-slate-400">Εικόνα (PNG, JPG, WebP) ή PDF · η επεξεργασία γίνεται τοπικά στον browser</p>
                </div>
                <ol className="mt-2 grid w-full grid-cols-1 gap-2 text-left text-[length:var(--fs-12)] text-slate-300 sm:grid-cols-3">
                  {[['1', 'Τοίχοι', 'Εντοπίζονται αυτόματα'], ['2', 'Κλίμακα', 'Μια γνωστή απόσταση'], ['3', 'Μέτρηση', 'Κλικ στον χώρο → m²']].map(([n, t, d]) => (
                    <li key={n} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                      <span className="font-mono text-[11px] text-cyan-300">{n.padStart(2, '0')}</span>
                      <span className="ml-2 font-semibold text-slate-100">{t}</span>
                      <span className="block text-slate-400">{d}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[320px_minmax(0,1fr)] md:grid-rows-1">
            {/* ── Πάνελ βημάτων ── */}
            <div ref={railRef} className="order-2 max-h-[42dvh] space-y-3 overflow-y-auto border-t border-border bg-muted/30 p-3 md:order-1 md:max-h-none md:border-r md:border-t-0">
              <Step n={1} title="Τοίχοι" done={!!walls} active={step === 1}>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  {analyzing ? <><FiLoader className="size-3.5 animate-spin" aria-hidden /> Ανάλυση σχεδίου…</> : walls ? <>Τοίχοι στο <b className="font-mono text-foreground">{nf.format(walls.coverage * 100)}%</b> της εικόνας</> : 'Ανάλυση…'}
                </p>
                <Range
                  label="Κατώφλι μελανιού" min={40} max={235} value={thr ?? walls?.threshold ?? 128}
                  display={thr == null ? `αυτόματο · ${walls?.threshold ?? '—'}` : String(thr)} onChange={setThr}
                />
                <Range
                  label="Ελάχιστο πάχος τοίχου" min={2} max={40} value={thick ?? walls?.minThickness ?? 6}
                  display={`${thick == null ? 'αυτόματο · ' : ''}${walls?.minThickness ?? '—'} px${thickCm != null ? ` ≈ ${nf.format(thickCm)} cm` : ''}`}
                  onChange={setThick}
                />
                <div className="flex flex-wrap gap-1.5">
                  {(thr != null || thick != null) && (
                    <Button size="xs" variant="outline" onClick={() => { setThr(null); setThick(null); }}><FiRefreshCw aria-hidden /> Αυτόματα</Button>
                  )}
                  <Button size="xs" variant="ghost" onClick={() => setShowWalls((s) => !s)}>
                    {showWalls ? <FiEyeOff aria-hidden /> : <FiEye aria-hidden />} {showWalls ? 'Απόκρυψη' : 'Εμφάνιση'} τοίχων
                  </Button>
                </div>
                <p className="text-[length:var(--fs-11)] text-muted-foreground">Αν χάνονται λεπτοί εσωτερικοί τοίχοι, μίκρυνε το πάχος· αν «πιάνονται» γράμματα και έπιπλα, μεγάλωσέ το.</p>
              </Step>

              <Step n={2} title="Κλίμακα" done={!!calib} active={step === 2}>
                {calib && !calibLine ? (
                  <p className="text-muted-foreground">
                    <b className="font-mono text-foreground">{nf.format(calib.meters)} m</b> = {Math.round(calib.meters / (mPerPx ?? 1))} px ·{' '}
                    1 px ≈ <span className="font-mono">{nf.format((mPerPx ?? 0) * 1000)}</span> mm
                  </p>
                ) : (
                  <p className="text-muted-foreground">Σχεδίασε μια γραμμή πάνω σε απόσταση που ξέρεις (π.χ. μια αναγραφόμενη διάσταση ή το πλάτος μιας πόρτας) και δώσε το πραγματικό μήκος.</p>
                )}
                <Button size="sm" variant={tool === 'calibrate' ? 'default' : 'outline'} onClick={() => changeTool('calibrate')} className="w-full">
                  <Ruler className="size-3.5" aria-hidden /> {calib ? 'Νέα γραμμή κλίμακας' : 'Σχεδίασε γραμμή γνωστού μήκους'}
                </Button>
                {(calibLine || calib) && (
                  <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); applyCalib(); }}>
                    <div className="min-w-0 flex-1">
                      <label htmlFor="fp-meters" className="mb-1 block text-muted-foreground">
                        Πραγματικό μήκος{calibLine ? ` (${Math.round(Math.hypot(calibLine[1].x - calibLine[0].x, calibLine[1].y - calibLine[0].y))} px)` : ''}
                      </label>
                      <div className="relative">
                        <Input id="fp-meters" ref={metersRef} inputMode="decimal" placeholder="π.χ. 4,50" value={meters} onChange={(e) => setMeters(e.target.value)} className="pr-8 font-mono" />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">m</span>
                      </div>
                    </div>
                    <Button type="submit" size="sm" disabled={!meters}>Εφαρμογή</Button>
                  </form>
                )}
              </Step>

              <Step n={3} title="Μέτρηση χώρων" done={rooms.length > 0} active={step === 3}>
                <div className="grid grid-cols-3 gap-1.5">
                  {TOOLS.filter((t) => t.key === 'room' || t.key === 'polygon' || t.key === 'divider').map((t) => (
                    <button
                      key={t.key} type="button" onClick={() => changeTool(t.key)} aria-pressed={tool === t.key}
                      className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[length:var(--fs-11)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
                      style={tool === t.key ? { borderColor: 'var(--primary)', background: 'color-mix(in oklab, var(--primary) 10%, transparent)', color: 'var(--primary)' } : { borderColor: 'var(--border)' }}
                    >
                      {t.icon}{t.label}
                    </button>
                  ))}
                </div>
                <Range
                  label="Μέγιστο άνοιγμα πόρτας" min={0} max={250} step={10} value={doorCm} onChange={setDoorCm} disabled={!calib}
                  display={calib ? `${doorCm} cm` : 'μετά την κλίμακα'}
                />
                {dividers.length > 0 && (
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{dividers.length} διαχωριστικ{dividers.length === 1 ? 'ό' : 'ά'}</span>
                    <span className="flex gap-1">
                      <Button size="xs" variant="ghost" onClick={() => setDividers((d) => d.slice(0, -1))}>Αναίρεση</Button>
                      <Button size="xs" variant="ghost" onClick={() => setDividers([])}>Όλα</Button>
                    </span>
                  </div>
                )}

                {rooms.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-muted-foreground">
                    {calib ? 'Κάνε κλικ μέσα σε έναν χώρο της κάτοψης.' : 'Όρισε πρώτα την κλίμακα για να βγαίνουν m².'}
                  </p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
                    {rooms.map((r) => {
                      const a = areaOf(r);
                      return (
                        <li
                          key={r.id}
                          className="flex items-center gap-2 px-2 py-1.5"
                          style={r.id === selected ? { background: 'color-mix(in oklab, var(--primary) 7%, transparent)' } : undefined}
                          onClick={() => setSelected(r.id)}
                        >
                          <span className="size-3 shrink-0 rounded-sm" style={{ background: r.color }} aria-hidden />
                          <input
                            value={r.name} aria-label="Όνομα χώρου"
                            onChange={(e) => setRooms((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[length:var(--fs-12)] hover:border-border focus:border-ring focus:outline-none"
                          />
                          <span className="shrink-0 text-right font-mono text-[length:var(--fs-12)] font-semibold tabular-nums">
                            {a == null ? '—' : nf.format(a)}<span className="ml-0.5 text-[10px] font-normal text-muted-foreground">m²</span>
                            {mPerPx && <span className="block text-[10px] font-normal text-muted-foreground">Π {nf.format(r.perimeterPx * mPerPx)} m{r.manual ? ' · χειρ.' : ''}</span>}
                          </span>
                          <button
                            type="button" aria-label={`Διαγραφή ${r.name}`}
                            onClick={(e) => { e.stopPropagation(); setRooms((rs) => rs.filter((x) => x.id !== r.id)); }}
                            className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <FiTrash2 className="size-3.5" aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Step>

              {/* Σύνολο + εξαγωγή */}
              <section data-fp-step className="rounded-xl p-3 text-slate-100" style={{ background: '#0B1220' }}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[length:var(--fs-11)] font-medium uppercase tracking-wider text-slate-400">Σύνολο</span>
                  <span className="text-[length:var(--fs-11)] text-slate-400">{rooms.length} χώρ{rooms.length === 1 ? 'ος' : 'οι'}</span>
                </div>
                <p className="mt-1 font-mono text-[28px] font-semibold leading-none tabular-nums" style={{ color: '#22D3EE' }}>
                  <span ref={totalRef}>0,00</span><span className="ml-1 text-[14px] text-slate-400">m²</span>
                </p>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <Button
                    size="sm" variant="secondary" disabled={!rooms.length || !calib}
                    onClick={() => navigator.clipboard.writeText(roomsText(exportRooms, projectLabel)).then(() => toast.success('Αντιγράφηκε'), () => toast.error('Δεν επετράπη η αντιγραφή'))}
                  >
                    <FiCopy aria-hidden /> Αντιγρ.
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!rooms.length || !calib} onClick={() => download(roomsCsv(exportRooms), `${baseName}.csv`)}>
                    <FiFileText aria-hidden /> CSV
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!rooms.length} onClick={() => void png().then((b) => download(b, `${baseName}.png`))}>
                    <FiDownload aria-hidden /> PNG
                  </Button>
                </div>
                {canSave && (
                  <Button className="mt-1.5 w-full" size="sm" disabled={!rooms.length || !calib || saving} onClick={() => void save()}>
                    {saving ? <FiLoader className="animate-spin" aria-hidden /> : <FiSave aria-hidden />} Αποθήκευση στα αρχεία του έργου
                  </Button>
                )}
              </section>
            </div>

            {/* ── Προβολή ── */}
            <div className="relative order-1 min-h-[45dvh] md:order-2 md:min-h-0" {...dz.getRootProps()}>
              <input {...dz.getInputProps()} />
              <PlanViewer
                image={plan.display} w={w} h={h}
                wallsOverlay={overlay} wallRects={rects} wallHeightPx={mPerPx ? WALL_VIEW_M / mPerPx : maxDim * 0.012}
                showWalls={showWalls} mode3d={mode3d}
                rooms={viewerRooms} selectedId={selected} dividers={dividers}
                calibration={calibLine ?? (calib ? [calib.a, calib.b] : null)}
                draft={draft} tool={tool} formatLength={fmtLen}
                onPick={onPick} onFinish={finishPolygon} fitKey={fitKey}
              />

              {/* Εργαλειοθήκη (αριστερά) */}
              <div className="absolute left-3 top-3 flex flex-col gap-1 rounded-xl border border-slate-700/80 bg-slate-900/85 p-1 shadow-xl backdrop-blur" role="toolbar" aria-label="Εργαλεία">
                {TOOLS.map((t) => (
                  <button
                    key={t.key} type="button" onClick={() => changeTool(t.key)} aria-pressed={tool === t.key}
                    title={`${t.label} (${t.kbd})`} aria-label={t.label}
                    className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 [&_svg]:size-4"
                    style={tool === t.key ? { background: '#22D3EE', color: '#0B1220' } : { color: '#CBD5E1' }}
                  >
                    {t.icon}
                  </button>
                ))}
              </div>

              {/* Προβολή (δεξιά) */}
              <div className="absolute right-3 top-3 flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-900/85 p-1 text-slate-200 shadow-xl backdrop-blur">
                <div className="flex rounded-lg bg-slate-800/80 p-0.5" role="group" aria-label="Προβολή">
                  {[{ v: false, l: '2D', i: <FiSquare /> }, { v: true, l: '3D', i: <FiBox /> }].map((o) => (
                    <button
                      key={o.l} type="button" onClick={() => setMode3d(o.v)} aria-pressed={mode3d === o.v}
                      className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-colors [&_svg]:size-3.5"
                      style={mode3d === o.v ? { background: '#22D3EE', color: '#0B1220' } : undefined}
                    >
                      {o.i}{o.l}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setShowWalls((s) => !s)} title="Τοίχοι" aria-label="Εναλλαγή τοίχων" aria-pressed={showWalls} className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-slate-800 [&_svg]:size-4">
                  {showWalls ? <FiEye /> : <FiEyeOff />}
                </button>
                <button type="button" onClick={() => setFitKey((k) => k + 1)} title="Χωράει ολόκληρο" aria-label="Χωράει ολόκληρο" className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-slate-800 [&_svg]:size-4">
                  <FiMaximize />
                </button>
                <button type="button" onClick={() => dz.open()} title="Άλλη κάτοψη" aria-label="Άλλη κάτοψη" className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-slate-800 [&_svg]:size-4">
                  <FiUploadCloud />
                </button>
              </div>

              {/* Σελίδες PDF */}
              {plan.pages > 1 && file && (
                <div className="absolute bottom-14 right-3 flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-900/85 px-1 py-0.5 text-[11px] text-slate-200 backdrop-blur">
                  <button type="button" aria-label="Προηγούμενη σελίδα" disabled={plan.page <= 1 || loading} onClick={() => void load(file, plan.page - 1, true)} className="inline-flex size-6 cursor-pointer items-center justify-center rounded hover:bg-slate-800 disabled:opacity-40"><FiChevronLeft /></button>
                  <span className="font-mono tabular-nums">σελ. {plan.page}/{plan.pages}</span>
                  <button type="button" aria-label="Επόμενη σελίδα" disabled={plan.page >= plan.pages || loading} onClick={() => void load(file, plan.page + 1, true)} className="inline-flex size-6 cursor-pointer items-center justify-center rounded hover:bg-slate-800 disabled:opacity-40"><FiChevronRight /></button>
                </div>
              )}

              {/* Οδηγία εργαλείου */}
              <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
                <div className="flex max-w-full items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 text-[length:var(--fs-12)] text-slate-200 shadow-xl backdrop-blur">
                  {(analyzing || loading) && <FiLoader className="size-3.5 shrink-0 animate-spin text-cyan-300" aria-hidden />}
                  <span className="shrink-0 font-semibold text-cyan-300">{activeTool.label}</span>
                  <span className="truncate">{tool === 'room' && !calib ? 'Όρισε πρώτα την κλίμακα (βήμα 2) για εμβαδά σε m².' : activeTool.hint}</span>
                  {draft.length > 0 && <kbd className="hidden shrink-0 rounded border border-slate-600 px-1 font-mono text-[10px] text-slate-400 sm:inline">Esc</kbd>}
                </div>
              </div>
              {dz.isDragActive && (
                <div className="absolute inset-0 flex items-center justify-center border-2 border-dashed border-cyan-300 bg-cyan-400/10 text-[length:var(--fs-14)] font-semibold text-cyan-100">
                  Άφησε εδώ τη νέα κάτοψη
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
