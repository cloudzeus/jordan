'use client';
// Γραφήματα της αρχικής — κανόνες dataviz: λεπτές στήλες (≤ 24 px, στρογγυλή άκρη 4 px, τετράγωνη
// βάση), κενό 2 px ανάμεσα σε γειτονικές στήλες, ΕΝΑΣ άξονας, αχνό πλέγμα, υπόμνημα για ≥ 2 σειρές,
// tooltip στο hover/focus και κρυφός πίνακας για αναγνώστες οθόνης. Τα χρώματα είναι CSS vars
// (--viz-*) με δικά τους βήματα για light/dark (home.css).
import * as React from 'react';
import { useChartWidth } from '@/components/admin/use-chart-width';
import { niceMax } from '@/lib/dashboard/series';

export type Series = { key: string; name: string; color: string };

/** Οι μορφές περνούν ως όνομα: συναρτήσεις δεν περνούν από server σε client component. */
export type FormatKey = 'eur' | 'eurCompact' | 'int';
const FORMATS: Record<FormatKey, (n: number) => string> = {
  eur: (n) => new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n),
  eurCompact: (n) => new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', notation: Math.abs(n) >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(n) >= 100_000 ? 1 : 0 }).format(n),
  int: (n) => new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 }).format(n),
};
export type ColumnPoint = { label: string; values: number[] };

function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const step = max / count;
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

