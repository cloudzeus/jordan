'use client';

import * as React from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FiCheck, FiFileText, FiMinus, FiPackage, FiPlus, FiSearch, FiTrendingDown, FiTruck } from 'react-icons/fi';
import { tierColor } from '@/components/site/tier-colors';
import { cn } from '@/lib/utils';
import { SectionMark } from '@/components/site/blueprint';

gsap.registerPlugin(ScrollTrigger);

/** Οι λειτουργίες της πύλης ως «οθόνες» προϊόντος σε προοπτική. Δεδομένα ενδεικτικά. */
const STEPS = [
  { k: 'offers', t: 'Δυναμικές προσφορές', d: 'Κοινά container με τιμή που πέφτει όσο γεμίζουν. Κλείνετε παλέτες με ένα πάτημα πάνω στο 3D container.' },
  { k: 'projects', t: 'Τα έργα σας, σε μία ματιά', d: 'Κάθε έργο με την πορεία του, τις ημερομηνίες και ό,τι έχει παραδοθεί ή τιμολογηθεί — χωρίς τηλέφωνα και email.' },
  { k: 'orders', t: 'Πού βρίσκεται η παραγγελία;', d: 'Από την παραγγελία στην αποστολή και στο τιμολόγιο: βλέπετε τι εκτελέστηκε και τι εκκρεμεί, ανά υλικό.' },
  { k: 'new', t: 'Παραγγελία σε ένα λεπτό', d: 'Αναζητάτε στον κατάλογο, ορίζετε ποσότητες και έργο, στέλνετε. Ή επαναλαμβάνετε μια παλιά παραγγελία.' },
] as const;

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });

