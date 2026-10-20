'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  FiArrowDown, FiArrowUp, FiCalendar, FiEdit3, FiFlag, FiLayers, FiLoader, FiMapPin, FiMic, FiMoreVertical, FiPackage, FiPlus, FiSave,
  FiSearch, FiSquare, FiTool, FiTrash2, FiUser, FiUsers, FiX,
} from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RegistrySearch, type RegistryPick } from '@/components/admin/registry-search';
import { useVoiceInput } from '@/components/assistant/use-voice-input';
import { cn } from '@/lib/utils';
import {
  CONTRACT_KINDS, KIND_HINT, KIND_LABEL, allowsCrews, crewTotal, eur, lineNet, milestoneCoverage, round2, totals, type ContractKind,
} from '@/lib/contracts/core';
import { siteLine } from '@/lib/project-site-core';
import type { ContractView } from '@/lib/contracts/service';
import { ProjectSiteDialog, type ProjectSiteValue } from '../project-site-dialog';
import type { OfferLine } from '@/lib/install-recipes-core';
import { RecipeLinesDialog } from './recipe-lines-dialog';

// ── Τύποι κατάστασης φόρμας (ίδιο σχήμα με το contractInput του server) ─────────────────────────
type Line = { uid: string; kind: 'MATERIAL' | 'SERVICE'; mtrl: number | null; code: string | null; name: string; unit: string | null; qty: number; unitPrice: number; discount: number; notes: string | null; partyKey: string | null; crewFee: number | null };
type Party = { key: string; kind: 'SUPPLIER' | 'PARTNER'; trdr: number | null; partnerId: string | null; name: string; email: string | null; phone: string | null; afm: string | null; specialty: string | null; scope: string | null };
type Milestone = { uid: string; id: string | null; partyKey: string | null; title: string; deliverables: string | null; dueDate: string | null; amount: number; status: 'PENDING' | 'DONE' | 'PAID' };
type Staff = { id: string; label: string; email: string };
type State = {
  title: string; summary: string; kind: ContractKind; trdr: number | null; customerName: string | null; customerEmail: string | null; customerPhone: string | null;
  site: ProjectSiteValue | null; startDate: string | null; endDate: string | null; validUntil: string | null; vatRate: number; terms: string | null;
  lines: Line[]; parties: Party[]; members: string[]; milestones: Milestone[];
};

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const blank = (): State => ({
  title: '', summary: '', kind: 'PRODUCT_INSTALL', trdr: null, customerName: null, customerEmail: null, customerPhone: null,
  site: null, startDate: null, endDate: null, validUntil: null, vatRate: 24, terms: null, lines: [], parties: [], members: [], milestones: [],
});
function fromView(c: ContractView): State {
  return {
    title: c.title, summary: c.summary, kind: c.kind as ContractKind, trdr: c.trdr, customerName: c.customerName, customerEmail: c.customerEmail, customerPhone: c.customerPhone,
    site: c.site, startDate: c.startDate, endDate: c.endDate, validUntil: c.validUntil, vatRate: c.vatRate, terms: c.terms,
    lines: c.lines.map((l) => ({ ...l, uid: l.id })), parties: c.parties, members: c.members.map((m) => m.id),
    milestones: c.milestones.map((m) => ({ ...m, uid: m.id })),
  };
}
const toPayload = (s: State) => ({
  ...s,
  lines: s.lines.map(({ uid: _u, ...l }) => l),
  milestones: s.milestones.map(({ uid: _u, ...m }) => m),
});

const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';
const field = 'h-9 text-[length:var(--fs-12)]';
const lbl = 'text-[length:var(--fs-11)] font-medium uppercase tracking-wide text-muted-foreground';
const numVal = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : 0; };

/** Αριθμητικό πεδίο που κρατά το κείμενο όσο γράφεις («1,», «0.5») — δέχεται κόμμα ή τελεία. */
function NumInput({ value, onValue, nullable = false, ...rest }: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & { value: number | null; onValue: (n: number | null) => void; nullable?: boolean }) {
  const show = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));
  const [text, setText] = React.useState(() => show(value));
  React.useEffect(() => {
    const cur = text.trim() === '' ? null : numVal(text);
    if (cur !== value && !(cur == null && value === 0 && !nullable)) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input {...rest} inputMode="decimal" value={text}
      onChange={(e) => { const t = e.target.value; setText(t); onValue(t.trim() === '' ? (nullable ? null : 0) : numVal(t)); }}
      onBlur={() => setText(show(value))} />
  );
}

/**
 * Χρώμα ανά ενότητα για γρήγορο προσανατολισμό: λωρίδα + λευκό εικονίδιο σε συμπαγές χρώμα και
 * απαλή απόχρωση στην κεφαλίδα. Το κείμενο μένει πάντα σκούρο (αντίθεση ≥ 4.5:1) — ΠΟΤΕ κίτρινο/amber.
 * Οι κλάσεις είναι γραμμένες ολόκληρες ώστε να τις βρίσκει ο Tailwind.
 */
