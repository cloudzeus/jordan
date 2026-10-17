'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { FiPause, FiPlay } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { tierColor } from './tier-colors';

const ContainerScene = dynamic(() => import('@/components/admin/container-scene'), { ssr: false, loading: () => null });

export type ShowcaseTier = { from: number; value: number; label: string };
export type ShowcaseProps = {
  product: { name: string; code?: string | null; load: 'stones' | 'boxes' | 'sacks'; unit: string; perPallet: number; eyebrow?: string };
  capacity: number;
  /** Κλιμάκια: από `from` παλέτες ισχύει `value` (για τον άξονα) που εμφανίζεται ως `label` (π.χ. «€24,50» ή «−6%»). */
  tiers: ShowcaseTier[];
  /** Τρέχον γέμισμα. Στο demo αγνοείται (κύκλος από την αρχή ως γεμάτο). */
  filled: number;
  mode: 'demo' | 'live';
  valueCaption: string;
  /** Επιπλέον στατιστικά κάτω από τα βασικά (π.χ. συμμετέχοντες, προθεσμία, η κράτησή σας). */
  extra?: { label: string; value: string }[];
  footnote?: string;
  /** Κράτηση με click στις άδειες θέσεις του 3D (portal). `maxPallets` = ελεύθερες μείον εκκρεμή αιτήματα. */
  booking?: { maxPallets: number; onPick: (pallets: number) => void; selected?: number };
  /** Demo (website): click σε άδεια θέση ⇒ μήνυμα «συνδεθείτε για κράτηση» με αυτό το link. */
  pickHref?: string;
  /** Προεπισκόπηση: +N παλέτες πάνω στο τρέχον γέμισμα — δείχνει στο γράφημα πού θα πάει η τιμή. */
  preview?: number;
  /** Ενέργειες κάτω από τα στατιστικά (π.χ. κουμπί «Κλείστε παλέτες»). */
  actions?: React.ReactNode;
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const fmt = (n: number, d = 0) => n.toLocaleString('el-GR', { maximumFractionDigits: d, minimumFractionDigits: Number.isInteger(n) ? 0 : d });

/** Ομαλή «κίνηση» προς τον στόχο με rAF — ΜΙΑ τιμή οδηγεί αριθμούς, καμπύλη, δείκτη και 3D. */
function useTween(target: number, ms: number, enabled: boolean) {
  const [v, setV] = React.useState(enabled ? 0 : target);
  const from = React.useRef(v);
  React.useEffect(() => {
    if (!enabled) { setV(target); return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const x = a + (target - a) * easeOut(t);
      from.current = x;
      setV(x);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, enabled]);
  return v;
}

/**
 * Βιτρίνα δυναμικής προσφοράς: 3D container + λιτή, ζωντανή απεικόνιση της τιμής ανά γέμισμα.
 *  • demo: κύκλος γεμίσματος (website, ενδεικτικά νούμερα)
 *  • live: γεμίζει μία φορά ως το πραγματικό γέμισμα όταν φανεί (portal, πραγματική προσφορά)
 * Reduced-motion: στατικό, με την τελική εικόνα. Παύση/συνέχεια πάντα διαθέσιμη (WCAG 2.2.2).
 */
export function OfferShowcase(p: ShowcaseProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [inView, setInView] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [reduce, setReduce] = React.useState(false);
  const [playing, setPlaying] = React.useState(true);
  const demoStart = Math.max(1, Math.round(p.capacity * 0.15));
  const [target, setTarget] = React.useState(p.mode === 'demo' ? demoStart : 0);
  const [demoPick, setDemoPick] = React.useState(0);

  React.useEffect(() => {
    const r = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduce(r);
    if (r) { setPlaying(false); setTarget(p.mode === 'demo' ? Math.round(p.capacity * 0.65) : p.filled); }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { setInView(e.isIntersecting); if (e.isIntersecting) setMounted(true); }, { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, [p.mode, p.capacity, p.filled]);

  // live: όταν φανεί, ανεβαίνει στο πραγματικό γέμισμα. demo: +1 παλέτα ανά βήμα, ξανά από την αρχή.
  React.useEffect(() => {
    if (!inView || reduce) return;
    if (p.mode === 'live') { setTarget(p.filled); return; }
    if (!playing) return;
    const t = window.setInterval(() => setTarget((f) => (f >= p.capacity ? demoStart : Math.min(p.capacity, f + 1))), 1400);
    return () => window.clearInterval(t);
  }, [inView, reduce, playing, p.mode, p.filled, p.capacity, demoStart]);

  const wrapping = p.mode === 'demo' && target === demoStart;
  const shown = useTween(target, p.mode === 'live' ? 2200 : wrapping ? 500 : 900, !reduce);
  const sceneFilled = Math.round(shown * 2) / 2; // η 3D ξαναχτίζεται μόνο σε βήματα ½ παλέτας

  const tiers = [...p.tiers].sort((a, b) => a.from - b.from);
  const idx = tiers.reduce((acc, t, i) => (shown + 1e-6 >= t.from ? i : acc), 0);
  const cur = tiers[idx];
  const next = tiers[idx + 1];
  const first = tiers[0];
  const dropPct = first && cur && first.value > 0 ? ((first.value - cur.value) / first.value) * 100 : 0;

  // Click σε άδεια θέση: στο portal → κράτηση· στο demo → παύση + «συνδεθείτε».
  const pickable = p.booking ? p.booking.maxPallets >= 0.5 : !!p.pickHref;
  const onPick = p.booking
    ? (n: number) => p.booking!.onPick(Math.min(n, p.booking!.maxPallets))
    : p.pickHref ? (n: number) => { setPlaying(false); setDemoPick(n); } : undefined;
  const selected = p.booking?.selected ?? demoPick;
  const previewN = p.preview ?? (demoPick || 0);

  return (
    <div ref={ref} className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-14">
      <div className="relative aspect-[4/3] w-full min-w-0 overflow-hidden">
        {mounted && (
          <ContainerScene
            pallets={p.capacity} perPallet={p.product.perPallet} filled={sceneFilled} load={p.product.load}
            labels={{ container: 'Container', pallet: 'ΠΑΛ', base: p.product.unit }}
            heightClass="h-full" expandable={false} fitScale={0.8}
            onPickSlots={pickable ? onPick : undefined} selectedSlots={Math.ceil(selected)}
            maxSelectable={p.booking ? Math.ceil(p.booking.maxPallets) : undefined}
            className="h-full [&>div>.pointer-events-none]:hidden [&>div]:rounded-none [&>div]:border-0 [&>div]:![background:transparent] [&_figcaption]:hidden"
          />
        )}
        <div className="pointer-events-none absolute left-0 top-2 hidden flex-col items-start gap-2 sm:flex">
          <Chip dot="var(--s-ink)">Γεμάτες <b className="font-semibold tabular-nums">{fmt(Math.floor(shown * 2) / 2, 1)}</b> παλέτες</Chip>
          <Chip dot={tierColor(idx, tiers.length)}>Τιμή τώρα <b className="font-semibold tabular-nums" style={{ color: tierColor(idx, tiers.length) }}>{cur?.label}</b></Chip>
        </div>
        <div className="pointer-events-none absolute bottom-6 right-0 flex flex-col items-end gap-2">
          {pickable && <Chip dot="#0F766E">Πατήστε σε <b className="font-semibold">ελεύθερη θέση</b> για κράτηση</Chip>}
          <Chip dot="#CFC9C0" hollow className="hidden sm:inline-flex">Ελεύθερες <b className="font-semibold tabular-nums">{fmt(Math.max(0, p.capacity - Math.floor(shown * 2) / 2), 1)}</b></Chip>
        </div>
        {p.pickHref && demoPick > 0 && (
          <div className="absolute inset-x-0 top-1/2 mx-auto w-fit max-w-[92%] -translate-y-1/2 border border-[var(--s-line)] bg-white px-5 py-4 text-center shadow-[0_12px_40px_rgba(28,50,65,0.12)]" role="status">
            <p className="text-[length:var(--fs-15)]">Θέλετε <b className="tabular-nums">{fmt(demoPick)}</b> {demoPick === 1 ? 'παλέτα' : 'παλέτες'};</p>
            <p className="mt-1 text-[length:var(--fs-13)] text-[var(--s-ink-2)]">Οι κρατήσεις γίνονται από την περιοχή πελατών & συνεργατών.</p>
            <div className="mt-3 flex items-center justify-center gap-4">
              <a href={p.pickHref} className="inline-flex min-h-11 items-center bg-[var(--s-ink)] px-5 text-[length:var(--fs-14)] font-medium text-white hover:bg-[#2C4556]">Είσοδος για κράτηση</a>
              <button type="button" onClick={() => { setDemoPick(0); setPlaying(true); }} className="min-h-11 cursor-pointer text-[length:var(--fs-14)] text-[var(--s-ink-2)] hover:text-[var(--s-ink)]">Κλείσιμο</button>
            </div>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-0 left-0 text-[length:var(--fs-12)] text-[var(--s-mute)]">Σύρετε για περιστροφή</p>
      </div>

      <div className="flex min-w-0 flex-col">
        {p.product.eyebrow && <p className="text-[length:var(--fs-12)] font-medium uppercase tracking-[0.18em] text-[var(--s-mute)]">{p.product.eyebrow}</p>}
        <h3 className="font-site mt-3 text-[length:var(--fs-24)] font-light leading-tight">{p.product.name}</h3>
        {p.product.code && <p className="mt-1 text-[length:var(--fs-13)] text-[var(--s-mute)]">{p.product.code} · παλέτα {fmt(p.product.perPallet)} {p.product.unit}</p>}

        <dl className="mt-8 grid grid-cols-3 border-t border-[var(--s-line)]" aria-live="polite">
          <Stat label="Παλέτες" value={<><span className="tabular-nums">{fmt(Math.floor(shown * 2) / 2, Number.isInteger(Math.floor(shown * 2) / 2) ? 0 : 1)}</span><span className="text-[length:var(--fs-15)] text-[var(--s-mute)]"> / {fmt(p.capacity)}</span></>} />
          <Stat label={p.product.unit} value={<span className="tabular-nums">{fmt(Math.round(shown * p.product.perPallet))}</span>} />
          <Stat label="Πτώση" value={<span className="tabular-nums transition-colors duration-500" style={{ color: dropPct > 0 ? tierColor(idx, tiers.length) : undefined }}>{dropPct > 0 ? `−${fmt(dropPct)}%` : '0%'}</span>} />
        </dl>

        <div className="mt-8">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">{p.valueCaption}</p>
            <p className={cn(/[\u0370-\u03FF]/.test(cur?.label ?? '') ? 'font-site' : 'font-num', 'text-[length:var(--fs-20)] font-light transition-colors duration-500')} style={{ color: tierColor(idx, tiers.length) }}>{cur?.label ?? '—'}</p>
          </div>
          <PriceSteps tiers={tiers} capacity={p.capacity} shown={shown} idx={idx} animate={!reduce} preview={previewN > 0 ? Math.min(p.capacity, shown + previewN) : undefined} />
          <p className="mt-3 min-h-6 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
            {next ? <>Επόμενη πτώση σε <strong className="font-medium tabular-nums text-[var(--s-ink)]">{fmt(Math.max(0.5, Math.ceil((next.from - shown) * 2) / 2), 1)}</strong> παλέτες → <span className="tabular-nums">{next.label}</span></> : 'Καλύτερη τιμή — το container είναι στο χαμηλότερο κλιμάκιο.'}
          </p>
        </div>

        {p.actions && <div className="mt-6">{p.actions}</div>}

        {p.extra && p.extra.length > 0 && (
          <dl className="mt-6 space-y-2 border-t border-[var(--s-line)] pt-5 text-[length:var(--fs-14)]">
            {p.extra.map((e) => (
              <div key={e.label} className="flex justify-between gap-4"><dt className="text-[var(--s-mute)]">{e.label}</dt><dd className="tabular-nums">{e.value}</dd></div>
            ))}
          </dl>
        )}

        <div className="mt-auto flex items-center justify-between gap-4 pt-6">
          {p.footnote ? <p className="text-[length:var(--fs-12)] text-[var(--s-mute)]">{p.footnote}</p> : <span />}
          {p.mode === 'demo' && !reduce && (
            <button type="button" onClick={() => setPlaying((x) => !x)} aria-pressed={!playing}
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-[length:var(--fs-14)] text-[var(--s-ink-2)] transition-colors hover:text-[var(--s-ink)]">
              {playing ? <FiPause className="size-4" aria-hidden /> : <FiPlay className="size-4" aria-hidden />}{playing ? 'Παύση' : 'Αναπαραγωγή'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ dot, hollow, className, children }: { dot: string; hollow?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-2 border border-[var(--s-line)] bg-white/90 px-3 py-1.5 text-[length:var(--fs-13)] text-[var(--s-ink)] backdrop-blur-sm', className)}>
      <span className="size-2 rounded-full" style={hollow ? { boxShadow: `inset 0 0 0 1.5px ${dot}` } : { background: dot }} aria-hidden />
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-r border-[var(--s-line)] py-4 pr-3 last:border-r-0 [&:not(:first-child)]:pl-4">
      <dt className="text-[length:var(--fs-12)] uppercase tracking-[0.14em] text-[var(--s-mute)]">{label}</dt>
      <dd className="font-num mt-1 text-[length:var(--fs-28)] font-light leading-none">{value}</dd>
    </div>
  );
}

/**
 * Λιτό, έγχρωμο γράφημα «σκαλοπάτι»: τιμή ανά γέμισμα. Κάθε κλιμάκιο έχει το χρώμα του (ζεστό → πράσινο)·
 * ό,τι έχει ήδη κατακτηθεί γεμίζει, το υπόλοιπο μένει αχνό. Ο δείκτης «περπατά» στην καμπύλη. Καθαρό SVG.
 */
function PriceSteps({ tiers, capacity, shown, idx, animate, preview }: { tiers: ShowcaseTier[]; capacity: number; shown: number; idx: number; animate: boolean; preview?: number }) {
  if (!tiers.length || capacity <= 0) return null;
  const W = 440, H = 210, L = 4, R = 4, T = 30, B = 34;
  const vals = tiers.map((t) => t.value);
  const max = Math.max(...vals), min = Math.min(...vals);
  const span = max - min || 1;
  const base = H - B;
  const x = (pal: number) => L + (Math.min(capacity, Math.max(0, pal)) / capacity) * (W - L - R);
  const y = (v: number) => T + ((max - v) / span) * (base - T) * 0.78;
  const cx = x(shown);
  const color = tierColor(idx, tiers.length);
  const cy = y(tiers[idx].value);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full overflow-visible" role="img"
      aria-label={`Κλιμάκια τιμής: ${tiers.map((t) => `από ${fmt(t.from, 1)} παλέτες ${t.label}`).join(', ')}. Τώρα: ${tiers[idx].label}.`}>
      {tiers.map((t, i) => {
        const xs = x(i === 0 ? 0 : t.from);
        const xe = x(tiers[i + 1]?.from ?? capacity);
        const ty = y(t.value);
        const c = tierColor(i, tiers.length);
        const doneW = Math.max(0, Math.min(xe - xs, cx - xs));
        return (
          <g key={t.from}>
            {/* όλο το σκαλοπάτι, αχνό */}
            <rect x={xs} y={ty} width={xe - xs} height={base - ty} fill={c} opacity={0.07} />
            <line x1={xs} x2={xe} y1={ty} y2={ty} stroke={c} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="3 4" />
            {/* κατακτημένο κομμάτι */}
            {doneW > 0 && (
              <>
                <rect x={xs} y={ty} width={doneW} height={base - ty} fill={c} opacity={0.22} />
                <line x1={xs} x2={xs + doneW} y1={ty} y2={ty} stroke={c} strokeWidth={2.5} />
              </>
            )}
            {i > 0 && <line x1={xs} x2={xs} y1={y(tiers[i - 1].value)} y2={ty} stroke={idx >= i ? c : '#CFC9C0'} strokeWidth={idx >= i ? 2.5 : 1} />}
            {(() => { const nearEnd = xs > W - 70; return (
              <text x={nearEnd ? xe : xs + 6} y={ty - 10} textAnchor={nearEnd ? 'end' : 'start'} fontSize="12.5" fontWeight={idx === i ? 600 : 400} fill={idx >= i ? c : 'var(--s-mute)'} style={{ fontVariantNumeric: 'tabular-nums' }}>{t.label}</text>
            ); })()}
            {i > 0 && <text x={xs} y={base + 18} textAnchor={xs > W - 30 ? 'end' : 'middle'} fontSize="12" fill={idx >= i ? 'var(--s-ink)' : 'var(--s-mute)'} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(t.from, 1)}</text>}
          </g>
        );
      })}
      <line x1={x(0)} x2={x(capacity)} y1={base} y2={base} stroke="var(--s-line)" />
      {tiers[tiers.length - 1].from < capacity - capacity * 0.08 && <text x={x(capacity)} y={base + 18} textAnchor="end" fontSize="12" fill="var(--s-mute)">{fmt(capacity)} παλ.</text>}
      {preview != null && preview > shown && (() => {
        const pi = tiers.reduce((acc, t, i) => (preview + 1e-6 >= t.from ? i : acc), 0);
        const px = x(preview), py = y(tiers[pi].value), pc = tierColor(pi, tiers.length);
        return (
          <g aria-hidden>
            <rect x={cx} y={T - 6} width={Math.max(0, px - cx)} height={base - T + 6} fill={pc} opacity={0.08} />
            <line x1={px} x2={px} y1={T - 6} y2={base} stroke={pc} strokeWidth={1.5} strokeDasharray="4 3" />
            <circle cx={px} cy={py} r={6} fill="#fff" stroke={pc} strokeWidth={2.5} />
            <text x={px} y={T - 12} textAnchor={px > W - 80 ? 'end' : 'middle'} fontSize="12.5" fontWeight={600} fill={pc} style={{ fontVariantNumeric: 'tabular-nums' }}>με την κράτησή σας: {tiers[pi].label}</text>
          </g>
        );
      })()}
      <line x1={cx} x2={cx} y1={cy} y2={base} stroke={color} strokeWidth={1} opacity={0.5} />
      {animate && <circle cx={cx} cy={cy} r={7} fill={color} className="origin-center animate-ping [transform-box:fill-box] motion-reduce:hidden" opacity={0.3} />}
      <circle cx={cx} cy={cy} r={6} fill={color} stroke="#fff" strokeWidth={2} />
    </svg>
  );
}
