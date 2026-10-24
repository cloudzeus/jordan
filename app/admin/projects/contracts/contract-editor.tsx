'use client';

// Φόρμα «Νέο έργο» / προσφορά / σύμβαση. Αριστερά τα βήματα (πελάτης → κάτοψη & χώροι → υλικά →
// περιγραφή → πληρωμές → συνεργεία), δεξιά μια σταθερή στήλη με πρόοδο, σύνολο, απόθεμα και αποθήκευση.
// Οι χώροι της κάτοψης παράγουν δικές τους γραμμές (`roomId`) που ξαναϋπολογίζονται όταν αλλάξει υλικό.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  FiArrowDown, FiArrowUp, FiCheck, FiChevronDown, FiEdit3, FiFileText, FiLayers, FiLoader, FiMapPin, FiMessageSquare, FiMoreVertical,
  FiPackage, FiPlus, FiSave, FiSquare, FiTool, FiTrash2, FiUsers, FiX, FiZap,
} from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RegistrySearch, type RegistryPick } from '@/components/admin/registry-search';
import type { RoomMaterial } from '@/components/admin/floorplan/offer-panel';
import type { FloorPlanOwner } from '@/components/admin/floorplan/floor-plan-dialog';
import { cn } from '@/lib/utils';
import {
  CONTRACT_KINDS, KIND_HINT, KIND_LABEL, allowsCrews, crewTotal, eur, lineNet, milestoneCoverage, round2, totals, type ContractKind,
} from '@/lib/contracts/core';
import { roomLines, roomNet } from '@/lib/contracts/room-lines';
import type { FloorPlanItem } from '@/lib/floorplan/offer-core';
import type { PlanPin, PlanRoom } from '@/lib/floorplan/saved';
import { siteLine } from '@/lib/project-site-core';
import type { ContractView } from '@/lib/contracts/service';
import type { OfferLine, OfferLineMode } from '@/lib/install-recipes-core';
import type { RecipeView } from '@/lib/install-recipes';
import { ProjectSiteDialog, type ProjectSiteValue } from '../project-site-dialog';
import { listRecipesAction } from '../../recipes/actions';
import { RecipeLinesDialog } from './recipe-lines-dialog';
import { customerTextAction, itemDefaultsAction, saveContractAction } from './actions';
import { CrewPicker, CustomerPicker, MicButton, type CrewOpt } from './editor/pickers';
import { RoomsSection } from './editor/rooms-section';
import { PaymentsSection, type EditorMilestone, type PlanPreset } from './editor/payments-section';
import { StockBadge, StockCard, useStock } from './editor/stock';
import { BomSection } from './editor/bom';
import { ScheduleSection, type EditorTask, type TemplateOption } from './editor/schedule-section';
import { NoteButton, NotesProvider, NoteThread } from './editor/notes';
import type { NoteView } from '@/lib/contracts/notes';

// ── Τύποι κατάστασης φόρμας (ίδιο σχήμα με το contractInput του server) ─────────────────────────
type Line = { uid: string; kind: 'MATERIAL' | 'SERVICE'; mtrl: number | null; code: string | null; name: string; unit: string | null; qty: number; unitPrice: number; discount: number; notes: string | null; partyKey: string | null; crewFee: number | null; roomId: string | null };
type Party = { key: string; kind: 'SUPPLIER' | 'PARTNER'; trdr: number | null; partnerId: string | null; name: string; email: string | null; phone: string | null; afm: string | null; specialty: string | null; scope: string | null };
type Staff = { id: string; label: string; email: string };
type State = {
  title: string; summary: string; customerText: string | null; kind: ContractKind; trdr: number | null; customerName: string | null; customerEmail: string | null; customerPhone: string | null;
  site: ProjectSiteValue | null; startDate: string | null; endDate: string | null; validUntil: string | null; vatRate: number; terms: string | null;
  lines: Line[]; parties: Party[]; members: string[]; milestones: EditorMilestone[];
  floorPlanId: string | null; floorPlanTitle: string | null; rooms: PlanRoom[]; pins: PlanPin[];
  tasks: EditorTask[];
};

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const blank = (): State => ({
  title: '', summary: '', customerText: null, kind: 'PRODUCT_INSTALL', trdr: null, customerName: null, customerEmail: null, customerPhone: null,
  site: null, startDate: null, endDate: null, validUntil: null, vatRate: 24, terms: null, lines: [], parties: [], members: [], milestones: [],
  floorPlanId: null, floorPlanTitle: null, rooms: [], pins: [], tasks: [],
});
function fromView(c: ContractView): State {
  return {
    title: c.title, summary: c.summary, customerText: c.customerText, kind: c.kind as ContractKind, trdr: c.trdr, customerName: c.customerName, customerEmail: c.customerEmail, customerPhone: c.customerPhone,
    site: c.site, startDate: c.startDate, endDate: c.endDate, validUntil: c.validUntil, vatRate: c.vatRate, terms: c.terms,
    lines: c.lines.map((l) => ({ ...l, uid: l.id })), parties: c.parties, members: c.members.map((m) => m.id),
    milestones: c.milestones.map((m) => ({ ...m, uid: m.id })),
    floorPlanId: c.floorPlanId, floorPlanTitle: c.floorPlan?.title ?? null, rooms: c.floorPlan?.rooms ?? [], pins: c.floorPlan?.pins ?? [],
    tasks: c.tasks,
  };
}
const toPayload = ({ floorPlanTitle: _t, pins: _pins, rooms, ...s }: State) => ({
  ...s,
  roomMaterials: s.floorPlanId ? rooms.map((r) => ({ roomId: r.id, material: r.material })) : undefined,
  lines: s.lines.map(({ uid: _u, ...l }) => l),
  milestones: s.milestones.map(({ uid: _u, ...m }) => m),
  tasks: s.tasks.map(({ projectTaskId: _p, ...t }) => t),
});

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const field = 'h-9 text-(length:--fs-12)';
const lbl = 'text-(length:--fs-12) font-medium text-foreground';
const numVal = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const m2 = (n: number) => `${n.toLocaleString('el-GR', { maximumFractionDigits: 1 })} m²`;
const textarea = 'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-(length:--fs-13) leading-relaxed outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70';

/** Αριθμητικό πεδίο που κρατά το κείμενο όσο γράφεις («1,», «0.5») — δέχεται κόμμα ή τελεία. */
function NumInput({ value, onValue, nullable = false, ...rest }: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & { value: number | null; onValue: (n: number | null) => void; nullable?: boolean }) {
  const show = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));
  const [text, setText] = React.useState(() => show(value));
  // Νέα τιμή απ' έξω → ενημέρωση κειμένου (adjust-state-while-rendering)
  const [prevValue, setPrevValue] = React.useState(value);
  if (!Object.is(value, prevValue)) {
    setPrevValue(value);
    const cur = text.trim() === '' ? null : numVal(text);
    if (cur !== value && !(cur == null && value === 0 && !nullable)) setText(show(value));
  }
  return (
    <Input {...rest} inputMode="decimal" value={text}
      onChange={(e) => { const t = e.target.value; setText(t); onValue(t.trim() === '' ? (nullable ? null : 0) : numVal(t)); }}
      onBlur={() => setText(show(value))} />
  );
}

