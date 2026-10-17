'use client';

import * as React from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Ζωντανή αντίστροφη μέτρηση ως την προθεσμία συμμετοχής. Πρώτη απόδοση ΧΩΡΙΣ χρόνο (ίδια σε server
 * και client — όχι hydration mismatch), μετά ανά δευτερόλεπτο. Οι αλλαγές δεν «φωνάζουν» στους
 * αναγνώστες οθόνης (aria-live off)· το πλήρες κείμενο υπάρχει στο aria-label.
 */
export function Countdown({ until, tone = 'dark' }: { until: string; tone?: 'dark' | 'light' }) {
  const target = React.useMemo(() => new Date(until).getTime(), [until]);
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const left = now == null ? null : Math.max(0, target - now);
  const d = left == null ? null : Math.floor(left / 86_400_000);
  const h = left == null ? null : Math.floor((left % 86_400_000) / 3_600_000);
  const m = left == null ? null : Math.floor((left % 3_600_000) / 60_000);
  const s = left == null ? null : Math.floor((left % 60_000) / 1000);
  const ended = left === 0;
  const label = ended ? 'Η προθεσμία έληξε' : left == null ? '' : `Απομένουν ${d} ημέρες, ${h} ώρες, ${m} λεπτά`;
  const cell = tone === 'dark' ? 'border-white/15 bg-white/[0.06] text-white' : 'border-[var(--s-line)] bg-white text-[var(--s-ink)]';
  const sub = tone === 'dark' ? 'text-white/60' : 'text-[var(--s-mute)]';

  if (ended) return <p className={tone === 'dark' ? 'text-white/80' : 'text-[var(--s-ink-2)]'}>Η προθεσμία συμμετοχής έληξε.</p>;
  return (
    <div className="flex gap-2" role="timer" aria-live="off" aria-label={label}>
      {([['ημ.', d], ['ώρ.', h], ['λεπ.', m], ['δευτ.', s]] as const).map(([u, v]) => (
        <div key={u} className={`min-w-[3.25rem] border px-2 py-1.5 text-center ${cell}`}>
          <span className="font-num block text-[length:var(--fs-24)] font-light leading-none tabular-nums">{v == null ? '––' : u === 'ημ.' ? v : pad(v)}</span>
          <span className={`mt-1 block text-[length:var(--fs-11)] uppercase tracking-[0.12em] ${sub}`}>{u}</span>
        </div>
      ))}
    </div>
  );
}
