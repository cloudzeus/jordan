'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiAlertTriangle, FiArrowLeft, FiArrowRight, FiCheckCircle, FiCopy, FiInfo, FiZap, FiLoader, FiPlus, FiSave, FiTrash2 } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RegistrySearch, type RegistryPick } from '@/components/admin/registry-search';
import {
  RECIPE_KINDS, RECIPE_KIND_META, lineCostPerSqm, parseDecimal, recipeCost, recipeForArea, toInput, type RecipeKind,
} from '@/lib/install-recipes-core';
import type { RecipeView } from '@/lib/install-recipes';
import { KindBadge, PickedItem, eur, fetchItemInfo, num } from './recipe-ui';
import { saveRecipeAction } from './actions';

type Item = { mtrl: number; code: string; name: string; unit: string | null };
type LineState = Item & { key: string; qty: string; waste: string; price: string; notes: string; lastBuy: number | null };

let seq = 0;
const nextKey = () => `n${++seq}`;

const fromRecipe = (r: RecipeView): LineState[] => r.lines.map((l) => ({
  key: nextKey(), mtrl: l.mtrl, code: l.code, name: l.name, unit: l.unit,
  qty: toInput(l.qtyPerSqm), waste: toInput(l.wastePct, 2), price: toInput(l.unitPrice), notes: l.notes ?? '', lastBuy: null,
}));

/** Κενό ή άκυρο → 0 για τα προαιρετικά πεδία. */
const optNum = (v: string) => (v.trim() === '' ? 0 : parseDecimal(v));

const field = 'h-9 tabular-nums text-(length:--fs-13)';

type StepId = 'start' | 'material' | 'lines' | 'labor' | 'summary';
const STEP_LABEL: Record<StepId, string> = {
  start: 'Αφετηρία', material: 'Υλικό', lines: 'Υλικά/m²', labor: 'Εργατικά', summary: 'Σύνοψη',
};

