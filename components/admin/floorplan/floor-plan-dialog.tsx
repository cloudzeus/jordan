'use client';

// Διαστασιολόγηση κάτοψης έργου — modal σε 3 βήματα:
//   1. Τοίχοι: ανέβασμα εικόνας/PDF, αυτόματη ανίχνευση τοίχων (ρυθμίσεις κατωφλίου/πάχους) ή/και
//      σχεδίαση τοίχων από τον χρήστη — πάνω στο σχέδιο ή σε κενό κάναβο αν το αρχείο δεν διαβάζεται.
//   2. Κλίμακα: γραμμή γνωστού μήκους (π.χ. μια διάσταση του σχεδίου) → μέτρα ανά pixel.
//   3. Μέτρηση: κλικ μέσα σε χώρο (αυτόματο περίγραμμα) ή χειροκίνητο πολύγωνο· διαχωριστικά για
//      ανοιχτές πόρτες/ενιαίους χώρους. Εμβαδά, περίμετροι, σύνολο, εξαγωγή CSV/PNG ή αποθήκευση
//      στα αρχεία του έργου.
//   4. Προσφορά: υλικό ή συνταγή τοποθέτησης ανά χώρο → νέα προσφορά (Συμβάσεις & Προσφορές) στο έργο.
// Όλη η επεξεργασία γίνεται στον browser — τίποτα δεν φεύγει πριν πατηθεί «Αποθήκευση στο έργο».
import * as React from 'react';
import gsap from 'gsap';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import {
  FiUploadCloud, FiLoader, FiCheck, FiMove, FiMousePointer, FiEdit3, FiScissors, FiMaximize, FiSquare, FiGrid, FiRotateCcw,
  FiEye, FiEyeOff, FiTrash2, FiCopy, FiDownload, FiSave, FiRefreshCw, FiHelpCircle, FiChevronLeft, FiChevronRight, FiFileText, FiCamera, FiMapPin,
} from 'react-icons/fi';
import { BrickWall, DoorOpen, RectangleHorizontal, Ruler, RulerDimensionLine, Spline } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  burnLine, detectWalls, labelPoint, measureRoom, otsu, pointInPolygon, polygonArea, polygonPerimeter, threshold, toGray, toM2,
  type Mask, type Pt, type WallResult,
} from '@/lib/floorplan/core';
import { blankPlan, loadPlan, type LoadedPlan } from './load-plan';
import { OPENING_COLOR, PlanViewer, WALL_DRAW, type EditPhase, type ViewerOpening, type ViewerRoom, type ViewerTool } from './plan-viewer';
import { Plan3d, type Plan3dHandle } from './plan-3d';
import { annotatedPng, download, fmtM, fmtM2, roomsCsv, roomsText, type ExportRoom } from './export';
import { MaterialChip, OfferStepBody, RoomMaterialEditor, type RoomMaterial } from './offer-panel';
import { FloorPlanOfferDialog, type OfferRoom, type OfferSubmit } from './offer-dialog';
import type { RecipeView } from '@/lib/install-recipes';
import { planData, planPins, planRooms, scalePlanData, type PlanData, type PlanPin, type PlanRoom } from '@/lib/floorplan/saved';
import { aiResponse, chooseScale, fallbackPolygon, pickCandidate, roomsInPx } from '@/lib/floorplan/ai-core';
import { Sparkles } from 'lucide-react';
import type { FloorPlanListRow } from '@/lib/floorplan/plans';
import { MetersInput, RoomWallsPanel, WallsToggle } from './room-walls';
import { DEFAULT_HEIGHT, OPENING_PRESETS, snapOpening, wallArea, type Opening, type OpeningKind, type RoomWalls } from '@/lib/floorplan/walls';

type Room = {
  id: string; name: string; color: string; polygon: Pt[]; areaPx: number; perimeterPx: number; manual: boolean;
  /** Πλακάκι και στους τοίχους (ύψος + ανοίγματα) — undefined/on:false = μόνο δάπεδο. */
  walls?: RoomWalls;
  /** Από την αναγνώριση AI ως ορθογώνιο (δεν βρέθηκε περίγραμμα) — θέλει έλεγχο. */
  approx?: boolean;
  /** Υλικό/συνταγή για την προσφορά. */
  material: RoomMaterial | null;
};
type Calib = { a: Pt; b: Pt; meters: number };
/** Τοίχος σχεδιασμένος από τον χρήστη: τμήμα a→b με πάχος t (px ανάλυσης). */
type DrawnWall = { a: Pt; b: Pt; t: number };

const PALETTE = ['#38BDF8', '#34D399', '#FBBF24', '#F472B6', '#A78BFA', '#FB923C', '#2DD4BF', '#F87171', '#A3E635', '#60A5FA'];
const WALL_RGB = [34, 211, 238];
const DRAWN_RGB = [251, 146, 60]; // = WALL_DRAW

const nf = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 });
const uid = () => Math.random().toString(36).slice(2, 10);

type ToolGroup = 'Πλοήγηση' | 'Χώροι' | 'Τοίχοι & ανοίγματα' | 'Μετρήσεις' | 'Σημειώσεις';
/**
 * Εργαλεία: `hint` = μία γραμμή στη μπάρα κάτω από το σχέδιο όσο είναι ενεργό· `help` = τι κάνει και
 * πότε το χρησιμοποιώ (tooltip και «Οδηγός εργαλείων»).
 */
const TOOLS: Array<{ key: ViewerTool; label: string; hint: string; help: string; kbd: string; icon: React.ReactNode; group: ToolGroup }> = [
  {
    key: 'pan', label: 'Μετακίνηση', kbd: 'V', icon: <FiMove />, group: 'Πλοήγηση',
    hint: 'Σύρε για μετακίνηση, ροδέλα για zoom.',
    help: 'Μετακινεί το σχέδιο χωρίς να αλλάζει τίποτα. Ροδέλα ή δύο δάχτυλα για zoom — λειτουργούν και με κάθε άλλο εργαλείο.',
  },
  {
    key: 'room', label: 'Χώρος με κλικ', kbd: 'R', icon: <FiMousePointer />, group: 'Χώροι',
    hint: 'Κάνε κλικ μέσα σε έναν χώρο — το περίγραμμα βγαίνει αυτόματα από τους τοίχους.',
    help: 'Ο γρηγορότερος τρόπος: κλικ στο δάπεδο ενός δωματίου και το περίγραμμα «γεμίζει» ως τους τοίχους. Αν «διαρρέει» από πόρτα, κλείσ’ την με Διαχωριστικό.',
  },
  {
    key: 'rect', label: 'Ορθογώνιος χώρος', kbd: 'T', icon: <RectangleHorizontal className="size-4" />, group: 'Χώροι',
    hint: 'Δύο κλικ σε απέναντι γωνίες — δημιουργείται ορθογώνιος χώρος. Βλέπεις πλάτος × μήκος όσο σέρνεις.',
    help: 'Για απλά ορθογώνια δωμάτια ή όταν το σχέδιο δεν «διαβάζεται»: κλικ στη μία γωνία, κλικ στην απέναντι. Δείχνει ζωντανά πλάτος × μήκος.',
  },
  {
    key: 'polygon', label: 'Πολύγωνο', kbd: 'P', icon: <FiEdit3 />, group: 'Χώροι',
    hint: 'Κλικ στις γωνίες· διπλό κλικ, Enter ή κλικ στο πρώτο σημείο κλείνει. Shift = ορθές γωνίες.',
    help: 'Χώρος με ελεύθερο σχήμα (Γ, σπασμένες γωνίες): κλικ σε κάθε γωνία και κλείσιμο με διπλό κλικ. Shift = μόνο οριζόντια/κάθετα.',
  },
  {
    key: 'edit', label: 'Επεξεργασία χώρου', kbd: 'E', icon: <Spline className="size-4" />, group: 'Χώροι',
    hint: 'Κλικ σε χώρο· σύρε κορυφές, σύρε το «+» για νέο σπάσιμο, σύρε μέσα για μετακίνηση (ή βελάκια). Διπλό κλικ σε κορυφή = διαγραφή · ⌘/Ctrl+Z αναίρεση.',
    help: 'Διορθώνει ένα περίγραμμα: σύρε τις γωνίες, σύρε το «+» στη μέση πλευράς για νέα γωνία, διπλό κλικ σε γωνία για διαγραφή, βελάκια για μετακίνηση (Shift ×10). ⌘/Ctrl+Z αναίρεση.',
  },
  {
    key: 'wall', label: 'Τοίχος', kbd: 'W', icon: <BrickWall className="size-4" />, group: 'Τοίχοι & ανοίγματα',
    hint: 'Κλικ σε κάθε γωνία του τοίχου· διπλό κλικ ή Enter τελειώνει. Shift = οριζόντια/κάθετα· κουμπώνει στα άκρα άλλων τοίχων.',
    help: 'Σχεδιάζει τοίχο με το πάχος που ορίζεις (βήμα 1). Χρήσιμο όταν η αυτόματη ανίχνευση χάνει τοίχους ή όταν δουλεύεις σε κενό κάναβο.',
  },
  {
    key: 'divider', label: 'Διαχωριστικό', kbd: 'D', icon: <FiScissors />, group: 'Τοίχοι & ανοίγματα',
    hint: 'Δύο κλικ: μια νοητή γραμμή που κλείνει πόρτες ή χωρίζει ενιαίους χώρους.',
    help: 'Νοητή γραμμή (δεν μετρά ως τοίχος): κλείνει ένα άνοιγμα πόρτας ή χωρίζει κουζίνα από σαλόνι ώστε το «Χώρος με κλικ» να σταματά εκεί.',
  },
  {
    key: 'opening', label: 'Άνοιγμα (πόρτα / παράθυρο)', kbd: 'O', icon: <DoorOpen className="size-4" />, group: 'Τοίχοι & ανοίγματα',
    hint: 'Διάλεξε είδος αριστερά, μετά δύο κλικ πάνω στον τοίχο του χώρου, στα άκρα του ανοίγματος.',
    help: 'Σχεδιάζει πόρτα ή παράθυρο πάνω στον τοίχο ενός χώρου: το πλάτος βγαίνει από το σχέδιο, το ύψος και η ποδιά από τις ρυθμίσεις. Αφαιρείται αυτόματα από τα m² τοίχων (πλακάκι, τσιμεντοκονία).',
  },
  {
    key: 'calibrate', label: 'Κλίμακα', kbd: 'K', icon: <Ruler className="size-4" />, group: 'Μετρήσεις',
    hint: 'Δύο κλικ στα άκρα μιας γνωστής απόστασης (π.χ. μια διάσταση του σχεδίου).',
    help: 'Λέει στο εργαλείο πόσα μέτρα είναι μια απόσταση του σχεδίου — χωρίς αυτή δεν βγαίνουν m². Διάλεξε τη μεγαλύτερη διάσταση που αναγράφεται για ακρίβεια.',
  },
  {
    key: 'measure', label: 'Διάσταση (από–έως)', kbd: 'M', icon: <RulerDimensionLine className="size-4" />, group: 'Μετρήσεις',
    hint: 'Δύο κλικ: από–έως. Η διάσταση μένει πάνω στο σχέδιο με το μήκος της. Shift = οριζόντια/κάθετα.',
    help: 'Τοποθετεί μόνιμη διάσταση πάνω στο σχέδιο (μήκος τοίχου, πλάτος πάγκου, άνοιγμα): κλικ στην αρχή, κλικ στο τέλος. Αποθηκεύεται με την κάτοψη και σβήνεται από τη λίστα «Διαστάσεις». Δεν αλλάζει την κλίμακα.',
  },
  {
    key: 'pin', label: 'Σημείωση στο σχέδιο', kbd: 'N', icon: <FiMapPin />, group: 'Σημειώσεις',
    hint: 'Κλικ στο σημείο του σχεδίου· γράψε τη σημείωση αριστερά και πρόσθεσε φωτογραφία.',
    help: 'Καρφιτσώνει σημείωση σε σημείο του σχεδίου (π.χ. «σπασμένο πλακάκι», «σωλήνας εδώ») με φωτογραφία. Στην προσφορά κάθε σημείωση γίνεται εργασία με ένα κλικ, μαζί με τη φωτογραφία της.',
  },
];
const TOOL_GROUPS: ToolGroup[] = ['Πλοήγηση', 'Χώροι', 'Τοίχοι & ανοίγματα', 'Μετρήσεις', 'Σημειώσεις'];