const TONES = {
  indigo: { bar: 'border-t-indigo-500', head: 'bg-indigo-50/70', chip: 'bg-indigo-600 text-white' },
  violet: { bar: 'border-t-violet-500', head: 'bg-violet-50/70', chip: 'bg-violet-600 text-white' },
  teal: { bar: 'border-t-teal-500', head: 'bg-teal-50/70', chip: 'bg-teal-600 text-white' },
  sky: { bar: 'border-t-sky-500', head: 'bg-sky-50/70', chip: 'bg-sky-600 text-white' },
  orange: { bar: 'border-t-orange-500', head: 'bg-orange-50/70', chip: 'bg-orange-600 text-white' },
  cyan: { bar: 'border-t-cyan-500', head: 'bg-cyan-50/70', chip: 'bg-cyan-700 text-white' },
  rose: { bar: 'border-t-rose-500', head: 'bg-rose-50/70', chip: 'bg-rose-600 text-white' },
  slate: { bar: 'border-t-slate-500', head: 'bg-slate-50', chip: 'bg-slate-700 text-white' },
} as const;
type Tone = keyof typeof TONES;

function Section({ icon, title, hint, children, actions, id, tone = 'slate' }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode; actions?: React.ReactNode; id?: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <section id={id} className={cn('overflow-hidden rounded-lg border border-border border-t-[3px] bg-card shadow-sm', t.bar)}>
      <header className={cn('flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-2.5', t.head)}>
        <div className="flex min-w-0 items-start gap-2.5">
          <span className={cn('mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md shadow-sm [&_svg]:size-3.5', t.chip)}>{icon}</span>
          <div className="min-w-0">
            <h2 className="text-[length:var(--fs-14)] font-semibold text-foreground">{title}</h2>
            {hint && <p className="text-[length:var(--fs-12)] text-muted-foreground">{hint}</p>}
          </div>
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted" aria-label={label}>
        <FiMoreVertical className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Πελάτης ──────────────────────────────────────────────────────────────────────────────────────
type CustomerHit = { trdr: number; name: string; code: string; email: string | null; phone: string | null; city: string | null };
function CustomerPicker({ value, onPick, disabled }: { value: { trdr: number | null; name: string | null }; onPick: (h: CustomerHit | null) => void; disabled?: boolean }) {
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<CustomerHit[]>([]);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/admin/contracts/options?kind=customers&q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => r.json()).then((b) => { setHits(b.options ?? []); setOpen(true); }).catch(() => null);
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  if (value.trdr && value.name) {
    return (
      <div className="flex min-h-9 items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3">
        <span className="flex min-w-0 items-center gap-2 text-[length:var(--fs-13)]"><FiUser className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /><span className="truncate font-medium">{value.name}</span></span>
        {!disabled && <button type="button" onClick={() => onPick(null)} className="inline-flex size-7 items-center justify-center rounded hover:bg-muted" aria-label="Αλλαγή πελάτη"><FiX className="size-3.5" /></button>}
      </div>
    );
  }
  return (
    <div className="relative">
      <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input id="c-customer" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Αναζήτηση πελάτη (επωνυμία, κωδικός, ΑΦΜ)…" className={cn(field, 'pl-8')} disabled={disabled} autoComplete="off" />
      {open && hits.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {hits.map((h) => (
            <li key={h.trdr}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(h); setQ(''); setOpen(false); }}
                className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-muted">
                <span className="text-[length:var(--fs-13)] font-medium">{h.name}</span>
                <span className="text-[length:var(--fs-11)] text-muted-foreground">{[h.code, h.city, h.email].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Συνεργεία ────────────────────────────────────────────────────────────────────────────────────
type CrewOpt = { kind: 'SUPPLIER' | 'PARTNER'; ref: string; name: string; sub: string | null; email: string | null; phone: string | null; afm: string | null; crew: boolean };
function CrewPicker({ onPick, exclude }: { onPick: (o: CrewOpt) => void; exclude: Set<string> }) {
  const [q, setQ] = React.useState('');
  const [opts, setOpts] = React.useState<CrewOpt[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const load = React.useCallback((s: string, signal?: AbortSignal) =>
    fetch(`/api/admin/contracts/options?kind=crew&q=${encodeURIComponent(s.trim())}`, { signal }).then((r) => r.json()).then((b) => setOpts(b.options ?? [])).catch(() => null), []);
  React.useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(() => void load(q, ctl.signal), 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open, load]);
  const shown = (opts ?? []).filter((o) => !exclude.has(`${o.kind}:${o.ref}`));
  return (
    <div className="relative w-full sm:w-80">
      <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Προσθήκη συνεργείου / μάστορα…" className={cn(field, 'pl-8')} autoComplete="off" aria-label="Αναζήτηση συνεργείου" />
      {open && (
        <ul className="absolute right-0 z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg sm:w-96">
          {opts == null && <li className="px-2 py-2 text-[length:var(--fs-12)] text-muted-foreground"><FiLoader className="mr-1 inline size-3 animate-spin" />Φόρτωση…</li>}
          {opts != null && !shown.length && <li className="px-2 py-2 text-[length:var(--fs-12)] text-muted-foreground">Κανένα αποτέλεσμα — γράψτε 2+ χαρακτήρες για όλους τους προμηθευτές.</li>}
          {shown.map((o, i) => (
            <li key={`${o.kind}:${o.ref}`}>
              {i > 0 && !o.crew && shown[i - 1].crew && <div className="mx-2 my-1 border-t border-border pt-1 text-[length:var(--fs-10)] uppercase tracking-wide text-muted-foreground">Άλλοι προμηθευτές</div>}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(o); setQ(''); setOpen(false); }} className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-muted">
                <span className={cn('mt-0.5 rounded px-1 text-[length:var(--fs-9)] font-semibold uppercase', o.kind === 'PARTNER' ? 'bg-violet-500/10 text-violet-700' : 'bg-sky-500/10 text-sky-700')}>{o.kind === 'PARTNER' ? 'Συνεργάτης' : 'Προμηθ.'}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[length:var(--fs-13)] font-medium">{o.name}</span>
                  <span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">{[o.sub, o.email, o.phone].filter(Boolean).join(' · ') || '—'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Μικρόφωνο ────────────────────────────────────────────────────────────────────────────────────
function MicButton({ onText }: { onText: (t: string) => void }) {
  const v = useVoiceInput({ endpoint: '/api/admin/contracts/transcribe', onText, onError: (m) => toast.error(m) });
  if (!v.supported) return null;
  const rec = v.state === 'recording';
  return (
    <Button type="button" variant={rec ? 'destructive' : 'secondary'} size="sm" onClick={() => (rec ? v.stop() : void v.start())} disabled={v.state === 'transcribing'}
      aria-label={rec ? 'Τέλος υπαγόρευσης' : 'Υπαγόρευση με μικρόφωνο'} className="gap-1.5">
      {v.state === 'transcribing' ? <FiLoader className="size-3.5 animate-spin" /> : rec ? <FiSquare className="size-3.5" /> : <FiMic className="size-3.5" />}
      {v.state === 'transcribing' ? 'Μεταγραφή…' : rec ? `Stop · ${v.seconds}s` : 'Υπαγόρευση'}
    </Button>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────────────────────────
export function ContractEditor({ initial, staff, readOnly = false }: { initial: ContractView | null; staff: Staff[]; readOnly?: boolean }) {
  const router = useRouter();
  const [s, setS] = React.useState<State>(() => (initial ? fromView(initial) : blank()));
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [siteOpen, setSiteOpen] = React.useState(false);
  const [adding, setAdding] = React.useState<'product' | 'service' | null>(null);
  const [fromRecipe, setFromRecipe] = React.useState(false);

  // Μετά από ενέργεια (π.χ. σύνδεση με έργο) ο server στέλνει νέα δεδομένα· τα παίρνουμε μόνο αν δεν
  // υπάρχουν μη αποθηκευμένες αλλαγές του χρήστη.
  const applied = React.useRef(initial);
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
  React.useEffect(() => {
    if (!initial || initial === applied.current) return;
    applied.current = initial;
    if (!dirtyRef.current) setS(fromView(initial));
  }, [initial]);
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const up = (patch: Partial<State> | ((p: State) => Partial<State>)) => { setS((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) })); setDirty(true); };
  const setLine = (u: string, patch: Partial<Line>) => up((p) => ({ lines: p.lines.map((l) => (l.uid === u ? { ...l, ...patch } : l)) }));
  const setParty = (k: string, patch: Partial<Party>) => up((p) => ({ parties: p.parties.map((x) => (x.key === k ? { ...x, ...patch } : x)) }));
  const setMs = (u: string, patch: Partial<Milestone>) => up((p) => ({ milestones: p.milestones.map((m) => (m.uid === u ? { ...m, ...patch } : m)) }));
  const move = <T,>(arr: T[], i: number, d: number) => { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };

  const crews = allowsCrews(s.kind);
  const t = totals(s.lines, s.vatRate);
  const feeOf = (key: string) => crewTotal(s.lines.map((l) => ({ ...l, partyId: l.partyKey })), key);
  const customerMs = milestoneCoverage(s.milestones.filter((m) => !m.partyKey).map((m) => m.amount), t.gross);

  const addItem = async (pick: RegistryPick, kind: 'MATERIAL' | 'SERVICE') => {
    const line: Line = { uid: uid(), kind, mtrl: pick.id, code: pick.code, name: pick.name, unit: null, qty: 1, unitPrice: 0, discount: 0, notes: null, partyKey: null, crewFee: null };
    up((p) => ({ lines: [...p.lines, line] }));
    setAdding(null);
    const r = await fetch(`/api/admin/contracts/options?kind=item&mtrl=${pick.id}`).then((x) => x.json()).catch(() => null);
    if (r?.item) setLine(line.uid, { unit: r.item.unit, unitPrice: r.item.price ?? 0 });
  };
  const addFromRecipe = (lines: OfferLine[], recipeName: string) => {
    up((p) => ({ lines: [...p.lines, ...lines.map((l) => ({ ...l, uid: uid(), discount: 0, partyKey: null, crewFee: null }))] }));
    toast.success(`Προστέθηκαν ${lines.length} γραμμές από «${recipeName}» — πατήστε «Αποθήκευση»`);
  };
  const addFree = (kind: 'MATERIAL' | 'SERVICE') => up((p) => ({ lines: [...p.lines, { uid: uid(), kind, mtrl: null, code: null, name: '', unit: kind === 'SERVICE' ? 'm²' : 'τεμ.', qty: 1, unitPrice: 0, discount: 0, notes: null, partyKey: null, crewFee: null }] }));
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
  const splitPlan = (partyKey: string | null, total: number) => {
    const plan: [string, number][] = partyKey
      ? [['Έναρξη εργασιών', 0.3], ['Ολοκλήρωση & παραλαβή', 0.7]]
      : [['Προκαταβολή με την υπογραφή', 0.3], ['Παράδοση υλικών', 0.4], ['Ολοκλήρωση & παραλαβή', 0.3]];
    let left = total;
    const ms: Milestone[] = plan.map(([title, pct], i) => {
      const amount = i === plan.length - 1 ? round2(left) : round2(total * pct);
      left -= amount;
      return { uid: uid(), id: null, partyKey, title, deliverables: null, dueDate: null, amount, status: 'PENDING' };
    });
    up((p) => ({ milestones: [...p.milestones.filter((m) => m.partyKey !== partyKey), ...ms] }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(initial ? `/api/admin/contracts/${initial.id}` : '/api/admin/contracts', {
        method: initial ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toPayload(s)),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(b.message ?? 'Η αποθήκευση απέτυχε'); return; }
      if (b.contract) setS(fromView(b.contract));
      setDirty(false);
      toast.success(initial ? 'Αποθηκεύτηκε' : 'Το έργο δημιουργήθηκε — συνέχισε με τα έγγραφα');
      if (initial) router.refresh(); else router.push(`/admin/projects/contracts/${b.id}`);
    } finally {
      setSaving(false);
    }
  };

  const ro = readOnly;
  return (
    <div className="space-y-4">
      {/* ── Βασικά ── */}
      <Section icon={<FiEdit3 />} tone="indigo" title="Έργο & πελάτης" hint="Τίτλος, τύπος σύμβασης, πελάτης και διάρκεια">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label className={lbl} htmlFor="c-title">Τίτλος έργου</Label>
            <Input id="c-title" value={s.title} onChange={(e) => up({ title: e.target.value })} placeholder="π.χ. Ανακαίνιση μπάνιου — Κηφισιά" className={field} disabled={ro} />
          </div>
          <fieldset className="md:col-span-2" disabled={ro}>
            <legend className="mb-1.5 text-[length:var(--fs-11)] font-medium uppercase tracking-wide text-muted-foreground">Τύπος</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {CONTRACT_KINDS.map((k) => (
                <label key={k} className={cn('flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 transition-colors', s.kind === k ? 'border-primary bg-[var(--cx-accent-soft)] ring-1 ring-primary' : 'border-border hover:bg-muted/50')}>
                  <span className="flex items-center gap-2 text-[length:var(--fs-13)] font-semibold">
                    <input type="radio" name="c-kind" value={k} checked={s.kind === k} onChange={() => up({ kind: k })} className="accent-[var(--primary)]" />
                    {KIND_LABEL[k]}
                  </span>
                  <span className={cn('pl-5 text-[length:var(--fs-11)]', s.kind === k ? 'text-slate-700' : 'text-muted-foreground')}>{KIND_HINT[k]}</span>
                </label>
              ))}
            </div>
            {!crews && s.parties.length > 0 && <p role="alert" className="mt-1.5 text-[length:var(--fs-12)] text-destructive">Ο τύπος «Μόνο προϊόν» δεν έχει συνεργεία — αφαιρέστε τα ή αλλάξτε τύπο.</p>}
          </fieldset>
          <div className="space-y-1.5 md:col-span-2">
            <Label className={lbl} htmlFor="c-customer">Πελάτης</Label>
            <CustomerPicker disabled={ro} value={{ trdr: s.trdr, name: s.customerName }}
              onPick={(h) => up(h ? { trdr: h.trdr, customerName: h.name, customerEmail: h.email, customerPhone: h.phone } : { trdr: null, customerName: null })} />
          </div>
          <div className="space-y-1.5">
            <Label className={lbl} htmlFor="c-email">Email πελάτη</Label>
            <Input id="c-email" type="email" value={s.customerEmail ?? ''} onChange={(e) => up({ customerEmail: e.target.value || null })} className={field} disabled={ro} />
          </div>
          <div className="space-y-1.5">
            <Label className={lbl} htmlFor="c-phone">Τηλέφωνο</Label>
            <Input id="c-phone" value={s.customerPhone ?? ''} onChange={(e) => up({ customerPhone: e.target.value || null })} className={field} disabled={ro} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:col-span-2 md:grid-cols-4">
            <div className="space-y-1.5"><Label className={lbl} htmlFor="c-start">Έναρξη</Label><Input id="c-start" type="date" value={s.startDate ?? ''} onChange={(e) => up({ startDate: e.target.value || null })} className={field} disabled={ro} /></div>
            <div className="space-y-1.5"><Label className={lbl} htmlFor="c-end">Λήξη</Label><Input id="c-end" type="date" value={s.endDate ?? ''} onChange={(e) => up({ endDate: e.target.value || null })} className={field} disabled={ro} /></div>
            <div className="space-y-1.5"><Label className={lbl} htmlFor="c-valid">Ισχύς προσφοράς</Label><Input id="c-valid" type="date" value={s.validUntil ?? ''} onChange={(e) => up({ validUntil: e.target.value || null })} className={field} disabled={ro} /></div>
            <div className="space-y-1.5"><Label className={lbl} htmlFor="c-vat">ΦΠΑ %</Label><NumInput id="c-vat" value={s.vatRate} onValue={(n) => up({ vatRate: n ?? 0 })} className={field} disabled={ro} /></div>
          </div>
        </div>
      </Section>

      {/* ── Περίληψη ── */}
      <Section icon={<FiMic />} tone="violet" title="Περίληψη έργου" hint="Γράψτε ή υπαγορεύστε τι θα γίνει — το AI τη χρησιμοποιεί για τις συμβάσεις"
        actions={!ro ? <MicButton onText={(txt) => up((p) => ({ summary: p.summary ? `${p.summary.trimEnd()}\n${txt}` : txt }))} /> : undefined}>
        <textarea value={s.summary} onChange={(e) => up({ summary: e.target.value })} rows={6} disabled={ro} aria-label="Περίληψη έργου"
          placeholder="π.χ. Μπάνιο 8 m² στον 2ο όροφο. Αφαίρεση παλιών πλακιδίων, αδιαβροχοποίηση ντουζιέρας, μάρμαρο Βόλακα 60x120 σε δάπεδο και τοίχους έως το ταβάνι…"
          className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-[length:var(--fs-12)] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70" />
      </Section>

      {/* ── Τοποθεσία ── */}
      <Section icon={<FiMapPin />} tone="teal" title="Τοποθεσία" hint="Διεύθυνση εργοταξίου — αντιγράφεται στο έργο SoftOne όταν συνδεθεί"
        actions={!ro ? <Button type="button" variant="secondary" size="sm" onClick={() => setSiteOpen(true)} className="gap-1.5"><FiMapPin className="size-3.5" />{s.site ? 'Αλλαγή' : 'Ορισμός στον χάρτη'}</Button> : undefined}>
        {s.site
          ? <p className="text-[length:var(--fs-13)]"><span className="font-medium">{siteLine(s.site)}</span> <span className="text-muted-foreground">· {s.site.lat.toFixed(5)}, {s.site.lng.toFixed(5)}</span></p>
          : <p className="text-[length:var(--fs-13)] text-muted-foreground">Δεν έχει οριστεί.</p>}
      </Section>
      <ProjectSiteDialog open={siteOpen} onOpenChange={setSiteOpen} prjc={null} projectLabel={s.title || 'Νέο έργο'} value={s.site} onSave={(site) => up({ site })} />

      {/* ── Υλικά & υπηρεσίες ── */}
      <Section icon={<FiPackage />} tone="sky" title="Υλικά & υπηρεσίες" hint={crews ? 'Ορίστε ποιο συνεργείο εκτελεί κάθε εργασία και την αμοιβή του — φαίνεται ΜΟΝΟ στη δική του σύμβαση' : 'Από το μητρώο ειδών/υπηρεσιών ή ελεύθερη γραμμή'}
        actions={!ro ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" size="sm" className="gap-1.5"><FiPlus className="size-3.5" />Προσθήκη</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem className={ITEM} onSelect={() => setAdding('product')}><FiPackage className="size-3.5" />Υλικό από το μητρώο</DropdownMenuItem>
              <DropdownMenuItem className={ITEM} onSelect={() => setAdding('service')}><FiTool className="size-3.5" />Υπηρεσία από το μητρώο</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className={ITEM} onSelect={() => addFree('MATERIAL')}><FiPlus className="size-3.5" />Ελεύθερη γραμμή υλικού</DropdownMenuItem>
              <DropdownMenuItem className={ITEM} onSelect={() => addFree('SERVICE')}><FiPlus className="size-3.5" />Ελεύθερη γραμμή εργασίας</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className={ITEM} onSelect={() => setFromRecipe(true)}><FiLayers className="size-3.5" />Από συνταγή τοποθέτησης…</DropdownMenuItem>
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
          <p className="py-6 text-center text-[length:var(--fs-13)] text-muted-foreground">Δεν υπάρχουν γραμμές. Πατήστε «Προσθήκη».</p>
        ) : (
          <div className="space-y-2">
            {s.lines.map((l, i) => (
              <div key={l.uid} className={cn('rounded-md border border-border p-3', l.kind === 'SERVICE' ? 'border-l-[3px] border-l-orange-500' : 'border-l-[3px] border-l-sky-500')}>
                <div className="flex items-start gap-2">
                  <span className="mt-2 inline-flex shrink-0 items-center gap-1 text-[length:var(--fs-11)] font-medium text-muted-foreground">
                    {l.kind === 'SERVICE' ? <FiTool className="size-3.5" /> : <FiPackage className="size-3.5" />}{i + 1}
                  </span>
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-12 lg:col-span-4">
                      <Input value={l.name} onChange={(e) => setLine(l.uid, { name: e.target.value })} placeholder="Περιγραφή" className={field} disabled={ro} aria-label={`Περιγραφή γραμμής ${i + 1}`} />
                      {l.code && <p className="mt-0.5 font-mono text-[length:var(--fs-10)] text-muted-foreground">{l.code}</p>}
                    </div>
                    <NumInput value={l.qty} onValue={(n) => setLine(l.uid, { qty: n ?? 0 })} className={cn(field, 'sm:col-span-3 lg:col-span-2')} disabled={ro} aria-label="Ποσότητα" />
                    <Input value={l.unit ?? ''} onChange={(e) => setLine(l.uid, { unit: e.target.value || null })} placeholder="μον." title={l.unit ?? undefined} className={cn(field, 'sm:col-span-2 lg:col-span-2')} disabled={ro} aria-label="Μονάδα" />
                    <NumInput value={l.unitPrice} onValue={(n) => setLine(l.uid, { unitPrice: n ?? 0 })} className={cn(field, 'sm:col-span-3 lg:col-span-2')} disabled={ro} aria-label="Τιμή μονάδας" />
                    <NumInput value={l.discount} onValue={(n) => setLine(l.uid, { discount: n ?? 0 })} className={cn(field, 'sm:col-span-2 lg:col-span-1')} disabled={ro} aria-label="Έκπτωση %" title="Έκπτωση %" />
                    <span className="flex items-center justify-end text-[length:var(--fs-13)] font-semibold tabular-nums sm:col-span-2 lg:col-span-1">{eur(lineNet(l))}</span>
                    {crews && (
                      <div className="flex flex-wrap items-center gap-2 sm:col-span-12">
                        <select value={l.partyKey ?? ''} onChange={(e) => setLine(l.uid, { partyKey: e.target.value || null, crewFee: e.target.value ? l.crewFee : null })} disabled={ro || !s.parties.length}
                          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-[length:var(--fs-12)] sm:max-w-xs" aria-label="Εκτελεί">
                          <option value="">{s.parties.length ? '— Χωρίς συνεργείο (εμείς) —' : 'Προσθέστε πρώτα συνεργεία'}</option>
                          {s.parties.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                        </select>
                        {l.partyKey && (
                          <label className="flex items-center gap-1.5 text-[length:var(--fs-12)] text-muted-foreground">
                            Αμοιβή συνεργείου
                            <NumInput nullable value={l.crewFee} onValue={(n) => setLine(l.uid, { crewFee: n })} className={cn(field, 'w-28')} disabled={ro} placeholder="€" />
                          </label>
                        )}
                      </div>
                    )}
                    <Input value={l.notes ?? ''} onChange={(e) => setLine(l.uid, { notes: e.target.value || null })} placeholder="Σημειώσεις (προαιρετικά)" className={cn(field, 'sm:col-span-12 text-[length:var(--fs-12)]')} disabled={ro} aria-label="Σημειώσεις γραμμής" />
                  </div>
                  {!ro && (
                    <RowMenu label={`Ενέργειες γραμμής ${i + 1}`}>
                      <DropdownMenuItem className={ITEM} disabled={i === 0} onSelect={() => up((p) => ({ lines: move(p.lines, i, -1) }))}><FiArrowUp className="size-3.5" />Μετακίνηση πάνω</DropdownMenuItem>
                      <DropdownMenuItem className={ITEM} disabled={i === s.lines.length - 1} onSelect={() => up((p) => ({ lines: move(p.lines, i, 1) }))}><FiArrowDown className="size-3.5" />Μετακίνηση κάτω</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => up((p) => ({ lines: p.lines.filter((x) => x.uid !== l.uid) }))}><FiTrash2 className="size-3.5" />Αφαίρεση</DropdownMenuItem>
                    </RowMenu>
                  )}
                </div>
              </div>
            ))}
            <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-y-1 pt-2 text-[length:var(--fs-13)]">
              <dt className="text-muted-foreground">Καθαρή αξία</dt><dd className="text-right tabular-nums">{eur(t.net)}</dd>
              <dt className="text-muted-foreground">ΦΠΑ {s.vatRate}%</dt><dd className="text-right tabular-nums">{eur(t.vat)}</dd>
              <dt className="border-t border-border pt-1 font-semibold">Σύνολο</dt><dd className="border-t border-border pt-1 text-right font-semibold tabular-nums">{eur(t.gross)}</dd>
            </dl>
          </div>
        )}
      </Section>

      {/* ── Συνεργεία ── */}
      {crews && (
        <Section icon={<FiUsers />} tone="orange" title="Συνεργεία & τεχνικές εταιρίες" hint="Προμηθευτές «Οικοδομικών Εργασιών» και Συνεργάτες — καθένας παίρνει δική του σύμβαση με οδηγίες εγκατάστασης"
          actions={!ro ? <CrewPicker onPick={addParty} exclude={new Set(s.parties.map((p) => `${p.kind}:${p.kind === 'SUPPLIER' ? p.trdr : p.partnerId}`))} /> : undefined}>
          {s.parties.length === 0 ? (
            <p className="py-4 text-center text-[length:var(--fs-13)] text-muted-foreground">Κανένα συνεργείο ακόμη.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {s.parties.map((p) => {
                const fee = feeOf(p.key);
                const assigned = s.lines.filter((l) => l.partyKey === p.key).length;
                return (
                  <div key={p.key} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[length:var(--fs-14)] font-semibold">{p.name}</p>
                        <p className="truncate text-[length:var(--fs-11)] text-muted-foreground">{[p.kind === 'PARTNER' ? 'Συνεργάτης' : 'Προμηθευτής', p.specialty, p.afm ? `ΑΦΜ ${p.afm}` : null].filter(Boolean).join(' · ')}</p>
                      </div>
                      {!ro && (
                        <RowMenu label={`Ενέργειες για ${p.name}`}>
                          <DropdownMenuItem className={ITEM} onSelect={() => addMilestone(p.key)}><FiFlag className="size-3.5" />Νέο milestone πληρωμής</DropdownMenuItem>
                          <DropdownMenuItem className={ITEM} disabled={!fee} onSelect={() => splitPlan(p.key, fee)}><FiCalendar className="size-3.5" />Πρόγραμμα 30/70 της αμοιβής</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => removeParty(p.key)}><FiTrash2 className="size-3.5" />Αφαίρεση</DropdownMenuItem>
                        </RowMenu>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Input type="email" value={p.email ?? ''} onChange={(e) => setParty(p.key, { email: e.target.value || null })} placeholder="Email" className={field} disabled={ro} aria-label={`Email ${p.name}`} />
                      <Input value={p.phone ?? ''} onChange={(e) => setParty(p.key, { phone: e.target.value || null })} placeholder="Τηλέφωνο" className={field} disabled={ro} aria-label={`Τηλέφωνο ${p.name}`} />
                      <textarea value={p.scope ?? ''} onChange={(e) => setParty(p.key, { scope: e.target.value || null })} rows={2} disabled={ro} placeholder="Τι αναλαμβάνει (πέρα από τις γραμμές)…" aria-label={`Αντικείμενο ${p.name}`}
                        className="col-span-2 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-[length:var(--fs-12)] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    </div>
                    <p className="mt-2 text-[length:var(--fs-12)] text-muted-foreground">{assigned} γραμμές · αμοιβή <span className="font-semibold text-foreground tabular-nums">{eur(fee)}</span></p>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ── Προσωπικό ── */}
      <Section icon={<FiUser />} tone="cyan" title="Προσωπικό έργου" hint="Παίρνουν τις εργασίες και τις εγγραφές ημερολογίου των milestones (με πρόσκληση .ics)">
        <div className="flex flex-wrap gap-1.5">
          {staff.map((u) => {
            const on = s.members.includes(u.id);
            return (
              <button key={u.id} type="button" disabled={ro} aria-pressed={on} onClick={() => up((p) => ({ members: on ? p.members.filter((x) => x !== u.id) : [...p.members, u.id] }))}
                className={cn('min-h-9 rounded-full border px-3 text-[length:var(--fs-12)] transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>
                {u.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── Milestones ── */}
      <Section icon={<FiFlag />} tone="rose" title="Milestones: παραδοτέα & πληρωμές" hint="Με την ενεργοποίηση γίνονται εργασίες του έργου και μπαίνουν στο ημερολόγιο"
        actions={!ro ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="secondary" className="gap-1.5"><FiPlus className="size-3.5" />Milestone</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem className={ITEM} onSelect={() => addMilestone(null)}><FiUser className="size-3.5" />Πληρωμή πελάτη</DropdownMenuItem>
              <DropdownMenuItem className={ITEM} disabled={!t.gross} onSelect={() => splitPlan(null, t.gross)}><FiCalendar className="size-3.5" />Πρόγραμμα πελάτη 30/40/30</DropdownMenuItem>
              {s.parties.length > 0 && <DropdownMenuSeparator />}
              {s.parties.map((p) => <DropdownMenuItem key={p.key} className={ITEM} onSelect={() => addMilestone(p.key)}><FiUsers className="size-3.5" />Πληρωμή προς {p.name}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined}>
        {s.milestones.length === 0 ? (
          <p className="py-4 text-center text-[length:var(--fs-13)] text-muted-foreground">Κανένα milestone. Ξεκινήστε από το «Πρόγραμμα πελάτη 30/40/30».</p>
        ) : (
          <div className="space-y-4">
            {[{ key: null as string | null, label: 'Πελάτης → εμάς', total: t.gross }, ...s.parties.map((p) => ({ key: p.key as string | null, label: `Εμείς → ${p.name}`, total: feeOf(p.key) }))]
              .filter((g) => s.milestones.some((m) => m.partyKey === g.key))
              .map((g) => {
                const ms = s.milestones.filter((m) => m.partyKey === g.key);
                const cov = g.key ? milestoneCoverage(ms.map((m) => m.amount), g.total) : customerMs;
                return (
                  <div key={g.key ?? 'customer'}>
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-[length:var(--fs-12)] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3>
                      <span className={cn('text-[length:var(--fs-12)] tabular-nums', cov.ok ? 'rounded bg-emerald-50 px-1.5 text-emerald-800' : 'rounded bg-rose-50 px-1.5 text-rose-800')}>
                        {eur(cov.sum)} / {eur(g.total)}{cov.ok ? ' ✓' : ` · διαφορά ${eur(cov.diff)}`}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {ms.map((m) => (
                        <div key={m.uid} className="grid gap-2 rounded-md border border-border p-2.5 sm:grid-cols-12">
                          <Input value={m.title} onChange={(e) => setMs(m.uid, { title: e.target.value })} placeholder="Τίτλος (π.χ. Παράδοση υλικών)" className={cn(field, 'sm:col-span-5')} disabled={ro} aria-label="Τίτλος milestone" />
                          <Input type="date" value={m.dueDate ?? ''} onChange={(e) => setMs(m.uid, { dueDate: e.target.value || null })} className={cn(field, 'sm:col-span-3')} disabled={ro} aria-label="Προθεσμία" />
                          <NumInput value={m.amount} onValue={(n) => setMs(m.uid, { amount: n ?? 0 })} className={cn(field, 'sm:col-span-3')} disabled={ro} aria-label="Ποσό πληρωμής" />
                          {!ro ? (
                            <div className="flex justify-end sm:col-span-1">
                              <RowMenu label={`Ενέργειες milestone ${m.title}`}>
                                <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => up((p) => ({ milestones: p.milestones.filter((x) => x.uid !== m.uid) }))}><FiTrash2 className="size-3.5" />Αφαίρεση</DropdownMenuItem>
                              </RowMenu>
                            </div>
                          ) : <span className="sm:col-span-1" />}
                          <Input value={m.deliverables ?? ''} onChange={(e) => setMs(m.uid, { deliverables: e.target.value || null })} placeholder="Παραδοτέα (π.χ. πρωτόκολλο παραλαβής, φωτογραφίες)" className={cn(field, 'text-[length:var(--fs-12)] sm:col-span-12')} disabled={ro} aria-label="Παραδοτέα" />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Section>

      {/* ── Ειδικοί όροι ── */}
      <Section icon={<FiEdit3 />} tone="slate" title="Ειδικοί όροι" hint="Ό,τι γράψετε εδώ ενσωματώνεται υποχρεωτικά στα έγγραφα">
        <textarea value={s.terms ?? ''} onChange={(e) => up({ terms: e.target.value || null })} rows={3} disabled={ro} aria-label="Ειδικοί όροι"
          placeholder="π.χ. Η μεταφορά υλικών μέχρι τον 2ο όροφο γίνεται από εμάς. Εγγύηση τοποθέτησης 2 έτη."
          className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-[length:var(--fs-12)] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </Section>

      {!ro && <RecipeLinesDialog open={fromRecipe} onOpenChange={setFromRecipe} onAdd={addFromRecipe} />}

      {!ro && (
        <div className="sticky bottom-0 z-30 -mx-1 rounded-t-lg border border-b-0 border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_16px_-10px_rgb(0_0_0/0.25)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[length:var(--fs-12)] text-muted-foreground">{dirty ? 'Μη αποθηκευμένες αλλαγές' : initial ? 'Όλα αποθηκευμένα' : 'Νέο έργο'} · Σύνολο <span className="font-semibold text-foreground tabular-nums">{eur(t.gross)}</span></p>
            <Button type="button" onClick={save} disabled={saving || (!dirty && !!initial)} className="min-h-10 gap-1.5">
              {saving ? <FiLoader className="size-4 animate-spin" /> : <FiSave className="size-4" />}{initial ? 'Αποθήκευση' : 'Δημιουργία'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