function Frame({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full overflow-hidden border border-[var(--s-line)] bg-white text-[var(--s-ink)] shadow-[0_40px_90px_-40px_rgba(28,50,65,0.55)]', className)}>
      <div className="flex items-center gap-2 border-b border-[var(--s-line)] bg-[var(--s-paper)] px-4 py-2.5">
        <span className="size-2 rounded-full bg-[#E7E3DD]" /><span className="size-2 rounded-full bg-[#E7E3DD]" /><span className="size-2 rounded-full bg-[#E7E3DD]" />
        <span className="ml-3 truncate text-[length:var(--fs-12)] text-[var(--s-mute)]">atelier · {title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function OffersUI() {
  const rows = [{ n: 'Τραβερτίνης Classic', p: 42.7, f: 0.62, i: 2 }, { n: 'Limestone Moca', p: 61.2, f: 0.34, i: 1 }, { n: 'Τσιμεντοκονία Base', p: 18.9, f: 0.88, i: 3 }];
  return (
    <Frame title="Δυναμικές προσφορές">
      <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">3 ανοιχτά container</p>
      <ul className="mt-3 space-y-3">
        {rows.map((r) => (
          <li key={r.n} className="border border-[var(--s-line)] p-3">
            <div className="flex items-baseline justify-between gap-3"><span className="truncate text-[length:var(--fs-14)]">{r.n}</span><span className="font-num text-[length:var(--fs-20)]" style={{ color: tierColor(r.i, 4) }}>{eur(r.p)}</span></div>
            <div className="mt-2 h-1 bg-[var(--s-line)]"><div className="h-full" style={{ width: `${r.f * 100}%`, background: tierColor(r.i, 4) }} /></div>
            <p className="mt-1.5 flex items-center gap-1 text-[length:var(--fs-12)] text-[var(--s-ink-2)]"><FiTrendingDown className="size-3" aria-hidden /> επόμενη πτώση σε {Math.round((1 - r.f) * 8)} παλ.</p>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function ProjectsUI() {
  const ms = ['Μελέτη', 'Δείγματα', 'Παραγγελία', 'Αποστολή', 'Τοποθέτηση'];
  return (
    <Frame title="Έργα · Κατοικία Εκάλη">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[length:var(--fs-12)] text-[var(--s-mute)]">0000062</p><p className="font-display text-[length:var(--fs-24)]">Κατοικία Εκάλη</p></div>
        <span className="inline-flex items-center gap-1.5 bg-[#1C3241]/10 px-2 py-1 text-[length:var(--fs-12)] font-medium text-[#1C3241]"><span className="size-1.5 rounded-full bg-[#1C3241]" />Σε εξέλιξη</span>
      </div>
      <ol className="mt-5 grid grid-cols-5 gap-1.5">
        {ms.map((m, i) => <li key={m}><span className="block h-1" style={{ background: i < 3 ? '#15803D' : i === 3 ? '#1C3241' : '#E7E3DD' }} /><span className={cn('mt-1.5 block truncate text-[length:var(--fs-12)]', i <= 3 ? 'text-[var(--s-ink)]' : 'text-[var(--s-mute)]')}>{m}</span></li>)}
      </ol>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[var(--s-line)] pt-4">
        {[['Αξία', '48.260 €'], ['Πληρωμένα', '36.000 €'], ['Ανοιχτά', '2']].map(([k, v]) => <div key={k}><p className="text-[length:var(--fs-12)] uppercase tracking-[0.14em] text-[var(--s-mute)]">{k}</p><p className="font-num mt-1 text-[length:var(--fs-20)]">{v}</p></div>)}
      </div>
    </Frame>
  );
}

function OrdersUI() {
  const lines = [{ n: 'Τραβερτίνης 60×40×2', q: 130, e: 130 }, { n: 'Κόλλα C2TE 25kg', q: 40, e: 24 }, { n: 'Αρμόστοκος Beige', q: 12, e: 0 }];
  return (
    <Frame title="Παραγγελία ΠΑΡ0000064">
      <ol className="grid grid-cols-3 gap-1.5">
        {[['Παραγγελία', FiFileText], ['Αποστολή', FiTruck], ['Τιμολόγηση', FiCheck]].map(([s, Icon], i) => {
          const I = Icon as typeof FiFileText;
          return <li key={s as string} className="min-w-0"><span className="block h-1" style={{ background: i === 0 ? '#15803D' : i === 1 ? '#1C3241' : '#E7E3DD' }} /><span className={cn('mt-1.5 flex items-center gap-1 truncate text-[length:var(--fs-12)]', i <= 1 ? 'text-[var(--s-ink)]' : 'text-[var(--s-mute)]')}><I className="size-3 shrink-0" aria-hidden />{s as string}</span></li>;
        })}
      </ol>
      <ul className="mt-5 space-y-3">
        {lines.map((l) => (
          <li key={l.n}>
            <div className="flex justify-between gap-3 text-[length:var(--fs-13)]"><span className="truncate">{l.n}</span><span className="shrink-0 tabular-nums text-[var(--s-ink-2)]">{l.e}/{l.q}</span></div>
            <div className="mt-1.5 h-1 bg-[var(--s-line)]"><div className="h-full bg-[#15803D]" style={{ width: `${(l.e / l.q) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function NewOrderUI() {
  return (
    <Frame title="Νέα παραγγελία">
      <div className="flex h-10 items-center gap-2 border border-[var(--s-ink)] px-3 text-[length:var(--fs-14)]"><FiSearch className="size-4 text-[var(--s-mute)]" aria-hidden />τραβερτ<span className="h-4 w-px animate-pulse bg-[var(--s-ink)]" /></div>
      <ul className="mt-4 divide-y divide-[var(--s-line)] border-y border-[var(--s-line)]">
        {[['Τραβερτίνης Classic 60×40', 96, 'τ.μ.'], ['Τραβερτίνης Silver 40×40', 24, 'τ.μ.']].map(([n, q, u]) => (
          <li key={n as string} className="flex items-center justify-between gap-3 py-3">
            <span className="flex min-w-0 items-center gap-3"><span className="size-9 shrink-0 bg-[url(/site/stones/stone-3.jpg)] bg-cover" /><span className="truncate text-[length:var(--fs-13)]">{n}</span></span>
            <span className="flex shrink-0 items-center gap-1.5"><span className="grid size-7 place-items-center border border-[var(--s-line)]"><FiMinus className="size-3" /></span><span className="w-8 text-center text-[length:var(--fs-13)] tabular-nums">{q}</span><span className="grid size-7 place-items-center border border-[var(--s-line)]"><FiPlus className="size-3" /></span><span className="w-7 text-[length:var(--fs-12)] text-[var(--s-mute)]">{u}</span></span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex h-10 items-center justify-center gap-2 bg-[var(--s-ink)] text-[length:var(--fs-13)] font-medium text-white"><FiPackage className="size-4" aria-hidden />Αποστολή αιτήματος · 2 υλικά</div>
    </Frame>
  );
}

const UIS = [OffersUI, ProjectsUI, OrdersUI, NewOrderUI];

export function PortalShowcase() {
  const root = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    // ΧΩΡΙΣ pin: κάθε βήμα είναι ψηλό (desktop) και η «σκηνή» δεξιά είναι sticky· ενεργό = το βήμα στο κέντρο.
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px)', () => {
      const sts = gsap.utils.toArray<HTMLElement>('[data-step]', el).map((step, i) =>
        ScrollTrigger.create({ trigger: step, start: 'top 55%', end: 'bottom 55%', onToggle: (s) => { if (s.isActive) setActive(i); } }));
      return () => sts.forEach((s) => s.kill());
    });
    return () => mm.revert();
  }, []);

  return (
    <div ref={root} className="relative overflow-x-clip bg-[#0B1620] text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:48px_48px]" />
      <div aria-hidden className="pointer-events-none absolute -right-40 top-1/2 size-[60rem] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(122,92,67,0.35),transparent_60%)]" />

      <div className="relative mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-14 px-5 py-16 sm:px-8 md:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-12 lg:py-28">
        <div className="min-w-0">
          <p className="s-kicker text-[#D6B796]">Η περιοχή πελάτη</p>
          <h2 data-split className="font-display mt-5 text-[length:var(--fs-64)]">Το γραφείο σας, <em>online.</em></h2>
          <ol className="mt-10 space-y-2 lg:mt-0">
            {STEPS.map((s, i) => {
              const Ui = UIS[i];
              return (
                <li key={s.k} data-step className={cn('border-l-2 py-3 pl-5 transition-[border-color,opacity] duration-500 lg:flex lg:min-h-[62vh] lg:flex-col lg:justify-center', i === active ? 'border-[#D6B796] opacity-100' : 'border-white/15 lg:opacity-40')}>
                  <p className="flex items-baseline gap-3"><span className="font-num text-[length:var(--fs-14)] text-[#D6B796]">0{i + 1}</span><span className="font-display text-[length:var(--fs-28)]">{s.t}</span></p>
                  <p className="mt-2 max-w-md text-[length:var(--fs-15)] text-white/70">{s.d}</p>
                  {/* Κινητό: η «οθόνη» κάτω από κάθε βήμα */}
                  <div className="mt-6 min-w-0 lg:hidden"><Ui /></div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Desktop: οθόνες σε προοπτική — η ενεργή μπροστά, οι άλλες ριπιδωτά πίσω */}
        <div className="relative hidden lg:block" aria-hidden>
         <div className="sticky top-[calc(50dvh-17rem)] h-[34rem] [perspective:1600px]">
          <div className="absolute -left-6 top-6 text-white/40"><SectionMark letter="A" sheet={`0${active + 1}`} /></div>
          {UIS.map((Ui, i) => {
            const off = i - active;
            const style: React.CSSProperties = {
              transform: `translate3d(${off * 46}px, ${off * -30}px, ${-Math.abs(off) * 140}px) rotateY(-16deg) rotateX(6deg)`,
              opacity: off < 0 ? 0 : 1 - off * 0.25,
              zIndex: 10 - Math.abs(off),
              filter: off === 0 ? 'none' : 'saturate(0.6) brightness(0.92)',
            };
            return (
              <div key={i} className="absolute inset-x-0 top-12 transition-[transform,opacity,filter] duration-700 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none" style={style}>
                <Ui />
              </div>
            );
          })}
         </div>
        </div>
      </div>
    </div>
  );
}