/** Κουμπί εργαλείου με αναλυτικό tooltip: όνομα, συντόμευση και τι κάνει. */
function ToolTip({ tool, side = 'right', children }: { tool: (typeof TOOLS)[number]; side?: 'right' | 'top' | 'bottom'; children: React.ReactNode }) {
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={8} className="block max-w-72 px-3 py-2 text-left">
        <span className="flex items-center justify-between gap-3 text-(length:--fs-12) font-semibold">
          {tool.label}
          <kbd className="rounded border border-background/30 px-1.5 font-mono text-(length:--fs-10) font-medium opacity-80">{tool.kbd}</kbd>
        </span>
        <span className="mt-1 block text-(length:--fs-12) leading-snug opacity-90">{tool.help}</span>
      </TooltipContent>
    </Tooltip>
  );
}

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

function Step({ n, title, done, active, raised, children }: { n: number; title: string; done: boolean; active: boolean; raised?: boolean; children: React.ReactNode }) {
  return (
    <section
      data-fp-step
      className="relative rounded-xl border bg-card p-3 transition-colors"
      style={{ borderColor: active ? 'var(--primary)' : 'var(--border)', boxShadow: active ? '0 0 0 3px color-mix(in oklab, var(--primary) 14%, transparent)' : undefined, zIndex: raised ? 2 : undefined }}
    >
      <header className="mb-2 flex items-center gap-2">
        <span
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-(length:--fs-11) font-bold"
          style={done ? { background: '#10B981', color: '#fff' } : active ? { background: 'var(--primary)', color: 'var(--primary-foreground)' } : { background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          {done ? <FiCheck className="size-3.5" aria-hidden /> : n}
        </span>
        <h3 className="text-(length:--fs-13) font-semibold">{title}</h3>
      </header>
      <div className="space-y-2.5 text-(length:--fs-12)">{children}</div>
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
        <span className="font-mono text-(length:--fs-11) tabular-nums text-foreground">{display}</span>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-(--primary) disabled:cursor-not-allowed"
      />
    </div>
  );
}

/** Σε ποιον ανήκει η χαρτογράφηση: έργο ή πελάτης (προσφορά από το μενού του πελάτη, πριν από το έργο). */
export type FloorPlanOwner = { prjc: number } | { trdr: number };

export function FloorPlanDialog({ owner, projectLabel, open, onOpenChange, canSave = false, canOffer = false, onApply, initialPlanId = null }: {
  owner: FloorPlanOwner; projectLabel: string; open: boolean; onOpenChange: (o: boolean) => void;
  /** files.manage: «Αποθήκευση στο έργο» ανεβάζει PNG + CSV στον φάκελο «Κατόψεις». */
  canSave?: boolean;
  /** projects.manage: υλικό/συνταγή ανά χώρο και «Δημιουργία προσφοράς». */
  canOffer?: boolean;
  /** Από τη φόρμα προσφοράς: αντί για νέα προσφορά, «Μεταφορά στην προσφορά» επιστρέφει τους χώρους. */
  onApply?: (r: { floorPlanId: string; title: string; rooms: PlanRoom[]; pins: PlanPin[] }) => void;
  /** Χαρτογράφηση που ανοίγει κατευθείαν (η ήδη συνδεδεμένη με την προσφορά). */
  initialPlanId?: string | null;
}) {
  const ownerId = 'prjc' in owner ? owner.prjc : owner.trdr;
  // API της χαρτογράφησης ανά ιδιοκτήτη· αρχεία στον φάκελο του έργου ή του πελάτη.
  const apiBase = 'prjc' in owner ? `/api/admin/projects/${owner.prjc}` : `/api/admin/traders/${owner.trdr}`;
  const filesUrl = 'prjc' in owner ? `/api/admin/entity-files/projects/${owner.prjc}` : `/api/admin/entity-files/traders/${owner.trdr}`;
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
  /** Διαστάσεις «από–έως» πάνω στο σχέδιο. */
  const [dims, setDims] = React.useState<Array<{ id: string; a: Pt; b: Pt }>>([]);
  /** Σημειώσεις-πινέζες στο σχέδιο (κείμενο + φωτογραφίες) — στην προσφορά γίνονται εργασίες. */
  const [pins, setPins] = React.useState<Array<{ id: string; x: number; y: number; text: string; photoFileIds: string[] }>>([]);
  const [pinSel, setPinSel] = React.useState<string | null>(null);
  const [pinUploading, setPinUploading] = React.useState(false);
  /** Ρυθμίσεις του εργαλείου «Άνοιγμα»: είδος, ύψος και ποδιά (m). */
  const [openingKind, setOpeningKind] = React.useState<OpeningKind>('door');
  const [openingH, setOpeningH] = React.useState(OPENING_PRESETS.door.h);
  const [openingSill, setOpeningSill] = React.useState(OPENING_PRESETS.door.sill);
  const [view3d, setView3d] = React.useState(false);
  const plan3dRef = React.useRef<Plan3dHandle | null>(null);
  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  // Το τελευταίο ύψος πλακιδίων που διάλεξε ο χρήστης — προτείνεται στον επόμενο χώρο.
  const [lastHeight, setLastHeight] = React.useState(DEFAULT_HEIGHT);
  const [fitKey, setFitKey] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [recipes, setRecipes] = React.useState<RecipeView[] | null>(null);
  const [recipesError, setRecipesError] = React.useState<string | null>(null);
  const [offering, setOffering] = React.useState(false);
  const [offerOpen, setOfferOpen] = React.useState(false);
  const [createdOffer, setCreatedOffer] = React.useState<string | null>(null);
  // Αποθηκευμένη χαρτογράφηση: id (μετά την πρώτη αποθήκευση), τίτλος, και για ποιο σχέδιο ανέβηκε η εικόνα.
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const [planTitle, setPlanTitle] = React.useState('');
  const imageSavedFor = React.useRef<LoadedPlan | null>(null);
  const [savedPlans, setSavedPlans] = React.useState<FloorPlanListRow[] | null>(null);
  const [planSaving, setPlanSaving] = React.useState(false);
  const [aiBusy, setAiBusy] = React.useState(false);
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
    setMeters(''); setRooms([]); setSelected(null); setTool('calibrate'); seq.current = 0; setDims([]); setPins([]); setPinSel(null); setView3d(false);
    setDrawnWalls([]); setAutoWalls(true);
    setSavedId(null); setPlanTitle(''); setCreatedOffer(null); imageSavedFor.current = null;
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
  // Λίστα αποθηκευμένων χαρτογραφήσεων του έργου (στην αρχική οθόνη).
  React.useEffect(() => {
    if (!open || plan || savedPlans) return;
    let ignore = false;
    fetch(`${apiBase}/floorplans`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((d) => { if (!ignore) setSavedPlans(d.plans ?? []); })
      .catch(() => { if (!ignore) setSavedPlans([]); });
    return () => { ignore = true; };
  }, [open, plan, savedPlans, apiBase]);

  /** Ξανάνοιγμα αποθηκευμένης χαρτογράφησης: σχέδιο + όλη η κατάσταση, κλιμακωμένη στη νέα ανάλυση. */
  const restore = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/floorplans/${id}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? 'Η χαρτογράφηση δεν άνοιξε.');
      const saved = planData.parse(body.plan.data);
      const img = await fetch(`/api/admin/floorplans/${id}/image?v=plan`);
      if (!img.ok) throw new Error('Η εικόνα της κάτοψης δεν βρέθηκε.');
      const f = new File([await img.blob()], body.plan.source || `${body.plan.title}.png`, { type: 'image/png' });
      const p = await loadPlan(f, 1);
      const d: PlanData = scalePlanData(saved, p.analysis.width, p.analysis.height);
      if (d.pxPerM != null) p.pxPerM = d.pxPerM;
      p.name = body.plan.source || p.name;
      reset();
      setFile(null); setPlan(p);
      setAutoWalls(d.autoWalls); setThr(d.thr); setThick(d.thick); setWallCm(d.wallCm); setDoorCm(d.doorCm);
      setDividers(d.dividers); setDrawnWalls(d.drawnWalls); setCalib(d.calib); setDims(d.dims); setPins(d.pins);
      setRooms(d.rooms.map((r) => ({ ...r, walls: r.walls, material: r.material })));
      seq.current = d.rooms.length;
      setSavedId(id); setPlanTitle(body.plan.title); imageSavedFor.current = p;
      setTool(d.calib ? 'room' : 'calibrate');
      toast.success(`Άνοιξε η χαρτογράφηση «${body.plan.title}» · ${d.rooms.length} χώροι.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Η χαρτογράφηση δεν άνοιξε.');
    } finally {
      setLoading(false);
    }
  };

  // Συνδεδεμένη χαρτογράφηση: ανοίγει κατευθείαν την πρώτη φορά.
  const restoredInitial = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!open || plan || loading || !initialPlanId || restoredInitial.current === initialPlanId) return;
    restoredInitial.current = initialPlanId;
    void restore(initialPlanId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPlanId]);

  const dz = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'], 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false, noClick: !!plan, noKeyboard: !!plan,
    onDrop: (fs) => { if (fs[0]) void load(fs[0]); },
    onDropRejected: () => toast.error('Ανέβασε εικόνα (PNG/JPG) ή PDF.'),
  });

  // ── Ανίχνευση τοίχων (καθυστέρηση ώστε να ζωγραφιστεί πρώτα η ένδειξη) ───────────────
  // Η ένδειξη/καθαρισμός με «adjust state while rendering» (αρχικό `[]` ⇒ και στο πρώτο render).
  const wallDeps = [gray, w, h, thr, thick, autoWalls];
  const [prevWallDeps, setPrevWallDeps] = React.useState<readonly unknown[]>([]);
  if (wallDeps.length !== prevWallDeps.length || wallDeps.some((x, i) => !Object.is(x, prevWallDeps[i]))) {
    setPrevWallDeps(wallDeps);
    if (!gray || !autoWalls) { setWalls(null); setAnalyzing(false); } else setAnalyzing(true);
  }
  React.useEffect(() => {
    if (!gray || !autoWalls) return;
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

  // Συνταγές τοποθέτησης για την επιλογή υλικού ανά χώρο (μία φορά, όταν ανοίξει κάτοψη).
  React.useEffect(() => {
    if (!canOffer || !plan || recipes || recipesError) return;
    let ignore = false;
    fetch('/api/admin/recipes', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 403) throw new Error('Χωρίς δικαίωμα συνταγών — μόνο είδη από το μητρώο.');
        if (!res.ok) throw new Error('Οι συνταγές δεν φορτώθηκαν — μόνο είδη από το μητρώο.');
        return (await res.json()).recipes as RecipeView[];
      })
      .then((r) => { if (!ignore) setRecipes(r); })
      .catch((e: Error) => { if (!ignore) setRecipesError(e.message); });
    return () => { ignore = true; };
  }, [canOffer, plan, recipes, recipesError]);

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
  const wallsTotal = mPerPx ? rooms.reduce((s, r) => s + (r.walls?.on ? wallArea(r.perimeterPx * mPerPx, r.walls).net : 0), 0) : 0;
  const wallRooms = rooms.filter((r) => r.walls?.on).length;

  // Τοίχοι: το κουμπί ανοίγει την κάρτα του χώρου (και τον επιλέγει)· ενεργό + επιλεγμένο = κλείσιμο κάρτας.
  const toggleWalls = (id: string) => {
    const r = rooms.find((x) => x.id === id);
    if (!r) return;
    if (r.walls?.on && selected === id) { setSelected(null); return; }
    if (!r.walls?.on) setRooms((rs) => rs.map((x) => (x.id === id ? { ...x, walls: { heightM: lastHeight, openings: [], ...x.walls, on: true } } : x)));
    setSelected(id);
  };
  const updateWalls = (id: string, walls: RoomWalls) => {
    setRooms((rs) => rs.map((x) => (x.id === id ? { ...x, walls } : x)));
    setLastHeight(walls.heightM);
  };

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
    const r: Room = { id: uid(), name: `Χώρος ${n}`, color: PALETTE[(n - 1) % PALETTE.length], polygon, areaPx, perimeterPx, manual, material: null };
    setRooms((rs) => [...rs, r]);
    setSelected(r.id);
  };

  // ── Αναγνώριση χώρων με AI ───────────────────────────────────────────────────────────
  // Το vision μοντέλο δίνει ονόματα, σημείο μέσα σε κάθε χώρο, πλαίσιο και κλίμακα· το περίγραμμα
  // χαράζεται εδώ: πρώτα από τους τοίχους, μετά από όλες τις γραμμές του σχεδίου (κούφιοι τοίχοι με
  // διπλή γραμμή), αλλιώς το πλαίσιο του μοντέλου ως ορθογώνιο «κατά προσέγγιση».
  const detectAi = async () => {
    if (!plan || !gray) return;
    setAiBusy(true);
    try {
      const k = Math.min(1, 2000 / Math.max(plan.display.width, plan.display.height));
      const c = document.createElement('canvas');
      c.width = Math.round(plan.display.width * k); c.height = Math.round(plan.display.height * k);
      c.getContext('2d')!.drawImage(plan.display, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('JPEG export failed'))), 'image/jpeg', 0.88));
      const fd = new FormData();
      fd.append('image', new File([blob], 'katopsi.jpg', { type: 'image/jpeg' }));
      const res = await fetch(`${apiBase}/floorplan-ai`, { method: 'POST', body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? 'Η αναγνώριση απέτυχε.');
      const r = aiResponse.parse(body);
      const found = roomsInPx(r, w, h);

      // Κλίμακα: μόνο αν δεν έχει οριστεί ήδη από τον χρήστη.
      let mpp = mPerPx;
      let scaleNote = '';
      if (!calib) {
        const sc = chooseScale(r, found, w, h);
        if (sc) {
          const len = Math.hypot(sc.line[1].x - sc.line[0].x, sc.line[1].y - sc.line[0].y);
          setCalib({ a: sc.line[0], b: sc.line[1], meters: sc.mPerPx * len });
          setCalibLine(null);
          mpp = sc.mPerPx;
          scaleNote = sc.source === 'dimension' ? ' Κλίμακα από διάσταση του σχεδίου.' : ' Κλίμακα από τις διαστάσεις των χώρων.';
        } else scaleNote = ' Δεν βρέθηκε κλίμακα — όρισέ τη στο βήμα 2.';
      }
      const maxGap = mpp ? doorCm / 100 / mpp : maxDim * 0.02;
      const gaps = [0, maxGap * 0.6, maxGap];
      // Όλες οι γραμμές του σχεδίου ως εμπόδια (για τοίχους με διπλή λεπτή γραμμή).
      const ink = threshold(gray, walls?.threshold ?? otsu(gray));
      if (blocked) for (let i = 0; i < ink.length; i++) if (blocked[i]) ink[i] = 1;

      const added: Room[] = [];
      let traced = 0, approx = 0, skipped = 0;
      for (const fr of found) {
        if ([...rooms, ...added].some((x) => pointInPolygon(fr.seed, x.polygon))) { skipped++; continue; }
        // Υποψήφια: από τους τοίχους και από όλες τις γραμμές, με και χωρίς κλείσιμο ανοιγμάτων.
        const cands = [blocked, ink].flatMap((mask) => (mask ? [measureRoom(mask, w, h, fr.seed, gaps), measureRoom(mask, w, h, fr.seed, [0])] : []))
          .map((m) => (m.ok ? m : null));
        const poly = pickCandidate(cands, fr, mpp);
        const n = ++seq.current;
        const base = { id: uid(), name: fr.name, color: PALETTE[(n - 1) % PALETTE.length], material: null } as const;
        if (poly) { traced++; added.push({ ...base, ...poly, manual: false }); }
        else {
          approx++;
          const pg = fallbackPolygon(fr, mpp);
          added.push({ ...base, polygon: pg, areaPx: polygonArea(pg), perimeterPx: polygonPerimeter(pg), manual: true, approx: true });
        }
      }
      setRooms((rs) => [...rs, ...added]);
      if (added[0]) setSelected(added[0].id);
      setTool('edit');
      toast.success(`Βρέθηκαν ${found.length} χώροι · ${traced} με περίγραμμα από το σχέδιο${approx ? `, ${approx} κατά προσέγγιση (ορθογώνιο — έλεγξέ τους)` : ''}${skipped ? `, ${skipped} υπήρχαν ήδη` : ''}.${scaleNote}`, { duration: 9000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Η αναγνώριση απέτυχε.');
    } finally {
      setAiBusy(false);
    }
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
    if (tool === 'edit') {
      const hit = [...rooms].reverse().find((r) => pointInPolygon(p, r.polygon));
      setSelected(hit?.id ?? null);
      return;
    }
    if (tool === 'rect') {
      if (!draft.length) { setDraft([p]); return; }
      const a = draft[0];
      if (Math.abs(p.x - a.x) < 3 || Math.abs(p.y - a.y) < 3) { toast.error('Το ορθογώνιο είναι πολύ μικρό — κάνε κλικ στην απέναντι γωνία.'); return; }
      const poly = [a, { x: p.x, y: a.y }, p, { x: a.x, y: p.y }];
      addRoom(poly, polygonArea(poly), polygonPerimeter(poly), true);
      setDraft([]);
      return;
    }
    if (tool === 'pin') {
      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${uid()}-${uid()}`;
      setPins((ps) => [...ps, { id, x: p.x, y: p.y, text: '', photoFileIds: [] }]);
      setPinSel(id);
      setTimeout(() => document.getElementById(`pin-text-${id}`)?.focus(), 40);
      return;
    }
    if (tool === 'measure') {
      if (!draft.length) { setDraft([p]); return; }
      if (Math.hypot(p.x - draft[0].x, p.y - draft[0].y) < 3) return;
      setDims((ds) => [...ds, { id: uid(), a: draft[0], b: p }]);
      setDraft([]);
      return;
    }
    if (tool === 'opening') {
      if (!mPerPx) { toast.error('Όρισε πρώτα την κλίμακα (βήμα 2) — το πλάτος του ανοίγματος βγαίνει σε μέτρα.'); return; }
      if (!draft.length) { setDraft([p]); return; }
      const snapped = snapOpening(rooms.map((r) => r.polygon), draft[0], p, 0.6 / mPerPx);
      setDraft([]);
      if (!snapped) { toast.error('Σχεδίασε το άνοιγμα πάνω στο περίγραμμα ενός χώρου (στον τοίχο του).'); return; }
      const r = rooms[snapped.room];
      const wM = Math.round(Math.hypot(snapped.b.x - snapped.a.x, snapped.b.y - snapped.a.y) * mPerPx * 100) / 100;
      if (wM < 0.2) { toast.error('Το άνοιγμα είναι πολύ μικρό — κάνε κλικ στα δύο άκρα του.'); return; }
      const o: Opening = { id: uid(), kind: openingKind, w: wM, h: openingH, sill: openingKind === 'door' ? 0 : openingSill, count: 1, at: [snapped.a, snapped.b] };
      const wasOn = !!r.walls?.on;
      setRooms((rs) => rs.map((x) => (x.id === r.id ? { ...x, walls: { heightM: x.walls?.heightM ?? lastHeight, openings: [...(x.walls?.openings ?? []), o], on: true } } : x)));
      setSelected(r.id);
      toast.success(`${OPENING_PRESETS[openingKind].label} ${nf.format(wM)} m στον χώρο «${r.name}»${wasOn ? '' : ' · ενεργοποιήθηκε «πλακάκι και στους τοίχους»'}.`);
      return;
    }
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

  // ── Επεξεργασία περιγράμματος (εργαλείο «Επεξεργασία») ─────────────────────────────────
  // Κάθε αλλαγή κάνει τον χώρο «χειροκίνητο» (εμβαδό από το πολύγωνο) και βγάζει το «κατά προσέγγιση».
  const history = React.useRef<Array<{ id: string; polygon: Pt[] }>>([]);
  const applyPolygon = (id: string, polygon: Pt[]) => setRooms((rs) => rs.map((x) => (x.id === id
    ? { ...x, polygon, areaPx: polygonArea(polygon), perimeterPx: polygonPerimeter(polygon), manual: true, approx: false }
    : x)));
  const onEdit = (id: string, polygon: Pt[], phase: EditPhase) => {
    if (phase === 'start') {
      const cur = rooms.find((x) => x.id === id);
      if (cur) history.current = [...history.current.slice(-49), { id, polygon: cur.polygon }];
      return;
    }
    applyPolygon(id, polygon);
  };
  const undoEdit = () => {
    const last = history.current.pop();
    if (!last) return false;
    if (!rooms.some((x) => x.id === last.id)) return undoEdit();
    applyPolygon(last.id, last.polygon);
    setSelected(last.id);
    return true;
  };
  /** Μετακίνηση του επιλεγμένου χώρου κατά (dx, dy) px· διαδοχικά πατήματα = μία εγγραφή αναίρεσης. */
  const nudgeAt = React.useRef(0);
  const nudge = (dx: number, dy: number) => {
    const r = rooms.find((x) => x.id === selected);
    if (!r) return;
    if (Date.now() - nudgeAt.current > 800) history.current = [...history.current.slice(-49), { id: r.id, polygon: r.polygon }];
    nudgeAt.current = Date.now();
    applyPolygon(r.id, r.polygon.map((q) => ({ x: Math.max(0, Math.min(w, q.x + dx)), y: Math.max(0, Math.min(h, q.y + dy)) })));
  };

  // Πλήκτρα συντόμευσης (μόνο όταν το modal έχει κάτοψη και δεν γράφουμε σε πεδίο).
  React.useEffect(() => {
    if (!open || !plan || offerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape' && draft.length) { e.preventDefault(); e.stopPropagation(); setDraft([]); return; }
      if (e.key === 'Enter') { finish(); return; }
      if (e.key === 'Backspace' && draft.length) { e.preventDefault(); setDraft((d) => d.slice(0, -1)); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { if (undoEdit()) e.preventDefault(); return; }
      if (tool === 'edit' && selected && e.key.startsWith('Arrow')) {
        e.preventDefault();
        // 1 px ανάλυσης· Shift ×10. Με κλίμακα: 1 cm / 10 cm.
        const stepPx = (mPerPx ? 0.01 / mPerPx : 1) * (e.shiftKey ? 10 : 1);
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key as 'ArrowLeft'];
        if (d) nudge(d[0] * stepPx, d[1] * stepPx);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { setRooms((rs) => rs.filter((r) => r.id !== selected)); setSelected(null); return; }
      const t = TOOLS.find((x) => x.kbd.toLowerCase() === e.key.toLowerCase());
      if (t && !e.metaKey && !e.ctrlKey) changeTool(t.key);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // ── Εξαγωγή ──────────────────────────────────────────────────────────────────────────
  const exportRooms: ExportRoom[] = rooms.map((r) => {
    const perimeterM = mPerPx ? r.perimeterPx * mPerPx : null;
    const wc = r.walls?.on && perimeterM != null ? wallArea(perimeterM, r.walls) : null;
    return {
      name: r.name, color: r.color, polygon: r.polygon, areaM2: areaOf(r), perimeterM,
      walls: wc ? { m2: wc.net, heightM: r.walls!.heightM, openingsM2: wc.openings } : null,
    };
  });
  const wallLenM = mPerPx && drawnWalls.length ? drawnWalls.reduce((sum, d) => sum + Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y), 0) * mPerPx : null;
  const baseName = `katopsi-${ownerId}-${new Date().toISOString().slice(0, 10)}`;
  const scaleNote = calib ? `Κλίμακα: ${nf.format(calib.meters)} m = ${Math.round(calib.meters / (mPerPx ?? 1))} px · αρχείο ${plan?.name ?? ''}${plan && plan.pages > 1 ? ` (σελ. ${plan.page})` : ''}` : 'Χωρίς κλίμακα';
  const png = () => annotatedPng({ image: plan!.display, w, h, rooms: exportRooms, dividers, walls: drawnWalls, title: projectLabel, scaleNote });

  const save = async (): Promise<boolean> => {
    if (!plan || !rooms.length) return false;
    setSaving(true);
    try {
      const files: Array<[Blob, string]> = [[await png(), `${baseName}.png`], [roomsCsv(exportRooms, wallLenM), `${baseName}.csv`]];
      for (const [b, name] of files) {
        const fd = new FormData();
        fd.append('file', new File([b], name, { type: b.type }));
        fd.append('subfolder', 'Κατόψεις');
        fd.append('notes', `Διαστασιολόγηση κάτοψης · σύνολο ${fmtM2(total)}`);
        const r = await fetch(filesUrl, { method: 'POST', body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? 'Η αποθήκευση απέτυχε.');
      }
      toast.success('Αποθηκεύτηκαν PNG και CSV στα αρχεία του έργου (φάκελος «Κατόψεις»).');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Η αποθήκευση απέτυχε.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ── Αποθήκευση χαρτογράφησης ─────────────────────────────────────────────────────────
  const planDataNow = (): PlanData => ({
    v: 1, w, h, pxPerM: plan?.pxPerM ?? null, page: plan?.page ?? 1, calib, autoWalls, thr, thick, wallCm, doorCm,
    dividers, drawnWalls, dims, pins, render3dFileId: null,
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, color: r.color, polygon: r.polygon, areaPx: r.areaPx, perimeterPx: r.perimeterPx, manual: r.manual, walls: r.walls, material: r.material })),
  });
  const canvasPng = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG export failed'))), 'image/png'));
  /** Νέα ή ενημέρωση της χαρτογράφησης στο έργο· επιστρέφει το id (null σε αποτυχία). */
  const savePlan = async (quiet = false): Promise<string | null> => {
    if (!plan || !rooms.length) return null;
    setPlanSaving(true);
    try {
      const fd = new FormData();
      const title = planTitle.trim() || `Κάτοψη ${projectLabel}`;
      if (savedId) fd.append('id', savedId);
      fd.append('title', title);
      fd.append('source', `${plan.name}${plan.pages > 1 ? `, σελ. ${plan.page}` : ''}`);
      fd.append('data', JSON.stringify(planDataNow()));
      // Το σχέδιο ανεβαίνει μόνο την πρώτη φορά ή όταν άλλαξε κάτοψη.
      if (imageSavedFor.current !== plan) {
        fd.append('image', new File([await canvasPng(plan.display)], 'plan.png', { type: 'image/png' }));
        // Και το πρωτότυπο (φωτογραφία σχεδίου/PDF) όπως το ανέβασε ο χρήστης — όχι στον κενό κάναβο.
        if (file) fd.append('original', file);
      }
      fd.append('annotated', new File([await png()], 'annotated.png', { type: 'image/png' }));
      // Η εικόνα 3D (όταν είναι ανοιχτή η προβολή) αποθηκεύεται μαζί — δεν χάνεται το render.
      const r3d = view3d ? await plan3dRef.current?.capture().catch(() => null) : null;
      if (r3d) fd.append('render3d', new File([r3d], 'render-3d.png', { type: 'image/png' }));
      const res = await fetch(`${apiBase}/floorplans`, { method: 'POST', body: fd });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.message ?? 'Η χαρτογράφηση δεν αποθηκεύτηκε.');
      setSavedId(d.id); setPlanTitle(title); imageSavedFor.current = plan; setSavedPlans(null);
      if (!quiet) toast.success(d.created ? 'Η χαρτογράφηση αποθηκεύτηκε στο έργο.' : 'Η χαρτογράφηση ενημερώθηκε.');
      return d.id as string;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Η χαρτογράφηση δεν αποθηκεύτηκε.');
      return null;
    } finally {
      setPlanSaving(false);
    }
  };

  /** Φωτογραφία σημείωσης: ανεβαίνει στα αρχεία του έργου/πελάτη (φάκελος «Σημειώσεις») και δένεται με την πινέζα. */
  const uploadPinPhoto = async (pinId: string, f: File) => {
    setPinUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('subfolder', 'Σημειώσεις');
      fd.append('notes', `Σημείωση κάτοψης · ${projectLabel}`);
      const r = await fetch(filesUrl, { method: 'POST', body: fd });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.message ?? 'Η φωτογραφία δεν ανέβηκε.');
      setPins((ps) => ps.map((x) => (x.id === pinId ? { ...x, photoFileIds: [...x.photoFileIds, d.file.id].slice(0, 8) } : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Η φωτογραφία δεν ανέβηκε.');
    } finally {
      setPinUploading(false);
    }
  };

  /** Αποθήκευση της χαρτογράφησης μαζί με την τρέχουσα εικόνα 3D. */
  const save3d = async () => {
    const id = await savePlan(true);
    if (id) toast.success('Η εικόνα 3D αποθηκεύτηκε μαζί με τη χαρτογράφηση (αρχεία → «Κατόψεις»).');
  };

  // ── Προσφορά ─────────────────────────────────────────────────────────────────────────
  const setMaterial = (id: string, m: RoomMaterial | null) => setRooms((rs) => rs.map((x) => (x.id === id ? { ...x, material: m } : x)));
  const selectedRoom = rooms.find((r) => r.id === selected) ?? null;
  const withMaterial = rooms.filter((r) => r.material).length;
  const offerRooms: OfferRoom[] = mPerPx
    ? rooms.map((r) => ({
      name: r.name.trim() || 'Χώρος', areaM2: toM2(r.areaPx, mPerPx), perimeterM: r.perimeterPx * mPerPx, color: r.color, material: r.material,
      wallsM2: r.walls?.on ? wallArea(r.perimeterPx * mPerPx, r.walls).net : null,
    }))
    : [];
  /** Μέσα από τη φόρμα προσφοράς: αποθήκευση χαρτογράφησης και επιστροφή των χώρων στη φόρμα. */
  const apply = async () => {
    if (!onApply || !calib) return;
    const floorPlanId = await savePlan(true);
    if (!floorPlanId) return;
    onApply({ floorPlanId, title: planTitle.trim() || `Κάτοψη ${projectLabel}`, rooms: planRooms(planDataNow()), pins: planPins(planDataNow()) });
    toast.success(`Η κάτοψη μπήκε στην προσφορά · ${rooms.length} χώροι.`);
    onOpenChange(false);
  };
  const createOffer = async (o: OfferSubmit) => {
    if (!offerRooms.length) return;
    setOffering(true);
    try {
      // Η χαρτογράφηση αποθηκεύεται πάντα και συνδέεται με την προσφορά (κάτοψη στο PDF πελάτη/συνεργείων).
      const floorPlanId = await savePlan(true);
      if (!floorPlanId) return;
      const res = await fetch(`${apiBase}/floorplan-offer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rooms: offerRooms.map((r) => ({
            name: r.name, areaM2: r.areaM2, perimeterM: r.perimeterM, wallsM2: r.wallsM2,
            material: r.material ? (r.material.type === 'recipe' ? { type: 'recipe', recipeId: r.material.recipeId } : { type: 'item', mtrl: r.material.mtrl }) : null,
          })),
          markupPct: o.markupPct, mode: o.mode, wallLenM, includeWalls: o.includeWalls, floorPlanId,
          title: o.title, trdr: o.trdr, kind: o.kind, validUntil: o.validUntil, vatRate: o.vatRate, terms: o.terms,
          source: plan ? `${plan.name}${plan.pages > 1 ? `, σελ. ${plan.page}` : ''}` : null,
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.message ?? 'Η προσφορά δεν δημιουργήθηκε.');
      setCreatedOffer(d.id);
      setOfferOpen(false);
      toast.success(`Δημιουργήθηκε πρόχειρη προσφορά με ${d.lines} γραμμές.`, {
        action: { label: 'Άνοιγμα', onClick: () => window.location.assign(`/admin/projects/contracts/${d.id}`) },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Η προσφορά δεν δημιουργήθηκε.');
    } finally {
      setOffering(false);
    }
  };

  const viewerRooms: ViewerRoom[] = React.useMemo(() => rooms.map((r) => ({
    id: r.id, color: r.color, polygon: r.polygon, label: r.name, anchor: labelPoint(r.polygon),
    sub: mPerPx ? fmtM2(toM2(r.areaPx, mPerPx)) : `${nf.format(r.areaPx)} px²`,
  })), [rooms, mPerPx]);

  const viewerOpenings: ViewerOpening[] = React.useMemo(() => rooms.flatMap((r) => (r.walls?.openings ?? [])
    .filter((o) => o.at).map((o) => ({ id: o.id, kind: o.kind, a: o.at![0], b: o.at![1], selected: r.id === selected }))), [rooms, selected]);

  // Η αυτόματη κλίμακα του κενού κάναβου δεν σχεδιάζεται ως γραμμή.
  const blankScale = !!calib && plan?.pxPerM != null && calib.meters === 1 && calib.a.x === 0 && calib.b.x === plan.pxPerM;
  const wallLenPx = drawnWalls.reduce((sum, d) => sum + Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y), 0);
  const wallsReady = autoWalls ? !!walls : drawnWalls.length > 0;
  const step = !wallsReady ? 1 : !calib ? 2 : 3;
  const activeTool = TOOLS.find((t) => t.key === tool)!;
  const thickCm = walls && mPerPx ? walls.minThickness * mPerPx * 100 : null;

  return (
    <TooltipProvider delayDuration={250}>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[calc(100dvh-1rem)] w-full max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[min(92dvh,57.5rem)] sm:max-w-[min(90rem,96vw)]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (draft.length) e.preventDefault(); }}
      >
        {/* Κεφαλίδα */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 pr-12">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md" style={{ background: '#0B1220', color: '#22D3EE' }}>
            <FiSquare className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-(length:--fs-15) font-semibold">Διαστασιολόγηση κάτοψης</DialogTitle>
            <DialogDescription className="truncate text-(length:--fs-12) text-muted-foreground">{projectLabel}</DialogDescription>
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
            <div className="relative flex h-full flex-col items-center justify-center gap-4 overflow-y-auto p-4 pb-20">
              <div
                {...dz.getRootProps()}
                className="group flex w-full max-w-xl cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                style={{ borderColor: dz.isDragActive ? '#22D3EE' : 'rgba(148,163,184,.45)', background: dz.isDragActive ? 'rgba(34,211,238,.08)' : 'rgba(15,23,42,.6)' }}
              >
                <input {...dz.getInputProps()} aria-label="Αρχείο κάτοψης" />
                <span className="inline-flex size-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(34,211,238,.12)', color: '#22D3EE' }}>
                  {loading ? <FiLoader className="size-6 animate-spin" aria-hidden /> : <FiUploadCloud className="size-6" aria-hidden />}
                </span>
                <div>
                  <p className="text-(length:--fs-16) font-semibold text-slate-50">{loading ? 'Άνοιγμα κάτοψης…' : 'Σύρε εδώ την κάτοψη ή πάτησε για επιλογή'}</p>
                  <p className="mt-1 text-(length:--fs-12) text-slate-400">Εικόνα (PNG, JPG, WebP) ή PDF · η επεξεργασία γίνεται τοπικά στον browser</p>
                </div>
                <ol className="mt-2 grid w-full grid-cols-1 gap-2 text-left text-(length:--fs-12) text-slate-300 sm:grid-cols-3">
                  {[['1', 'Τοίχοι', 'Εντοπίζονται αυτόματα'], ['2', 'Κλίμακα', 'Μια γνωστή απόσταση'], ['3', 'Μέτρηση', 'Κλικ στον χώρο → m²']].map(([n, t, d]) => (
                    <li key={n} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                      <span className="font-mono text-(length:--fs-11) text-cyan-300">{n.padStart(2, '0')}</span>
                      <span className="ml-2 font-semibold text-slate-100">{t}</span>
                      <span className="block text-slate-400">{d}</span>
                    </li>
                  ))}
                </ol>
              </div>
              {savedPlans && savedPlans.length > 0 && (
                <section className="w-full max-w-xl rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3" aria-label="Αποθηκευμένες χαρτογραφήσεις">
                  <h3 className="mb-2 text-(length:--fs-11) font-semibold uppercase tracking-wider text-cyan-300">Αποθηκευμένες χαρτογραφήσεις του έργου</h3>
                  <ul className="divide-y divide-slate-700/70">
                    {savedPlans.map((sp) => (
                      <li key={sp.id} className="flex items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-(length:--fs-13) font-medium text-slate-100">{sp.title}</p>
                          <p className="truncate text-(length:--fs-11) text-slate-400">
                            {sp.roomCount} χώροι · {fmtM2(sp.floorM2)}{sp.wallsM2 > 0 ? ` + τοίχοι ${fmtM2(sp.wallsM2)}` : ''} · {new Date(sp.updatedAt).toLocaleDateString('el-GR')}
                            {sp.contracts.length > 0 && ` · ${sp.contracts.map((c) => `ΣΥΜ-${String(c.number).padStart(6, '0')}`).join(', ')}`}
                          </p>
                        </div>
                        <Button size="sm" variant="secondary" disabled={loading} onClick={() => void restore(sp.id)}>Άνοιγμα</Button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
              <button
                type="button" onClick={startBlank}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-600 bg-slate-900/80 px-4 py-2 text-(length:--fs-12) font-medium text-slate-200 transition-colors hover:border-orange-400 hover:text-orange-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                <FiGrid className="size-4" aria-hidden /> Δεν διαβάζεται το σχέδιο; Σχεδίασε τους τοίχους σε κενό κάναβο
              </button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[20rem_minmax(0,1fr)] md:grid-rows-1">
            {/* ── Πάνελ βημάτων ── */}
            <div ref={railRef} className="order-2 max-h-[42dvh] space-y-3 overflow-y-auto border-t border-border bg-muted/30 p-3 md:order-1 md:max-h-none md:border-r md:border-t-0">
              {canOffer && plan.pxPerM == null && (
                <section data-fp-step className="rounded-xl border p-3" style={{ borderColor: '#C4B5FD', background: 'linear-gradient(135deg, #F5F3FF, #EEF2FF)' }}>
                  <Button className="w-full" size="sm" disabled={aiBusy || !gray} onClick={() => void detectAi()} style={{ background: '#6D28D9', color: '#fff' }}>
                    {aiBusy ? <FiLoader className="animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />} {aiBusy ? 'Ανάγνωση σχεδίου… (~30″)' : 'Αναγνώριση χώρων με AI'}
                  </Button>
                  <p className="mt-1.5 text-(length:--fs-11)" style={{ color: '#4C1D95' }}>
                    Διαβάζει ονόματα χώρων, διαστάσεις{calib ? '' : ', κλίμακα'} και περιγράμματα από το σχέδιο. Όπου το σχέδιο γράφει διαστάσεις, το εμβαδό ελέγχεται με αυτές. Όσα σημειωθούν «κατά προσέγγιση» διόρθωσέ τα με «Πολύγωνο».
                  </p>
                </section>
              )}
              <Step n={1} title="Τοίχοι" done={wallsReady} active={step === 1}>
                {plan.pxPerM == null && (
                  <label className="flex cursor-pointer items-center justify-between gap-2">
                    <span>Αυτόματη ανίχνευση από το σχέδιο</span>
                    <input type="checkbox" role="switch" checked={autoWalls} onChange={(e) => setAutoWalls(e.target.checked)} className="size-4 cursor-pointer accent-(--primary)" />
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
                    <p className="text-(length:--fs-11) text-muted-foreground">Αν χάνονται λεπτοί εσωτερικοί τοίχοι, μίκρυνε το πάχος· αν «πιάνονται» γράμματα και έπιπλα, μεγάλωσέ το. Ό,τι λείπει, σχεδίασέ το παρακάτω.</p>
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

              {/* raised: το dropdown αναζήτησης είδους να περνά πάνω από το βήμα «Προσφορά» */}
              <Step n={3} title="Μέτρηση χώρων" done={rooms.length > 0} active={step === 3} raised>
                <div className="grid grid-cols-2 gap-1.5">
                  {TOOLS.filter((t) => ['room', 'rect', 'polygon', 'edit', 'divider', 'opening', 'measure'].includes(t.key)).map((t) => (
                    <ToolTip key={t.key} tool={t}>
                      <button
                        type="button" onClick={() => changeTool(t.key)} aria-pressed={tool === t.key}
                        className="flex min-h-9 cursor-pointer items-center justify-start gap-1.5 rounded-lg border px-2 py-1.5 text-left text-(length:--fs-12) font-medium leading-tight transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0"
                        style={tool === t.key ? { borderColor: 'var(--primary)', background: 'color-mix(in oklab, var(--primary) 10%, transparent)', color: 'var(--primary)' } : { borderColor: 'var(--border)' }}
                      >
                        {t.icon}{t.label}
                      </button>
                    </ToolTip>
                  ))}
                </div>
                {tool === 'opening' && (
                  <div className="space-y-2 rounded-lg border border-border bg-background p-2">
                    <p className="text-(length:--fs-11) text-muted-foreground">Διάλεξε είδος και κάνε δύο κλικ πάνω στον τοίχο του χώρου, στα άκρα του ανοίγματος. Το πλάτος μετριέται από το σχέδιο.</p>
                    <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Είδος ανοίγματος">
                      {(Object.keys(OPENING_PRESETS) as OpeningKind[]).map((k) => (
                        <button
                          key={k} type="button" role="radio" aria-checked={openingKind === k}
                          onClick={() => { setOpeningKind(k); setOpeningH(OPENING_PRESETS[k].h); setOpeningSill(OPENING_PRESETS[k].sill); }}
                          className="flex cursor-pointer items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-(length:--fs-11) font-medium transition-colors"
                          style={openingKind === k ? { borderColor: OPENING_COLOR[k], background: `color-mix(in oklab, ${OPENING_COLOR[k]} 15%, transparent)` } : { borderColor: 'var(--border)' }}
                        >
                          <span className="size-2 rounded-full" style={{ background: OPENING_COLOR[k] }} aria-hidden />{OPENING_PRESETS[k].label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-(length:--fs-11)">
                      <label className="inline-flex items-center gap-1">Ύψος <MetersInput value={openingH} onValue={setOpeningH} label="Ύψος ανοίγματος σε μέτρα" className="w-12" /> m</label>
                      {openingKind !== 'door' && (
                        <label className="inline-flex items-center gap-1" title="Πόσο ψηλά από το δάπεδο ξεκινά το άνοιγμα">Ποδιά <MetersInput value={openingSill} onValue={setOpeningSill} min={0} label="Ύψος ποδιάς από το δάπεδο σε μέτρα" className="w-12" /> m</label>
                      )}
                    </div>
                  </div>
                )}
                {(pins.length > 0 || tool === 'pin') && (
                  <div className="rounded-lg border border-border bg-background p-2">
                    <p className="mb-1 text-(length:--fs-11) font-semibold uppercase tracking-wider text-muted-foreground">Σημειώσεις στο σχέδιο ({pins.length})</p>
                    {pins.length === 0 && <p className="text-(length:--fs-12) text-muted-foreground">Κάνε κλικ σε ένα σημείο του σχεδίου για νέα σημείωση.</p>}
                    <ul className="space-y-1.5">
                      {pins.map((p, i) => {
                        const open = pinSel === p.id;
                        return (
                          <li key={p.id} className={cn('rounded-md p-1.5', open && 'bg-muted/60')}>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setPinSel(open ? null : p.id)} className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-rose-600 font-mono text-(length:--fs-11) font-bold text-white" aria-label={`Σημείωση ${i + 1}`}>{i + 1}</button>
                              <button type="button" onClick={() => setPinSel(open ? null : p.id)} className="min-w-0 flex-1 cursor-pointer truncate text-left text-(length:--fs-12)">{p.text || <span className="text-muted-foreground">Χωρίς κείμενο</span>}</button>
                              {p.photoFileIds.length > 0 && <span className="inline-flex items-center gap-0.5 text-(length:--fs-11) text-muted-foreground"><FiCamera className="size-3" aria-hidden />{p.photoFileIds.length}</span>}
                              <button type="button" aria-label={`Διαγραφή σημείωσης ${i + 1}`} onClick={() => { setPins((ps) => ps.filter((x) => x.id !== p.id)); if (open) setPinSel(null); }} className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><FiTrash2 className="size-3.5" aria-hidden /></button>
                            </div>
                            {open && (
                              <div className="mt-1.5 space-y-1.5 pl-8">
                                <textarea id={`pin-text-${p.id}`} value={p.text} rows={2} maxLength={2000} aria-label={`Κείμενο σημείωσης ${i + 1}`}
                                  onChange={(e) => setPins((ps) => ps.map((x) => (x.id === p.id ? { ...x, text: e.target.value } : x)))}
                                  placeholder="π.χ. Σπασμένο πλακάκι κάτω από το παράθυρο — αλλαγή πριν την τοποθέτηση"
                                  className="w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-(length:--fs-12) outline-hidden focus-visible:ring-2 focus-visible:ring-ring" />
                                <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-(length:--fs-12) text-muted-foreground hover:bg-muted hover:text-foreground focus-within:ring-2 focus-within:ring-ring">
                                  {pinUploading ? <FiLoader className="size-3.5 animate-spin" aria-hidden /> : <FiCamera className="size-3.5" aria-hidden />} Φωτογραφία
                                  <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={pinUploading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadPinPhoto(p.id, f); }} />
                                </label>
                                {p.photoFileIds.length > 0 && (
                                  <ul className="flex flex-wrap gap-1">
                                    {p.photoFileIds.map((fid, j) => <li key={fid}><img src={`/api/admin/entity-files/file/${fid}`} alt={`Φωτογραφία ${j + 1} της σημείωσης ${i + 1}`} className="size-12 rounded object-cover ring-1 ring-border" /></li>)}
                                  </ul>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-1 text-(length:--fs-10) text-muted-foreground">Αποθηκεύονται με τη χαρτογράφηση. Στην προσφορά: «→ Εργασία».</p>
                  </div>
                )}
                {dims.length > 0 && (
                  <div className="rounded-lg border border-border bg-background p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-(length:--fs-11) font-semibold uppercase tracking-wider text-muted-foreground">Διαστάσεις ({dims.length})</span>
                      <Button size="xs" variant="ghost" onClick={() => setDims([])}>Όλες</Button>
                    </div>
                    <ul className="max-h-28 space-y-0.5 overflow-y-auto">
                      {dims.map((d, i) => (
                        <li key={d.id} className="flex items-center justify-between gap-2 text-(length:--fs-12)">
                          <span className="font-mono tabular-nums">{i + 1}. {fmtLen(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y))}</span>
                          <button type="button" aria-label={`Διαγραφή διάστασης ${i + 1}`} onClick={() => setDims((ds) => ds.filter((x) => x.id !== d.id))} className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <FiTrash2 className="size-3.5" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {tool === 'edit' && (
                  <div className="rounded-lg border border-border bg-background p-2 text-(length:--fs-11) text-muted-foreground">
                    {selected ? (
                      <ul className="list-disc space-y-0.5 pl-4">
                        <li><b className="text-foreground">Σύρε μια κορυφή</b> για να μετακινήσεις τη γωνία (κουμπώνει σε ευθεία με τις διπλανές· Shift = οριζόντια/κάθετα).</li>
                        <li><b className="text-foreground">Σύρε το «+»</b> στη μέση μιας πλευράς για νέο σπάσιμο.</li>
                        <li><b className="text-foreground">Σύρε μέσα στον χώρο</b> ή πάτα τα βελάκια (1 cm, Shift 10 cm) για να τον μετακινήσεις.</li>
                        <li><b className="text-foreground">Διπλό κλικ σε κορυφή</b> για διαγραφή της.</li>
                      </ul>
                    ) : 'Κάνε κλικ σε έναν χώρο (στο σχέδιο ή στη λίστα) για να εμφανιστούν οι λαβές του.'}
                    <Button size="xs" variant="outline" className="mt-2" onClick={() => { if (!undoEdit()) toast.message('Δεν υπάρχει αλλαγή για αναίρεση.'); }}>
                      <FiRotateCcw aria-hidden /> Αναίρεση (⌘/Ctrl+Z)
                    </Button>
                  </div>
                )}
                {tool === 'polygon' && (
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background p-2">
                    <input type="checkbox" checked={polyWalls} onChange={(e) => setPolyWalls(e.target.checked)} className="mt-0.5 size-4 cursor-pointer accent-(--primary)" />
                    <span>
                      <span className="font-medium">Το περίγραμμα είναι τοίχοι</span>
                      <span className="block text-(length:--fs-11) text-muted-foreground">Οι πλευρές του πολυγώνου γίνονται τοίχοι ({calib ? `${wallCm} cm` : `${wallPx} px`}) και το εμβαδό μετριέται καθαρό, μέσα από αυτούς. Σχεδίασε στον άξονα του τοίχου.</span>
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
                          className="px-2 py-1.5"
                          style={r.id === selected ? { background: 'color-mix(in oklab, var(--primary) 7%, transparent)' } : undefined}
                          onClick={() => setSelected(r.id)}
                        >
                          <div className="flex items-center gap-2">
                          <span className="size-3 shrink-0 rounded-sm" style={{ background: r.color }} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <input
                              value={r.name} aria-label="Όνομα χώρου"
                              onChange={(e) => setRooms((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                              onFocus={() => setSelected(r.id)}
                              className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-(length:--fs-12) hover:border-border focus:border-ring focus:outline-hidden"
                            />
                            {canOffer && <span className="block px-1"><MaterialChip material={r.material} /></span>}
                          </span>
                          <span className="shrink-0 text-right font-mono text-(length:--fs-12) font-semibold tabular-nums">
                            {a == null ? '—' : nf.format(a)}<span className="ml-0.5 text-(length:--fs-10) font-normal text-muted-foreground">m²</span>
                            {mPerPx && <span className="block text-(length:--fs-10) font-normal text-muted-foreground">Π {nf.format(r.perimeterPx * mPerPx)} m{r.approx ? '' : r.manual ? ' · χειρ.' : ''}</span>}
                            {r.approx && <span className="block text-(length:--fs-10) font-semibold" style={{ color: '#B45309' }} title="Ορθογώνιο από την αναγνώριση AI — έλεγξε/διόρθωσε με «Πολύγωνο»">κατά προσέγγιση</span>}
                          </span>
                          <button
                            type="button" aria-label={`Διαγραφή ${r.name}`}
                            onClick={(e) => { e.stopPropagation(); setRooms((rs) => rs.filter((x) => x.id !== r.id)); }}
                            className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <FiTrash2 className="size-3.5" aria-hidden />
                          </button>
                          </div>
                          {mPerPx && <WallsToggle walls={r.walls} perimeterM={r.perimeterPx * mPerPx} color={r.color} open={selected === r.id} onToggle={() => toggleWalls(r.id)} />}
                          {r.walls?.on && selected === r.id && (
                            <>
                              <RoomWallsPanel walls={r.walls} perimeterM={mPerPx ? r.perimeterPx * mPerPx : null} color={r.color} onChange={(wl) => updateWalls(r.id, wl)} />
                              <button
                                type="button" onClick={(e) => { e.stopPropagation(); updateWalls(r.id, { ...r.walls!, on: false }); }}
                                className="mt-1 cursor-pointer text-(length:--fs-10) text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                              >
                                Χωρίς πλακάκι στους τοίχους
                              </button>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {canOffer && selectedRoom && mPerPx && (
                  <RoomMaterialEditor
                    key={selectedRoom.id}
                    roomName={selectedRoom.name} value={selectedRoom.material} recipes={recipes} recipesError={recipesError}
                    onChange={(m, note) => { setMaterial(selectedRoom.id, m); if (note) toast.message(note); }}
                    canApplyAll={rooms.some((r) => r.id !== selectedRoom.id && !r.material)}
                    onApplyAll={() => setRooms((rs) => rs.map((x) => (x.material ? x : { ...x, material: selectedRoom.material })))}
                  />
                )}
              </Step>

              {onApply && (
                <Step n={4} title="Στην προσφορά" done={false} active={step === 3 && rooms.length > 0}>
                  <p className="text-muted-foreground">
                    {rooms.length
                      ? <>Οι <b className="text-foreground">{rooms.length}</b> χώροι μπαίνουν στη φόρμα της προσφοράς· υλικά/συνταγές ορίζονται κι εκεί, με το κόστος κάθε χώρου.</>
                      : 'Μέτρησε τουλάχιστον έναν χώρο.'}
                  </p>
                  <Button size="sm" className="w-full" disabled={!calib || !rooms.length || planSaving} onClick={() => void apply()}>
                    {planSaving ? <FiLoader className="animate-spin" aria-hidden /> : <FiCheck aria-hidden />} Μεταφορά στην προσφορά
                  </Button>
                </Step>
              )}
              {canOffer && !onApply && (
                <Step n={4} title="Προσφορά" done={!!createdOffer} active={step === 3 && rooms.length > 0}>
                  <OfferStepBody
                    withMaterial={withMaterial} total={rooms.length} ready={!!calib && rooms.length > 0}
                    onOpen={() => setOfferOpen(true)} created={createdOffer}
                  />
                </Step>
              )}
              {canOffer && !onApply && (
                <FloorPlanOfferDialog
                  open={offerOpen} onOpenChange={setOfferOpen} apiBase={apiBase} rooms={offerRooms} recipes={recipes}
                  busy={offering || planSaving} onSubmit={(o) => void createOffer(o)}
                />
              )}

              {/* Σύνολο + εξαγωγή */}
              <section data-fp-step className="rounded-xl p-3 text-slate-100" style={{ background: '#0B1220' }}>
                <div className="flex items-baseline justify-between">
                  <span className="text-(length:--fs-11) font-medium uppercase tracking-wider text-slate-400">Σύνολο</span>
                  <span className="text-(length:--fs-11) text-slate-400">{rooms.length} χώρ{rooms.length === 1 ? 'ος' : 'οι'}</span>
                </div>
                <p className="mt-1 font-mono text-(length:--fs-28) font-semibold leading-none tabular-nums" style={{ color: '#22D3EE' }}>
                  <span ref={totalRef}>0,00</span><span className="ml-1 text-(length:--fs-14) text-slate-400">m²</span>
                  {wallRooms > 0 && <span className="ml-2 align-middle font-sans text-(length:--fs-10) font-medium uppercase tracking-wider text-slate-400">δάπεδο</span>}
                </p>
                {wallRooms > 0 && (
                  <dl className="mt-2 space-y-0.5 border-t border-white/10 pt-2 font-mono text-(length:--fs-12) tabular-nums">
                    <div className="flex justify-between gap-2"><dt className="font-sans text-slate-400">Τοίχοι · {wallRooms} χώρ{wallRooms === 1 ? 'ος' : 'οι'}</dt><dd>{fmtM2(wallsTotal)}</dd></div>
                    <div className="flex justify-between gap-2 font-semibold text-white"><dt className="font-sans">Δάπεδο + τοίχοι</dt><dd style={{ color: '#22D3EE' }}>{fmtM2(total + wallsTotal)}</dd></div>
                  </dl>
                )}
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
                {canOffer && (
                  <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                    <label htmlFor="fp-title" className="block text-[length:var(--fs-11)] font-medium uppercase tracking-wider text-slate-400">Χαρτογράφηση στο έργο</label>
                    <input
                      id="fp-title" value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder={`Κάτοψη ${projectLabel}`} maxLength={200}
                      className="h-8 w-full rounded-md border border-slate-600 bg-slate-900 px-2 text-(length:--fs-12) text-slate-100 placeholder:text-slate-500 focus:border-cyan-300 focus:outline-hidden"
                    />
                    <Button className="w-full" size="sm" disabled={!rooms.length || !calib || planSaving} onClick={() => void savePlan()}>
                      {planSaving ? <FiLoader className="animate-spin" aria-hidden /> : <FiSave aria-hidden />} {savedId ? 'Ενημέρωση χαρτογράφησης' : 'Αποθήκευση χαρτογράφησης'}
                    </Button>
                    {savedId && <p className="text-[length:var(--fs-11)] text-slate-400">Αποθηκευμένη — ξανανοίγει από την αρχική οθόνη του εργαλείου.</p>}
                  </div>
                )}
                {canSave && (
                  <Button className="mt-1.5 w-full" size="sm" variant="secondary" disabled={!rooms.length || !calib || saving} onClick={() => void save()}>
                    {saving ? <FiLoader className="animate-spin" aria-hidden /> : <FiSave aria-hidden />} Αποθήκευση στα αρχεία του έργου
                  </Button>
                )}
              </section>
            </div>

            {/* ── Προβολή ── */}
            <div className="relative order-1 min-h-[45dvh] md:order-2 md:min-h-0" {...dz.getRootProps()}>
              <input {...dz.getInputProps()} />
              {view3d && mPerPx ? (
                <Plan3d ref={plan3dRef} image={plan.display} w={w} h={h} mPerPx={mPerPx} rooms={rooms} selectedId={selected} />
              ) : (
                <PlanViewer
                  image={plan.display} w={w} h={h}
                  wallsOverlay={overlay} showWalls={showWalls} wallThicknessPx={wallPx}
                  rooms={viewerRooms} selectedId={selected} dividers={dividers}
                  openings={viewerOpenings} openingKind={openingKind} dimensions={dims}
                  pins={pins.map((p, i) => ({ id: p.id, x: p.x, y: p.y, n: i + 1, selected: p.id === pinSel, hasPhoto: p.photoFileIds.length > 0 }))}
                  calibration={calibLine ?? (calib && !blankScale ? [calib.a, calib.b] : null)}
                  draft={draft} tool={tool} formatLength={fmtLen}
                  onPick={onPick} onFinish={finish} onEdit={onEdit} fitKey={fitKey}
                />
              )}

              {/* Εργαλειοθήκη (αριστερά), σε ομάδες — tooltip με το τι κάνει κάθε εργαλείο */}
              {!view3d && (
                <div className="absolute left-3 top-3 flex max-h-[calc(100%-5rem)] flex-col gap-0.5 overflow-y-auto rounded-xl border border-slate-700/80 bg-slate-900/85 p-1 shadow-xl backdrop-blur-sm" role="toolbar" aria-label="Εργαλεία" aria-orientation="vertical">
                  {TOOL_GROUPS.map((g, gi) => (
                    <React.Fragment key={g}>
                      {gi > 0 && <span className="mx-1.5 my-0.5 h-px bg-slate-700" aria-hidden />}
                      {TOOLS.filter((t) => t.group === g).map((t) => (
                        <ToolTip key={t.key} tool={t}>
                          <button
                            type="button" onClick={() => changeTool(t.key)} aria-pressed={tool === t.key} aria-label={`${t.label} (${t.kbd})`}
                            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 [&_svg]:size-4"
                            style={tool === t.key ? { background: '#22D3EE', color: '#0B1220' } : { color: '#CBD5E1' }}
                          >
                            {t.icon}
                          </button>
                        </ToolTip>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Προβολή (δεξιά) */}
              <div className="absolute right-3 top-3 flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-900/85 p-1 text-slate-200 shadow-xl backdrop-blur-sm">
                {/* 2D / 3D */}
                <div className="flex rounded-md bg-slate-800/80 p-0.5" role="radiogroup" aria-label="Προβολή">
                  {(['2D', '3D'] as const).map((m) => {
                    const on = (m === '3D') === view3d;
                    return (
                      <button
                        key={m} type="button" role="radio" aria-checked={on} disabled={m === '3D' && !mPerPx}
                        title={m === '3D' ? (mPerPx ? 'Προβολή 3D: τοίχοι, ζώνη πλακιδίων και ανοίγματα' : 'Όρισε πρώτα κλίμακα για 3D') : 'Σχέδιο 2D με τα εργαλεία'}
                        onClick={() => { setView3d(m === '3D'); setDraft([]); }}
                        className="h-6 cursor-pointer rounded px-2 font-mono text-(length:--fs-11) font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        style={on ? { background: '#22D3EE', color: '#0B1220' } : undefined}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
                {view3d && (
                  <button type="button" onClick={() => void save3d()} disabled={planSaving || !rooms.length} title="Αποθήκευση της εικόνας 3D μαζί με τη χαρτογράφηση" aria-label="Αποθήκευση εικόνας 3D" className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-(length:--fs-11) font-medium hover:bg-slate-800 disabled:opacity-40 [&_svg]:size-3.5">
                    {planSaving ? <FiLoader className="animate-spin" aria-hidden /> : <FiCamera aria-hidden />} Αποθήκευση 3D
                  </button>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" title="Οδηγός εργαλείων" aria-label="Οδηγός εργαλείων" className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-slate-800 [&_svg]:size-4"><FiHelpCircle /></button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="max-h-[70dvh] w-[min(26rem,90vw)] overflow-y-auto p-3">
                    <p className="text-(length:--fs-13) font-semibold">Οδηγός εργαλείων</p>
                    <p className="mb-2 text-(length:--fs-11) text-muted-foreground">Πλήκτρο σε παρένθεση · Esc ακυρώνει ό,τι σχεδιάζεις · Enter/διπλό κλικ τελειώνει · ⌘/Ctrl+Z αναίρεση</p>
                    {TOOL_GROUPS.map((g) => (
                      <div key={g} className="mb-2">
                        <p className="mb-1 text-(length:--fs-10) font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
                        <ul className="space-y-1.5">
                          {TOOLS.filter((t) => t.group === g).map((t) => (
                            <li key={t.key}>
                              <button type="button" onClick={() => { setView3d(false); changeTool(t.key); }} className="flex w-full cursor-pointer items-start gap-2 rounded-md p-1 text-left hover:bg-muted [&_svg]:size-4">
                                <span className="mt-0.5 shrink-0 text-muted-foreground">{t.icon}</span>
                                <span className="min-w-0">
                                  <span className="text-(length:--fs-12) font-semibold">{t.label} <kbd className="ml-1 rounded border border-border px-1 font-mono text-(length:--fs-10) font-normal">{t.kbd}</kbd></span>
                                  <span className="block text-(length:--fs-11) leading-snug text-muted-foreground">{t.help}</span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </PopoverContent>
                </Popover>
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
                <div className="absolute bottom-14 right-3 flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-900/85 px-1 py-0.5 text-(length:--fs-11) text-slate-200 backdrop-blur-sm">
                  <button type="button" aria-label="Προηγούμενη σελίδα" disabled={plan.page <= 1 || loading} onClick={() => void load(file, plan.page - 1, true)} className="inline-flex size-6 cursor-pointer items-center justify-center rounded hover:bg-slate-800 disabled:opacity-40"><FiChevronLeft /></button>
                  <span className="font-mono tabular-nums">σελ. {plan.page}/{plan.pages}</span>
                  <button type="button" aria-label="Επόμενη σελίδα" disabled={plan.page >= plan.pages || loading} onClick={() => void load(file, plan.page + 1, true)} className="inline-flex size-6 cursor-pointer items-center justify-center rounded hover:bg-slate-800 disabled:opacity-40"><FiChevronRight /></button>
                </div>
              )}

              {/* Οδηγία εργαλείου */}
              <div className={cn('pointer-events-none absolute inset-x-3 bottom-3 flex justify-center', view3d && 'hidden')}>
                <div className="flex max-w-full items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 text-(length:--fs-12) text-slate-200 shadow-xl backdrop-blur-sm">
                  {(analyzing || loading) && <FiLoader className="size-3.5 shrink-0 animate-spin text-cyan-300" aria-hidden />}
                  <span className="shrink-0 font-semibold text-cyan-300">{activeTool.label}</span>
                  <span className="truncate">{tool === 'room' && !calib ? 'Όρισε πρώτα την κλίμακα (βήμα 2) για εμβαδά σε m².' : activeTool.hint}</span>
                  {draft.length > 0 && <kbd className="hidden shrink-0 rounded border border-slate-600 px-1 font-mono text-(length:--fs-10) text-slate-400 sm:inline">Esc</kbd>}
                </div>
              </div>
              {dz.isDragActive && (
                <div className="absolute inset-0 flex items-center justify-center border-2 border-dashed border-cyan-300 bg-cyan-400/10 text-(length:--fs-14) font-semibold text-cyan-100">
                  Άφησε εδώ τη νέα κάτοψη
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </TooltipProvider>
  );
}
