'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FiArrowDown, FiCheck, FiMail, FiMousePointer, FiTrendingDown, FiUsers } from 'react-icons/fi';
import { tierColor } from '@/components/site/tier-colors';
import { cn } from '@/lib/utils';

gsap.registerPlugin(ScrollTrigger);

const ContainerScene = dynamic(() => import('@/components/admin/container-scene'), { ssr: false, loading: () => null });

type Tier = { from: number; price: number };

const eur = (n: number, d = 2) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d });
const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 1 });

/** Το «σενάριο» μιας δυναμικής προσφοράς σε 5 κεφάλαια — η κύλιση είναι ο χρόνος. */
const CHAPTERS = [
  { at: 0, t: 'Ανοίγει ένα κοινό container', d: 'Επιλεγμένα υλικά, συγκεκριμένη χωρητικότητα, βασική τιμή. Η πρόσκληση φτάνει με email σε όσους αφορά.' },
  { at: 1, t: 'Οι πρώτοι επαγγελματίες κλείνουν θέσεις', d: 'Αρχιτέκτονες και κατασκευαστές κλείνουν όσες παλέτες χρειάζονται — από μισή παλέτα. Όλοι βλέπουν το γέμισμα ζωντανά, ανώνυμα.' },
  { at: 6, t: 'Πέρασε κλιμάκιο — η τιμή έπεσε για όλους', d: 'Μόλις το γέμισμα φτάσει το επόμενο σκαλί, η τιμή κατεβαίνει για κάθε συμμετέχοντα, ακόμη και για όσους έκλεισαν πρώτοι.' },
  { at: 11, t: 'Κλείνετε κι εσείς — με ένα πάτημα', d: 'Πατάτε στον ελεύθερο χώρο του container και επιλέγετε παλέτες. Εμείς εγκρίνουμε και η κράτηση μετρά στο γέμισμα.' },
  { at: 16, t: 'Το container κλείνει — ίδια τιμή για όλους', d: 'Όλοι πληρώνουν την ίδια, χαμηλότερη τιμή. Η παραγγελία σας περνά στα έργα και τις παραγγελίες σας στην πύλη.' },
] as const;

/** Γεγονότα που «σκάνε» πάνω στη σκηνή όπως στην πραγματική πύλη. */
const EVENTS = [
  { at: 1.5, icon: FiUsers, tone: '#1C3241', t: 'Ένας αρχιτέκτονας έκλεισε 3 παλέτες' },
  { at: 4, icon: FiUsers, tone: '#1C3241', t: 'Κατασκευαστική έκλεισε 2 παλέτες' },
  { at: 6, icon: FiMail, tone: '#15803D', t: 'Email · «Η τιμή έπεσε στο 2ο κλιμάκιο»' },
  { at: 11, icon: FiMousePointer, tone: '#7A5C43', t: 'Η κράτησή σας · 4 παλέτες — σε έγκριση' },
  { at: 12.5, icon: FiCheck, tone: '#15803D', t: 'Εγκρίθηκε · μετράει στο γέμισμα' },
  { at: 16, icon: FiMail, tone: '#15803D', t: 'Email · «Καλύτερη τιμή για όλους»' },
] as const;

const MY_PALLETS = 4;

/** Η 3D σκηνή απομονωμένη (memo): δεν ξαναζωγραφίζεται όταν αλλάζουν μόνο νούμερα/μπάρες. */
const Scene = React.memo(function Scene({ capacity, perPallet, unit, filled, picked }: { capacity: number; perPallet: number; unit: string; filled: number; picked: number }) {
  return (
    <ContainerScene
      pallets={capacity} perPallet={perPallet} filled={filled} load="stones"
      labels={{ container: 'Container', pallet: 'ΠΑΛ', base: unit }}
      heightClass="h-full" expandable={false} fitScale={0.8}
      selectedSlots={picked} maxSelectable={MY_PALLETS}
      className="h-full [&>div>.pointer-events-none]:hidden [&>div]:rounded-none [&>div]:border-0 [&>div]:![background:transparent] [&_figcaption]:hidden"
    />
  );
});

/**
 * Η δυναμική προσφορά ως ιστορία: η κύλιση γεμίζει το 3D container, η τιμή πέφτει κλιμάκιο-κλιμάκιο, τα
 * κεφάλαια εξηγούν τι συμβαίνει και τα «γεγονότα» της πύλης εμφανίζονται πάνω στη σκηνή. Χωρίς pin:
 * η ενότητα είναι ψηλή και η σκηνή sticky (ομαλή, εγγενής κύλιση). Ενδεικτικά νούμερα.
 */
