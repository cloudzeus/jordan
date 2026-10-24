'use client';

// «Δημιουργία προσφοράς» από την κάτοψη: όλα τα στοιχεία της προσφοράς (τίτλος, πελάτης, τύπος,
// ισχύς, ΦΠΑ, περιθώριο, μορφή γραμμών) και προεπισκόπηση γραμμών/συνόλων ΠΡΙΝ την καταχώριση.
// Η προεπισκόπηση βγαίνει με την ίδια καθαρή λογική που χρησιμοποιεί ο server (lib/floorplan/offer-core).
import * as React from 'react';
import { FiAlertTriangle, FiFilePlus, FiLoader, FiSearch, FiUser, FiX } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { CONTRACT_KINDS, KIND_HINT, KIND_LABEL, eur, totals, type ContractKind } from '@/lib/contracts/core';
import { parseDecimal, type OfferLineMode, type RecipeForOffer } from '@/lib/install-recipes-core';
import { floorPlanOffer, roomNote, wallsNote, type FloorPlanItem, type FloorPlanRoom } from '@/lib/floorplan/offer-core';
import type { RecipeView } from '@/lib/install-recipes';
import type { RoomMaterial } from './offer-panel';

export type OfferRoom = { name: string; areaM2: number; perimeterM: number | null; color: string; material: RoomMaterial | null; wallsM2: number | null };
export type OfferSubmit = {
  title: string; trdr: number | null; kind: ContractKind; validUntil: string | null; vatRate: number; terms: string | null;
  markupPct: number; mode: OfferLineMode; includeWalls: boolean;
  /** Και οι γραμμές ηλεκτρολογικών/δικτύου της κάτοψης. */
  includeNetwork: boolean;
};
type Customer = { trdr: number; name: string; code?: string | null; email?: string | null; city?: string | null };

