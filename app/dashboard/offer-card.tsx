import Link from 'next/link';
import { FiArrowRight, FiClock, FiTrendingDown } from 'react-icons/fi';
import type { PortalOffer } from '@/lib/portal-data';
import { ProductPlaceholder } from '@/components/site/visuals';
import { tierColor } from '@/components/site/tier-colors';
import { CropMarks } from '@/components/site/blueprint';

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });

function daysLeft(iso: string | null) {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return d <= 0 ? 'κλείνει σήμερα' : d === 1 ? 'κλείνει αύριο' : `κλείνει σε ${d} ημέρες`;
}

/**
 * Κάρτα κοινού container — ίδια γλώσσα με τη «δημοπρασία»: φωτογραφία με σημάδια κοπής, τιμή στο χρώμα
 * του κλιμακίου, μικρή σκάλα τιμής (σκαλοπάτια) και γέμισμα. Για αρχικές και λίστες του portal.
 */
export function OfferCard({ o, big = false }: { o: PortalOffer; big?: boolean }) {
  const idx = Math.max(0, o.levels.findIndex((t) => t.level === o.currentLevel));
  const color = tierColor(idx, o.levels.length);
  const lead = o.items[0];
  const tiers = (lead?.tiers ?? []) as { fromPallets: number; price: number }[];
  const first = tiers[0]?.price;
  const cur = lead?.current?.price;
  const drop = first && cur ? ((first - cur) / first) * 100 : 0;
  const W = 200, H = 54;
  const pMax = Math.max(...tiers.map((t) => t.price), 1), pMin = Math.min(...tiers.map((t) => t.price), 0);
  const x = (p: number) => (p / Math.max(1, o.capacity)) * W;
  const y = (p: number) => 4 + ((pMax - p) / (pMax - pMin || 1)) * (H - 8);
  const path = tiers.map((t, i) => `${i ? 'L' : 'M'}${x(t.fromPallets)},${y(t.price)} L${x(tiers[i + 1]?.fromPallets ?? o.capacity)},${y(t.price)}`).join(' ');
  const closes = o.status === 'OPEN' ? daysLeft(o.closesAt) : null;

  return (
    <Link href={`/dashboard/offers/${o.id}`} className="group relative block bg-white text-[var(--s-ink)] transition-shadow duration-300 hover:shadow-[0_24px_60px_-28px_rgba(28,50,65,0.45)]">
      <div className={big ? 'relative aspect-[16/10] overflow-hidden bg-[var(--s-paper)]' : 'relative aspect-[4/3] overflow-hidden bg-[var(--s-paper)]'}>
        {o.photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={o.photo} alt="" className="s-img size-full object-cover" />
          : <ProductPlaceholder mtrl={lead?.mtrl ?? 0} name={o.title} label={false} />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1620]/70 via-transparent to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {o.status === 'OPEN'
            ? <span className="inline-flex items-center gap-1.5 bg-white/95 px-2.5 py-1 text-[length:var(--fs-11)] font-medium uppercase tracking-[0.16em] text-[#B42318]"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#F87171] opacity-75 motion-reduce:hidden" /><span className="relative inline-flex size-2 rounded-full bg-[#EF4444]" /></span>Ζωντανά</span>
            : <span className="bg-white/95 px-2.5 py-1 text-[length:var(--fs-11)] font-medium uppercase tracking-[0.16em] text-[var(--s-ink-2)]">Έκλεισε</span>}
          {o.items.length > 1 && <span className="bg-white/95 px-2.5 py-1 text-[length:var(--fs-11)] uppercase tracking-[0.12em]">{o.items.length} προϊόντα</span>}
        </div>
        {(o.mine > 0 || o.myPending.length > 0) && (
          <span className="absolute right-3 top-3 bg-[var(--s-ink)] px-2.5 py-1 text-[length:var(--fs-12)] text-white">{o.mine > 0 ? `Δικές σας: ${num(o.mine)} παλ.` : 'Αίτημα σε αναμονή'}</span>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white">
          <p className="font-display min-w-0 text-[length:var(--fs-24)] leading-tight">{o.title}</p>
          {cur != null && (
            <p className="shrink-0 text-right">
              <span className="font-num block text-[length:var(--fs-28)] leading-none">{eur(cur)}</span>
              <span className="text-[length:var(--fs-12)] text-white/80">/ {lead?.baseUnit ?? 'τ.μ.'}</span>
            </p>
          )}
        </div>
      </div>

      <div className="relative p-4">
        <div className="flex items-end gap-4">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-1/2 shrink-0 overflow-visible" aria-hidden>
            <defs><clipPath id={`oc-${o.id}`}><rect x="0" y="-6" height={H + 12} width={x(o.filled)} /></clipPath></defs>
            <path d={path} fill="none" stroke="#E7E3DD" strokeWidth="2" />
            <path d={path} fill="none" stroke={color} strokeWidth="2.5" clipPath={`url(#oc-${o.id})`} />
            {cur != null && <circle cx={x(o.filled)} cy={y(cur)} r="4" fill="#fff" stroke={color} strokeWidth="2.5" />}
          </svg>
          <div className="min-w-0 flex-1 text-right">
            {drop > 0
              ? <p className="inline-flex items-center gap-1 px-2 py-0.5 text-[length:var(--fs-13)] font-medium" style={{ color, background: `${color}14` }}><FiTrendingDown className="size-3.5" aria-hidden />−{num(Math.round(drop * 10) / 10)}%</p>
              : <p className="text-[length:var(--fs-13)] text-[var(--s-mute)]">βασική τιμή</p>}
            <p className="mt-1 text-[length:var(--fs-12)] text-[var(--s-ink-2)]">{o.nextLevel ? <>πτώση σε <b className="font-medium tabular-nums">{num(o.nextLevel.missing)}</b> παλ.</> : 'καλύτερη τιμή'}</p>
          </div>
        </div>
        <div className="relative mt-3 h-1.5 bg-[var(--s-line)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(o.percent)} aria-label="Γέμισμα container">
          <div className="absolute inset-y-0 left-0" style={{ width: `${o.percent}%`, background: `linear-gradient(90deg, ${tierColor(0, o.levels.length)}, ${color})` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[length:var(--fs-12)] text-[var(--s-ink-2)]">
          <span className="tabular-nums">{num(o.filled)} / {num(o.capacity)} παλέτες · {o.customers} συμμετέχοντες</span>
          {closes ? <span className="inline-flex items-center gap-1"><FiClock className="size-3" aria-hidden />{closes}</span> : <FiArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />}
        </div>
        <CropMarks className="text-[var(--s-line)] opacity-0 transition-opacity group-hover:opacity-100" size={12} />
      </div>
    </Link>
  );
}