export function AuctionStory({ capacity = 20, tiers, product, unit = 'τ.μ.', perPallet = 48 }: { capacity?: number; tiers: Tier[]; product: string; unit?: string; perPallet?: number }) {
  const root = React.useRef<HTMLDivElement>(null);
  // Δύο ρυθμοί: τα νούμερα/μπάρες/διάγραμμα κυλούν ομαλά (κάθε frame, φθηνά)· η 3D σκηνή —που ΞΑΝΑΧΤΙΖΕΤΑΙ
  // σε κάθε αλλαγή γεμίσματος— αλλάζει μόνο σε ακέραιες παλέτες και το πολύ ~8 φορές το δευτερόλεπτο.
  const [filled, setFilled] = React.useState(0);
  const [sceneFilled, setSceneFilled] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setFilled(capacity); setSceneFilled(capacity); return; }

    const proxy = { v: 0 };
    let sceneAt = 0, sceneTimer: ReturnType<typeof setTimeout> | null = null, sceneLast = -1;
    const pushScene = () => {
      const n = Math.floor(proxy.v + 1e-6);
      if (n === sceneLast) return;
      const wait = 125 - (performance.now() - sceneAt);
      if (wait > 0) { if (!sceneTimer) sceneTimer = setTimeout(() => { sceneTimer = null; pushScene(); }, wait); return; }
      sceneLast = n; sceneAt = performance.now(); setSceneFilled(n);
    };
    const glide = gsap.quickTo(proxy, 'v', {
      duration: 0.35, ease: 'power3.out',
      onUpdate: () => { setFilled(Math.round(proxy.v * 10) / 10); pushScene(); },
    });

    // «Κεφαλή ανάγνωσης» που προχωρά ΓΡΗΓΟΡΟΤΕΡΑ από την κύλιση όταν ο χρήστης κυλά γρήγορα (velocity boost),
    // ώστε η ιστορία να μη «φρενάρει» ποτέ τη σελίδα. Δεν μένει ποτέ πίσω από την πραγματική πρόοδο.
    let head = 0, prev = 0;
    const st = ScrollTrigger.create({
      trigger: el, start: 'top top', end: 'bottom bottom',
      onUpdate: (s) => {
        const delta = s.progress - prev;
        prev = s.progress;
        const boost = 1.35 + Math.min(1.6, Math.abs(s.getVelocity()) / 1800);
        head = Math.min(1, Math.max(0, head + delta * boost));
        if (delta > 0) head = Math.max(head, s.progress);
        else head = Math.min(head, Math.min(1, s.progress * 1.8));
        if (s.progress >= 0.999) head = 1;
        if (s.progress <= 0.001) head = 0;
        glide(head * capacity);
      },
    });
    return () => { st.kill(); if (sceneTimer) clearTimeout(sceneTimer); gsap.killTweensOf(proxy); };
  }, [capacity]);

  const skip = () => {
    const el = root.current;
    if (!el) return;
    const y = el.getBoundingClientRect().bottom + window.scrollY - 60;
    const lenis = (window as unknown as { __lenis?: { scrollTo: (y: number, o?: object) => void } }).__lenis;
    if (lenis) lenis.scrollTo(y, { duration: 1.1 }); else window.scrollTo({ top: y, behavior: 'smooth' });
  };

  const idx = tiers.reduce((acc, t, i) => (filled + 1e-9 >= t.from ? i : acc), 0);
  const cur = tiers[idx];
  const next = tiers[idx + 1];
  const base = tiers[0].price;
  const drop = ((base - cur.price) / base) * 100;
  const color = tierColor(idx, tiers.length);
  const pct = (filled / capacity) * 100;
  const chapter = CHAPTERS.reduce((a, c, i) => (filled + 1e-9 >= c.at ? i : a), 0);
  const ch = CHAPTERS[chapter];
  const events = EVENTS.filter((e) => filled + 1e-9 >= e.at).slice(-3).reverse();
  const saving = (base - cur.price) * MY_PALLETS * perPallet;

  // Διάγραμμα: σκαλοπάτια τιμής ανά παλέτες.
  const W = 400, H = 120, pad = 8;
  const pMin = tiers[tiers.length - 1].price;
  const y = (p: number) => pad + ((base - p) / (base - pMin || 1)) * (H - pad * 2);
  const x = (pal: number) => (pal / capacity) * W;
  const d = tiers.map((t, i) => `${i === 0 ? 'M' : 'L'}${x(t.from)},${y(t.price)} L${x(tiers[i + 1]?.from ?? capacity)},${y(t.price)}`).join(' ');

  return (
    <div ref={root} className="relative h-[230vh] bg-[var(--s-paper)] lg:h-[270vh]">
      <div className="sticky top-16 flex h-[calc(100dvh-4rem)] items-center overflow-hidden md:top-20 md:h-[calc(100dvh-5rem)]">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(#1C3241_1px,transparent_1px),linear-gradient(90deg,#1C3241_1px,transparent_1px)] [background-size:48px_48px]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_32%_50%,rgba(255,255,255,0.95),transparent_70%)]" />

        {/* Πρόοδος κεφαλαίων (πάνω) */}
        <ol className="absolute inset-x-0 top-0 z-10 mx-auto flex w-full max-w-[1280px] gap-1.5 px-5 pt-4 sm:px-8 lg:px-12" aria-label="Κεφάλαια">
          {CHAPTERS.map((c, i) => (
            <li key={c.t} className="h-0.5 flex-1 bg-[var(--s-line)]" aria-current={i === chapter ? 'step' : undefined}>
              <span className="block h-full bg-[var(--s-ink)] transition-[width] duration-300" style={{ width: i < chapter ? '100%' : i === chapter ? '55%' : '0%' }} />
            </li>
          ))}
        </ol>

        <button type="button" onClick={skip} className="absolute bottom-4 right-5 z-10 inline-flex min-h-11 cursor-pointer items-center gap-2 border border-[var(--s-line)] bg-white/90 px-4 text-[length:var(--fs-13)] text-[var(--s-ink-2)] transition-colors hover:border-[var(--s-ink)] hover:text-[var(--s-ink)] sm:right-8 lg:right-12">
          Παράλειψη <FiArrowDown className="size-3.5" aria-hidden />
        </button>

        <div className="relative mx-auto grid w-full max-w-[1280px] items-center gap-4 px-5 sm:px-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-12 lg:px-12">
          <div className="min-w-0">
            <p className="s-kicker text-[var(--s-accent)]">Δυναμική προσφορά · {String(chapter + 1).padStart(2, '0')} / 05</p>
            <div className="relative mt-3 min-h-[7.5rem] lg:min-h-[10rem]" aria-live="polite">
              {CHAPTERS.map((c, i) => (
                <div key={c.t} className={cn('absolute inset-x-0 top-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.2,0,0,1)]', i === chapter ? 'translate-y-0 opacity-100' : i < chapter ? '-translate-y-4 opacity-0' : 'translate-y-4 opacity-0')} aria-hidden={i !== chapter}>
                  <h2 className="font-display text-[length:var(--fs-32)] lg:text-[length:var(--fs-48)]">{c.t}</h2>
                  <p className="mt-2 hidden max-w-xl text-[length:var(--fs-16)] text-[var(--s-ink-2)] sm:block">{c.d}</p>
                </div>
              ))}
            </div>
            <div className="relative aspect-[16/10] w-full lg:aspect-[16/9]">
              <Scene capacity={capacity} perPallet={perPallet} unit={unit} filled={sceneFilled} picked={chapter === 3 ? MY_PALLETS : 0} />
              {/* «Κέρσορας» που κλείνει θέσεις στο κεφάλαιο 4 */}
              <span aria-hidden className={cn('pointer-events-none absolute left-[62%] top-[46%] transition-[opacity,transform] duration-700', chapter === 3 ? 'scale-100 opacity-100' : 'scale-75 opacity-0')}>
                <span className="absolute -left-3 -top-3 size-8 animate-ping rounded-full bg-[#7A5C43]/40 motion-reduce:hidden" />
                <FiMousePointer className="relative size-7 fill-white text-[var(--s-ink)] drop-shadow" />
              </span>
              {/* Γεγονότα της πύλης */}
              <ul className="absolute bottom-1 left-0 hidden w-[19rem] flex-col gap-2 sm:flex" aria-label="Δραστηριότητα">
                {events.map((e, i) => (
                  <li key={e.t} className="flex items-center gap-3 border border-[var(--s-line)] bg-white/95 px-3 py-2 text-[length:var(--fs-13)] shadow-[0_12px_30px_-18px_rgba(28,50,65,0.5)] transition-opacity duration-500" style={{ opacity: 1 - i * 0.28 }}>
                    <span className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: `${e.tone}14`, color: e.tone }}><e.icon className="size-3.5" aria-hidden /></span>
                    <span className="min-w-0 truncate">{e.t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="min-w-0 border border-[var(--s-line)] bg-white p-4 shadow-[0_24px_60px_-28px_rgba(28,50,65,0.35)] sm:p-6 lg:p-8">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">Τιμή για όλους · {product}</p>
              <span className="inline-flex shrink-0 items-center gap-2 border border-[#FCA5A5] px-2 py-0.5 text-[length:var(--fs-11)] font-medium uppercase tracking-[0.16em] text-[#B42318]">
                <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#F87171] opacity-75 motion-reduce:hidden" /><span className="relative inline-flex size-2 rounded-full bg-[#EF4444]" /></span>{chapter === 4 ? 'Έκλεισε' : 'Ζωντανά'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-x-3">
              <p className="font-num text-[length:var(--fs-48)] font-light leading-none tabular-nums transition-colors duration-500 lg:text-[length:var(--fs-72)]" style={{ color }}>{eur(cur.price)}</p>
              <p className="pb-1 text-[length:var(--fs-14)] text-[var(--s-mute)] lg:pb-2">/ {unit}</p>
            </div>
            <div className="mt-2 flex h-7 items-center gap-2 text-[length:var(--fs-13)]">
              {drop > 0
                ? <><s className="text-[var(--s-mute)]">{eur(base)}</s><span className="inline-flex items-center gap-1 px-2 py-0.5 font-medium" style={{ background: `${color}1f`, color }}><FiTrendingDown className="size-3.5" aria-hidden />−{num(drop)}%</span></>
                : <span className="text-[var(--s-mute)]">Βασική τιμή</span>}
            </div>

            <div className="mt-4 lg:mt-6">
              <div className="flex justify-between text-[length:var(--fs-13)] text-[var(--s-ink-2)]"><span>Γέμισμα · <b className="font-num font-normal tabular-nums text-[var(--s-ink)]">{num(filled)}</b> / {capacity} παλέτες</span><span className="tabular-nums">{Math.round(pct)}%</span></div>
              <div className="relative mt-2 h-2 bg-[var(--s-line)]" role="progressbar" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={filled} aria-label="Γέμισμα container">
                <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tierColor(0, tiers.length)}, ${color})` }} />
                {tiers.slice(1).map((t, i) => (
                  <span key={t.from} className="absolute -top-1 h-4 w-0.5" style={{ left: `${(t.from / capacity) * 100}%`, background: filled >= t.from ? tierColor(i + 1, tiers.length) : '#CFC9C0' }} aria-hidden />
                ))}
              </div>
              <p className="mt-3 min-h-6 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
                {next ? <>Επόμενη πτώση σε <b className="font-num font-normal text-[var(--s-ink)]">{num(Math.max(0.5, next.from - filled))}</b> παλέτες → <b className="font-num font-normal" style={{ color: tierColor(idx + 1, tiers.length) }}>{eur(next.price)}</b></> : 'Χαμηλότερο κλιμάκιο — η καλύτερη τιμή για όλους.'}
              </p>
            </div>

            <figure className="mt-4 hidden border-t border-[var(--s-line)] pt-4 md:block lg:mt-6 lg:pt-5">
              <figcaption className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">Η σκάλα της τιμής</figcaption>
              <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full overflow-visible" role="img" aria-label={`Η τιμή πέφτει από ${eur(base)} σε ${eur(pMin)} όσο γεμίζει το container`}>
                <defs><clipPath id="as-clip"><rect x="0" y="-10" height={H + 20} width={x(filled)} /></clipPath></defs>
                {tiers.map((t) => <line key={t.from} x1={x(t.from)} x2={x(t.from)} y1={0} y2={H} stroke="#E7E3DD" strokeDasharray="2 4" />)}
                <path d={d} fill="none" stroke="#CFC9C0" strokeWidth="1.5" strokeDasharray="4 5" />
                <path d={d} fill="none" stroke={color} strokeWidth="3" clipPath="url(#as-clip)" />
                <circle cx={x(filled)} cy={y(cur.price)} r="6" fill="#fff" stroke={color} strokeWidth="3" />
                {tiers.map((t, i) => <text key={`t${t.from}`} x={x(t.from) + 4} y={y(t.price) - 8} fontSize="13" fill={i <= idx ? tierColor(i, tiers.length) : '#8A847C'}>{eur(t.price)}</text>)}
              </svg>
            </figure>

            {/* Τι σημαίνει για εσάς */}
            <div className={cn('mt-4 border-t border-[var(--s-line)] pt-4 transition-opacity duration-500 lg:mt-5', chapter >= 3 ? 'opacity-100' : 'opacity-40')}>
              <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">Για τις {MY_PALLETS} παλέτες σας ({MY_PALLETS * perPallet} {unit})</p>
              <p className="mt-1 flex items-baseline gap-2"><span className="font-num text-[length:var(--fs-32)] tabular-nums" style={{ color: saving > 0 ? '#15803D' : undefined }}>{eur(saving, 0)}</span><span className="text-[length:var(--fs-14)] text-[var(--s-ink-2)]">εξοικονόμηση</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
