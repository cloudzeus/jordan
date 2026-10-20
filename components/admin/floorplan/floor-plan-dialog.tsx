'use client';

// Διαστασιολόγηση κάτοψης έργου — modal σε 3 βήματα:
//   1. Τοίχοι: ανέβασμα εικόνας/PDF, αυτόματη ανίχνευση τοίχων (ρυθμίσεις κατωφλίου/πάχους) ή/και
//      σχεδίαση τοίχων από τον χρήστη — πάνω στο σχέδιο ή σε κενό κάναβο αν το αρχείο δεν διαβάζεται.
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
  FiUploadCloud, FiLoader, FiCheck, FiMove, FiMousePointer, FiEdit3, FiScissors, FiMaximize, FiSquare, FiGrid, FiRotateCcw,
  FiEye, FiEyeOff, FiTrash2, FiCopy, FiDownload, FiSave, FiRefreshCw, FiHelpCircle, FiChevronLeft, FiChevronRight, FiFileText,
} from 'react-icons/fi';
import { BrickWall, Ruler } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  burnLine, detectWalls, labelPoint, measureRoom, pointInPolygon, polygonArea, polygonPerimeter, toGray, toM2,
  type Mask, type Pt, type WallResult,
} from '@/lib/floorplan/core';
import { blankPlan, loadPlan, type LoadedPlan } from './load-plan';
import { PlanViewer, WALL_DRAW, type ViewerRoom, type ViewerTool } from './plan-viewer';
import { annotatedPng, download, fmtM, fmtM2, roomsCsv, roomsText, type ExportRoom } from './export';

type Room = { id: string; name: string; color: string; polygon: Pt[]; areaPx: number; perimeterPx: number; manual: boolean };
type Calib = { a: Pt; b: Pt; meters: number };
/** Τοίχος σχεδιασμένος από τον χρήστη: τμήμα a→b με πάχος t (px ανάλυσης). */
type DrawnWall = { a: Pt; b: Pt; t: number };

const PALETTE = ['#38BDF8', '#34D399', '#FBBF24', '#F472B6', '#A78BFA', '#FB923C', '#2DD4BF', '#F87171', '#A3E635', '#60A5FA'];
const WALL_RGB = [34, 211, 238];
const DRAWN_RGB = [251, 146, 60]; // = WALL_DRAW

const nf = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 });
const uid = () => Math.random().toString(36).slice(2, 10);

const TOOLS: Array<{ key: ViewerTool; label: string; hint: string; kbd: string; icon: React.ReactNode }> = [
  { key: 'pan', label: 'Μετακίνηση', kbd: 'V', icon: <FiMove />, hint: 'Σύρε για μετακίνηση, ροδέλα για zoom.' },
  { key: 'room', label: 'Χώρος με κλικ', kbd: 'R', icon: <FiMousePointer />, hint: 'Κάνε κλικ μέσα σε έναν χώρο — το περίγραμμα βγαίνει αυτόματα από τους τοίχους.' },
  { key: 'polygon', label: 'Πολύγωνο', kbd: 'P', icon: <FiEdit3 />, hint: 'Κλικ στις γωνίες· διπλό κλικ, Enter ή κλικ στο πρώτο σημείο κλείνει. Shift = ορθές γωνίες.' },
  { key: 'wall', label: 'Τοίχος', kbd: 'W', icon: <BrickWall className="size-4" />, hint: 'Κλικ σε κάθε γωνία του τοίχου· διπλό κλικ ή Enter τελειώνει. Shift = οριζόντια/κάθετα· κουμπώνει στα άκρα άλλων τοίχων.' },
  { key: 'divider', label: 'Διαχωριστικό', kbd: 'D', icon: <FiScissors />, hint: 'Δύο κλικ: μια νοητή γραμμή που κλείνει πόρτες ή χωρίζει ενιαίους χώρους.' },
  { key: 'calibrate', label: 'Κλίμακα', kbd: 'K', icon: <Ruler className="size-4" />, hint: 'Δύο κλικ στα άκρα μιας γνωστής απόστασης (π.χ. μια διάσταση του σχεδίου).' },
];