/** Ενότητα-βήμα: ήρεμη κάρτα με αριθμό (✓ όταν ολοκληρωθεί), τίτλο, μία γραμμή βοήθειας και ενέργειες. */
function Section({ id, n, done, title, hint, actions, children, optional }: {
  id: string; n: number | null; done?: boolean; title: string; hint?: string; actions?: React.ReactNode; children: React.ReactNode; optional?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 rounded-xl border border-border bg-card shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pb-3 pt-4">
        <div className="flex min-w-0 items-start gap-3">
          {n != null && (
            <span className={cn('mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-(length:--fs-12) font-semibold tabular-nums',
              done ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground')} aria-label={done ? 'Ολοκληρώθηκε' : `Βήμα ${n}`}>
              {done ? <FiCheck className="size-3.5" aria-hidden /> : n}
            </span>
          )}
          <div className="min-w-0">
            <h2 id={`${id}-h`} className="text-(length:--fs-15) font-semibold text-foreground">
              {title}{optional && <span className="ml-2 align-middle text-(length:--fs-11) font-normal text-muted-foreground">προαιρετικό</span>}
            </h2>
            {hint && <p className="mt-0.5 text-(length:--fs-12) text-muted-foreground">{hint}</p>}
          </div>
        </div>
        {actions}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted" aria-label={label}>
        <FiMoreVertical className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────────────────────────
export function ContractEditor({ initial, staff, readOnly = false, customer = null, templates = [], today, notes = [] }: {
  initial: ContractView | null; staff: Staff[]; readOnly?: boolean;
  /** Templates εργασιών για το χρονοδιάγραμμα. */
  templates?: TemplateOption[];
  /** Σημερινή ημερομηνία (Αθήνα) από τον server. */
  today: string;
  /** Σημειώσεις / ειδικές οδηγίες της προσφοράς (όλες — βλέπουμε πάντα όλες). */
  notes?: NoteView[];
  /** Νέα προσφορά από το μενού του πελάτη: ο πελάτης ήδη επιλεγμένος. */
  customer?: { trdr: number; name: string; email: string | null; phone: string | null } | null;
}) {
  const router = useRouter();
  const [s, setS] = React.useState<State>(() => (initial ? fromView(initial)
    : customer ? { ...blank(), trdr: customer.trdr, customerName: customer.name, customerEmail: customer.email, customerPhone: customer.phone }
    : blank()));
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [siteOpen, setSiteOpen] = React.useState(false);
  const [adding, setAdding] = React.useState<'product' | 'service' | null>(null);
  const [fromRecipe, setFromRecipe] = React.useState(false);
  const [openNotes, setOpenNotes] = React.useState<Set<string>>(new Set());
  const [writing, setWriting] = React.useState(false);
  // Τιμολόγηση χώρων (συνταγές): περιθώριο % και μορφή γραμμών — ισχύουν στον επόμενο υπολογισμό.
  const [markupPct, setMarkupPct] = React.useState(0);
  const [lineMode, setLineMode] = React.useState<OfferLineMode>('detailed');

  // Μετά από ενέργεια (π.χ. σύνδεση με έργο) ο server στέλνει νέα δεδομένα· τα παίρνουμε μόνο αν δεν
  // υπάρχουν μη αποθηκευμένες αλλαγές του χρήστη. (adjust-state-while-rendering)
  const [applied, setApplied] = React.useState(initial);
  if (initial && initial !== applied) {
    setApplied(initial);
    if (!dirty) setS(fromView(initial));
  }
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const up = (patch: Partial<State> | ((p: State) => Partial<State>)) => { setS((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) })); setDirty(true); };
  const setLine = (u: string, patch: Partial<Line>) => up((p) => ({ lines: p.lines.map((l) => (l.uid === u ? { ...l, ...patch } : l)) }));
  const setParty = (k: string, patch: Partial<Party>) => up((p) => ({ parties: p.parties.map((x) => (x.key === k ? { ...x, ...patch } : x)) }));
  const setMs = (u: string, patch: Partial<EditorMilestone>) => up((p) => ({ milestones: p.milestones.map((m) => (m.uid === u ? { ...m, ...patch } : m)) }));
  const move = <T,>(arr: T[], i: number, d: number) => { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };

  const crews = allowsCrews(s.kind);
  const t = totals(s.lines, s.vatRate);
  const feeOf = (key: string) => crewTotal(s.lines.map((l) => ({ ...l, partyId: l.partyKey })), key);
  const customerMs = milestoneCoverage(s.milestones.filter((m) => !m.partyKey).map((m) => m.amount), t.gross);
  const stock = useStock(s.lines);
  const bomLines = React.useMemo(() => s.lines.map((l) => ({ ...l, partyId: l.partyKey ?? null })), [s.lines]);

  // ── Συνταγές & τιμές ειδών για τις γραμμές των χώρων (φορτώνονται μία φορά, όταν χρειαστούν) ──
  const [recipes, setRecipes] = React.useState<RecipeView[] | null>(null);
  const [recipesError, setRecipesError] = React.useState<string | null>(null);
  const recipesP = React.useRef<Promise<RecipeView[]> | null>(null);
  const loadRecipes = React.useCallback(() => {
    recipesP.current ??= listRecipesAction().then((r) => {
      if (!r.ok) { setRecipesError(r.message); return []; }
      setRecipes(r.data);
      return r.data;
    }).catch(() => { setRecipesError('Οι συνταγές δεν φορτώθηκαν — μόνο είδη από το μητρώο.'); return []; });
    return recipesP.current;
  }, []);
  React.useEffect(() => { if (s.rooms.length && !readOnly) void loadRecipes(); }, [s.rooms.length, readOnly, loadRecipes]);
  const items = React.useRef(new Map<number, FloorPlanItem>());

  /** Γραμμές για τους χώρους `ids` (ή όλους) — οι υπόλοιπες γραμμές μένουν ως έχουν. Σειρά: χώροι, μετά τα άλλα. */
  const recalcRooms = async (rooms: PlanRoom[], ids: Set<string> | null, opts = { markupPct, mode: lineMode }) => {
    const target = rooms.filter((r) => r.material && (!ids || ids.has(r.id)));
    const needRecipes = target.some((r) => r.material?.type === 'recipe');
    const list = needRecipes ? await loadRecipes() : [];
    for (const r of target) {
      if (r.material?.type !== 'item' || items.current.has(r.material.mtrl)) continue;
      const it = await itemDefaultsAction(r.material.mtrl).catch(() => null);
      if (it) items.current.set(r.material.mtrl, { mtrl: r.material.mtrl, code: it.code, name: it.name, price: it.price });
    }
    const recipeMap = new Map(list.map((x) => [x.id, x]));
    const fresh = new Map<string, Line[]>();
    const missing: string[] = [];
    for (const r of rooms) {
      if (ids && !ids.has(r.id)) continue;
      const out = roomLines({ room: r, material: r.material, recipes: recipeMap, items: items.current, markupPct: opts.markupPct, mode: opts.mode });
      if (out.missing) missing.push(r.name);
      fresh.set(r.id, out.lines.map((l) => ({ ...l, uid: uid(), discount: 0, partyKey: null, crewFee: null })));
    }
    up((p) => {
      const keep = new Set(rooms.map((r) => r.id));
      const byRoom = (id: string) => fresh.get(id) ?? p.lines.filter((l) => l.roomId === id);
      return { lines: [...rooms.flatMap((r) => byRoom(r.id)), ...p.lines.filter((l) => !l.roomId || !keep.has(l.roomId))] };
    });
    if (missing.length) toast.error(`Δεν βρέθηκε υλικό/συνταγή για: ${missing.join(', ')}`);
  };
  const setRoomMaterial = (roomId: string, m: RoomMaterial | null) => {
    const rooms = s.rooms.map((r) => (r.id === roomId ? { ...r, material: m } : r));
    up({ rooms });
    void recalcRooms(rooms, new Set([roomId]));
  };
  const applyToEmpty = (m: RoomMaterial) => {
    const ids = new Set(s.rooms.filter((r) => !r.material).map((r) => r.id));
    const rooms = s.rooms.map((r) => (ids.has(r.id) ? { ...r, material: m } : r));
    up({ rooms });
    void recalcRooms(rooms, ids);
    toast.success(`Το ίδιο υλικό σε ${ids.size} χώρ${ids.size === 1 ? 'ο' : 'ους'}`);
  };
  const applyPlan = (r: { floorPlanId: string; title: string; rooms: PlanRoom[]; pins: PlanPin[] }) => {
    up((p) => ({ floorPlanId: r.floorPlanId, floorPlanTitle: r.title, rooms: r.rooms, pins: r.pins, lines: p.lines.filter((l) => !l.roomId || r.rooms.some((x) => x.id === l.roomId)) }));
    void recalcRooms(r.rooms, null);
  };
  const unlinkPlan = () => {
    up((p) => ({ floorPlanId: null, floorPlanTitle: null, rooms: [], pins: [], lines: p.lines.map((l) => ({ ...l, roomId: null })) }));
    toast.message('Η κάτοψη αποσυνδέθηκε — οι γραμμές των χώρων έμειναν ως απλές γραμμές.');
  };

  const addItem = async (pick: RegistryPick, kind: 'MATERIAL' | 'SERVICE') => {
    const line: Line = { uid: uid(), kind, mtrl: pick.id, code: pick.code, name: pick.name, unit: null, qty: 1, unitPrice: 0, discount: 0, notes: null, partyKey: null, crewFee: null, roomId: null };
    up((p) => ({ lines: [...p.lines, line] }));
    setAdding(null);
    const item = await itemDefaultsAction(pick.id).catch(() => null);
    if (item) setLine(line.uid, { unit: item.unit, unitPrice: item.price ?? 0 });
  };
  const addFromRecipe = (lines: OfferLine[], recipeName: string) => {
    up((p) => ({ lines: [...p.lines, ...lines.map((l) => ({ ...l, uid: uid(), discount: 0, partyKey: null, crewFee: null, roomId: null }))] }));
    toast.success(`Προστέθηκαν ${lines.length} γραμμές από «${recipeName}» — πατήστε «Αποθήκευση»`);
  };
  const addFree = (kind: 'MATERIAL' | 'SERVICE') => up((p) => ({ lines: [...p.lines, { uid: uid(), kind, mtrl: null, code: null, name: '', unit: kind === 'SERVICE' ? 'm²' : 'τεμ.', qty: 1, unitPrice: 0, discount: 0, notes: null, partyKey: null, crewFee: null, roomId: null }] }));
  const addParty = (o: CrewOpt) => up((p) => ({
    parties: [...p.parties, { key: `new-${uid()}`, kind: o.kind, trdr: o.kind === 'SUPPLIER' ? Number(o.ref) : null, partnerId: o.kind === 'PARTNER' ? o.ref : null, name: o.name, email: o.email, phone: o.phone, afm: o.afm, specialty: o.sub, scope: null }],
  }));
  const removeParty = (k: string) => up((p) => ({
    parties: p.parties.filter((x) => x.key !== k),
    lines: p.lines.map((l) => (l.partyKey === k ? { ...l, partyKey: null, crewFee: null } : l)),
    milestones: p.milestones.filter((m) => m.partyKey !== k),
  }));
  const addMilestone = (partyKey: string | null) => up((p) => ({ milestones: [...p.milestones, { uid: uid(), id: null, partyKey, title: '', deliverables: null, dueDate: null, amount: 0, status: 'PENDING' }] }));
  /** Πρόγραμμα πληρωμών σε ποσοστά (π.χ. 30/40/30) για τον πελάτη ή ένα συνεργείο. */
  const splitPlan = (partyKey: string | null, total: number, preset: PlanPreset) => {
    let left = total;
    const ms: EditorMilestone[] = preset.steps.map(([title, share], i) => {
      const amount = i === preset.steps.length - 1 ? round2(left) : round2(total * share);
      left -= amount;
      return { uid: uid(), id: null, partyKey, title, deliverables: null, dueDate: null, amount, status: 'PENDING' };
    });
    up((p) => ({ milestones: [...p.milestones.filter((m) => m.partyKey !== partyKey), ...ms] }));
  };

  // ── Περιγραφή για τον πελάτη (AI) ──
  const roomName = new Map(s.rooms.map((r) => [r.id, r.name]));
  const writeCustomerText = async () => {
    setWriting(true);
    try {
      const res = await customerTextAction({
        contractId: initial?.id ?? null, title: s.title, kindLabel: KIND_LABEL[s.kind], customerName: s.customerName,
        site: s.site ? siteLine(s.site) : null, startDate: s.startDate, endDate: s.endDate, summary: s.summary,
        rooms: s.rooms.map((r) => ({ name: r.name, floorM2: r.floorM2, wallsM2: r.wallsM2, material: r.material?.label ?? null })),
        lines: s.lines.filter((l) => l.name.trim()).map((l) => ({ kind: l.kind, name: l.name, qty: l.qty, unit: l.unit, room: l.roomId ? roomName.get(l.roomId) ?? null : null })),
        milestones: s.milestones.filter((m) => !m.partyKey && m.title.trim()).map((m) => m.title),
      });
      if (!res.ok) { toast.error(res.message); return; }
      up({ customerText: res.data.text });
      toast.success('Το κείμενο για τον πελάτη γράφτηκε — διαβάστε το και διορθώστε ό,τι θέλετε.');
    } finally {
      setWriting(false);
    }
  };
  const insertRooms = () => {
    const list = s.rooms.map((r) => `• ${r.name}: ${m2(r.floorM2)}${r.wallsM2 > 0 ? ` + τοίχοι ${m2(r.wallsM2)}` : ''}${r.material ? ` — ${r.material.label}` : ''}`).join('\n');
    const block = `Χώροι από την κάτοψη (${s.rooms.length}, σύνολο δαπέδου ${m2(s.rooms.reduce((a, r) => a + r.floorM2, 0))}):\n${list}`;
    up((p) => ({ summary: p.summary.trim() ? `${p.summary.trimEnd()}\n\n${block}` : block }));
  };

  const save = async () => {
    setSaving(true);
    try {
      // Server Action: αποθήκευση + revalidate στον server — χωρίς fetch/router.refresh.
      const res = await saveContractAction(initial?.id ?? null, toPayload(s));
      if (!res.ok) { toast.error(res.message); return; }
      if (initial && res.data.contract) setS(fromView(res.data.contract));
      setDirty(false);
      toast.success(initial ? 'Αποθηκεύτηκε' : 'Το έργο δημιουργήθηκε — συνέχισε με τα έγγραφα');
      if (!initial) router.push(`/admin/projects/contracts/${res.data.id}`);
    } finally {
      setSaving(false);
    }
  };

  const ro = readOnly;
  const owner: FloorPlanOwner | null = initial?.prjc ? { prjc: initial.prjc } : s.trdr ? { trdr: s.trdr } : null;

  // ── Πρόοδος (δεξιά στήλη) ──
  const steps = [
    { id: 'c-basics', label: 'Έργο & πελάτης', done: !!s.title.trim() && !!(s.trdr || s.customerName) },
    { id: 'c-rooms', label: 'Κάτοψη & χώροι', done: s.rooms.length > 0 && s.rooms.every((r) => r.material), optional: true },
    { id: 'c-lines', label: 'Υλικά & εργασίες', done: s.lines.length > 0 },
    { id: 'c-text', label: 'Περιγραφή για τον πελάτη', done: !!(s.customerText?.trim() || s.summary.trim()) },
    { id: 'c-pay', label: 'Πληρωμές', done: s.milestones.some((m) => !m.partyKey) && customerMs.ok },
    { id: 'c-plan', label: 'Χρονοδιάγραμμα', done: s.tasks.length > 0, optional: true },
    ...(crews ? [{ id: 'c-crews', label: 'Συνεργεία', done: s.parties.length > 0, optional: true }] : []),
  ];
  const stepNo = (id: string) => steps.findIndex((x) => x.id === id) + 1;
  const stepDone = (id: string) => steps.find((x) => x.id === id)?.done ?? false;

  // ── Γραμμές ομαδοποιημένες ανά χώρο ──
  const groups = [
    ...s.rooms.map((r) => ({ key: r.id, room: r, lines: s.lines.filter((l) => l.roomId === r.id) })).filter((g) => g.lines.length),
    { key: 'other', room: null as PlanRoom | null, lines: s.lines.filter((l) => !l.roomId || !roomName.has(l.roomId)) },
  ].filter((g) => g.lines.length);

  const lineRow = (l: Line) => {
    const i = s.lines.indexOf(l);
    // Η σημείωση φαίνεται ως κείμενο· πεδίο μόνο όταν ο χρήστης θέλει να τη γράψει/αλλάξει.
    const notesOpen = openNotes.has(l.uid);
    const need = l.kind === 'MATERIAL' && l.mtrl != null ? stock.byMtrl.get(l.mtrl) : undefined;
    return (
      <li key={l.uid} className="py-2.5 first:pt-1">
        <div className="flex items-start gap-2">
          <span className={cn('mt-2.5 inline-flex size-5 shrink-0 items-center justify-center rounded [&_svg]:size-3', l.kind === 'SERVICE' ? 'bg-orange-50 text-orange-700' : 'bg-sky-50 text-sky-700')}
            title={l.kind === 'SERVICE' ? 'Εργασία' : 'Υλικό'} aria-label={l.kind === 'SERVICE' ? 'Εργασία' : 'Υλικό'}>
            {l.kind === 'SERVICE' ? <FiTool /> : <FiPackage />}
          </span>
          <div className="grid min-w-0 flex-1 grid-cols-4 gap-2 lg:grid-cols-[minmax(0,1fr)_5rem_4.5rem_6rem_4rem]">
            <div className="col-span-4 min-w-0 lg:col-span-1">
              <Input value={l.name} onChange={(e) => setLine(l.uid, { name: e.target.value })} placeholder="Περιγραφή" className={field} disabled={ro} aria-label={`Περιγραφή γραμμής ${i + 1}`} />
            </div>
            <NumInput value={l.qty} onValue={(n) => setLine(l.uid, { qty: n ?? 0 })} className={cn(field, 'tabular-nums')} disabled={ro} aria-label="Ποσότητα" placeholder="Ποσ." />
            <Input value={l.unit ?? ''} onChange={(e) => setLine(l.uid, { unit: e.target.value || null })} placeholder="μον." title={l.unit ?? undefined} className={field} disabled={ro} aria-label="Μονάδα" />
            <NumInput value={l.unitPrice} onValue={(n) => setLine(l.uid, { unitPrice: n ?? 0 })} className={cn(field, 'tabular-nums')} disabled={ro} aria-label="Τιμή μονάδας" placeholder="Τιμή" />
            <NumInput value={l.discount} onValue={(n) => setLine(l.uid, { discount: n ?? 0 })} className={cn(field, 'tabular-nums')} disabled={ro} aria-label="Έκπτωση %" title="Έκπτωση %" placeholder="Έκπ.%" />
          </div>
          <span className="mt-2 w-20 shrink-0 text-right text-(length:--fs-13) font-semibold tabular-nums sm:w-24">{eur(lineNet(l))}</span>
          {!ro ? (
            <RowMenu label={`Ενέργειες γραμμής ${i + 1}`}>
              <DropdownMenuItem className={ITEM} onSelect={() => setOpenNotes((x) => new Set(x).add(l.uid))}><FiMessageSquare className="size-3.5" />Σημείωση…</DropdownMenuItem>
              <DropdownMenuItem className={ITEM} disabled={i === 0} onSelect={() => up((p) => ({ lines: move(p.lines, i, -1) }))}><FiArrowUp className="size-3.5" />Μετακίνηση πάνω</DropdownMenuItem>
              <DropdownMenuItem className={ITEM} disabled={i === s.lines.length - 1} onSelect={() => up((p) => ({ lines: move(p.lines, i, 1) }))}><FiArrowDown className="size-3.5" />Μετακίνηση κάτω</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => up((p) => ({ lines: p.lines.filter((x) => x.uid !== l.uid) }))}><FiTrash2 className="size-3.5" />Αφαίρεση</DropdownMenuItem>
            </RowMenu>
          ) : <span className="w-9 shrink-0" />}
        </div>
        {(l.code || need || (crews && s.parties.length > 0) || (l.notes && !notesOpen)) && (
          <div className="ml-7 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {l.code && <span className="font-mono text-(length:--fs-11) text-muted-foreground">{l.code}</span>}
            <StockBadge need={need} />
            {l.notes && !notesOpen && (
              <button type="button" disabled={ro} onClick={() => setOpenNotes((x) => new Set(x).add(l.uid))} title="Σημείωση γραμμής — κλικ για αλλαγή"
                className="min-w-0 max-w-full cursor-pointer truncate text-left text-(length:--fs-11) text-muted-foreground hover:text-foreground disabled:cursor-default">
                {l.notes}
              </button>
            )}
            {crews && s.parties.length > 0 && (
              <span className="flex flex-wrap items-center gap-2">
                <select value={l.partyKey ?? ''} onChange={(e) => setLine(l.uid, { partyKey: e.target.value || null, crewFee: e.target.value ? l.crewFee : null })} disabled={ro || !s.parties.length}
                  className="h-8 max-w-56 cursor-pointer rounded-md border border-input bg-transparent px-2 text-(length:--fs-12) disabled:cursor-not-allowed disabled:opacity-60" aria-label="Εκτελεί">
                  <option value="">Εκτελούμε εμείς</option>
                  {s.parties.map((p) => <option key={p.key} value={p.key}>Εκτελεί: {p.name}</option>)}
                </select>
                {l.partyKey && (
                  <label className="flex items-center gap-1.5 text-(length:--fs-12) text-muted-foreground">
                    Αμοιβή
                    <NumInput nullable value={l.crewFee} onValue={(n) => setLine(l.uid, { crewFee: n })} className="h-8 w-24 text-(length:--fs-12) tabular-nums" disabled={ro} placeholder="€" />
                  </label>
                )}
              </span>
            )}
          </div>
        )}
        {notesOpen && (
          <Input value={l.notes ?? ''} onChange={(e) => setLine(l.uid, { notes: e.target.value || null })} placeholder="Σημείωση (τυπώνεται στο έγγραφο)" className="ml-7 mt-1.5 h-8 w-[calc(100%-1.75rem)] text-(length:--fs-12)" disabled={ro} aria-label="Σημείωση γραμμής" />
        )}
      </li>
    );
  };

  // ── Σημειώσεις: πάροχος για τα κουμπιά δίπλα σε κάθε σημείο ──
  const savedTasks = new Set((initial?.tasks ?? []).map((t) => t.key));
  const notesCtx = {
    contractId: initial?.id ?? null,
    notes,
    // Μόνο συνεργεία που έχουν αποθηκευτεί (έχουν id) — αλλιώς η κοινοποίηση δεν θα έδειχνε πουθενά.
    parties: s.parties.filter((p) => !p.key.startsWith('new-')).map((p) => ({ key: p.key, name: p.name })),
    taskKeys: new Set(s.tasks.map((t) => t.key)),
    readOnly: ro,
    // Σημείωση → εργασία: μπαίνει στο χρονοδιάγραμμα με τις φωτογραφίες της (αποθηκεύεται με την προσφορά).
    onToTask: (n: NoteView) => {
      const first = n.body.split('\n')[0].trim();
      const t: EditorTask = {
        key: uid(), name: (first.length > 90 ? `${first.slice(0, 87)}…` : first) || 'Εργασία από σημείωση', description: n.body,
        durationValue: 1, durationUnit: 'DAYS', startDate: null,
        dependsOn: n.targetType === 'TASK' && n.targetId ? [n.targetId] : [], roomId: n.targetType === 'ROOM' ? n.targetId : null,
        customerVisible: n.shareWith.includes('CUSTOMER'), photoFileIds: n.photoFileIds,
      };
      up((p) => ({ tasks: [...p.tasks, t] }));
      return t.key;
    },
  };
  const noteBtn = (type: 'ROOM' | 'MILESTONE' | 'TASK', id: string | null, label: string) => (id ? <NoteButton target={{ type, id, label }} /> : null);

  const totalsCard = (
    <section aria-labelledby="c-total-h" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 id="c-total-h" className="text-(length:--fs-12) font-medium text-muted-foreground">Σύνολο προσφοράς</h2>
      <p className="mt-0.5 text-(length:--fs-24) font-semibold tabular-nums">{eur(t.gross)}</p>
      <dl className="mt-2 grid grid-cols-2 gap-y-1 text-(length:--fs-12)">
        <dt className="text-muted-foreground">Καθαρή αξία</dt><dd className="text-right tabular-nums">{eur(t.net)}</dd>
        <dt className="text-muted-foreground">ΦΠΑ {s.vatRate}%</dt><dd className="text-right tabular-nums">{eur(t.vat)}</dd>
        {s.rooms.length > 0 && (<><dt className="text-muted-foreground">από χώρους</dt><dd className="text-right tabular-nums">{eur(s.rooms.reduce((a, r) => a + roomNet(s.lines, r.id), 0))}</dd></>)}
      </dl>
      {!ro && (
        <>
          <Button type="button" onClick={save} disabled={saving || (!dirty && !!initial)} className="mt-3 min-h-10 w-full gap-1.5">
            {saving ? <FiLoader className="size-4 animate-spin" /> : <FiSave className="size-4" />}{initial ? 'Αποθήκευση' : 'Δημιουργία'}
          </Button>
          <p className="mt-1.5 text-center text-(length:--fs-11) text-muted-foreground" aria-live="polite">{dirty ? 'Υπάρχουν αλλαγές που δεν αποθηκεύτηκαν' : initial ? 'Όλα αποθηκευμένα' : 'Νέο έργο — ξεκινά ως προσφορά'}</p>
        </>
      )}
    </section>
  );

  return (
    <NotesProvider value={notesCtx}>
    <div className="items-start gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_17.5rem]">
      <div className="min-w-0 space-y-4">
        {/* ── 1. Έργο & πελάτης ── */}
        <Section id="c-basics" n={stepNo('c-basics')} done={stepDone('c-basics')} title="Έργο & πελάτης" hint="Για ποιον είναι, τι είδους δουλειά, πού και πότε">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label className={lbl} htmlFor="c-title">Τίτλος έργου <span className="text-destructive" aria-hidden>*</span></Label>
              <Input id="c-title" value={s.title} onChange={(e) => up({ title: e.target.value })} placeholder="π.χ. Ανακαίνιση μπάνιου — Κηφισιά" className={field} disabled={ro} required />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className={lbl} htmlFor="c-customer">Πελάτης <span className="text-destructive" aria-hidden>*</span></Label>
              <CustomerPicker disabled={ro} value={{ trdr: s.trdr, name: s.customerName }}
                onPick={(h) => up(h ? { trdr: h.trdr, customerName: h.name, customerEmail: h.email, customerPhone: h.phone } : { trdr: null, customerName: null })} />
            </div>
            <fieldset className="md:col-span-2" disabled={ro}>
              <legend className={cn(lbl, 'mb-1.5')}>Τύπος δουλειάς</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {CONTRACT_KINDS.map((k) => (
                  <label key={k} className={cn('flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 transition-colors', s.kind === k ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50')}>
                    <span className="flex items-center gap-2 text-(length:--fs-13) font-semibold">
                      <input type="radio" name="c-kind" value={k} checked={s.kind === k} onChange={() => up({ kind: k })} className="accent-(--primary)" />
                      {KIND_LABEL[k]}
                    </span>
                    <span className="pl-5 text-(length:--fs-11) text-muted-foreground">{KIND_HINT[k]}</span>
                  </label>
                ))}
              </div>
              {!crews && s.parties.length > 0 && <p role="alert" className="mt-1.5 text-(length:--fs-12) text-destructive">Ο τύπος «Μόνο προϊόν» δεν έχει συνεργεία — αφαιρέστε τα ή αλλάξτε τύπο.</p>}
            </fieldset>
            <div className="space-y-1.5">
              <Label className={lbl} htmlFor="c-email">Email πελάτη</Label>
              <Input id="c-email" type="email" value={s.customerEmail ?? ''} onChange={(e) => up({ customerEmail: e.target.value || null })} className={field} disabled={ro} autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label className={lbl} htmlFor="c-phone">Τηλέφωνο</Label>
              <Input id="c-phone" type="tel" value={s.customerPhone ?? ''} onChange={(e) => up({ customerPhone: e.target.value || null })} className={field} disabled={ro} autoComplete="tel" />
            </div>
            <div className="md:col-span-2">
              <span className={lbl}>Τοποθεσία εργοταξίου</span>
              <div className="mt-1.5 flex min-h-9 flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5">
                <span className="flex min-w-0 items-center gap-2 text-(length:--fs-13)">
                  <FiMapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {s.site ? <span className="truncate">{siteLine(s.site)}</span> : <span className="text-muted-foreground">Δεν έχει οριστεί</span>}
                </span>
                {!ro && <Button type="button" variant="ghost" size="sm" onClick={() => setSiteOpen(true)}>{s.site ? 'Αλλαγή' : 'Ορισμός στον χάρτη'}</Button>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:col-span-2 md:grid-cols-4">
              <div className="space-y-1.5"><Label className={lbl} htmlFor="c-start">Έναρξη</Label><Input id="c-start" type="date" value={s.startDate ?? ''} onChange={(e) => up({ startDate: e.target.value || null })} className={field} disabled={ro} /></div>
              <div className="space-y-1.5"><Label className={lbl} htmlFor="c-end">Λήξη</Label><Input id="c-end" type="date" value={s.endDate ?? ''} onChange={(e) => up({ endDate: e.target.value || null })} className={field} disabled={ro} /></div>
              <div className="space-y-1.5"><Label className={lbl} htmlFor="c-valid">Ισχύς προσφοράς</Label><Input id="c-valid" type="date" value={s.validUntil ?? ''} onChange={(e) => up({ validUntil: e.target.value || null })} className={field} disabled={ro} /></div>
              <div className="space-y-1.5"><Label className={lbl} htmlFor="c-vat">ΦΠΑ %</Label><NumInput id="c-vat" value={s.vatRate} onValue={(n) => up({ vatRate: n ?? 0 })} className={field} disabled={ro} /></div>
            </div>
          </div>
        </Section>
        <ProjectSiteDialog open={siteOpen} onOpenChange={setSiteOpen} prjc={null} projectLabel={s.title || 'Νέο έργο'} value={s.site} onSave={(site) => up({ site })} />

        {/* ── 2. Κάτοψη & χώροι ── */}
        <Section id="c-rooms" n={stepNo('c-rooms')} done={stepDone('c-rooms')} optional title="Κάτοψη & χώροι"
          hint="Ανεβάστε το σχέδιο, διαλέξτε υλικό ανά χώρο — οι γραμμές και το ποσό βγαίνουν μόνα τους">
          <RoomsSection
            owner={owner} ownerHint={owner ? null : 'Επιλέξτε πρώτα πελάτη — η κάτοψη αποθηκεύεται στον φάκελό του.'}
            projectLabel={s.title || s.customerName || 'Νέα προσφορά'}
            floorPlan={s.floorPlanId ? { id: s.floorPlanId, title: s.floorPlanTitle ?? 'Κάτοψη' } : null}
            rooms={s.rooms} costOf={(id) => roomNet(s.lines, id)} recipes={recipes} recipesError={recipesError}
            markupPct={markupPct} mode={lineMode} readOnly={ro}
            onApplyPlan={applyPlan} onMaterial={setRoomMaterial} onApplyToEmpty={applyToEmpty}
            extra={(r) => noteBtn('ROOM', r.id, `Χώρος: ${r.name}`)}
            pins={s.pins} pinIsTask={(id) => s.tasks.some((t) => t.key === `pin-${id}`)}
            onPinToTask={(p) => {
              // Σταθερό key «pin-<id>»: η ίδια σημείωση δεν γίνεται δεύτερη εργασία.
              const first = p.text.split('\n')[0].trim();
              up((st) => ({ tasks: [...st.tasks, {
                key: `pin-${p.id}`, name: first.length > 90 ? `${first.slice(0, 87)}…` : first, description: p.roomName ? `${p.text}\n(Χώρος: ${p.roomName})` : p.text,
                durationValue: 1, durationUnit: 'DAYS', startDate: null, dependsOn: [], roomId: p.roomId, customerVisible: false, photoFileIds: p.photoFileIds,
              }] }));
              toast.success('Η σημείωση μπήκε στο χρονοδιάγραμμα ως εργασία — πατήστε «Αποθήκευση»');
            }}
            onMarkup={setMarkupPct} onMode={setLineMode} onUnlink={unlinkPlan}
            onRecalc={() => {
              // Από την αρχή: φρέσκιες συνταγές και τιμές ειδών (αλλαγές στις συνταγές περνούν στην προσφορά).
              recipesP.current = null; items.current.clear();
              void recalcRooms(s.rooms, null).then(() => toast.success('Οι γραμμές των χώρων ξαναϋπολογίστηκαν με τις τρέχουσες συνταγές και τιμές'));
            }}
          />
        </Section>

        {/* ── 3. Υλικά & εργασίες ── */}
        <Section id="c-lines" n={stepNo('c-lines')} done={stepDone('c-lines')} title="Υλικά & εργασίες"
          hint={crews ? 'Ποιο συνεργείο εκτελεί κάθε γραμμή και η αμοιβή του φαίνονται ΜΟΝΟ στη δική του σύμβαση' : 'Από το μητρώο, από συνταγή ή ελεύθερη γραμμή · δίπλα στα υλικά φαίνεται το απόθεμα'}
          actions={!ro ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="outline" className="gap-1.5"><FiPlus className="size-3.5" />Προσθήκη</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem className={ITEM} onSelect={() => setAdding('product')}><FiPackage className="size-3.5" />Υλικό από το μητρώο</DropdownMenuItem>
                <DropdownMenuItem className={ITEM} onSelect={() => setAdding('service')}><FiTool className="size-3.5" />Υπηρεσία από το μητρώο</DropdownMenuItem>
                <DropdownMenuItem className={ITEM} onSelect={() => setFromRecipe(true)}><FiLayers className="size-3.5" />Από συνταγή τοποθέτησης…</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className={ITEM} onSelect={() => addFree('MATERIAL')}><FiPlus className="size-3.5" />Ελεύθερη γραμμή υλικού</DropdownMenuItem>
                <DropdownMenuItem className={ITEM} onSelect={() => addFree('SERVICE')}><FiPlus className="size-3.5" />Ελεύθερη γραμμή εργασίας</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined}>
          {adding && (
            <div className="mb-3 flex items-end gap-2 rounded-md border border-dashed border-border p-3">
              <div className="min-w-0 flex-1">
                <RegistrySearch kind={adding} id="c-registry" label={adding === 'product' ? 'Υλικό' : 'Υπηρεσία'} onPick={(p) => addItem(p, adding === 'product' ? 'MATERIAL' : 'SERVICE')} />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(null)} aria-label="Κλείσιμο αναζήτησης"><FiX className="size-4" /></Button>
            </div>
          )}
          {s.lines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-(length:--fs-13) text-muted-foreground">
              {s.rooms.length ? 'Διαλέξτε υλικό στους χώρους παραπάνω — ή πατήστε «Προσθήκη» για άλλες γραμμές.' : 'Δεν υπάρχουν γραμμές ακόμη. Πατήστε «Προσθήκη» ή ανεβάστε κάτοψη.'}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="ml-7 mr-[7.75rem] hidden grid-cols-[minmax(0,1fr)_5rem_4.5rem_6rem_4rem] gap-2 text-(length:--fs-11) font-medium text-muted-foreground lg:grid sm:mr-[8.75rem]" aria-hidden>
                <span>Περιγραφή</span><span>Ποσότητα</span><span>Μονάδα</span><span>Τιμή €</span><span>Έκπ. %</span>
              </div>
              {groups.map((g) => (
                <details key={g.key} open className="group rounded-lg border border-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                    <span className="flex min-w-0 items-center gap-2 text-(length:--fs-13) font-semibold">
                      <FiChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-0 -rotate-90" aria-hidden />
                      {g.room ? <span className="size-2.5 shrink-0 rounded-sm" style={{ background: g.room.color }} aria-hidden /> : null}
                      <span className="truncate">{g.room ? g.room.name : s.rooms.length ? 'Άλλα υλικά & εργασίες' : 'Γραμμές'}</span>
                      <span className="font-normal text-muted-foreground">· {g.lines.length}{g.room ? ` · ${m2(g.room.floorM2 + g.room.wallsM2)}` : ''}</span>
                    </span>
                    <span className="shrink-0 text-(length:--fs-13) font-semibold tabular-nums">{eur(round2(g.lines.reduce((a, l) => a + lineNet(l), 0)))}</span>
                  </summary>
                  <ul className="divide-y divide-border border-t border-border px-3">{g.lines.map(lineRow)}</ul>
                </details>
              ))}
              <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-y-1 pt-1 text-(length:--fs-13)">
                <dt className="text-muted-foreground">Καθαρή αξία</dt><dd className="text-right tabular-nums">{eur(t.net)}</dd>
                <dt className="text-muted-foreground">ΦΠΑ {s.vatRate}%</dt><dd className="text-right tabular-nums">{eur(t.vat)}</dd>
                <dt className="border-t border-border pt-1 font-semibold">Σύνολο</dt><dd className="border-t border-border pt-1 text-right font-semibold tabular-nums">{eur(t.gross)}</dd>
              </dl>
            </div>
          )}
          <div className="mt-4 lg:hidden"><StockCard needs={stock.needs} loading={stock.loading} /></div>
        </Section>

        {/* ── BOM: λίστα υλικών ανά είδος / χώρο ── */}
        {s.lines.length > 0 && (
          <Section id="c-bom" n={null} title="Λίστα υλικών (BOM)" hint="Τι χρειάζεται ανά είδος και ανά χώρο, τι έχουμε και τι πρέπει να παραγγελθεί">
            <BomSection
              lines={bomLines} rooms={s.rooms} stock={stock.stock} loading={stock.loading}
              fileName={s.title.trim() || 'προσφορά'}
            />
          </Section>
        )}

        {/* ── 4. Περιγραφή ── */}
        <Section id="c-text" n={stepNo('c-text')} done={stepDone('c-text')} title="Περιγραφή του έργου"
          hint="Οι σημειώσεις σας και ένα απλό κείμενο για τον πελάτη — και τα δύο μπαίνουν στη σύνταξη των εγγράφων">
          {s.rooms.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-(length:--fs-12)">
              <span className="flex items-center gap-2">
                <FiSquare className="size-3.5 text-muted-foreground" aria-hidden />
                Από την κάτοψη: <b className="tabular-nums">{s.rooms.length} χώροι</b> · <b className="tabular-nums">{m2(s.rooms.reduce((a, r) => a + r.floorM2, 0))}</b> δάπεδο
                {s.rooms.some((r) => r.wallsM2 > 0) && <> · <b className="tabular-nums">{m2(s.rooms.reduce((a, r) => a + r.wallsM2, 0))}</b> τοίχοι</>}
              </span>
              {!ro && !/Χώροι από την κάτοψη/.test(s.summary) && (
                <button type="button" onClick={insertRooms} className="min-h-8 cursor-pointer font-medium text-primary hover:underline">Προσθήκη στις σημειώσεις</button>
              )}
            </div>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className={lbl} htmlFor="c-summary">Σημειώσεις (εσωτερικές)</Label>
                {!ro && <MicButton onText={(txt) => up((p) => ({ summary: p.summary ? `${p.summary.trimEnd()}\n${txt}` : txt }))} />}
              </div>
              <textarea id="c-summary" value={s.summary} onChange={(e) => up({ summary: e.target.value })} rows={7} disabled={ro}
                placeholder="Γράψτε ή υπαγορεύστε τι θα γίνει: π.χ. Μπάνιο στον 2ο όροφο. Αφαίρεση παλιών πλακιδίων, αδιαβροχοποίηση ντουζιέρας, μάρμαρο Βόλακα 60x120 σε δάπεδο και τοίχους…"
                className={textarea} />
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className={lbl} htmlFor="c-ctext">Κείμενο για τον πελάτη</Label>
                {!ro && (
                  <Button type="button" size="sm" variant={s.customerText ? 'ghost' : 'secondary'} onClick={() => void writeCustomerText()} disabled={writing} className="gap-1.5">
                    {writing ? <FiLoader className="size-3.5 animate-spin" aria-hidden /> : <FiZap className="size-3.5" aria-hidden />}
                    {writing ? 'Γράφεται…' : s.customerText ? 'Ξανά με AI' : 'Σύνταξη με AI'}
                  </Button>
                )}
              </div>
              <textarea id="c-ctext" value={s.customerText ?? ''} onChange={(e) => up({ customerText: e.target.value || null })} rows={7} disabled={ro}
                placeholder="Πατήστε «Σύνταξη με AI»: ένα φιλικό κείμενο χωρίς τεχνικούς όρους — τι θα γίνει σε κάθε χώρο, με ποια υλικά και πώς θα προχωρήσουμε."
                className={textarea} aria-describedby="c-ctext-hint" />
              <p id="c-ctext-hint" className="text-(length:--fs-11) text-muted-foreground">Βασίζεται στις σημειώσεις, στους χώρους και στις γραμμές. Χωρίς τιμές — τα ποσά φαίνονται στον πίνακα της προσφοράς.</p>
            </div>
          </div>
        </Section>

        {/* ── Σημειώσεις & ειδικές οδηγίες (γενικές) ── */}
        <Section id="c-notes" n={null} title="Σημειώσεις & ειδικές οδηγίες"
          hint={`Γενικές για το έργο — για συγκεκριμένο χώρο, πληρωμή ή εργασία πατήστε το εικονίδιο δίπλα του.${notes.length ? ` Σύνολο: ${notes.length} (${notes.filter((n) => n.authorKind === 'CUSTOMER').length} από τον πελάτη).` : ''}`}>
          <NoteThread target={{ type: 'CONTRACT', id: null, label: 'Γενικά' }} />
          {notes.some((n) => n.targetType !== 'CONTRACT') && (
            <details className="mt-3 rounded-lg border border-border">
              <summary className="cursor-pointer px-3 py-2 text-(length:--fs-12) font-medium">Όλες οι σημειώσεις σε σημεία ({notes.filter((n) => n.targetType !== 'CONTRACT').length})</summary>
              <ul className="divide-y divide-border border-t border-border">
                {notes.filter((n) => n.targetType !== 'CONTRACT').map((n) => (
                  <li key={n.id} className="px-3 py-2 text-(length:--fs-12)">
                    <span className="font-medium">{n.targetLabel ?? n.targetType}</span>
                    <span className="text-muted-foreground"> · {n.authorKind === 'CUSTOMER' ? 'Πελάτης' : n.authorName ?? 'Εμείς'}{n.kind === 'INSTRUCTION' ? ' · ειδική οδηγία' : ''}{n.resolved ? ' · επιλύθηκε' : ''}</span>
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap">{n.body}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Section>

        {/* ── 5. Πληρωμές ── */}
        <Section id="c-pay" n={stepNo('c-pay')} done={stepDone('c-pay')} title="Πληρωμές"
          hint="Πότε και πόσα πληρώνει ο πελάτης (και εμείς τα συνεργεία) — με την ενεργοποίηση γίνονται εργασίες στο ημερολόγιο">
          <PaymentsSection
            milestones={s.milestones} parties={crews ? s.parties : []} customerTotal={t.gross} feeOf={feeOf} readOnly={ro}
            onAdd={addMilestone} onPlan={splitPlan} onSet={setMs} onRemove={(u) => up((p) => ({ milestones: p.milestones.filter((x) => x.uid !== u) }))}
            noteFor={(m) => noteBtn('MILESTONE', m.id, `Πληρωμή: ${m.title || '—'}`)}
          />
        </Section>

        {/* ── Χρονοδιάγραμμα (Gantt) ── */}
        <Section id="c-plan" n={stepNo('c-plan')} done={stepDone('c-plan')} optional title="Χρονοδιάγραμμα εργασιών"
          hint="Τι γίνεται και πότε — ήδη από την προσφορά. Με την ενεργοποίηση γίνονται εργασίες του έργου (Kanban & Gantt)">
          <ScheduleSection tasks={s.tasks} rooms={s.rooms} start={s.startDate} today={today} templates={templates} readOnly={ro} onChange={(tasks) => up({ tasks })}
            noteFor={(t) => noteBtn('TASK', savedTasks.has(t.key) ? t.key : null, `Εργασία: ${t.name || '—'}`)} />
        </Section>

        {/* ── 6. Συνεργεία ── */}
        {crews && (
          <Section id="c-crews" n={stepNo('c-crews')} done={stepDone('c-crews')} optional title="Συνεργεία & τεχνικές εταιρίες"
            hint="Καθένας παίρνει δική του σύμβαση με οδηγίες εγκατάστασης"
            actions={!ro ? <CrewPicker onPick={addParty} exclude={new Set(s.parties.map((p) => `${p.kind}:${p.kind === 'SUPPLIER' ? p.trdr : p.partnerId}`))} /> : undefined}>
            {s.parties.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-4 text-center text-(length:--fs-13) text-muted-foreground">Κανένα συνεργείο — αν εκτελείτε εσείς, προχωρήστε χωρίς.</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {s.parties.map((p) => {
                  const fee = feeOf(p.key);
                  const assigned = s.lines.filter((l) => l.partyKey === p.key).length;
                  return (
                    <div key={p.key} className="rounded-lg border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-(length:--fs-14) font-semibold">{p.name}</p>
                          <p className="truncate text-(length:--fs-11) text-muted-foreground">{[p.kind === 'PARTNER' ? 'Συνεργάτης' : 'Προμηθευτής', p.specialty, p.afm ? `ΑΦΜ ${p.afm}` : null].filter(Boolean).join(' · ')}</p>
                        </div>
                        {!ro && (
                          <RowMenu label={`Ενέργειες για ${p.name}`}>
                            <DropdownMenuItem className={ITEM} onSelect={() => addMilestone(p.key)}><FiPlus className="size-3.5" />Νέα πληρωμή προς το συνεργείο</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => removeParty(p.key)}><FiTrash2 className="size-3.5" />Αφαίρεση</DropdownMenuItem>
                          </RowMenu>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Input type="email" value={p.email ?? ''} onChange={(e) => setParty(p.key, { email: e.target.value || null })} placeholder="Email" className={field} disabled={ro} aria-label={`Email ${p.name}`} />
                        <Input type="tel" value={p.phone ?? ''} onChange={(e) => setParty(p.key, { phone: e.target.value || null })} placeholder="Τηλέφωνο" className={field} disabled={ro} aria-label={`Τηλέφωνο ${p.name}`} />
                        <textarea value={p.scope ?? ''} onChange={(e) => setParty(p.key, { scope: e.target.value || null })} rows={2} disabled={ro} placeholder="Τι αναλαμβάνει (πέρα από τις γραμμές)…" aria-label={`Αντικείμενο ${p.name}`}
                          className="col-span-2 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-(length:--fs-12) outline-hidden focus-visible:ring-2 focus-visible:ring-ring" />
                      </div>
                      <p className="mt-2 text-(length:--fs-12) text-muted-foreground">{assigned} γραμμές · αμοιβή <span className="font-semibold text-foreground tabular-nums">{eur(fee)}</span></p>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        )}

        {/* ── Περισσότερα (σπάνια πεδία) ── */}
        <details className="group rounded-xl border border-border bg-card shadow-xs" open={!!s.terms || s.members.length > 0}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="text-(length:--fs-14) font-semibold">Περισσότερα</span>
              <span className="ml-2 text-(length:--fs-12) text-muted-foreground">Προσωπικό έργου · ειδικοί όροι{s.members.length || s.terms ? ` · ${[s.members.length ? `${s.members.length} άτομα` : null, s.terms ? 'όροι' : null].filter(Boolean).join(', ')}` : ''}</span>
            </span>
            <FiChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-4 px-4 pb-4">
            <div>
              <p className={lbl}><FiUsers className="mr-1.5 inline size-3.5 text-muted-foreground" aria-hidden />Προσωπικό έργου</p>
              <p className="mb-2 text-(length:--fs-12) text-muted-foreground">Παίρνουν τις εργασίες και τις εγγραφές ημερολογίου των πληρωμών (με πρόσκληση .ics).</p>
              <div className="flex flex-wrap gap-1.5">
                {staff.map((u) => {
                  const on = s.members.includes(u.id);
                  return (
                    <button key={u.id} type="button" disabled={ro} aria-pressed={on} onClick={() => up((p) => ({ members: on ? p.members.filter((x) => x !== u.id) : [...p.members, u.id] }))}
                      className={cn('min-h-9 cursor-pointer rounded-full border px-3 text-(length:--fs-12) transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>
                      {on && <FiCheck className="mr-1 inline size-3" aria-hidden />}{u.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className={lbl} htmlFor="c-terms"><FiFileText className="mr-1.5 inline size-3.5 text-muted-foreground" aria-hidden />Ειδικοί όροι</Label>
              <textarea id="c-terms" value={s.terms ?? ''} onChange={(e) => up({ terms: e.target.value || null })} rows={3} disabled={ro}
                placeholder="π.χ. Η μεταφορά υλικών μέχρι τον 2ο όροφο γίνεται από εμάς. Εγγύηση τοποθέτησης 2 έτη."
                className={textarea} aria-describedby="c-terms-hint" />
              <p id="c-terms-hint" className="text-(length:--fs-11) text-muted-foreground">Ό,τι γράψετε εδώ ενσωματώνεται υποχρεωτικά στα έγγραφα.</p>
            </div>
          </div>
        </details>

        {!ro && <RecipeLinesDialog open={fromRecipe} onOpenChange={setFromRecipe} onAdd={addFromRecipe} />}

        {/* Κινητό/tablet: σύνολο + αποθήκευση πάντα ορατά */}
        {!ro && (
          <div className="sticky bottom-0 z-30 -mx-1 rounded-t-lg border border-b-0 border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_16px_-10px_rgb(0_0_0/0.25)] backdrop-blur-sm lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <p className="text-(length:--fs-12) text-muted-foreground">{dirty ? 'Μη αποθηκευμένες αλλαγές' : initial ? 'Όλα αποθηκευμένα' : 'Νέο έργο'} · <span className="font-semibold text-foreground tabular-nums">{eur(t.gross)}</span></p>
              <Button type="button" onClick={save} disabled={saving || (!dirty && !!initial)} className="min-h-10 gap-1.5">
                {saving ? <FiLoader className="size-4 animate-spin" /> : <FiSave className="size-4" />}{initial ? 'Αποθήκευση' : 'Δημιουργία'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Δεξιά στήλη: πρόοδος, σύνολο, απόθεμα ── */}
      <aside className="sticky top-4 hidden space-y-3 lg:block" aria-label="Σύνοψη προσφοράς">
        {totalsCard}
        <nav aria-label="Βήματα" className="rounded-xl border border-border bg-card p-2 shadow-xs">
          <ol>
            {steps.map((st, i) => (
              <li key={st.id}>
                <a href={`#${st.id}`} className="flex min-h-9 items-center gap-2.5 rounded-md px-2 text-(length:--fs-12) hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                  <span className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded-full text-(length:--fs-10) font-semibold', st.done ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground')}>
                    {st.done ? <FiCheck className="size-3" aria-hidden /> : i + 1}
                  </span>
                  <span className={cn('min-w-0 flex-1 truncate', st.done ? 'text-muted-foreground' : 'font-medium text-foreground')}>{st.label}</span>
                  {st.optional && !st.done && <span className="text-(length:--fs-10) text-muted-foreground">προαιρ.</span>}
                  <span className="sr-only">{st.done ? ' — ολοκληρώθηκε' : ''}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <StockCard needs={stock.needs} loading={stock.loading} />
        {!ro && s.rooms.length === 0 && (
          <p className="flex items-start gap-1.5 px-1 text-(length:--fs-11) text-muted-foreground"><FiEdit3 className="mt-0.5 size-3 shrink-0" aria-hidden />Συμβουλή: με κάτοψη τα τετραγωνικά και το ποσό ανά χώρο βγαίνουν αυτόματα.</p>
        )}
      </aside>
    </div>
    </NotesProvider>
  );
}
