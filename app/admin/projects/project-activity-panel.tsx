'use client';

import * as React from 'react';
import {
  FiRefreshCw, FiPackage, FiTool, FiFileText, FiAlertTriangle, FiSlash,
  FiShoppingCart, FiTrendingUp, FiArrowUpRight, FiArrowDownLeft, FiLayers, FiPlus, FiTrash2, FiTarget, FiMoreVertical,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ExpandableDocRow } from '@/components/admin/document-expand';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ProjectActivity, ProjectDoc, ProjectMaterial } from '@/lib/project-activity';
import type { BudgetLine } from '@/lib/project-budget';
import { AddBudgetLineDialog } from './add-budget-line-dialog';
import { ApplyRecipeDialog } from './apply-recipe-dialog';
import { useProjectRefresh } from './project-events';

// Μνήμη ανά έργο για τη διάρκεια της σελίδας: κλείσιμο/άνοιγμα της ίδιας γραμμής δεν ξαναρωτά
// το SoftOne. Το «Ανανέωση» την παρακάμπτει.
const cache = new Map<number, ProjectActivity>();
// Ένα αίτημα ανά έργο τη φορά: το Strict Mode (και δύο ανοιχτές όψεις του ίδιου έργου) θα
// έστελναν διπλό αίτημα στο SoftOne, που ήδη μπορεί να απαντά αργά.
const inflight = new Map<number, Promise<ProjectActivity>>();

async function fetchActivity(prjc: number): Promise<ProjectActivity> {
  const pending = inflight.get(prjc);
  if (pending) return pending;
  const p = (async () => {
    const res = await fetch(`/api/admin/projects/${prjc}/activity`, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'Αποτυχία ανάγνωσης από το SoftOne');
    return body as ProjectActivity;
  })().finally(() => inflight.delete(prjc));
  inflight.set(prjc, p);
  return p;
}

const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const qtyFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 3 });
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : '—');

/**
 * Χρώμα ανά ενότητα SoftOne (παλέτα «B2B Service» του ui-ux-pro-max + σημασιολογικοί τόνοι).
 * Κάθε τόνος περνά 4.5:1 ως κείμενο πάνω στο ανοιχτό του φόντο. Τα φόντα βγαίνουν με
 * `color-mix` από τον τόνο, οπότε δουλεύουν και σε σκούρο θέμα. Inline hex — όχι δυναμικές
 * κλάσεις Tailwind, που ο JIT θα έσβηνε.
 */
type Tone = { fg: string; icon: React.ComponentType<{ className?: string }> };
const TONE: Record<number, Tone> = {
  1251: { fg: '#B45309', icon: FiShoppingCart },    // Αγορές — amber
  1351: { fg: '#047857', icon: FiTrendingUp },      // Πωλήσεις — emerald
  1412: { fg: '#BE123C', icon: FiArrowUpRight },    // Εμβάσματα προμηθευτών — rose (εκροή)
  1413: { fg: '#0369A1', icon: FiArrowDownLeft },   // Εμβάσματα πελατών — sky (εισροή)
};
const NEUTRAL: Tone = { fg: '#475569', icon: FiLayers };
const toneOf = (sosource: number) => TONE[sosource] ?? NEUTRAL;
const soft = (hex: string, pct = 10) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;

const ACCENT = '#0369A1';
const TAB_TONE = { materials: '#B45309', services: '#7C3AED', docs: ACCENT } as const;

const TH = 'px-1.5 sm:px-2 py-1.5 text-left text-(length:--fs-10) font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap';
const TD = 'px-1.5 sm:px-2 py-1.5 text-(length:--fs-12) align-top';
const NUM = 'text-right tabular-nums whitespace-nowrap';

