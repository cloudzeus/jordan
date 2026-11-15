'use client';

import * as React from 'react';
import { FiInfo, FiImage, FiShoppingCart, FiAlertTriangle, FiRefreshCw, FiSlash, FiTag, FiTrendingUp } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ItemMediaPanel, StockStrip } from '@/components/admin/item-media/item-media-panel';
import type { ItemPurchases, PurchaseLine } from '@/lib/item-purchases';
import type { PurchaseKind } from '@/lib/purchase-kinds';

const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const qtyFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 3 });
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : '—');
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;

const TAB = { info: '#0369A1', media: '#7C3AED', purchases: '#B45309', prices: '#047857' } as const;
const KIND_TONE: Record<PurchaseKind, string> = {
  invoice: '#B45309', credit: '#BE123C', order: '#0369A1', quote: '#7C3AED', movement: '#475569',
};

const TRIGGER = cn(
  'h-9! flex-none cursor-pointer gap-1 rounded-none px-2 text-(length:--fs-12) text-muted-foreground sm:gap-1.5 sm:px-3',
  'hover:text-foreground data-[state=active]:font-semibold data-[state=active]:text-(--tab-tone)!',
  'after:bg-(--tab-tone) after:h-[2px]! after:bottom-0!',
);
const TH = 'px-1.5 sm:px-2 py-1.5 text-left text-(length:--fs-10) font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap';
const TD = 'px-1.5 sm:px-2 py-1.5 text-(length:--fs-12) align-top';
const NUM = 'text-right tabular-nums whitespace-nowrap';

function useJson<T>(url: string | null) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const load = React.useCallback(async () => {
    if (!url) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Αποτυχία ανάγνωσης');
      setData(body as T);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);
  // Το load ξεκινά σε microtask: τα setState του γίνονται σε callback, όχι σύγχρονα στο σώμα του effect.
  React.useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return { data, error, loading, reload: load };
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12)">
      <FiAlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onRetry} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2.5 hover:bg-muted">
        <FiRefreshCw className="size-3.5" aria-hidden /> Δοκιμή ξανά
      </button>
    </div>
  );
}

type FullItem = {
  record: {
    code: string; name: string | null; name2: string | null; isService: boolean; isActive: boolean;
    vat: string | null; category: string | null; group: string | null; manufacturer: string | null; brand: string | null;
    unit1: string | null; priceRetail: number; priceWholesale: number;
    weight: number; grossWeight: number; volume: number; dim1: number; dim2: number; dim3: number;
  };
  options: Record<'units' | 'categories' | 'groups' | 'manufacturers' | 'brands' | 'vats', { id: string; name: string }[]>;
  lastPurchase: { unitCost: number; date: string; fincode: string } | null;
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-(length:--fs-10) font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-(length:--fs-12) text-foreground">{children}</dd>
    </div>
  );
}