const nf2 = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 3 });
const field = 'h-9 text-[length:var(--fs-13)]';
const MODES: { key: OfferLineMode; label: string; hint: string }[] = [
  { key: 'detailed', label: 'Αναλυτικά', hint: 'Κάθε υλικό και η εργασία σε δική τους γραμμή' },
  { key: 'bundled', label: 'Μία γραμμή ανά m²', hint: '«Προμήθεια & τοποθέτηση» με τιμή ανά m²' },
];
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function CustomerField({ value, onChange }: { value: Customer | null; onChange: (c: Customer | null) => void }) {
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<Customer[]>([]);
  const [open, setOpen] = React.useState(false);
  // Λιγότεροι από 2 χαρακτήρες → καμία πρόταση (adjust-state-while-rendering, όχι setState στο effect).
  const [prevQ, setPrevQ] = React.useState(q);
  if (prevQ !== q) { setPrevQ(q); if (q.trim().length < 2) setHits([]); }
  React.useEffect(() => {
    if (q.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/admin/contracts/options?kind=customers&q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => r.json()).then((b) => { setHits(b.options ?? []); setOpen(true); }).catch(() => null);
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  if (value) {
    return (
      <div className="flex min-h-9 items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3">
        <span className="flex min-w-0 items-center gap-2 text-[length:var(--fs-13)]">
          <FiUser className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate font-medium">{value.name}</span>
          {value.code && <span className="shrink-0 text-[length:var(--fs-11)] text-muted-foreground">{value.code}</span>}
        </span>
        <button type="button" onClick={() => onChange(null)} className="inline-flex size-7 cursor-pointer items-center justify-center rounded hover:bg-muted" aria-label="Αλλαγή πελάτη"><FiX className="size-3.5" /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input id="fo-customer" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Αναζήτηση πελάτη (επωνυμία, κωδικός, ΑΦΜ)…" className={cn(field, 'pl-8')} autoComplete="off" aria-invalid />
      {open && hits.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {hits.map((h) => (
            <li key={h.trdr}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(h); setQ(''); setOpen(false); }}
                className="flex w-full cursor-pointer flex-col items-start rounded px-2 py-1.5 text-left hover:bg-muted">
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

export function FloorPlanOfferDialog({ open, onOpenChange, apiBase, rooms, recipes, busy, onSubmit, networkLines = 0 }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** `/api/admin/projects/[prjc]` ή `/api/admin/traders/[trdr]`. */
  apiBase: string;
  rooms: OfferRoom[];
  recipes: RecipeView[] | null;
  busy: boolean;
  onSubmit: (o: OfferSubmit) => void;
  /** Πόσες γραμμές ηλεκτρολογικών/δικτύου βγάζει η κάτοψη (0 = καμία). */
  networkLines?: number;
}) {
  const [defaults, setDefaults] = React.useState<{ title: string; customer: Customer | null; site: string | null } | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [kind, setKind] = React.useState<ContractKind | null>(null); // null ⇒ αυτόματα από τις γραμμές
  const [validUntil, setValidUntil] = React.useState(plusDays(30));
  const [vat, setVat] = React.useState('24');
  const [markup, setMarkup] = React.useState('');
  const [mode, setMode] = React.useState<OfferLineMode>('detailed');
  const [terms, setTerms] = React.useState('');
  const [includeWalls, setIncludeWalls] = React.useState(true);
  const [includeNetwork, setIncludeNetwork] = React.useState(true);
  const [items, setItems] = React.useState<Map<number, FloorPlanItem>>(new Map());

  // Προεπιλογές έργου (μία φορά ανά άνοιγμα).
  // Στο άνοιγμα: καθαρό σφάλμα (adjust-state-while-rendering)· η φόρτωση στο effect.
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (prevOpen !== open) { setPrevOpen(open); if (open) setLoadError(null); }
  React.useEffect(() => {
    if (!open) return;
    let ignore = false;
    fetch(`${apiBase}/floorplan-offer`, { cache: 'no-store' })
      .then(async (r) => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.message ?? 'Τα στοιχεία του έργου δεν φορτώθηκαν.'); return d; })
      .then((d) => {
        if (ignore) return;
        setDefaults(d);
        setTitle((t) => t || d.title);
        setCustomer((c) => c ?? d.customer);
      })
      .catch((e: Error) => { if (!ignore) setLoadError(e.message); });
    return () => { ignore = true; };
  }, [open, apiBase]);

  // Τιμές λιανικής των σκέτων ειδών για την προεπισκόπηση.
  const mtrls = React.useMemo(() => [...new Set(rooms.flatMap((r) => (r.material?.type === 'item' ? [r.material.mtrl] : [])))], [rooms]);
  React.useEffect(() => {
    if (!open) return;
    const missing = mtrls.filter((m) => !items.has(m));
    if (!missing.length) return;
    let ignore = false;
    Promise.all(missing.map((m) => fetch(`/api/admin/contracts/options?kind=item&mtrl=${m}`).then((r) => r.json()).then((d) => [m, d.item] as const).catch(() => [m, null] as const)))
      .then((rows) => {
        if (ignore) return;
        setItems((cur) => {
          const next = new Map(cur);
          for (const [m, it] of rows) if (it) next.set(m, { mtrl: m, code: it.code, name: it.name, price: it.price ?? 0 });
          return next;
        });
      });
    return () => { ignore = true; };
  }, [open, mtrls, items]);

  const markupN = markup.trim() === '' ? 0 : parseDecimal(markup);
  const markupOk = Number.isFinite(markupN) && markupN >= 0 && markupN <= 1000;
  const vatN = parseDecimal(vat);
  const vatOk = Number.isFinite(vatN) && vatN >= 0 && vatN <= 100;
  const recipeMap = React.useMemo(() => new Map<string, RecipeForOffer>((recipes ?? []).map((r) => [r.id, r])), [recipes]);
  const fpRooms: FloorPlanRoom[] = rooms.map((r) => ({
    name: r.name, areaM2: r.areaM2, perimeterM: r.perimeterM, wallsM2: r.wallsM2,
    material: r.material ? (r.material.type === 'recipe' ? { type: 'recipe', recipeId: r.material.recipeId } : { type: 'item', mtrl: r.material.mtrl }) : null,
  }));
  const preview = floorPlanOffer({ rooms: fpRooms, recipes: recipeMap, items, markupPct: markupOk ? markupN : 0, mode, includeWalls });
  const pricesLoading = mtrls.some((m) => !items.has(m));
  const effKind = kind ?? preview.kind;
  const t = totals(preview.lines.map((l) => ({ ...l, discount: 0 })), vatOk ? vatN : 0);
  const noMaterial = rooms.filter((r) => !r.material);
  const zeroPrice = preview.lines.filter((l) => !(l.unitPrice > 0));
  const totalArea = rooms.reduce((s, r) => s + r.areaM2, 0);
  const totalWalls = rooms.reduce((s, r) => s + (r.wallsM2 ?? 0), 0);

  const errors = [
    !title.trim() && 'Δώστε τίτλο',
    !customer && 'Επιλέξτε πελάτη',
    !preview.lines.length && !(includeNetwork && networkLines > 0) && 'Δεν υπάρχουν γραμμές — ορίστε υλικό σε τουλάχιστον έναν χώρο',
    preview.missing.length > 0 && `Λείπει υλικό/συνταγή για: ${preview.missing.join(', ')}`,
    !markupOk && 'Μη έγκυρο περιθώριο',
    !vatOk && 'Μη έγκυρος ΦΠΑ',
  ].filter(Boolean) as string[];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (errors.length || busy || pricesLoading) return;
    onSubmit({
      title: title.trim(), trdr: customer?.trdr ?? null, kind: effKind, validUntil: validUntil || null, vatRate: vatN,
      terms: terms.trim() || null, markupPct: markupN, mode, includeWalls, includeNetwork: includeNetwork && networkLines > 0,
    });
  };

  // Γραμμές ομαδοποιημένες ανά χώρο (η σημείωση ξεκινά με «Χώρος: … · m²»).
  const groups = rooms.filter((r) => r.material).map((r) => {
    const notes = [roomNote({ name: r.name, areaM2: Math.round(r.areaM2 * 1000) / 1000 })];
    if (r.wallsM2) notes.push(wallsNote(r.name, Math.round(r.wallsM2 * 1000) / 1000));
    return { room: r, lines: preview.lines.filter((l) => notes.some((n) => l.notes === n || l.notes?.startsWith(`${n} — `))) };
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader className="border-b border-border px-5 pb-3 pt-4">
            <DialogTitle className="text-[length:var(--fs-16)]">Δημιουργία προσφοράς από την κάτοψη</DialogTitle>
            <DialogDescription className="text-[length:var(--fs-12)]">
              Ελέγξτε τα στοιχεία και την προεπισκόπηση. Η προσφορά καταχωρίζεται ως πρόχειρη {apiBase.includes('/traders/') ? 'στον πελάτη — το έργο δημιουργείται όταν γίνει αποδεκτή' : 'στο έργο'} και διορθώνεται μετά στις «Συμβάσεις & Προσφορές».
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-5 overflow-y-auto">
            {loadError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)] text-destructive">{loadError}</p>}

            {/* Στοιχεία */}
            <section className="space-y-3">
              <h3 className="text-[length:var(--fs-13)] font-semibold" style={{ color: '#0E7490' }}>Στοιχεία προσφοράς</h3>
              <div>
                <Label htmlFor="fo-title" className="mb-1 block text-[length:var(--fs-12)]">Τίτλος <span className="text-destructive">*</span></Label>
                <Input id="fo-title" value={title} onChange={(e) => setTitle(e.target.value)} className={field} maxLength={200} />
              </div>
              <div>
                <Label htmlFor="fo-customer" className="mb-1 block text-[length:var(--fs-12)]">Πελάτης <span className="text-destructive">*</span></Label>
                {!defaults && !loadError ? (
                  <p className="flex h-9 items-center gap-2 text-[length:var(--fs-12)] text-muted-foreground"><FiLoader className="size-3.5 animate-spin" aria-hidden /> Φόρτωση…</p>
                ) : <CustomerField value={customer} onChange={setCustomer} />}
                {defaults && !defaults.customer && <p className="mt-1 text-[length:var(--fs-11)] text-muted-foreground">Το έργο δεν έχει πελάτη στο SoftOne — αναζητήστε τον.</p>}
              </div>
              {defaults?.site && <p className="text-[length:var(--fs-12)] text-muted-foreground">Τοποθεσία από το έργο: <span className="text-foreground">{defaults.site}</span></p>}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="fo-kind" className="mb-1 block text-[length:var(--fs-12)]">Τύπος</Label>
                  <select
                    id="fo-kind" value={kind ?? ''} onChange={(e) => setKind((e.target.value || null) as ContractKind | null)}
                    className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-[length:var(--fs-13)] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <option value="">Αυτόματα · {KIND_LABEL[preview.kind]}</option>
                    {CONTRACT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                  <p className="mt-1 text-[length:var(--fs-11)] text-muted-foreground">{KIND_HINT[effKind]}</p>
                </div>
                <div>
                  <Label htmlFor="fo-valid" className="mb-1 block text-[length:var(--fs-12)]">Ισχύς έως</Label>
                  <Input id="fo-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={field} />
                </div>
                <div>
                  <Label htmlFor="fo-vat" className="mb-1 block text-[length:var(--fs-12)]">ΦΠΑ (%)</Label>
                  <Input id="fo-vat" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} className={cn(field, 'tabular-nums')} aria-invalid={!vatOk} />
                </div>
              </div>
            </section>

            {/* Τιμολόγηση */}
            <section className="space-y-3">
              <h3 className="text-[length:var(--fs-13)] font-semibold" style={{ color: '#7C3AED' }}>Τιμολόγηση συνταγών</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                <div>
                  <Label htmlFor="fo-markup" className="mb-1 block text-[length:var(--fs-12)]">Περιθώριο (%)</Label>
                  <Input id="fo-markup" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} placeholder="0" className={cn(field, 'tabular-nums')} aria-invalid={!markupOk} />
                  <p className="mt-1 text-[length:var(--fs-11)] text-muted-foreground">Οι τιμές συνταγών είναι κόστος· τα σκέτα είδη μπαίνουν με τιμή λιανικής.</p>
                </div>
                <div role="radiogroup" aria-label="Μορφή γραμμών" className="grid gap-2 sm:grid-cols-2">
                  {MODES.map((m) => (
                    <button
                      key={m.key} type="button" role="radio" aria-checked={mode === m.key} onClick={() => setMode(m.key)}
                      className={cn('cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors', mode === m.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50')}
                    >
                      <span className="block text-[length:var(--fs-13)] font-medium">{m.label}</span>
                      <span className="block text-[length:var(--fs-11)] text-muted-foreground">{m.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="fo-terms" className="mb-1 block text-[length:var(--fs-12)]">Ειδικοί όροι (προαιρετικά)</Label>
                <textarea
                  id="fo-terms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} maxLength={20000}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-[length:var(--fs-13)] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </div>
              {totalWalls > 0 && (
                <label className="flex cursor-pointer items-start gap-2 text-[length:var(--fs-12)]">
                  <input type="checkbox" checked={includeWalls} onChange={(e) => setIncludeWalls(e.target.checked)} className="mt-0.5 size-4 cursor-pointer accent-[var(--primary)]" />
                  <span>Και οι τοίχοι ({nf2.format(totalWalls)} m²) με το υλικό του χώρου, σε δικές τους γραμμές</span>
                </label>
              )}
              {networkLines > 0 && (
                <label className="flex cursor-pointer items-start gap-2 text-[length:var(--fs-12)]">
                  <input type="checkbox" checked={includeNetwork} onChange={(e) => setIncludeNetwork(e.target.checked)} className="mt-0.5 size-4 cursor-pointer accent-[var(--primary)]" />
                  <span>Και τα ηλεκτρολογικά & δίκτυο της κάτοψης ({networkLines} γραμμές: συσκευές, μέτρα καλωδίων, εργασίες) — μπαίνουν χωρίς τιμή, τις συμπληρώνεις στην προσφορά</span>
                </label>
              )}
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[length:var(--fs-12)] text-muted-foreground">
                Η χαρτογράφηση αποθηκεύεται στο έργο και επισυνάπτεται στην προσφορά: η κάτοψη με τους χώρους μπαίνει στο PDF του πελάτη και στις συμβάσεις/οδηγίες των συνεργείων.
              </p>
            </section>

            {/* Προεπισκόπηση */}
            <section className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[length:var(--fs-13)] font-semibold" style={{ color: '#047857' }}>Προεπισκόπηση</h3>
                <span className="text-[length:var(--fs-12)] text-muted-foreground">{rooms.length} χώροι · {nf2.format(totalArea)} m²{totalWalls > 0 ? ` + τοίχοι ${nf2.format(totalWalls)} m²` : ''} · {preview.lines.length} γραμμές</span>
              </div>
              {noMaterial.length > 0 && (
                <p className="flex items-start gap-1.5 rounded-md border px-3 py-2 text-[length:var(--fs-12)]" style={{ borderColor: '#FDBA74', background: '#FFF7ED', color: '#9A3412' }}>
                  <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Χωρίς υλικό (μόνο στην περίληψη): {noMaterial.map((r) => `${r.name} (${nf2.format(r.areaM2)} m²)`).join(', ')}
                </p>
              )}
              {!pricesLoading && zeroPrice.length > 0 && (
                <p className="flex items-start gap-1.5 rounded-md border px-3 py-2 text-[length:var(--fs-12)]" style={{ borderColor: '#FDBA74', background: '#FFF7ED', color: '#9A3412' }}>
                  <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Χωρίς τιμή (0,00 €): {[...new Set(zeroPrice.map((l) => l.name))].join(', ')} — συμπληρώστε την τιμή στην προσφορά μετά την καταχώριση.
                </p>
              )}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[600px] table-fixed text-[length:var(--fs-12)]">
                  <thead className="bg-muted/40 text-left text-[length:var(--fs-11)] text-muted-foreground">
                    <tr>
                      <th className="w-[46%] px-2.5 py-1.5 font-medium">Γραμμή</th>
                      <th className="px-2.5 py-1.5 font-medium">Είδος</th>
                      <th className="px-2.5 py-1.5 text-right font-medium">Ποσότητα</th>
                      <th className="px-2.5 py-1.5 text-right font-medium">Τιμή</th>
                      <th className="px-2.5 py-1.5 text-right font-medium">Αξία</th>
                    </tr>
                  </thead>
                  {groups.map(({ room, lines }) => (
                    <tbody key={room.name + room.areaM2} className="divide-y divide-border border-t border-border">
                      <tr className="bg-muted/20">
                        <td colSpan={5} className="px-2.5 py-1.5 font-semibold">
                          <span className="mr-1.5 inline-block size-2.5 rounded-sm align-middle" style={{ background: room.color }} aria-hidden />
                          {room.name} <span className="font-normal text-muted-foreground">· {nf2.format(room.areaM2)} m²{includeWalls && room.wallsM2 ? ` + τοίχοι ${nf2.format(room.wallsM2)} m²` : ''}{room.material ? ` · ${room.material.type === 'recipe' ? 'συνταγή' : 'είδος'}: ${room.material.label}` : ''}</span>
                        </td>
                      </tr>
                      {lines.length === 0 ? (
                        <tr><td colSpan={5} className="px-2.5 py-1.5 text-muted-foreground">{pricesLoading ? 'Φόρτωση τιμής…' : 'Καμία γραμμή (η συνταγή δεν έχει τιμές).'}</td></tr>
                      ) : lines.map((l, i) => (
                        <tr key={i}>
                          <td className="max-w-0 px-2.5 py-1.5" title={l.notes ?? undefined}>
                            <span className="block truncate">{l.name}</span>
                            {(room.wallsM2 || l.notes?.includes(' — ')) && (
                              <span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">
                                {[room.wallsM2 ? (l.notes?.includes(' · τοίχοι ') ? 'Τοίχοι' : 'Δάπεδο') : null, l.notes?.includes(' — ') ? l.notes.split(' — ').slice(1).join(' — ') : null].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-muted-foreground">{l.kind === 'SERVICE' ? 'Υπηρεσία' : 'Υλικό'}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{qtyFmt.format(l.qty)}{l.unit ? ` ${l.unit}` : ''}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{eur(l.unitPrice)}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{eur(l.qty * l.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                  <tfoot className="border-t border-border">
                    <tr><td colSpan={4} className="px-2.5 py-1 text-right text-muted-foreground">Καθαρή αξία</td><td className="px-2.5 py-1 text-right tabular-nums">{eur(t.net)}</td></tr>
                    <tr><td colSpan={4} className="px-2.5 py-1 text-right text-muted-foreground">ΦΠΑ {vatOk ? nf2.format(vatN) : '—'}%</td><td className="px-2.5 py-1 text-right tabular-nums">{eur(t.vat)}</td></tr>
                    <tr className="font-semibold"><td colSpan={4} className="px-2.5 py-1.5 text-right">Σύνολο</td><td className="px-2.5 py-1.5 text-right tabular-nums">{eur(t.gross)}</td></tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </DialogBody>

          <DialogFooter className="m-0 flex-col items-stretch gap-2 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[length:var(--fs-12)] text-destructive" role={errors.length ? 'alert' : undefined}>{errors[0] ?? ''}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
              <Button type="submit" disabled={!!errors.length || busy || pricesLoading}>
                {busy ? <FiLoader className="animate-spin" aria-hidden /> : <FiFilePlus aria-hidden />} Καταχώριση προσφοράς
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