function useProjectActivity(prjc: number) {
  const [data, setData] = React.useState<ProjectActivity | null>(() => cache.get(prjc) ?? null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(!cache.has(prjc));

  const load = React.useCallback(async (force = false) => {
    if (!force && cache.has(prjc)) return;
    setLoading(true);
    setError(null);
    try {
      const body = await fetchActivity(prjc);
      cache.set(prjc, body);
      setData(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [prjc]);

  React.useEffect(() => { void load(); }, [load]);
  useProjectRefresh(prjc, (scope) => { if (scope === 'all') void load(true); });
  return { data, error, loading, reload: () => load(true) };
}

/** Ο προϋπολογισμός ζει στη δική μας βάση: ξαναδιαβάζεται μόνος του, χωρίς κλήση στο SoftOne. */
function useBudget(prjc: number) {
  const [lines, setLines] = React.useState<BudgetLine[] | null>(null);
  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/projects/${prjc}/budget`, { cache: 'no-store' });
      if (res.ok) setLines(((await res.json()) as { lines: BudgetLine[] }).lines);
    } catch { /* ο προϋπολογισμός είναι συμπληρωματικός — οι κινήσεις φαίνονται κι έτσι */ }
  }, [prjc]);
  React.useEffect(() => { void load(); }, [load]);
  useProjectRefresh(prjc, () => { void load(); });
  return { lines, reload: load };
}

const BUDGET_TONE = '#4338CA';

function Skeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Φόρτωση από το SoftOne">
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 w-40 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />)}
      </div>
      <div className="h-7 w-80 max-w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />)}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-(length:--fs-12) text-muted-foreground">{children}</p>;
}

function FamilyBadge({ sosource, label }: { sosource: number; label: string }) {
  const t = toneOf(sosource);
  const Icon = t.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-(length:--fs-11) font-medium sm:whitespace-nowrap"
      style={{ color: t.fg, backgroundColor: soft(t.fg, 12) }}
    >
      <Icon className="size-3" aria-hidden /> {label}
    </span>
  );
}

function LastPurchaseCell({ lp }: { lp: { unitCost: number; date: string; fincode: string } | null }) {
  if (!lp) return <span className="text-(length:--fs-11) text-muted-foreground">καμία αγορά</span>;
  return (
    <span title={`Από ${lp.fincode}`}>
      <span className="whitespace-nowrap text-foreground">{eur.format(lp.unitCost)}</span>
      <span className="block text-(length:--fs-10) text-muted-foreground">{fmtDate(lp.date)}</span>
    </span>
  );
}

function MaterialsTable({ rows, kind }: { rows: ProjectMaterial[]; kind: 'materials' | 'services' }) {
  if (rows.length === 0) {
    return (
      <Empty>
        {kind === 'materials'
          ? 'Δεν υπάρχουν υλικά χρεωμένα σε αυτό το έργο στο SoftOne.'
          : 'Δεν υπάρχουν υπηρεσίες χρεωμένες σε αυτό το έργο στο SoftOne.'}
      </Empty>
    );
  }
  const groups = new Map<number, ProjectMaterial[]>();
  for (const r of rows) groups.set(r.sosource, [...(groups.get(r.sosource) ?? []), r]);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <table className="w-full border-collapse">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th scope="col" className={TH}>{kind === 'materials' ? 'Υλικό' : 'Υπηρεσία'}</th>
            <th scope="col" className={cn(TH, 'text-right')}>Ποσότητα</th>
            <th scope="col" className={cn(TH, 'hidden text-right md:table-cell')} title="Καθαρό κόστος μονάδας από το πιο πρόσφατο παραστατικό αγοράς του είδους">Τελ. τιμή αγοράς</th>
            <th scope="col" className={cn(TH, 'text-right')}>Αξία</th>
            <th scope="col" className={cn(TH, 'hidden text-right sm:table-cell')}>Παραστατικά</th>
          </tr>
        </thead>
        {[...groups.entries()].map(([sosource, items]) => {
          const t = toneOf(sosource);
          return (
            <tbody key={sosource}>
              <tr style={{ backgroundColor: soft(t.fg, 7) }}>
                <th scope="rowgroup" colSpan={5} className="px-2 py-1 text-left" style={{ boxShadow: `inset 3px 0 0 ${t.fg}` }}>
                  <span className="text-(length:--fs-11) font-semibold" style={{ color: t.fg }}>{items[0].family}</span>
                  <span className="ml-2 text-(length:--fs-11) font-normal tabular-nums text-muted-foreground">
                    {items.length} · {eur.format(items.reduce((s, m) => s + m.value, 0))}
                  </span>
                </th>
              </tr>
              {items.map((m) => (
                <tr key={`${m.mtrl}:${m.sosource}`} className="border-t border-border/60 transition-colors duration-150 hover:bg-muted/30">
                  <td className={TD}>
                    <span className="font-medium text-foreground">{m.name}</span>
                    {m.code && <span className="ml-1.5 font-mono text-(length:--fs-10) text-muted-foreground">{m.code}</span>}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>
                    <span className="whitespace-nowrap">{qtyFmt.format(m.qty)}</span>
                    {/* Η μονάδα («Τετραγωνικά μέτρα») κάτω από τον αριθμό στο κινητό, δίπλα του από sm. */}
                    {m.unit && <span className="block text-(length:--fs-11) text-muted-foreground sm:ml-1 sm:inline">{m.unit}</span>}
                  </td>
                  <td className={cn(TD, 'hidden text-right tabular-nums md:table-cell')}>
                    <LastPurchaseCell lp={m.lastPurchase} />
                  </td>
                  <td className={cn(TD, NUM, 'font-semibold text-foreground')}>{eur.format(m.value)}</td>
                  <td className={cn(TD, NUM, 'hidden text-muted-foreground sm:table-cell')}>{m.docs}</td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function DocsTable({ rows }: { rows: ProjectDoc[] }) {
  if (rows.length === 0) {
    return <Empty>Δεν υπάρχουν παραστατικά συνδεδεμένα με αυτό το έργο στο SoftOne.</Empty>;
  }
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <table className="w-full border-collapse">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th scope="col" className="w-7"><span className="sr-only">Στοιχεία</span></th>
            <th scope="col" className={TH}>Ημ/νία</th>
            <th scope="col" className={TH}>Παραστατικό</th>
            <th scope="col" className={cn(TH, 'hidden md:table-cell')}>Ενότητα</th>
            <th scope="col" className={cn(TH, 'hidden lg:table-cell')}>Συναλλασσόμενος</th>
            <th scope="col" className={cn(TH, 'hidden text-right xl:table-cell')}>Καθαρή</th>
            <th scope="col" className={cn(TH, 'hidden text-right xl:table-cell')}>ΦΠΑ</th>
            <th scope="col" className={cn(TH, 'text-right')}>Σύνολο</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const t = toneOf(d.sosource);
            return (
              <ExpandableDocRow
                key={d.findoc} findoc={d.findoc} fincode={d.fincode} colSpan={8}
                className={cn('border-t border-border/60 transition-colors duration-150 hover:bg-muted/30', (d.cancelled || !d.counts) && 'text-muted-foreground')}
              >
                <td className={cn(TD, 'tabular-nums whitespace-nowrap')} style={{ boxShadow: `inset 3px 0 0 ${t.fg}` }}>{fmtDate(d.date)}</td>
                <td className={TD}>
                  <span className={cn('font-mono font-medium whitespace-nowrap', d.cancelled ? 'line-through' : 'text-foreground')}>{d.fincode}</span>
                  <span className="block text-(length:--fs-11) text-muted-foreground">{d.seriesName ?? `Σειρά ${d.series}`}</span>
                  {/* Στο κινητό η στήλη «Ενότητα» κρύβεται — η ένδειξη μένει εδώ. */}
                  <span className="mt-0.5 block md:hidden"><FamilyBadge sosource={d.sosource} label={d.family} /></span>
                  {d.cancelled && (
                    <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-sm bg-muted px-1 text-(length:--fs-11)">
                      <FiSlash className="size-3" aria-hidden /> Ακυρωμένο
                    </span>
                  )}
                  {!d.counts && !d.cancelled && (
                    <span className="mt-0.5 ml-1 inline-block rounded-sm bg-muted px-1 text-(length:--fs-11) text-muted-foreground" title="Παραγγελίες, προσφορές και δελτία δεν μετρούν στα σύνολα — η ίδια αγορά/πώληση μετριέται στο τιμολόγιο">
                      {d.kindLabel} · δεν μετρά
                    </span>
                  )}
                  {!d.onHeader && (
                    <span className="mt-0.5 ml-1 inline-block rounded-sm bg-muted px-1 text-(length:--fs-11) text-muted-foreground" title="Το έργο είναι μόνο σε γραμμές του παραστατικού, όχι στην κεφαλή">
                      μόνο γραμμές
                    </span>
                  )}
                </td>
                <td className={cn(TD, 'hidden md:table-cell')}><FamilyBadge sosource={d.sosource} label={d.family} /></td>
                <td className={cn(TD, 'hidden lg:table-cell')}>{d.trader ?? <span className="text-muted-foreground/50">—</span>}</td>
                <td className={cn(TD, NUM, 'hidden xl:table-cell')}>{eur.format(d.net)}</td>
                <td className={cn(TD, NUM, 'hidden text-muted-foreground xl:table-cell')}>{eur.format(d.vat)}</td>
                <td className={cn(TD, NUM, 'font-semibold', !d.cancelled && d.counts && 'text-foreground')}>{eur.format(d.total)}</td>
              </ExpandableDocRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BudgetSection({
  prjc, lines, kind, purchased, canManage, onAdd, onRecipe, onDeleted,
}: {
  prjc: number;
  lines: BudgetLine[];
  kind: 'materials' | 'services';
  /** Ποσότητα που αγοράστηκε (ενότητα Αγορές) ανά MTRL — για σύγκριση με την πρόβλεψη. */
  purchased: Map<number, number>;
  canManage: boolean;
  onAdd: () => void;
  /** «Από συνταγή»: γραμμές από συνταγή τοποθέτησης (υλικά + εργατικά). */
  onRecipe: () => void;
  onDeleted: () => void;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const total = lines.reduce((s, l) => s + l.value, 0);
  // Κόστος με την τελευταία τιμή αγοράς — μόνο για γραμμές με γνωστή αγορά.
  const cost = lines.reduce((s, l) => s + (l.lastPurchase ? l.qty * l.lastPurchase.unitCost : 0), 0);
  const costKnown = lines.some((l) => l.lastPurchase);
  const noun = kind === 'materials' ? 'υλικό' : 'υπηρεσία';

  const remove = async (l: BudgetLine) => {
    const ok = await confirmAction({
      title: 'Αφαίρεση από τον προϋπολογισμό',
      message: `Να αφαιρεθεί η γραμμή «${l.name}» (${qtyFmt.format(l.qty)}${l.unit ? ` ${l.unit}` : ''}); Το SoftOne δεν επηρεάζεται.`,
      confirmLabel: 'Αφαίρεση',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(l.id);
    try {
      const res = await fetch(`/api/admin/projects/${prjc}/budget/${l.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Αποτυχία αφαίρεσης');
      toast.success(`Αφαιρέθηκε: ${l.name}`);
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (lines.length === 0) {
    if (!canManage) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2" style={{ borderColor: `color-mix(in srgb, ${BUDGET_TONE} 30%, var(--border))` }}>
        <FiTarget className="size-3.5 shrink-0" style={{ color: BUDGET_TONE }} aria-hidden />
        <span className="flex-1 text-(length:--fs-12) text-muted-foreground">Δεν υπάρχει προϋπολογισμός για {kind === 'materials' ? 'υλικά' : 'υπηρεσίες'}.</span>
        <button type="button" onClick={onAdd} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2.5 text-(length:--fs-12) font-medium text-white transition-opacity duration-150 hover:opacity-90" style={{ backgroundColor: BUDGET_TONE }}>
          <FiPlus className="size-3.5" aria-hidden /> Προσθήκη {noun === 'υλικό' ? 'υλικού' : 'υπηρεσίας'}
        </button>
        <button type="button" onClick={onRecipe} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-(length:--fs-12) font-medium transition-colors duration-150 hover:bg-muted" style={{ color: BUDGET_TONE, borderColor: `color-mix(in srgb, ${BUDGET_TONE} 35%, var(--border))` }}>
          <FiLayers className="size-3.5" aria-hidden /> Από συνταγή
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background" style={{ borderColor: `color-mix(in srgb, ${BUDGET_TONE} 30%, var(--border))` }}>
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5" style={{ backgroundColor: soft(BUDGET_TONE, 8), boxShadow: `inset 3px 0 0 ${BUDGET_TONE}` }}>
        <FiTarget className="size-3.5" style={{ color: BUDGET_TONE }} aria-hidden />
        <span className="text-(length:--fs-11) font-semibold" style={{ color: BUDGET_TONE }}>Προϋπολογισμός</span>
        <span className="text-(length:--fs-11) tabular-nums text-muted-foreground">
          {lines.length} · {eur.format(total)}{costKnown && <> · κόστος {eur.format(cost)}</>}
        </span>
        {canManage && (
          <>
            <button type="button" onClick={onRecipe} className="ml-auto inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-(length:--fs-11) font-medium transition-colors duration-150 hover:bg-background" style={{ color: BUDGET_TONE }}>
              <FiLayers className="size-3.5" aria-hidden /> Από συνταγή
            </button>
            <button type="button" onClick={onAdd} className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-(length:--fs-11) font-medium transition-colors duration-150 hover:bg-background" style={{ color: BUDGET_TONE }}>
              <FiPlus className="size-3.5" aria-hidden /> Προσθήκη
            </button>
          </>
        )}
      </div>
      <table className="w-full border-collapse">
        <thead className="border-y border-border bg-muted/40">
          <tr>
            <th scope="col" className={TH}>{kind === 'materials' ? 'Υλικό' : 'Υπηρεσία'}</th>
            <th scope="col" className={cn(TH, 'text-right')}>Πρόβλεψη</th>
            <th scope="col" className={cn(TH, 'hidden text-right sm:table-cell')}>Αγοράστηκαν</th>
            <th scope="col" className={cn(TH, 'hidden text-right md:table-cell')}>Τιμή</th>
            <th scope="col" className={cn(TH, 'hidden text-right lg:table-cell')} title="Πρόβλεψη × τελευταία τιμή αγοράς">Κόστος (τελ. αγοράς)</th>
            <th scope="col" className={cn(TH, 'text-right')}>Αξία</th>
            {canManage && <th scope="col" className={TH}><span className="sr-only">Ενέργειες</span></th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const bought = purchased.get(l.mtrl) ?? 0;
            const over = bought > l.qty;
            return (
              <tr key={l.id} className="border-t border-border/60 transition-colors duration-150 hover:bg-muted/30">
                <td className={TD}>
                  <span className="font-medium text-foreground">{l.name}</span>
                  <span className="ml-1.5 font-mono text-(length:--fs-10) text-muted-foreground">{l.code}</span>
                  {l.notes && <span className="block text-(length:--fs-11) text-muted-foreground">{l.notes}</span>}
                </td>
                <td className={cn(TD, 'text-right tabular-nums')}>
                  <span className="whitespace-nowrap">{qtyFmt.format(l.qty)}</span>
                  {l.unit && <span className="block text-(length:--fs-11) text-muted-foreground sm:ml-1 sm:inline">{l.unit}</span>}
                </td>
                <td className={cn(TD, NUM, 'hidden sm:table-cell')}>
                  {/* Πάνω από την πρόβλεψη = υπέρβαση: κείμενο + χρώμα, όχι μόνο χρώμα. */}
                  <span className={over ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
                    {qtyFmt.format(bought)}{over && ' · υπέρβαση'}
                  </span>
                </td>
                <td className={cn(TD, NUM, 'hidden text-muted-foreground md:table-cell')}>{eur.format(l.unitPrice)}</td>
                <td className={cn(TD, 'hidden text-right tabular-nums lg:table-cell')}>
                  {l.lastPurchase ? (
                    <span title={`${eur.format(l.lastPurchase.unitCost)} / μονάδα · ${l.lastPurchase.fincode} · ${fmtDate(l.lastPurchase.date)}`}>
                      <span className="whitespace-nowrap text-foreground">{eur.format(l.qty * l.lastPurchase.unitCost)}</span>
                      <span className="block text-(length:--fs-10) text-muted-foreground">{eur.format(l.lastPurchase.unitCost)} · {fmtDate(l.lastPurchase.date)}</span>
                    </span>
                  ) : <span className="text-(length:--fs-11) text-muted-foreground">καμία αγορά</span>}
                </td>
                <td className={cn(TD, NUM, 'font-semibold text-foreground')}>{eur.format(l.value)}</td>
                {canManage && (
                  <td className={cn(TD, 'w-10 text-right')}>
                    {/* Οι ενέργειες διαχείρισης ζουν ΠΑΝΤΑ σε dropdown (κανόνας του project). */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={busyId === l.id}
                        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-50 data-[state=open]:bg-muted"
                        aria-label={`Ενέργειες για ${l.name}`}
                      >
                        <FiMoreVertical className="size-4" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2 text-(length:--fs-12)" onSelect={() => remove(l)}>
                          <FiTrash2 className="size-3.5" aria-hidden /> Αφαίρεση από τον προϋπολογισμό
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TabLabel({ icon: Icon, label, count, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; count: number; tone: string }) {
  return (
    <>
      {/* Στο κινητό χωρίς εικονίδιο: τα τρία tabs πρέπει να χωρούν χωρίς κύλιση. */}
      <Icon className="hidden size-3.5 sm:inline" aria-hidden />
      {label}
      <span
        className="rounded-full px-1.5 text-(length:--fs-10) font-semibold tabular-nums leading-4"
        style={{ color: tone, backgroundColor: soft(tone, 14) }}
      >
        {count}
      </span>
    </>
  );
}

// Μικρά, έγχρωμα tabs: ίδιο μέγεθος με το κείμενο του πίνακα (όχι το 14px του shadcn), με
// υπογράμμιση στο χρώμα του tab όταν είναι ενεργό.
const TRIGGER = cn(
  'h-8! flex-none cursor-pointer gap-1 sm:gap-1.5 rounded-none px-1.5 sm:px-2.5 text-(length:--fs-12) text-muted-foreground',
  'hover:text-foreground data-[state=active]:font-semibold data-[state=active]:text-(--tab-tone)!',
  // Η υπογράμμιση κάθεται στο κάτω άκρο του tab, που πιάνει όλο το ύψος της λίστας (όχι 5px
  // κάτω, όπως στο shadcn): αλλιώς βγαίνει εκτός της λίστας, κόβεται, και η λίστα αποκτά scrollbar.
  'after:bg-(--tab-tone) after:h-[2px]! after:bottom-0!',
);

export function ProjectActivityPanel({ prjc, canManage = false, projectLabel }: { prjc: number; canManage?: boolean; projectLabel: string }) {
  const { data, error, loading, reload } = useProjectActivity(prjc);
  const budget = useBudget(prjc);
  const [adding, setAdding] = React.useState<'product' | 'service' | null>(null);
  const [fromRecipe, setFromRecipe] = React.useState(false);

  if (loading && !data) return <Skeleton />;

  if (error && !data) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12)">
        <FiAlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
        <span className="flex-1 text-foreground">{error}</span>
        <button type="button" onClick={reload} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2.5 font-medium hover:bg-muted">
          <FiRefreshCw className="size-3.5" aria-hidden /> Δοκιμή ξανά
        </button>
      </div>
    );
  }
  if (!data) return null;

  const materials = data.materials.filter((m) => !m.isService);
  const services = data.materials.filter((m) => m.isService);
  const budgetLines = budget.lines ?? [];
  const budgetMaterials = budgetLines.filter((l) => !l.isService);
  const budgetServices = budgetLines.filter((l) => l.isService);
  const purchased = new Map<number, number>();
  for (const m of data.materials) if (m.sosource === 1251) purchased.set(m.mtrl, (purchased.get(m.mtrl) ?? 0) + m.qty);
  const activeDocs = data.docs.filter((d) => !d.cancelled).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-2">
        {data.totals.length === 0 && (
          <span className="text-(length:--fs-12) text-muted-foreground">Καμία κίνηση στο SoftOne για αυτό το έργο.</span>
        )}
        {data.totals.map((t) => {
          const tone = toneOf(t.sosource);
          const Icon = tone.icon;
          return (
            <div
              key={t.sosource}
              className="min-w-38 flex-1 rounded-md border px-3 py-1.5 sm:flex-none"
              style={{ backgroundColor: soft(tone.fg, 8), borderColor: soft(tone.fg, 30), boxShadow: `inset 3px 0 0 ${tone.fg}` }}
            >
              <p className="flex items-center gap-1 text-(length:--fs-11) font-semibold" style={{ color: tone.fg }}>
                <Icon className="size-3.5" aria-hidden /> {t.family}
              </p>
              <p className="text-(length:--fs-14) font-bold tabular-nums text-foreground">{eur.format(t.total)}</p>
              <p className="text-(length:--fs-10) tabular-nums text-muted-foreground">
                {t.docs} παραστατικά · καθαρή {eur.format(t.net)}
              </p>
            </div>
          );
        })}
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1 self-start rounded-md px-2 text-(length:--fs-11) text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-50"
          title={`Από SoftOne · ${new Date(data.fetchedAt).toLocaleTimeString('el-GR')}`}
        >
          <FiRefreshCw className={cn('size-3.5', loading && 'animate-spin motion-reduce:animate-none')} aria-hidden />
          Ανανέωση
        </button>
      </div>

      <Tabs defaultValue={materials.length + budgetMaterials.length ? 'materials' : services.length + budgetServices.length ? 'services' : 'docs'} className="gap-2">
        <TabsList variant="line" className="h-auto! min-h-8 flex-wrap w-full justify-start gap-0 border-b border-border p-0">
          <TabsTrigger value="materials" className={TRIGGER} style={{ ['--tab-tone' as string]: TAB_TONE.materials }}>
            <TabLabel icon={FiPackage} label="Υλικά" count={materials.length + budgetMaterials.length} tone={TAB_TONE.materials} />
          </TabsTrigger>
          <TabsTrigger value="services" className={TRIGGER} style={{ ['--tab-tone' as string]: TAB_TONE.services }}>
            <TabLabel icon={FiTool} label="Υπηρεσίες" count={services.length + budgetServices.length} tone={TAB_TONE.services} />
          </TabsTrigger>
          <TabsTrigger value="docs" className={TRIGGER} style={{ ['--tab-tone' as string]: TAB_TONE.docs }}>
            <TabLabel icon={FiFileText} label="Παραστατικά" count={activeDocs} tone={TAB_TONE.docs} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="materials" className="space-y-2">
          <BudgetSection prjc={prjc} lines={budgetMaterials} kind="materials" purchased={purchased} canManage={canManage} onAdd={() => setAdding('product')} onRecipe={() => setFromRecipe(true)} onDeleted={budget.reload} />
          <MaterialsTable rows={materials} kind="materials" />
        </TabsContent>
        <TabsContent value="services" className="space-y-2">
          <BudgetSection prjc={prjc} lines={budgetServices} kind="services" purchased={purchased} canManage={canManage} onAdd={() => setAdding('service')} onRecipe={() => setFromRecipe(true)} onDeleted={budget.reload} />
          <MaterialsTable rows={services} kind="services" />
        </TabsContent>
        <TabsContent value="docs"><DocsTable rows={data.docs} /></TabsContent>
      </Tabs>

      {canManage && (
        <AddBudgetLineDialog
          open={adding != null}
          onOpenChange={(o) => { if (!o) setAdding(null); }}
          prjc={prjc}
          projectLabel={projectLabel}
          defaultKind={adding ?? 'product'}
        />
      )}
      {canManage && <ApplyRecipeDialog open={fromRecipe} onOpenChange={setFromRecipe} prjc={prjc} projectLabel={projectLabel} />}
    </div>
  );
}