/** Info: υπόλοιπα αποθηκών + βασικά στοιχεία του είδους (ζωντανά από το SoftOne) + χαρακτηριστικά. */
function InfoTab({ mtrl, isService }: { mtrl: number; isService: boolean }) {
  // Η καρτέλα χωρίς την (αργή) τελευταία τιμή αγοράς· αυτή φορτώνει παράλληλα και συμπληρώνεται όταν έρθει.
  const full = useJson<FullItem>(`/api/admin/softone/items/${mtrl}/full?lp=0`);
  const lastBuy = useJson<{ lastPurchase: FullItem['lastPurchase'] }>(`/api/admin/softone/items/${mtrl}/last-purchase`);
  const attrs = useJson<{ attributes: { name: string; value: string; unit: string | null }[] }>(`/api/admin/items/${mtrl}/attributes`);
  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null) => (id ? list?.find((o) => o.id === id)?.name ?? `#${id}` : '—');
  const dash = (n: number, unit = '') => (n ? `${qtyFmt.format(n)}${unit}` : '—');

  return (
    <div className="space-y-3">
      {!isService && <StockStrip mtrl={mtrl} />}
      {full.error && !full.data && <ErrorBox message={full.error} onRetry={full.reload} />}
      {!full.data && !full.error && <div className="h-24 animate-pulse rounded-md bg-muted motion-reduce:animate-none" aria-busy="true" aria-label="Φόρτωση στοιχείων" />}
      {full.data && (() => {
        const r = full.data.record; const o = full.data.options; const lp = lastBuy.data?.lastPurchase ?? null;
        return (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-md border border-border bg-background px-3 py-2.5 sm:grid-cols-4 lg:grid-cols-6">
            <Fact label="Εμπορική κατηγορία">{nameOf(o.categories, r.category)}</Fact>
            <Fact label="Ομάδα">{nameOf(o.groups, r.group)}</Fact>
            <Fact label="Βασική μονάδα">{nameOf(o.units, r.unit1)}</Fact>
            <Fact label="ΦΠΑ">{nameOf(o.vats, r.vat)}</Fact>
            <Fact label="Τιμή λιανικής">{r.priceRetail ? eur.format(r.priceRetail) : '—'}</Fact>
            <Fact label="Τελ. τιμή αγοράς">
              {lp ? <span title={`${lp.fincode} · ${fmtDate(lp.date)}`}>{eur.format(lp.unitCost)} <span className="text-muted-foreground">· {fmtDate(lp.date)}</span></span>
                : lastBuy.loading ? <span className="inline-block h-3 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" aria-label="Φόρτωση" /> : '—'}
            </Fact>
            {!isService && (
              <>
                <Fact label="Κατασκευαστής">{nameOf(o.manufacturers, r.manufacturer)}</Fact>
                <Fact label="Μάρκα">{nameOf(o.brands, r.brand)}</Fact>
                <Fact label="Διαστάσεις (Μ×Π×Υ)">{r.dim1 || r.dim2 || r.dim3 ? `${qtyFmt.format(r.dim1)} × ${qtyFmt.format(r.dim2)} × ${qtyFmt.format(r.dim3)}` : '—'}</Fact>
                <Fact label="Καθαρό / μικτό βάρος">{r.weight || r.grossWeight ? `${dash(r.weight, ' kg')} / ${dash(r.grossWeight, ' kg')}` : '—'}</Fact>
                <Fact label="Όγκος">{dash(r.volume)}</Fact>
              </>
            )}
            <Fact label="Κατάσταση">{r.isActive ? 'Ενεργό' : 'Ανενεργό'}</Fact>
          </dl>
        );
      })()}
      {attrs.data && attrs.data.attributes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FiTag className="size-3.5 text-violet-600" aria-hidden />
          {attrs.data.attributes.map((a) => (
            <span key={a.name} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-(length:--fs-11)" style={{ borderColor: soft('#7C3AED', 35), backgroundColor: soft('#7C3AED', 8) }}>
              <span className="text-muted-foreground">{a.name}:</span>
              <span className="font-medium text-foreground">{a.value}{a.unit ? ` ${a.unit}` : ''}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Αγορές: όλα τα παραστατικά αγορών του είδους· τα σύνολα μετρούν ΜΟΝΟ τιμολόγια − πιστωτικά. */
function PurchasesTab({ mtrl }: { mtrl: number }) {
  const { data, error, loading, reload } = useJson<ItemPurchases>(`/api/admin/items/${mtrl}/purchases`);
  const [kind, setKind] = React.useState<PurchaseKind | 'all'>('all');

  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <div className="h-32 animate-pulse rounded-md bg-muted motion-reduce:animate-none" aria-busy="true" aria-label="Φόρτωση αγορών από το SoftOne" />;

  const unit = data.unit ? ` ${data.unit}` : '';
  const rows = kind === 'all' ? data.lines : data.lines.filter((l) => l.kind === kind);
  const t = data.totals;
  const chip = (active: boolean) => cn(
    'inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-(length:--fs-11) font-medium transition-colors duration-150',
    active ? 'text-white shadow-xs' : 'border-border bg-background hover:bg-muted',
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-2">
        {[
          ['Τιμολογημένη ποσότητα', `${qtyFmt.format(t.qty)}${unit}`],
          ['Αξία αγορών', eur.format(t.value)],
          ['Μέσο κόστος', t.avgCost != null ? eur.format(t.avgCost) : '—'],
          ['Τελευταίο κόστος', t.lastCost != null ? `${eur.format(t.lastCost)} · ${fmtDate(t.lastDate)}` : '—'],
          ['Τιμολόγια / προμηθευτές', `${t.docs} / ${t.suppliers}`],
        ].map(([label, value], i) => (
          <div
            key={label} className="min-w-34 flex-1 rounded-md border px-3 py-1.5 sm:flex-none"
            style={i === 1 ? { backgroundColor: soft(TAB.purchases, 8), borderColor: soft(TAB.purchases, 30), boxShadow: `inset 3px 0 0 ${TAB.purchases}` } : undefined}
          >
            <p className="text-(length:--fs-11) font-medium text-muted-foreground">{label}</p>
            <p className="text-(length:--fs-14) font-semibold tabular-nums text-foreground">{value}</p>
          </div>
        ))}
        <button
          type="button" onClick={reload} disabled={loading}
          className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1 self-start rounded-md px-2 text-(length:--fs-11) text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <FiRefreshCw className={cn('size-3.5', loading && 'animate-spin motion-reduce:animate-none')} aria-hidden /> Ανανέωση
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Φίλτρο τύπου παραστατικού">
        <button type="button" onClick={() => setKind('all')} className={cn(chip(kind === 'all'), kind !== 'all' && 'text-muted-foreground')} style={kind === 'all' ? { backgroundColor: '#475569', borderColor: '#475569' } : undefined}>
          Όλα <span className="tabular-nums opacity-80">{data.lines.length}</span>
        </button>
        {data.byKind.map((k) => (
          <button
            key={k.kind} type="button" onClick={() => setKind(k.kind)} className={chip(kind === k.kind)}
            style={kind === k.kind ? { backgroundColor: KIND_TONE[k.kind], borderColor: KIND_TONE[k.kind] } : { color: KIND_TONE[k.kind] }}
          >
            {k.label} <span className="tabular-nums opacity-80">{k.docs}</span>
          </button>
        ))}
        <span className="text-(length:--fs-11) text-muted-foreground">Τα σύνολα μετρούν μόνο τιμολόγια μείον πιστωτικά.</span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-(length:--fs-12) text-muted-foreground">
          {data.lines.length === 0 ? 'Δεν υπάρχουν παραστατικά αγορών για αυτό το είδος στο SoftOne.' : 'Κανένα παραστατικό αυτού του τύπου.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <table className="w-full border-collapse">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th scope="col" className={TH}>Ημ/νία</th>
                <th scope="col" className={TH}>Παραστατικό</th>
                <th scope="col" className={cn(TH, 'hidden md:table-cell')}>Προμηθευτής</th>
                <th scope="col" className={cn(TH, 'hidden lg:table-cell')}>Έργο</th>
                <th scope="col" className={cn(TH, 'text-right')}>Ποσότητα</th>
                <th scope="col" className={cn(TH, 'hidden text-right sm:table-cell')}>Κόστος μον.</th>
                <th scope="col" className={cn(TH, 'text-right')}>Αξία</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l: PurchaseLine, i) => {
                const tone = KIND_TONE[l.kind];
                const counts = l.kind === 'invoice' || l.kind === 'credit';
                return (
                  <tr key={`${l.findoc}-${i}`} className={cn('border-t border-border/60 transition-colors duration-150 hover:bg-muted/30', (!counts || l.cancelled) && 'text-muted-foreground')}>
                    <td className={cn(TD, 'tabular-nums whitespace-nowrap')} style={{ boxShadow: `inset 3px 0 0 ${tone}` }}>{fmtDate(l.date)}</td>
                    <td className={TD}>
                      <span className={cn('font-mono font-medium whitespace-nowrap', l.cancelled ? 'line-through' : counts && 'text-foreground')}>{l.fincode}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-sm px-1 text-(length:--fs-10) font-semibold" style={{ color: tone, backgroundColor: soft(tone, 12) }}>{l.kindLabel}</span>
                        {l.cancelled && <span className="inline-flex items-center gap-0.5 rounded-sm bg-muted px-1 text-(length:--fs-10)"><FiSlash className="size-3" aria-hidden /> Ακυρωμένο</span>}
                        <span className="text-(length:--fs-10) text-muted-foreground">{l.seriesName ?? `Σειρά ${l.series}`}</span>
                      </span>
                      <span className="block text-(length:--fs-11) md:hidden">{l.supplier ?? ''}</span>
                    </td>
                    <td className={cn(TD, 'hidden md:table-cell')}>{l.supplier ?? '—'}</td>
                    <td className={cn(TD, 'hidden lg:table-cell')}>{l.project ?? <span className="text-muted-foreground/50">—</span>}</td>
                    <td className={cn(TD, NUM)}>{qtyFmt.format(l.kind === 'credit' ? -l.qty : l.qty)}</td>
                    <td className={cn(TD, NUM, 'hidden sm:table-cell')}>{eur.format(l.unitCost)}</td>
                    <td className={cn(TD, NUM, counts && !l.cancelled && 'font-semibold text-foreground')}>{eur.format(l.kind === 'credit' ? -l.value : l.value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const pct = (cur: number, prev: number | null) => (prev == null || prev === 0 ? null : ((cur - prev) / prev) * 100);
const pctFmt = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('el-GR', { maximumFractionDigits: 1 })}%`;

/** Μικρή κάρτα-νούμερο της σύνοψης τιμών. */
function PriceStat({ label, value, hint, hl }: { label: string; value: React.ReactNode; hint?: React.ReactNode; hl?: boolean }) {
  return (
    <div
      className="min-w-34 flex-1 rounded-md border px-3 py-1.5 sm:flex-none"
      style={hl ? { backgroundColor: soft(TAB.prices, 8), borderColor: soft(TAB.prices, 30), boxShadow: `inset 3px 0 0 ${TAB.prices}` } : { borderColor: 'var(--border)' }}
    >
      <p className="text-(length:--fs-11) font-medium text-muted-foreground">{label}</p>
      <p className="text-(length:--fs-14) font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-(length:--fs-10) tabular-nums text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Τιμές: η πορεία του κόστους μονάδας στα 10 τελευταία ΤΙΜΟΛΟΓΙΑ αγοράς (μη ακυρωμένα), γράφημα +
 * σύνοψη + πίνακας. Ίδιο endpoint με τις «Αγορές» — εδώ μόνο τα τιμολόγια, κανονικοποιημένα στη μονάδα.
 */
function PricesTab({ mtrl }: { mtrl: number }) {
  const { data, error, loading, reload } = useJson<ItemPurchases>(`/api/admin/items/${mtrl}/purchases`);
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <div className="h-48 animate-pulse rounded-md bg-muted motion-reduce:animate-none" aria-busy="true" aria-label="Φόρτωση τιμών αγοράς" />;

  const unit = data.unit ? ` ${data.unit}` : '';
  const invoices = data.lines.filter((l) => l.kind === 'invoice' && !l.cancelled && l.qty > 0 && l.value > 0);
  const last10 = invoices.slice(0, 10); // φθίνουσα (νεότερο πρώτο)
  const series = [...last10].reverse(); // χρονολογικά (παλιό → νέο) για το γράφημα

  if (series.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-(length:--fs-12) text-muted-foreground">
        Δεν υπάρχουν τιμολόγια αγοράς για αυτό το είδος — δεν υπάρχει πορεία τιμής ακόμη.
      </p>
    );
  }

  const vals = series.map((l) => l.unitCost);
  const first = vals[0], latest = vals[vals.length - 1];
  const min = Math.min(...vals), max = Math.max(...vals);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const overall = pct(latest, first);

  // Γεωμετρία SVG (viewBox σταθερό, πλάτος 100%). Κλίμακα y με περιθώριο 20% πάνω/κάτω.
  const W = 720, H = 220, padL = 52, padR = 16, padT = 18, padB = 28;
  const range = max - min || Math.abs(max) || 1;
  const lo = min - range * 0.2, hi = max + range * 0.2;
  const xOf = (i: number) => (series.length === 1 ? (padL + (W - padL - padR) / 2) : padL + (i / (series.length - 1)) * (W - padL - padR));
  const yOf = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const pts = series.map((l, i) => ({ x: xOf(i), y: yOf(l.unitCost) }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${(H - padB).toFixed(1)} L${pts[0].x.toFixed(1)},${(H - padB).toFixed(1)} Z`;
  const ticks = [0, 1, 2, 3].map((i) => lo + (hi - lo) * (i / 3));
  const last = pts[pts.length - 1];
  const labelIdx = series.length <= 4 ? series.map((_, i) => i) : [0, Math.round((series.length - 1) / 2), series.length - 1];
  const gid = `price-area-${mtrl}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-2">
        <PriceStat label="Τελευταίο κόστος" hl value={eur.format(latest)} hint={fmtDate(series[series.length - 1].date)} />
        <PriceStat label={`Μέσο (${series.length})`} value={eur.format(avg)} hint={`εύρος ${eur.format(min)}–${eur.format(max)}`} />
        <PriceStat label="Ελάχιστο / Μέγιστο" value={<>{eur.format(min)} <span className="text-muted-foreground">/</span> {eur.format(max)}</>} />
        <PriceStat
          label={`Μεταβολή (${series.length}→1)`}
          value={overall == null ? '—' : <span className={overall > 0 ? 'text-rose-600' : overall < 0 ? 'text-emerald-700' : undefined}>{pctFmt(overall)}</span>}
          hint={`${eur.format(first)} → ${eur.format(latest)}`}
        />
        <button
          type="button" onClick={reload} disabled={loading}
          className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1 self-start rounded-md px-2 text-(length:--fs-11) text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <FiRefreshCw className={cn('size-3.5', loading && 'animate-spin motion-reduce:animate-none')} aria-hidden /> Ανανέωση
        </button>
      </div>

      <div className="rounded-md border border-border bg-background px-3 pt-2.5 pb-1">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-(length:--fs-12) font-semibold text-foreground">Κόστος μονάδας{unit ? ` (€/${unit.trim()})` : ' (€)'} — τελευταία {series.length} τιμολόγια</span>
          <span className="text-(length:--fs-11) text-muted-foreground">μόνο τιμολόγια αγοράς · κανονικοποιημένο στη μονάδα</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="200" role="img" aria-label={`Γράφημα κόστους μονάδας· τελευταίο ${eur.format(latest)}, μέσο ${eur.format(avg)}`}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={TAB.prices} stopOpacity="0.2" />
              <stop offset="1" stopColor={TAB.prices} stopOpacity="0" />
            </linearGradient>
          </defs>
          <g stroke="rgba(17,24,39,.08)" strokeWidth="1">
            {ticks.map((_, i) => { const y = padT + (i / 3) * (H - padT - padB); return <line key={i} x1={padL} y1={y} x2={W - padR} y2={y} />; })}
          </g>
          <g fill="#9ca3af" fontSize="10" textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {ticks.map((t, i) => { const y = padT + ((3 - i) / 3) * (H - padT - padB); return <text key={i} x={padL - 6} y={y + 3}>{eur.format(t)}</text>; })}
          </g>
          {series.length > 1 && <path d={area} fill={`url(#${gid})`} />}
          {series.length > 1
            ? <path d={line} fill="none" stroke={TAB.prices} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            : null}
          <g fill={TAB.prices}>
            {pts.slice(0, -1).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" opacity="0.55" />)}
          </g>
          <circle cx={last.x} cy={last.y} r="5" fill={TAB.prices} />
          <circle cx={last.x} cy={last.y} r="9" fill="none" stroke={TAB.prices} strokeOpacity="0.3" strokeWidth="2" />
          <g fill="#9ca3af" fontSize="9" textAnchor="middle">
            {labelIdx.map((i) => <text key={i} x={xOf(i)} y={H - 8} fill={i === series.length - 1 ? TAB.prices : '#9ca3af'} fontWeight={i === series.length - 1 ? 600 : 400}>{fmtDate(series[i].date)}</text>)}
          </g>
        </svg>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <table className="w-full border-collapse">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th scope="col" className={TH}>Ημ/νία</th>
              <th scope="col" className={TH}>Τιμολόγιο</th>
              <th scope="col" className={cn(TH, 'hidden md:table-cell')}>Προμηθευτής</th>
              <th scope="col" className={cn(TH, 'text-right')}>Ποσότητα</th>
              <th scope="col" className={cn(TH, 'text-right')}>Κόστος μον.</th>
              <th scope="col" className={cn(TH, 'text-right')}>Μεταβ.</th>
            </tr>
          </thead>
          <tbody>
            {last10.map((l, i) => {
              const ch = pct(l.unitCost, last10[i + 1]?.unitCost ?? null);
              return (
                <tr key={`${l.findoc}-${i}`} className="border-t border-border/60 transition-colors duration-150 hover:bg-muted/30">
                  <td className={cn(TD, 'tabular-nums whitespace-nowrap')} style={{ boxShadow: `inset 3px 0 0 ${TAB.prices}` }}>{fmtDate(l.date)}</td>
                  <td className={TD}><span className="font-mono font-medium whitespace-nowrap text-foreground">{l.fincode}</span></td>
                  <td className={cn(TD, 'hidden md:table-cell')}>{l.supplier ?? '—'}</td>
                  <td className={cn(TD, NUM)}>{qtyFmt.format(l.qty)}{unit}</td>
                  <td className={cn(TD, NUM, 'font-semibold text-foreground')}>{eur.format(l.unitCost)}</td>
                  <td className={cn(TD, NUM)}>{ch == null ? <span className="text-muted-foreground/50">—</span> : <span className={ch > 0 ? 'text-rose-600' : ch < 0 ? 'text-emerald-700' : 'text-muted-foreground'}>{pctFmt(ch)}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-(length:--fs-11) text-muted-foreground">Η μεταβολή κάθε γραμμής είναι σε σχέση με το προηγούμενο (παλαιότερο) τιμολόγιο.</p>
    </div>
  );
}

/** Η ανοιγμένη γραμμή ενός είδους/υπηρεσίας: Info · Media · Αγορές · Τιμές. */
export function ItemExpandPanel({ mtrl, canManage, isService }: { mtrl: number; canManage: boolean; isService: boolean }) {
  return (
    <Tabs defaultValue="info" className="gap-3">
      <TabsList variant="line" className="h-auto! min-h-9 flex-wrap w-full justify-start gap-0 border-b border-border p-0">
        <TabsTrigger value="info" className={TRIGGER} style={{ ['--tab-tone' as string]: TAB.info }}>
          <FiInfo className="size-3.5" aria-hidden /> Info
        </TabsTrigger>
        <TabsTrigger value="media" className={TRIGGER} style={{ ['--tab-tone' as string]: TAB.media }}>
          <FiImage className="size-3.5" aria-hidden /> Media
        </TabsTrigger>
        <TabsTrigger value="purchases" className={TRIGGER} style={{ ['--tab-tone' as string]: TAB.purchases }}>
          <FiShoppingCart className="size-3.5" aria-hidden /> Αγορές
        </TabsTrigger>
        {!isService && (
          <TabsTrigger value="prices" className={TRIGGER} style={{ ['--tab-tone' as string]: TAB.prices }}>
            <FiTrendingUp className="size-3.5" aria-hidden /> Τιμές
          </TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="info"><InfoTab mtrl={mtrl} isService={isService} /></TabsContent>
      <TabsContent value="media"><ItemMediaPanel mtrl={mtrl} canManage={canManage} /></TabsContent>
      <TabsContent value="purchases"><PurchasesTab mtrl={mtrl} /></TabsContent>
      {!isService && <TabsContent value="prices"><PricesTab mtrl={mtrl} /></TabsContent>}
    </Tabs>
  );
}