/** Μάσκα τοίχων ως διαφανής εικόνα: αυτόματοι σε κυανό, σχεδιασμένοι από τον χρήστη σε πορτοκαλί. */
function maskOverlay(auto: Mask | null, drawn: Mask, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let i = 0, j = 0; i < drawn.length; i++, j += 4) {
    const rgb = drawn[i] ? DRAWN_RGB : auto?.[i] ? WALL_RGB : null;
    if (!rgb) continue;
    img.data[j] = rgb[0]; img.data[j + 1] = rgb[1]; img.data[j + 2] = rgb[2]; img.data[j + 3] = drawn[i] ? 210 : 150;
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
  /** Αυτόματη ανίχνευση τοίχων· σβήνει όταν το σχέδιο δεν «διαβάζεται» και ο χρήστης τους σχεδιάζει μόνος. */
  const [autoWalls, setAutoWalls] = React.useState(true);
  const [drawnWalls, setDrawnWalls] = React.useState<DrawnWall[]>([]);
  const [wallCm, setWallCm] = React.useState(15);
  /** Πολύγωνο: οι πλευρές του γίνονται και τοίχοι (καθαρό εμβαδό μέσα από τον τοίχο). */
  const [polyWalls, setPolyWalls] = React.useState(false);
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
    setMeters(''); setRooms([]); setSelected(null); setTool('calibrate'); seq.current = 0;
    setDrawnWalls([]); setAutoWalls(true);
  };
  const load = React.useCallback(async (f: File, page = 1, keep = false) => {
    setLoading(true);
    try {
      const p = await loadPlan(f, page);
      if (!keep) reset();
      else { setWalls(null); setDraft([]); setDividers([]); setRooms([]); setSelected(null); setCalib(null); setCalibLine(null); setDrawnWalls([]); }
      setFile(f); setPlan(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Το αρχείο δεν άνοιξε.', {
        description: 'Μπορείς να σχεδιάσεις τους τοίχους μόνος σου σε κενό κάναβο.',
        action: { label: 'Κενός κάναβος', onClick: () => startBlank() },
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Χωρίς σχέδιο: κενός κάναβος με γνωστή κλίμακα — κατευθείαν στη σχεδίαση τοίχων.
  function startBlank() {
    const p = blankPlan();
    reset();
    setFile(null); setPlan(p); setAutoWalls(false); setTool('wall');
    setCalib({ a: { x: 0, y: 0 }, b: { x: p.pxPerM!, y: 0 }, meters: 1 });
  }
  const dz = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'], 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false, noClick: !!plan, noKeyboard: !!plan,
    onDrop: (fs) => { if (fs[0]) void load(fs[0]); },
    onDropRejected: () => toast.error('Ανέβασε εικόνα (PNG/JPG) ή PDF.'),
  });

  // ── Ανίχνευση τοίχων (καθυστέρηση ώστε να ζωγραφιστεί πρώτα η ένδειξη) ───────────────
  React.useEffect(() => {
    if (!gray || !autoWalls) { setWalls(null); setAnalyzing(false); return; }
    setAnalyzing(true);
    const t = setTimeout(() => {
      const r = detectWalls(gray, w, h, { threshold: thr, minThickness: thick });
      setWalls(r);
      setAnalyzing(false);
    }, 120);
    return () => clearTimeout(t);
  }, [gray, w, h, thr, thick, autoWalls]);

  const drawnMask = React.useMemo(() => {
    const m = new Uint8Array(w * h);
    for (const d of drawnWalls) burnLine(m, w, h, d.a, d.b, Math.max(1, Math.round(d.t / 2)));
    return m;
  }, [drawnWalls, w, h]);
  const autoMask = autoWalls ? walls?.walls ?? null : null;
  const overlay = React.useMemo(() => (plan ? maskOverlay(autoMask, drawnMask, w, h) : null), [plan, autoMask, drawnMask, w, h]);
  // Εμπόδια για το «χώρος με κλικ»: αυτόματοι + σχεδιασμένοι τοίχοι + διαχωριστικά.
  const blocked = React.useMemo(() => {
    if (!plan || (autoWalls && !walls)) return null;
    const b = drawnMask.slice();
    if (autoMask) for (let i = 0; i < b.length; i++) if (autoMask[i]) b[i] = 1;
    for (const [a, c] of dividers) burnLine(b, w, h, a, c, 1);
    return b;
  }, [plan, autoWalls, walls, autoMask, drawnMask, dividers, w, h]);

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

  const wallPx = mPerPx ? wallCm / 100 / mPerPx : Math.max(4, Math.round(maxDim * 0.008));
  // Κούμπωμα στα άκρα των τοίχων (και στο πρώτο σημείο της τρέχουσας αλυσίδας) για κλειστά περιγράμματα.
  const snap = (p: Pt): Pt => {
    const r = Math.max(6, maxDim * 0.012);
    let best: Pt | null = null, bd = r;
    for (const q of [...drawnWalls.flatMap((d) => [d.a, d.b]), ...draft]) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = q; }
    }
    return best ? { ...best } : p;
  };
  const finish = () => { if (tool === 'wall') setDraft([]); else finishPolygon(); };

  const finishPolygon = () => {
    if (tool !== 'polygon' || draft.length < 3) return;
    if (polyWalls) {
      // Το περίγραμμα γίνεται τοίχος· ο χώρος μετριέται μέσα του όπως με το «χώρος με κλικ».
      const edges: DrawnWall[] = draft.map((a, i) => ({ a, b: draft[(i + 1) % draft.length], t: wallPx }));
      setDrawnWalls((ws) => [...ws, ...edges]);
      const b = blocked ? blocked.slice() : new Uint8Array(w * h);
      for (const e of edges) burnLine(b, w, h, e.a, e.b, Math.max(1, Math.round(e.t / 2)));
      const res = measureRoom(b, w, h, labelPoint(draft), [0]);
      if (res.ok) addRoom(res.polygon, res.areaPx, res.perimeterPx, true);
      else addRoom(draft, polygonArea(draft), polygonPerimeter(draft), true);
    } else addRoom(draft, polygonArea(draft), polygonPerimeter(draft), true);
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
          : 'Ο χώρος «διαρρέει» από κάποιο άνοιγμα. Κλείσ’ το με «Τοίχος» ή «Διαχωριστικό», ή αύξησε το «Μέγιστο άνοιγμα πόρτας».');
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
    if (tool === 'wall') {
      const q = snap(p);
      const last = draft[draft.length - 1];
      if (!last) { setDraft([q]); return; }
      if (Math.hypot(q.x - last.x, q.y - last.y) < 2) return; // δεύτερο κλικ του διπλού κλικ
      setDrawnWalls((ws) => [...ws, { a: last, b: q, t: wallPx }]);
      // Κλείσιμο στο πρώτο σημείο της αλυσίδας ⇒ τέλος· αλλιώς συνεχίζουμε από το νέο άκρο.
      setDraft(draft.length > 1 && q.x === draft[0].x && q.y === draft[0].y ? [] : [...draft, q]);
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
      if (e.key === 'Enter') { finish(); return; }
      if (e.key === 'Backspace' && draft.length) { e.preventDefault(); setDraft((d) => d.slice(0, -1)); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { setRooms((rs) => rs.filter((r) => r.id !== selected)); setSelected(null); return; }
      const t = TOOLS.find((x) => x.kbd.toLowerCase() === e.key.toLowerCase());
      if (t && !e.metaKey && !e.ctrlKey) changeTool(t.key);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // ── Εξαγωγή ──────────────────────────────────────────────────────────────────────────
  const exportRooms: ExportRoom[] = rooms.map((r) => ({
    name: r.name, color: r.color, polygon: r.polygon, areaM2: areaOf(r), perimeterM: mPerPx ? r.perimeterPx * mPerPx : null,
  }));
  const wallLenM = mPerPx && drawnWalls.length ? drawnWalls.reduce((sum, d) => sum + Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y), 0) * mPerPx : null;
  const baseName = `katopsi-${prjc}-${new Date().toISOString().slice(0, 10)}`;
  const scaleNote = calib ? `Κλίμακα: ${nf.format(calib.meters)} m = ${Math.round(calib.meters / (mPerPx ?? 1))} px · αρχείο ${plan?.name ?? ''}${plan && plan.pages > 1 ? ` (σελ. ${plan.page})` : ''}` : 'Χωρίς κλίμακα';
  const png = () => annotatedPng({ image: plan!.display, w, h, rooms: exportRooms, dividers, walls: drawnWalls, title: projectLabel, scaleNote });

  const save = async () => {
    if (!plan || !rooms.length) return;
    setSaving(true);
    try {
      const files: Array<[Blob, string]> = [[await png(), `${baseName}.png`], [roomsCsv(exportRooms, wallLenM), `${baseName}.csv`]];
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

  // Η αυτόματη κλίμακα του κενού κάναβου δεν σχεδιάζεται ως γραμμή.
  const blankScale = !!calib && plan?.pxPerM != null && calib.meters === 1 && calib.a.x === 0 && calib.b.x === plan.pxPerM;
  const wallLenPx = drawnWalls.reduce((sum, d) => sum + Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y), 0);
  const wallsReady = autoWalls ? !!walls : drawnWalls.length > 0;
  const step = !wallsReady ? 1 : !calib ? 2 : 3;
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
            <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
              <button
                type="button" onClick={startBlank}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-600 bg-slate-900/80 px-4 py-2 text-[length:var(--fs-12)] font-medium text-slate-200 transition-colors hover:border-orange-400 hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                <FiGrid className="size-4" aria-hidden /> Δεν διαβάζεται το σχέδιο; Σχεδίασε τους τοίχους σε κενό κάναβο
              </button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[320px_minmax(0,1fr)] md:grid-rows-1">
            {/* ── Πάνελ βημάτων ── */}
            <div ref={railRef} className="order-2 max-h-[42dvh] space-y-3 overflow-y-auto border-t border-border bg-muted/30 p-3 md:order-1 md:max-h-none md:border-r md:border-t-0">
              <Step n={1} title="Τοίχοι" done={wallsReady} active={step === 1}>
                {plan.pxPerM == null && (
                  <label className="flex cursor-pointer items-center justify-between gap-2">
                    <span>Αυτόματη ανίχνευση από το σχέδιο</span>
                    <input type="checkbox" role="switch" checked={autoWalls} onChange={(e) => setAutoWalls(e.target.checked)} className="size-4 cursor-pointer accent-[var(--primary)]" />
                  </label>
                )}
                {autoWalls && (
                  <>
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
                    {(thr != null || thick != null) && (
                      <Button size="xs" variant="outline" onClick={() => { setThr(null); setThick(null); }}><FiRefreshCw aria-hidden /> Αυτόματα</Button>
                    )}
                    <p className="text-[length:var(--fs-11)] text-muted-foreground">Αν χάνονται λεπτοί εσωτερικοί τοίχοι, μίκρυνε το πάχος· αν «πιάνονται» γράμματα και έπιπλα, μεγάλωσέ το. Ό,τι λείπει, σχεδίασέ το παρακάτω.</p>
                  </>
                )}
                {!autoWalls && plan.pxPerM == null && (
                  <p className="text-muted-foreground">Σχεδίασε τους τοίχους πάνω στο σχέδιο — μόνο αυτοί μετρούν για τα περιγράμματα των χώρων.</p>
                )}
                {plan.pxPerM != null && (
                  <p className="text-muted-foreground">Κενός κάναβος {plan.name.replace('Κενός κάναβος ', '')} · κάθε τετράγωνο 0,5 m. Σχεδίασε τους τοίχους με κλικ στις γωνίες.</p>
                )}
                <div className="rounded-lg border border-border bg-background p-2">
                  <Button size="sm" variant={tool === 'wall' ? 'default' : 'outline'} onClick={() => changeTool('wall')} className="w-full">
                    <BrickWall className="size-3.5" aria-hidden /> Σχεδίαση τοίχου
                  </Button>
                  <div className="mt-2">
                    <Range
                      label="Πάχος τοίχου" min={5} max={50} step={5} value={wallCm} onChange={setWallCm} disabled={!calib}
                      display={calib ? `${wallCm} cm` : `${wallPx} px · cm μετά την κλίμακα`}
                    />
                  </div>
                  {drawnWalls.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className="size-2.5 rounded-sm" style={{ background: WALL_DRAW }} aria-hidden />
                        {drawnWalls.length} τμήμα{drawnWalls.length === 1 ? '' : 'τα'}
                        {mPerPx != null && <> · <b className="font-mono text-foreground">{nf.format(wallLenPx * mPerPx)} m</b></>}
                      </span>
                      <span className="flex gap-1">
                        <Button size="xs" variant="ghost" onClick={() => setDrawnWalls((d) => d.slice(0, -1))}><FiRotateCcw aria-hidden /> Αναίρεση</Button>
                        <Button size="xs" variant="ghost" onClick={() => { setDrawnWalls([]); setDraft([]); }}>Όλα</Button>
                      </span>
                    </div>
                  )}
                </div>
                <Button size="xs" variant="ghost" onClick={() => setShowWalls((s) => !s)}>
                  {showWalls ? <FiEyeOff aria-hidden /> : <FiEye aria-hidden />} {showWalls ? 'Απόκρυψη' : 'Εμφάνιση'} τοίχων
                </Button>
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
                {tool === 'polygon' && (
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background p-2">
                    <input type="checkbox" checked={polyWalls} onChange={(e) => setPolyWalls(e.target.checked)} className="mt-0.5 size-4 cursor-pointer accent-[var(--primary)]" />
                    <span>
                      <span className="font-medium">Το περίγραμμα είναι τοίχοι</span>
                      <span className="block text-[length:var(--fs-11)] text-muted-foreground">Οι πλευρές του πολυγώνου γίνονται τοίχοι ({calib ? `${wallCm} cm` : `${wallPx} px`}) και το εμβαδό μετριέται καθαρό, μέσα από αυτούς. Σχεδίασε στον άξονα του τοίχου.</span>
                    </span>
                  </label>
                )}
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
                    onClick={() => navigator.clipboard.writeText(roomsText(exportRooms, projectLabel, wallLenM)).then(() => toast.success('Αντιγράφηκε'), () => toast.error('Δεν επετράπη η αντιγραφή'))}
                  >
                    <FiCopy aria-hidden /> Αντιγρ.
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!rooms.length || !calib} onClick={() => download(roomsCsv(exportRooms, wallLenM), `${baseName}.csv`)}>
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
                wallsOverlay={overlay} showWalls={showWalls} wallThicknessPx={wallPx}
                rooms={viewerRooms} selectedId={selected} dividers={dividers}
                calibration={calibLine ?? (calib && !blankScale ? [calib.a, calib.b] : null)}
                draft={draft} tool={tool} formatLength={fmtLen}
                onPick={onPick} onFinish={finish} fitKey={fitKey}
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
