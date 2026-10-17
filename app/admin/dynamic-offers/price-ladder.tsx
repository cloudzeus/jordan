'use client';

// Κλίμακα τιμής σε γράφημα «σκάλας»: οριζόντια οι παλέτες του container, κάθετα η τιμή.
// Το τρέχον γέμισμα είναι πράσινη περιοχή/γραμμή· το κλιμάκιο που ισχύει τονίζεται.
import * as React from 'react';
import { sortTiers, tierAt, type Tier } from '@/lib/container-pricing';

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });

export function PriceLadder({ tiers, capacity, filled = 0, unit = 'τ.μ.', height = 190 }: {
  tiers: Tier[]; capacity: number; filled?: number; unit?: string; height?: number;
}) {
  const t = sortTiers(tiers).filter((x) => x.price > 0);
  const W = 640; const H = height; const pad = { l: 64, r: 16, t: 18, b: 34 };
  if (!t.length || !(capacity > 0)) {
    return <div className="grid h-40 place-items-center rounded-md border border-dashed border-border text-[length:var(--fs-12)] text-muted-foreground">Συμπλήρωσε χωρητικότητα και τιμές για να φανεί η κλίμακα.</div>;
  }
  const maxP = Math.max(...t.map((x) => x.price));
  const minP = Math.min(...t.map((x) => x.price));
  const span = Math.max(maxP - minP, maxP * 0.15);
  const y = (p: number) => pad.t + (1 - (p - (minP - span * 0.25)) / (maxP - (minP - span * 0.25))) * (H - pad.t - pad.b);
  const x = (pl: number) => pad.l + (Math.min(pl, capacity) / capacity) * (W - pad.l - pad.r);
  const cur = tierAt(t, filled);
  const segs = t.map((tier, i) => ({ tier, from: i === 0 ? 0 : tier.fromPallets, to: t[i + 1]?.fromPallets ?? capacity }));
  const path = segs.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.from)},${y(s.tier.price)} L${x(s.to)},${y(s.tier.price)}`).join(' ');
  // Σημάδια άξονα: χωρίς επικαλύψεις (κρατά το επόμενο μόνο αν απέχει ≥ 4% του πλάτους).
  const ticks = Array.from(new Set([0, ...t.map((v) => v.fromPallets), capacity])).sort((a, b) => a - b)
    .reduce<number[]>((acc, v) => (acc.length && (v - acc[acc.length - 1]) / capacity < 0.04 ? (v === capacity ? [...acc.slice(0, -1), v] : acc) : [...acc, v]), []);

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Κλίμακα τιμής: ${t.map((v) => `από ${num(v.fromPallets)} παλέτες ${eur(v.price)}`).join(', ')}`}>
        {filled > 0 && <rect x={x(0)} y={pad.t} width={Math.max(0, x(filled) - x(0))} height={H - pad.t - pad.b} fill="#10b981" opacity={0.1} />}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={pad.t} y2={H - pad.b} stroke="#e2e8f0" strokeDasharray="3 4" />
            <text x={x(v)} y={H - pad.b + 16} textAnchor="middle" fontSize="11" fill="#64748b">{num(v)}</text>
          </g>
        ))}
        <text x={(pad.l + W - pad.r) / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="#94a3b8">παλέτες στο container</text>
        <path d={path} fill="none" stroke="#0369a1" strokeWidth={3} strokeLinejoin="round" />
        {segs.map((s) => {
          const on = cur?.level === s.tier.level;
          return (
            <g key={s.tier.level}>
              <circle cx={x(s.from)} cy={y(s.tier.price)} r={on ? 6 : 4} fill={on ? '#047857' : '#0369a1'} stroke="#fff" strokeWidth={2} />
              <text x={x(s.from) > W - pad.r - 70 ? x(s.from) - 8 : x(s.from) + 8} textAnchor={x(s.from) > W - pad.r - 70 ? 'end' : 'start'} y={y(s.tier.price) - 8} fontSize={on ? 13 : 12} fontWeight={on ? 700 : 500} fill={on ? '#047857' : '#0f172a'}>
                {eur(s.tier.price)}
              </text>
              <text x={pad.l - 8} y={y(s.tier.price) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">W0{s.tier.level}</text>
            </g>
          );
        })}
        {filled > 0 && (
          <g>
            <line x1={x(filled)} x2={x(filled)} y1={pad.t - 6} y2={H - pad.b} stroke="#047857" strokeWidth={2} />
            <text x={x(filled)} y={pad.t - 8} textAnchor="middle" fontSize="11" fontWeight={700} fill="#047857">τώρα: {num(filled)}</text>
          </g>
        )}
      </svg>
      <figcaption className="text-[length:var(--fs-11)] text-muted-foreground">Τιμή ανά {unit} για όλους τους συμμετέχοντες, ανάλογα με τις παλέτες που έχουν κλειστεί.</figcaption>
    </figure>
  );
}