/** Έγχρωμο πλαίσιο επεξήγησης/παραδείγματος πάνω από κάθε βήμα. */
function Callout({ tone, icon, children }: { tone: 'info' | 'example' | 'warn'; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = tone === 'warn'
    ? 'bg-amber-50 text-amber-900 ring-amber-200'
    : tone === 'example'
      ? 'bg-violet-50 text-violet-900 ring-violet-200'
      : 'bg-blue-50 text-blue-900 ring-blue-200';
  return (
    <p className={cn('mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-(length:--fs-12) leading-relaxed ring-1 ring-inset', cls)}>
      <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span>
      <span>{children}</span>
    </p>
  );
}

/**
 * Οδηγός συνταγής τοποθέτησης σε βήματα: Αφετηρία (κατηγορία + αντιγραφή από ομοειδή) → Υλικό →
 * Υλικά ανά m² (με φύρα) → Εργατικά → Σύνοψη. Δεξιά, πάντα ορατό, το ζωντανό κόστος ανά m² και τι
 * μπαίνει στην προσφορά. Στην επεξεργασία υπάρχουσας, το βήμα «Αφετηρία» παραλείπεται.
 */
export function RecipeEditor({ initial, templates = [], readOnly = false }: { initial: RecipeView | null; templates?: RecipeView[]; readOnly?: boolean }) {
  const router = useRouter();
  const [kind, setKind] = React.useState<RecipeKind>(initial?.kind ?? 'TILE');
  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [main, setMain] = React.useState<Item | null>(
    initial?.mtrl ? { mtrl: initial.mtrl, code: initial.mtrlCode ?? '', name: initial.mtrlName ?? '', unit: initial.mtrlUnit } : null,
  );
  const [mainLastBuy, setMainLastBuy] = React.useState<number | null>(null);
  const [materialPrice, setMaterialPrice] = React.useState(toInput(initial?.materialPrice ?? 0));
  const [waste, setWaste] = React.useState(toInput(initial?.wastePct ?? 0, 2));
  const [labor, setLabor] = React.useState(toInput(initial?.laborCostPerSqm ?? 0));
  const [laborItem, setLaborItem] = React.useState<{ mtrl: number; code: string; name: string } | null>(initial?.labor ?? null);
  const [lines, setLines] = React.useState<LineState[]>(() => (initial ? fromRecipe(initial) : []));
  const [area, setArea] = React.useState('100');
  const [source, setSource] = React.useState('');
  const [startMode, setStartMode] = React.useState<'blank' | 'copy'>('blank');
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const steps: StepId[] = initial ? ['material', 'lines', 'labor', 'summary'] : ['start', 'material', 'lines', 'labor', 'summary'];
  const [cur, setCur] = React.useState(0);
  const step = steps[cur];

  const tone = RECIPE_KIND_META[kind].color;
  const sameKind = templates.filter((t) => t.kind === kind && t.id !== initial?.id);

  const pickMain = async (p: RegistryPick) => {
    setMain({ mtrl: p.id, code: p.code, name: p.name, unit: null });
    if (!name.trim()) setName(`Τοποθέτηση ${p.name}`);
    const info = (await fetchItemInfo([p.id]))[p.id];
    setMain((m) => (m && m.mtrl === p.id ? { ...m, unit: info?.unit ?? null } : m));
    const lp = info?.lastPurchase?.unitCost ?? null;
    setMainLastBuy(lp);
    if (lp != null) setMaterialPrice((cur) => (cur.trim() === '' ? toInput(lp) : cur));
  };

  const addLine = async (p: RegistryPick) => {
    const key = nextKey();
    setLines((ls) => [...ls, { key, mtrl: p.id, code: p.code, name: p.name, unit: null, qty: '', waste: '', price: '', notes: '', lastBuy: null }]);
    const info = (await fetchItemInfo([p.id]))[p.id];
    const lp = info?.lastPurchase?.unitCost ?? null;
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, unit: info?.unit ?? null, lastBuy: lp, price: l.price.trim() === '' && lp != null ? toInput(lp) : l.price } : l)));
  };

  const patchLine = (key: string, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));
  const moveLine = (key: string, dir: -1 | 1) => setLines((ls) => {
    const i = ls.findIndex((l) => l.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ls.length) return ls;
    const next = [...ls];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  // Αντιγραφή από υπάρχουσα συνταγή ίδιας κατηγορίας: βοηθητικά υλικά, φύρες, εργατικά.
  const applyTemplate = (id: string) => {
    setSource(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setLines(fromRecipe(t));
    setWaste(toInput(t.wastePct, 2));
    setLabor(toInput(t.laborCostPerSqm));
    setLaborItem(t.labor);
    if (!description.trim() && t.description) setDescription(t.description);
    toast.success(`Αντιγράφηκαν ${t.lines.length} υλικά, φύρα και εργατικά από «${t.name}»`);
  };

  // ── Έλεγχοι ──
  const wasteN = optNum(waste);
  const laborN = optNum(labor);
  const priceN = optNum(materialPrice);
  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = 'Δώστε όνομα συνταγής.';
  if (!Number.isFinite(wasteN) || wasteN < 0 || wasteN > 100) errors.waste = 'Φύρα από 0 έως 100%.';
  if (!Number.isFinite(laborN) || laborN < 0) errors.labor = 'Αριθμός ≥ 0.';
  if (!Number.isFinite(priceN) || priceN < 0) errors.price = 'Αριθμός ≥ 0.';
  const parsedLines = lines.map((l) => {
    const qty = parseDecimal(l.qty);
    const w = optNum(l.waste);
    const p = optNum(l.price);
    const err = !Number.isFinite(qty) || qty <= 0 ? 'Ποσότητα/m² > 0'
      : !Number.isFinite(w) || w < 0 || w > 100 ? 'Φύρα 0–100%'
        : !Number.isFinite(p) || p < 0 ? 'Τιμή ≥ 0' : null;
    return { l, qty, w, p, err };
  });
  const valid = !Object.keys(errors).length && parsedLines.every((x) => !x.err);
  // Ανά βήμα: τι πρέπει να είναι σωστό για να προχωρήσει ο χρήστης.
  const stepValid: Record<StepId, boolean> = {
    start: true,
    material: !errors.name && !errors.price && !errors.waste,
    lines: parsedLines.every((x) => !x.err),
    labor: !errors.labor,
    summary: valid,
  };

  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  const calcLines = parsedLines.map((x) => ({ name: x.l.name, unit: x.l.unit, qtyPerSqm: safe(x.qty), wastePct: safe(x.w), unitPrice: safe(x.p) }));
  const calc = { mtrlName: main?.name ?? null, materialPrice: safe(priceN), wastePct: safe(wasteN), laborCostPerSqm: safe(laborN), lines: calcLines };
  const cost = recipeCost(calc);
  const areaN = parseDecimal(area);
  const forArea = recipeForArea(calc, Number.isFinite(areaN) ? areaN : 0);

  const goNext = () => {
    if (!stepValid[step]) { setTouched(true); return; }
    if (cur < steps.length - 1) setCur(cur + 1);
  };
  const goPrev = () => setCur((c) => Math.max(0, c - 1));
  const jump = (i: number) => { if (i <= cur || steps.slice(0, i).every((s) => stepValid[s])) setCur(i); else setTouched(true); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || readOnly) { const bad = steps.findIndex((s) => !stepValid[s]); if (bad >= 0) setCur(bad); return; }
    setBusy(true);
    setServerError(null);
    try {
      const payload = {
        name: name.trim(), kind, description: description.trim() || null, mtrl: main?.mtrl ?? null,
        materialPrice: priceN, wastePct: wasteN, laborCostPerSqm: laborN, laborMtrl: laborItem?.mtrl ?? null,
        lines: parsedLines.map((x) => ({ mtrl: x.l.mtrl, qtyPerSqm: x.qty, wastePct: x.w, unitPrice: x.p, notes: x.l.notes.trim() || null })),
      };
      const res = await saveRecipeAction(initial?.id ?? null, payload);
      if (!res.ok) throw new Error(res.message);
      toast.success(initial ? 'Η συνταγή αποθηκεύτηκε' : 'Η συνταγή δημιουργήθηκε');
      if (!initial) router.push(`/admin/recipes/${res.data.id}`);
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) => (touched && errors[k] ? <p role="alert" className="mt-1 text-(length:--fs-11) text-destructive">{errors[k]}</p> : null);
  const isLast = cur === steps.length - 1;

  return (
    <form onSubmit={save} noValidate className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {/* ── Rail βημάτων ── */}
        <nav aria-label="Βήματα" className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-2 shadow-xs">
          {steps.map((s, i) => {
            const state = i < cur ? 'done' : i === cur ? 'active' : 'todo';
            return (
              <React.Fragment key={s}>
                {i > 0 && <span className="h-px w-5 shrink-0 bg-border sm:w-7" aria-hidden />}
                <button
                  type="button" onClick={() => jump(i)} aria-current={state === 'active' ? 'step' : undefined}
                  className={cn('inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors',
                    state === 'active' ? 'bg-muted' : 'hover:bg-muted/60')}
                >
                  <span className={cn('grid size-6 place-items-center rounded-full border-2 text-(length:--fs-11) font-bold tabular-nums',
                    state === 'done' ? 'border-emerald-600 bg-emerald-600 text-white' : state === 'active' ? 'border-current' : 'border-border text-muted-foreground')}
                    style={state === 'active' ? { color: tone } : undefined}>
                    {state === 'done' ? '✓' : i + 1}
                  </span>
                  <span className={cn('text-(length:--fs-12) font-medium whitespace-nowrap', state === 'todo' ? 'text-muted-foreground' : 'text-foreground')}>{STEP_LABEL[s]}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
          {/* ── Βήμα: Αφετηρία ── */}
          {step === 'start' && (
            <div>
              <h2 className="mb-1 text-(length:--fs-16) font-semibold">Αφετηρία</h2>
              <p className="mb-4 text-(length:--fs-12) text-muted-foreground">Διάλεξε κατηγορία και, αν θέλεις, ξεκίνα αντιγράφοντας μια παρόμοια συνταγή — κρατά υλικά ανά m², φύρες και εργατικά.</p>

              <div className="mb-4">
                <Label className="mb-1 block text-(length:--fs-12)">Κατηγορία <span className="text-destructive">*</span></Label>
                <div role="radiogroup" aria-label="Κατηγορία υλικού" className="inline-flex flex-wrap rounded-lg border border-border p-0.5">
                  {RECIPE_KINDS.map((k) => {
                    const active = kind === k;
                    return (
                      <button key={k} type="button" role="radio" aria-checked={active}
                        onClick={() => { setKind(k); setSource(''); }}
                        className={cn('inline-flex h-8 cursor-pointer items-center rounded-md px-3 text-(length:--fs-12) font-medium transition-colors duration-150',
                          active ? 'text-white shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                        style={active ? { backgroundColor: RECIPE_KIND_META[k].color } : undefined}>
                        {RECIPE_KIND_META[k].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => { setStartMode('blank'); setSource(''); }}
                  className={cn('cursor-pointer rounded-xl border p-3 text-left transition-colors', startMode === 'blank' ? 'border-ring bg-accent' : 'border-border hover:border-ring/50')}>
                  <p className="text-(length:--fs-13) font-semibold">Κενή συνταγή</p>
                  <p className="mt-0.5 text-(length:--fs-11) text-muted-foreground">Ξεκινάς από την αρχή — για νέο τύπο τοποθέτησης.</p>
                </button>
                <button type="button" onClick={() => setStartMode('copy')} disabled={!sameKind.length}
                  className={cn('cursor-pointer rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50', startMode === 'copy' ? 'border-ring bg-accent' : 'border-border hover:border-ring/50')}>
                  <p className="flex items-center gap-1.5 text-(length:--fs-13) font-semibold"><FiCopy className="size-3.5" aria-hidden /> Αντιγραφή από υπάρχουσα</p>
                  <p className="mt-0.5 text-(length:--fs-11) text-muted-foreground">{sameKind.length ? `${sameKind.length} ${RECIPE_KIND_META[kind].plural.toLowerCase()} διαθέσιμες` : 'Καμία συνταγή σε αυτή την κατηγορία ακόμη.'}</p>
                </button>
              </div>

              {startMode === 'copy' && sameKind.length > 0 && (
                <div className="mt-3">
                  <Callout tone="example" icon={<FiCopy className="size-3.5" />}>Διάλεξε μια όμοια συνταγή — θα αντιγραφούν τα βοηθητικά υλικά, οι φύρες και τα εργατικά. Στη συνέχεια αλλάζεις μόνο το κύριο υλικό και την τιμή του.</Callout>
                  <ul className="space-y-2">
                    {sameKind.map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => applyTemplate(t.id)}
                          className={cn('flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors', source === t.id ? 'border-ring bg-accent' : 'border-border hover:border-ring/50 hover:bg-muted/40')}>
                          <span className="min-w-0">
                            <span className="block truncate text-(length:--fs-13) font-medium">{t.name}</span>
                            <span className="block text-(length:--fs-11) text-muted-foreground">{t.lines.length} υλικά · φύρα {num(t.wastePct, 2)}% · {eur.format(t.cost.total)}/m²</span>
                          </span>
                          <span className="shrink-0 text-(length:--fs-11) font-medium" style={{ color: tone }}>{source === t.id ? '✓ Αντιγράφηκε' : 'Αντιγραφή →'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Βήμα: Υλικό ── */}
          {step === 'material' && (
            <div>
              <h2 className="mb-1 text-(length:--fs-16) font-semibold">Υλικό</h2>
              <p className="mb-4 text-(length:--fs-12) text-muted-foreground">Το κύριο υλικό της συνταγής και η τιμή του. Το κύριο υλικό είναι προαιρετικό — χωρίς αυτό, η συνταγή ισχύει γενικά για την κατηγορία.</p>

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="text-(length:--fs-12) text-muted-foreground">Κατηγορία:</span>
                <KindBadge kind={kind} />
                {initial
                  ? <span className="text-(length:--fs-11) text-muted-foreground">— δεν αλλάζει μετά τη δημιουργία· για άλλη κατηγορία φτιάξτε νέα συνταγή.</span>
                  : !readOnly && <button type="button" onClick={() => setCur(0)} className="text-(length:--fs-11) text-ring hover:underline">αλλαγή στο βήμα 1</button>}
              </div>

              <div className="mb-4">
                <Label htmlFor="recipe-main" className="mb-1 block text-(length:--fs-12)">Κύριο υλικό (είδος μητρώου)</Label>
                {main ? (
                  <PickedItem code={main.code} name={main.name} unit={main.unit} tone={tone} disabled={readOnly} onClear={() => { setMain(null); setMainLastBuy(null); }} />
                ) : readOnly ? (
                  <p className="text-(length:--fs-13) text-muted-foreground">Γενική συνταγή — χωρίς συγκεκριμένο είδος.</p>
                ) : (
                  <RegistrySearch id="recipe-main" kind="product" onPick={pickMain} label="" />
                )}
                {!main && !readOnly && <p className="mt-1 text-(length:--fs-11) text-muted-foreground">Προαιρετικό. Με το που διαλέξεις είδος, προσυμπληρώνεται η τελευταία τιμή αγοράς.</p>}
              </div>

              <div className="mb-4">
                <Label htmlFor="recipe-name" className="mb-1 block text-(length:--fs-12)">Όνομα συνταγής <span className="text-destructive">*</span></Label>
                <Input id="recipe-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} disabled={readOnly} aria-invalid={touched && !!errors.name} placeholder="π.χ. Πλακάκι δαπέδου 60×60 σε κόλλα" />
                {err('name')}
                <p className="mt-1 text-(length:--fs-11) text-muted-foreground">Περιγραφικό όνομα — το βλέπεις στη λίστα και στις προσφορές.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="recipe-price" className="mb-1 block text-(length:--fs-12)">Τιμή κύριου υλικού (€/m²)</Label>
                  <Input id="recipe-price" inputMode="decimal" value={materialPrice} onChange={(e) => setMaterialPrice(e.target.value)} disabled={readOnly} placeholder="0,00" className={field} aria-invalid={touched && !!errors.price} />
                  {err('price')}
                  {mainLastBuy != null && <p className="mt-1 text-(length:--fs-11) text-muted-foreground">Τελευταία αγορά: <span className="font-medium text-foreground">{eur.format(mainLastBuy)}</span>{main?.unit ? ` / ${main.unit}` : ''}</p>}
                </div>
                <div>
                  <Label htmlFor="recipe-waste" className="mb-1 block text-(length:--fs-12)">Φύρα κύριου υλικού (%)</Label>
                  <Input id="recipe-waste" inputMode="decimal" value={waste} onChange={(e) => setWaste(e.target.value)} disabled={readOnly} placeholder="π.χ. 10" className={field} aria-invalid={touched && !!errors.waste} />
                  {err('waste')}
                  <p className="mt-1 text-(length:--fs-11) text-muted-foreground">Κόψιμο & χαλάσματα. Τυπικά 8–12%.</p>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="recipe-desc" className="mb-1 block text-(length:--fs-12)">Περιγραφή / οδηγίες</Label>
                  <textarea id="recipe-desc" rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly}
                    className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-(length:--fs-13) outline-hidden focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70"
                    placeholder="Προαιρετικά — π.χ. υπόστρωμα, πάχος, τρόπος τοποθέτησης" />
                </div>
              </div>
            </div>
          )}

          {/* ── Βήμα: Υλικά ανά m² ── */}
          {step === 'lines' && (
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h2 className="text-(length:--fs-16) font-semibold">Υλικά ανά m²</h2>
                <span className="text-(length:--fs-12) tabular-nums text-muted-foreground">{lines.length} υλικά · {eur.format(cost.accessories)}/m²</span>
              </div>
              <p className="mb-4 text-(length:--fs-12) text-muted-foreground">Τα αναλώσιμα που καταναλώνονται ανά τετραγωνικό. Για κάθε ένα: ποσότητα ανά m², φύρα και τιμή μονάδας.</p>
              <Callout tone="example" icon={<FiZap className="size-3.5" />}><b>Παράδειγμα:</b> κόλλα πλακιδίων ≈ 4 kg/m², αρμόστοκος ≈ 0,4 kg/m², αστάρι ≈ 0,2 lt/m². Οι ποσότητες εξαρτώνται από το μέγεθος του πλακιδίου.</Callout>

              {lines.length === 0 && (
                <p className="mb-3 rounded-lg bg-muted/50 px-3 py-4 text-center text-(length:--fs-12) text-muted-foreground">
                  Πρόσθεσε τα υλικά που καταναλώνονται ανά τετραγωνικό (κόλλα, αρμόστοκος, αστάρι, σταυρουδάκια…).
                </p>
              )}
              <ul className="space-y-2">
                {parsedLines.map(({ l, err: lineErr }, i) => (
                  <li key={l.key} className="rounded-lg border border-border p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 w-5 shrink-0 text-right text-(length:--fs-12) tabular-nums text-muted-foreground">{i + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-(length:--fs-13) font-medium">{l.name}</p>
                        <p className="font-mono text-(length:--fs-11) text-muted-foreground">{l.code}{l.unit ? ` · ${l.unit}` : ''}</p>
                      </div>
                      {!readOnly && (
                        <div className="flex shrink-0 items-center">
                          <button type="button" onClick={() => moveLine(l.key, -1)} disabled={i === 0} className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:cursor-default disabled:opacity-30" aria-label={`Μετακίνηση «${l.name}» πάνω`}>↑</button>
                          <button type="button" onClick={() => moveLine(l.key, 1)} disabled={i === lines.length - 1} className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:cursor-default disabled:opacity-30" aria-label={`Μετακίνηση «${l.name}» κάτω`}>↓</button>
                          <button type="button" onClick={() => removeLine(l.key)} className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Αφαίρεση «${l.name}»`}>
                            <FiTrash2 className="size-4" aria-hidden />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:pl-7">
                      <div>
                        <Label htmlFor={`${l.key}-qty`} className="mb-0.5 block text-(length:--fs-11) text-muted-foreground">Ποσότητα/m²{l.unit ? ` (${l.unit})` : ''} *</Label>
                        <Input id={`${l.key}-qty`} inputMode="decimal" value={l.qty} onChange={(e) => patchLine(l.key, { qty: e.target.value })} disabled={readOnly} className={field} aria-invalid={touched && !!lineErr} />
                      </div>
                      <div>
                        <Label htmlFor={`${l.key}-waste`} className="mb-0.5 block text-(length:--fs-11) text-muted-foreground">Φύρα (%)</Label>
                        <Input id={`${l.key}-waste`} inputMode="decimal" value={l.waste} onChange={(e) => patchLine(l.key, { waste: e.target.value })} disabled={readOnly} placeholder="0" className={field} />
                      </div>
                      <div>
                        <Label htmlFor={`${l.key}-price`} className="mb-0.5 block text-(length:--fs-11) text-muted-foreground">Τιμή μονάδας (€)</Label>
                        <Input id={`${l.key}-price`} inputMode="decimal" value={l.price} onChange={(e) => patchLine(l.key, { price: e.target.value })} disabled={readOnly} placeholder="0,00" className={field} />
                      </div>
                      <div className="flex flex-col justify-end">
                        <span className="text-(length:--fs-11) text-muted-foreground">Κόστος/m²</span>
                        <span className="h-9 content-center text-(length:--fs-13) font-semibold tabular-nums">{eur.format(calcLines[i] ? lineCostPerSqm(calcLines[i]) : 0)}</span>
                      </div>
                    </div>
                    {l.lastBuy != null && <p className="mt-1 text-(length:--fs-11) text-muted-foreground sm:pl-7">Τελευταία αγορά: {eur.format(l.lastBuy)}{l.unit ? ` / ${l.unit}` : ''}</p>}
                    {(!readOnly || l.notes) && (
                      <Input value={l.notes} onChange={(e) => patchLine(l.key, { notes: e.target.value })} disabled={readOnly} maxLength={500} placeholder="Σημείωση (προαιρετικά) — π.χ. μόνο σε υγρούς χώρους" className="mt-2 h-8 text-(length:--fs-12) sm:ml-7 sm:w-[calc(100%-1.75rem)]" aria-label={`Σημείωση για «${l.name}»`} />
                    )}
                    {touched && lineErr && <p role="alert" className="mt-1 text-(length:--fs-11) text-destructive sm:pl-7">{lineErr}</p>}
                  </li>
                ))}
              </ul>
              {!readOnly && (
                <div className="mt-3">
                  <Label htmlFor="recipe-add-line" className="mb-1 flex items-center gap-1.5 text-(length:--fs-12)"><FiPlus className="size-3.5" aria-hidden /> Προσθήκη υλικού</Label>
                  <RegistrySearch id="recipe-add-line" kind="product" onPick={addLine} label="" />
                </div>
              )}
            </div>
          )}

          {/* ── Βήμα: Εργατικά ── */}
          {step === 'labor' && (
            <div>
              <h2 className="mb-1 text-(length:--fs-16) font-semibold">Εργατικό κόστος</h2>
              <p className="mb-4 text-(length:--fs-12) text-muted-foreground">Το κόστος εργασίας ανά m² και η υπηρεσία με την οποία τα εργατικά περνούν στον προϋπολογισμό του έργου.</p>
              <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
                <div>
                  <Label htmlFor="recipe-labor" className="mb-1 block text-(length:--fs-12)">Εργατικά ανά m² (€)</Label>
                  <Input id="recipe-labor" inputMode="decimal" value={labor} onChange={(e) => setLabor(e.target.value)} disabled={readOnly} placeholder="0,00" className={field} aria-invalid={touched && !!errors.labor} />
                  {err('labor')}
                </div>
                <div className="min-w-0">
                  <Label htmlFor="recipe-labor-item" className="mb-1 block text-(length:--fs-12)">Υπηρεσία εργατικών (για τον προϋπολογισμό έργου)</Label>
                  {laborItem ? (
                    <PickedItem code={laborItem.code} name={laborItem.name} tone="#7C3AED" disabled={readOnly} onClear={() => setLaborItem(null)} />
                  ) : readOnly ? (
                    <p className="text-(length:--fs-13) text-muted-foreground">Δεν έχει οριστεί.</p>
                  ) : (
                    <RegistrySearch id="recipe-labor-item" kind="service" onPick={(p) => setLaborItem({ mtrl: p.id, code: p.code, name: p.name })} label="" />
                  )}
                  {!laborItem && (laborN ?? 0) > 0 ? (
                    <p role="status" className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-(length:--fs-12) text-amber-900 ring-1 ring-inset ring-amber-200">
                      <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span>Λείπει η υπηρεσία εργατικών: στις προσφορές τα εργατικά μπαίνουν ως ελεύθερη γραμμή και <b>δεν περνούν στον προϋπολογισμό του έργου</b> με την ενεργοποίηση. Διαλέξτε π.χ. «Τοποθέτηση υλικών».</span>
                    </p>
                  ) : !readOnly && <p className="mt-1 text-(length:--fs-11) text-muted-foreground">Όταν η συνταγή μπαίνει σε προσφορά ή έργο, τα εργατικά γράφονται ως αυτή η υπηρεσία (m² × εργατικά/m²).</p>}
                </div>
              </div>
            </div>
          )}

          {/* ── Βήμα: Σύνοψη ── */}
          {step === 'summary' && (
            <div>
              <h2 className="mb-1 text-(length:--fs-16) font-semibold">Σύνοψη & έλεγχος</h2>
              <p className="mb-4 text-(length:--fs-12) text-muted-foreground">Δες το τελικό κόστος ανά m² και υπολόγισε για συγκεκριμένα τετραγωνικά πριν αποθηκεύσεις.</p>

              {touched && !valid && (
                <Callout tone="warn" icon={<FiAlertTriangle className="size-3.5" />}>Υπάρχουν πεδία που χρειάζονται διόρθωση. Πάτησε σε ένα βήμα πάνω για να τα δεις σημειωμένα με κόκκινο.</Callout>
              )}

              <div className="rounded-lg border border-border p-3">
                <Label htmlFor="recipe-area" className="mb-1 block text-(length:--fs-12)">Υπολογισμός για τετραγωνικά (m²)</Label>
                <Input id="recipe-area" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} className={`${field} max-w-[160px]`} />
                <table className="mt-3 w-full text-(length:--fs-12)">
                  <thead className="text-left text-(length:--fs-11) text-muted-foreground">
                    <tr><th className="pb-1 font-medium">Υλικό</th><th className="pb-1 text-right font-medium">Ποσότητα</th><th className="pb-1 text-right font-medium">€</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {forArea.rows.map((r) => (
                      <tr key={r.key}>
                        <td className="max-w-0 truncate py-1 pr-2" title={r.name}>{r.name}</td>
                        <td className="whitespace-nowrap py-1 text-right tabular-nums">{num(r.qty)}{r.unit ? ` ${r.unit}` : ''}</td>
                        <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums">{eur.format(r.cost)}</td>
                      </tr>
                    ))}
                    <tr><td className="py-1 pr-2">Εργατικά</td><td /><td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums">{eur.format(forArea.labor)}</td></tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border font-semibold"><td className="pt-1.5">Σύνολο</td><td /><td className="whitespace-nowrap pt-1.5 text-right tabular-nums">{eur.format(forArea.total)}</td></tr>
                  </tfoot>
                </table>
                <p className="mt-2 text-(length:--fs-11) text-muted-foreground">Οι ποσότητες περιλαμβάνουν τη φύρα.</p>
              </div>

              <Callout tone="info" icon={<FiInfo className="size-3.5" />}>Όταν η συνταγή μπει σε προσφορά/έργο: το κύριο υλικό & τα βοηθητικά γράφονται ως είδη (ποσότητα × m², με φύρα) και τα εργατικά ως η υπηρεσία που διάλεξες.</Callout>
            </div>
          )}
        </section>

        {/* ── Πλοήγηση βημάτων ── */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-xs">
          <Button type="button" variant="ghost" onClick={goPrev} disabled={cur === 0} className="gap-1.5">
            <FiArrowLeft className="size-4" aria-hidden /> Πίσω
          </Button>
          <span className="text-(length:--fs-12) text-muted-foreground tabular-nums">Βήμα {cur + 1} από {steps.length}</span>
          {isLast ? (
            readOnly ? <span className="text-(length:--fs-12) text-muted-foreground">Μόνο προβολή</span> : (
              <Button type="submit" disabled={busy} className="gap-1.5 text-white hover:opacity-90" style={{ backgroundColor: tone }}>
                {busy ? <FiLoader className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FiSave className="size-4" aria-hidden />}
                {busy ? 'Αποθήκευση…' : initial ? 'Αποθήκευση αλλαγών' : 'Δημιουργία συνταγής'}
              </Button>
            )
          ) : (
            <Button type="button" onClick={goNext} className="gap-1.5" style={{ backgroundColor: tone, color: '#fff' }}>
              Επόμενο <FiArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      {/* ── Σύνοψη (πάντα ορατή) ── */}
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-(length:--fs-14) font-semibold">Κόστος ανά m²</h2>
            <KindBadge kind={kind} />
          </div>
          <dl className="space-y-1.5 text-(length:--fs-13)">
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Κύριο υλικό{safe(wasteN) ? ` (+${num(safe(wasteN), 2)}%)` : ''}</dt><dd className="tabular-nums">{eur.format(cost.material)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Βοηθητικά υλικά</dt><dd className="tabular-nums">{eur.format(cost.accessories)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Εργατικά</dt><dd className="tabular-nums">{eur.format(cost.labor)}</dd></div>
            <div className="flex justify-between gap-2 border-t border-border pt-1.5 text-(length:--fs-16) font-semibold" style={{ color: tone }}>
              <dt>Σύνολο</dt><dd className="tabular-nums">{eur.format(cost.total)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-dashed border-border bg-card p-4 shadow-xs">
          <h2 className="mb-2 text-(length:--fs-12) font-semibold uppercase tracking-wide text-muted-foreground">Τι μπαίνει στην προσφορά</h2>
          <ul className="space-y-1 text-(length:--fs-12)">
            <li className="flex justify-between gap-2"><span className="min-w-0 truncate">{main?.name ?? `${RECIPE_KIND_META[kind].label} (κύριο υλικό)`}</span><span className="shrink-0 tabular-nums text-muted-foreground">{eur.format(cost.material)}/m²</span></li>
            {calcLines.map((l, i) => <li key={i} className="flex justify-between gap-2"><span className="min-w-0 truncate">{l.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{eur.format(lineCostPerSqm(l))}/m²</span></li>)}
            <li className="flex justify-between gap-2"><span className="min-w-0 truncate">{laborItem?.name ?? 'Εργασία τοποθέτησης'}</span><span className="shrink-0 tabular-nums text-muted-foreground">{eur.format(cost.labor)}/m²</span></li>
          </ul>
          {!laborItem && safe(laborN) > 0 && <p className="mt-2 flex items-start gap-1 text-(length:--fs-11) text-amber-700"><FiAlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden /> Τα εργατικά δεν θα περάσουν στον προϋπολογισμό χωρίς υπηρεσία.</p>}
        </section>

        {!readOnly && serverError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12) text-destructive">{serverError}</p>}
        {!readOnly && valid && <p className="flex items-center gap-1.5 text-(length:--fs-12) text-emerald-700"><FiCheckCircle className="size-3.5" aria-hidden /> Η συνταγή είναι έτοιμη για αποθήκευση.</p>}
      </aside>
    </form>
  );
}
