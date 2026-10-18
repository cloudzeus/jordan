'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { FiTrendingDown } from 'react-icons/fi';
import { tierColor } from '@/components/site/tier-colors';

const ContainerScene = dynamic(() => import('@/components/admin/container-scene'), { ssr: false, loading: () => null });

const TIERS = [{ from: 0, price: 48 }, { from: 6, price: 45.1 }, { from: 11, price: 42.7 }, { from: 16, price: 40.8 }];
const CAP = 20;
const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });

/** Η 3D σκηνή απομονωμένη: ξαναχτίζεται ΜΟΝΟ όταν αλλάζει το (ακέραιο) γέμισμα. */
const Scene = React.memo(function Scene({ filled }: { filled: number }) {
  return (
    <ContainerScene pallets={CAP} perPallet={48} filled={filled} load="stones" labels={{ container: 'Container', pallet: 'ΠΑΛ', base: 'τ.μ.' }}
      heightClass="h-full" expandable={false} fitScale={0.86}
      className="h-full [&>div>.pointer-events-none]:hidden [&>div]:rounded-none [&>div]:border-0 [&>div]:![background:transparent] [&_figcaption]:hidden" />
  );
});

/** «Κρατήσεις» της επίδειξης: κάθε βήμα = μία κράτηση (παλέτες) — διακριτά, όπως στην πραγματική πύλη. */
const STEPS = [2, 1, 2, 1, 2, 1, 1, 2, 1, 2];
const START = 3;

/**
 * Κάρτα «ζωντανής» δημοπρασίας στο hero: το 3D container γεμίζει με διακριτές κρατήσεις (μία ανά ~1,1s),
 * η τιμή πέφτει στα κλιμάκια και στο τέλος ο βρόχος ξαναρχίζει. Η σκηνή ξαναχτίζεται ΜΟΝΟ ανά κράτηση,
 * καμία κλίση/blur πάνω στον καμβά (αυτά προκαλούσαν «τρεμόπαιγμα»), παύση όταν δεν φαίνεται.
 * Ενδεικτικά νούμερα — οι πραγματικές τιμές μόνο μετά τη σύνδεση.
 */
export function HeroLive() {
  const [filled, setFilled] = React.useState(START);
  const [last, setLast] = React.useState<{ n: number; k: number } | null>(null);
  const card = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setFilled(13); return; }
    let i = 0, f = START, visible = true, timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      timer = null;
      if (!visible || document.hidden) return;
      if (i >= STEPS.length) { i = 0; f = START; setFilled(f); setLast(null); timer = setTimeout(tick, 1400); return; }
      const n = STEPS[i++];
      f = Math.min(CAP, f + n);
      setFilled(f);
      setLast({ n, k: i });
      timer = setTimeout(tick, i >= STEPS.length ? 2600 : 1100);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !timer) timer = setTimeout(tick, 700);
    }, { threshold: 0.2 });
    if (card.current) io.observe(card.current);
    const onVis = () => { if (!document.hidden && visible && !timer) timer = setTimeout(tick, 500); };
    document.addEventListener('visibilitychange', onVis);
    return () => { if (timer) clearTimeout(timer); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const idx = TIERS.reduce((a, t, i) => (filled >= t.from ? i : a), 0);
  const c = tierColor(idx, TIERS.length);
  const drop = ((TIERS[0].price - TIERS[idx].price) / TIERS[0].price) * 100;

  return (
    <div>
      <div ref={card} className="relative border border-white/20 bg-[#0B1620]/80 p-4 text-white shadow-[0_40px_120px_-30px_rgba(0,0,0,0.7)] sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[length:var(--fs-11)] uppercase tracking-[0.2em] text-white/75">Κοινό container · Τραβερτίνης Classic</p>
          <span className="inline-flex items-center gap-1.5 text-[length:var(--fs-11)] font-medium uppercase tracking-[0.16em] text-[#FCA5A5]">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#F87171] opacity-75 motion-reduce:hidden" /><span className="relative inline-flex size-2 rounded-full bg-[#EF4444]" /></span>Live
          </span>
        </div>
        <div className="relative mt-2 aspect-[16/10] w-full">
          <Scene filled={filled} />
          {last && (
            <span key={last.k} className="s-pop absolute right-2 top-2 inline-flex items-center gap-1.5 bg-white px-2.5 py-1 text-[length:var(--fs-12)] font-medium text-[var(--s-ink)] shadow-lg">
              <span className="size-1.5 rounded-full bg-[#15803D]" aria-hidden />Νέα κράτηση · +{last.n} {last.n === 1 ? 'παλέτα' : 'παλέτες'}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-end justify-between gap-4 border-t border-white/20 pt-3">
          <div>
            <p className="text-[length:var(--fs-11)] uppercase tracking-[0.18em] text-white/70">Τιμή για όλους</p>
            <p className="font-num text-[length:var(--fs-40)] font-light leading-none tabular-nums" style={{ color: idx ? '#BEF264' : '#fff' }}>{eur(TIERS[idx].price)}<span className="text-[length:var(--fs-14)] text-white/70"> /τ.μ.</span></p>
          </div>
          <div className="text-right">
            {drop > 0 && <p className="inline-flex items-center gap-1 bg-white/15 px-2 py-0.5 text-[length:var(--fs-13)] font-medium text-[#BEF264]"><FiTrendingDown className="size-3.5" aria-hidden />−{drop.toLocaleString('el-GR', { maximumFractionDigits: 1 })}%</p>}
            <p className="mt-1 text-[length:var(--fs-13)] tabular-nums text-white/80">{filled.toLocaleString('el-GR')} / {CAP} παλέτες</p>
          </div>
        </div>
        <div className="mt-3 h-1 bg-white/20"><div className="h-full transition-[width] duration-700 ease-out" style={{ width: `${(filled / CAP) * 100}%`, background: `linear-gradient(90deg, ${tierColor(0, 4)}, ${c})` }} /></div>
      </div>
    </div>
  );
}