/** Στρογγυλή άκρη μόνο στην πλευρά των δεδομένων (πάνω για θετικά, κάτω για αρνητικά). */
function barPath(x: number, y0: number, w: number, y1: number): string {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const r = Math.min(4, w / 2, h);
  if (y1 < y0) {
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`;
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-12)] text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * Ομαδοποιημένες στήλες (1–3 σειρές) με κοινό άξονα. Υποστηρίζει αρνητικές τιμές (πιστωτικά):
 * η γραμμή του μηδενός είναι πάντα ορατή.
 */
export function ColumnChart({
  points, series, format: fmtKey, height = 200, caption, highlightLast = false,
}: {
  points: ColumnPoint[];
  series: Series[];
  format: FormatKey;
  /** Συμπτυγμένη μορφή για τον άξονα (π.χ. «12 χιλ.»). */
  height?: number;
  caption: string;
  highlightLast?: boolean;
}) {
  const format = FORMATS[fmtKey];
  const wrap = React.useRef<HTMLDivElement>(null);
  const W = useChartWidth(wrap, 560);
  const [hover, setHover] = React.useState<number | null>(null);
  const n = points.length;
  const H = height, padL = 46, padR = 6, padT = 10, padB = 22;
  const innerW = Math.max(10, W - padL - padR), innerH = H - padT - padB;

  const all = points.flatMap((p) => p.values);
  const hi = niceMax(Math.max(0, ...all));
  const lo = Math.min(0, ...all) < 0 ? -niceMax(-Math.min(0, ...all)) : 0;
  const span = hi - lo || 1;
  const y = (v: number) => padT + ((hi - v) / span) * innerH;
  const y0 = y(0);
  const slot = innerW / Math.max(1, n);
  const k = series.length;
  const barW = Math.max(3, Math.min(24, (slot * 0.7 - (k - 1) * 2) / k));
  const groupW = barW * k + (k - 1) * 2;
  const tickVals = [...ticks(hi), ...(lo < 0 ? ticks(-lo).slice(1).map((t) => -t) : [])];
  const labelStep = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 44))));
  const compact = new Intl.NumberFormat('el-GR', { notation: 'compact', maximumFractionDigits: 1 });

  const empty = all.every((v) => v === 0);

  return (
    <div className="space-y-2">
      <Legend series={series} />
      <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
        {empty ? (
          <p className="grid place-items-center text-[length:var(--fs-13)] text-muted-foreground" style={{ height: H }}>Δεν υπάρχουν κινήσεις στην περίοδο.</p>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={caption} className="block overflow-visible">
            {tickVals.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
                <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--viz-axis)" className="tabular-nums">{compact.format(t)}</text>
              </g>
            ))}
            <line x1={padL} x2={W - padR} y1={y0} y2={y0} stroke="var(--viz-axis)" strokeOpacity={0.5} strokeWidth={1} />
            {points.map((p, i) => {
              const gx = padL + slot * i + (slot - groupW) / 2;
              const active = hover === i;
              return (
                <g key={p.label}>
                  {active && <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="var(--viz-hover)" />}
                  {p.values.map((v, s) => (
                    <path
                      key={series[s].key}
                      d={barPath(gx + s * (barW + 2), y0, barW, y(v))}
                      fill={series[s].color}
                      fillOpacity={hover == null || active ? (highlightLast && i !== n - 1 && hover == null ? 0.55 : 1) : 0.35}
                    />
                  ))}
                  {(i % labelStep === 0 || i === n - 1) && (
                    <text x={padL + slot * i + slot / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--viz-axis)">{p.label}</text>
                  )}
                  {/* Στόχος hover/focus: όλο το slot, όχι μόνο η στήλη. */}
                  <rect
                    x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent" tabIndex={0}
                    aria-label={`${p.label}: ${p.values.map((v, s) => `${series[s].name} ${format(v)}`).join(', ')}`}
                    onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                    className="outline-none"
                  />
                </g>
              );
            })}
          </svg>
        )}
        {hover != null && !empty && (
          <div
            role="presentation"
            className="pointer-events-none absolute top-0 z-10 min-w-[9rem] rounded-md border border-border bg-popover px-2.5 py-2 text-[length:var(--fs-12)] shadow-fluent-8"
            style={{ left: Math.min(Math.max(0, padL + slot * hover + slot / 2 - 72), Math.max(0, W - 150)) }}
          >
            <div className="mb-1 font-semibold text-foreground">{points[hover].label}</div>
            {series.map((s, si) => (
              <div key={s.key} className="flex items-center justify-between gap-3 text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-sm" style={{ backgroundColor: s.color }} />{s.name}</span>
                <span className="font-medium tabular-nums text-foreground">{format(points[hover].values[si])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Περιτύλιγμα: ένας <table> αγνοεί το width:1px του sr-only και άπλωνε τη σελίδα στο κινητό. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead><tr><th>Περίοδος</th>{series.map((s) => <th key={s.key}>{s.name}</th>)}</tr></thead>
          <tbody>{points.map((p) => <tr key={p.label}><td>{p.label}</td>{p.values.map((v, i) => <td key={series[i].key}>{format(v)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

/** Οριζόντιες μπάρες μίας σειράς (κατηγορίες με σειρά: ηλικίες, φάσεις). Η τιμή στην άκρη. */
export function BarRows({
  rows, format: fmtKey, caption, color = 'var(--viz-1)',
}: {
  rows: { label: string; value: number; color?: string; href?: string }[];
  format: FormatKey;
  caption: string;
  color?: string;
}) {
  const format = FORMATS[fmtKey];
  const max = Math.max(0, ...rows.map((r) => r.value));
  const [hover, setHover] = React.useState<number | null>(null);
  return (
    <figure className="space-y-2" aria-label={caption}>
      {rows.map((r, i) => {
        const pct = max > 0 ? (r.value / max) * 100 : 0;
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-2 text-[length:var(--fs-12)]">
              <span className="truncate text-muted-foreground">{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">{format(r.value)}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-[var(--viz-track)]">
              <div
                className="h-full rounded-r-[4px] rounded-l-[2px] transition-[width,opacity] duration-300"
                style={{ width: `${r.value > 0 ? Math.max(2, pct) : 0}%`, backgroundColor: r.color ?? color, opacity: hover == null || hover === i ? 1 : 0.45 }}
              />
            </div>
          </>
        );
        return (
          <div key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={`${r.label}: ${format(r.value)}`}>
            {r.href ? <a href={r.href} className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</a> : body}
          </div>
        );
      })}
    </figure>
  );
}
