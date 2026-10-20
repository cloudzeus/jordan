'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FiArrowRight, FiClock, FiMoreVertical, FiTrendingDown, FiUsers, FiX, FiBox, FiMaximize2 } from 'react-icons/fi';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { tierColor } from '@/components/site/tier-colors';
import { Container } from '@/components/site/ui';
import { cn } from '@/lib/utils';
import { ago, eur, num, pal, step, tierAt, tiersOf, type Activity, type AuctionItem, type Level } from './auction-shared';
import { BookingModal } from './booking-modal';
import { Countdown } from './countdown';
import { ProductModal } from './product-modal';

const ContainerScene = dynamic(() => import('@/components/admin/container-scene'), { ssr: false, loading: () => null });

// Χρώματα προϊόντων στο κοινό container (όχι πράσινα/τιρκουάζ: αυτά είναι οι ελεύθερες/επιλεγμένες θέσεις).
const SEG_COLORS = ['#C2410C', '#1D4ED8', '#7E22CE', '#BE185D', '#A16207', '#334155'];
const segColor = (i: number) => SEG_COLORS[i % SEG_COLORS.length];

const STONES = 9;
const stoneFor = (mtrl: number) => `/site/stones/stone-${(Math.abs(Math.imul(mtrl, 2654435761)) % STONES) + 1}.jpg`;

export type AuctionProps = {
  offerId: string; title: string; open: boolean; homeHref: string;
  items: AuctionItem[]; initialItemId: string;
  levels: Level[]; capacity: number; filled: number; pendingAll: number; minOrder: number;
  participants: number; closesAt: string | null; mine: number;
  myPending: { id: string; offerItemId: string; product: string; pallets: number; createdAt: string }[];
  activity: Activity[];
};

/**
 * Η «δημοπρασία» του κοινού container: σκηνή (φωτεινή, ύφος website) με το 3D container στο κέντρο και ζωντανό πάνελ
 * τιμής (τρέχουσα τιμή, πτώση %, γέμισμα με κλιμάκια, επόμενη πτώση, αντίστροφη μέτρηση, CTA), μετά η
 * «σκάλα» της τιμής με τη δραστηριότητα, και τα προϊόντα ως κάρτες που ανοίγουν modal με όλα τα στοιχεία.
 */
export function AuctionStage(p: AuctionProps) {
  const router = useRouter();
  const levels = React.useMemo(() => [...p.levels].sort((a, b) => a.fromPallets - b.fromPallets), [p.levels]);
  const multi = p.items.length > 1;
  const [selId, setSelId] = React.useState(p.initialItemId);
  const sel = p.items.find((i) => i.id === selId) ?? p.items[0];
  const tiers = React.useMemo(() => tiersOf(levels, sel.prices), [levels, sel.prices]);
  const cur = tierAt(tiers, p.filled);
  const curIdx = cur ? tiers.indexOf(cur) : 0;
  const next = tiers[curIdx + 1] ?? null;
  const first = tiers[0];
  const drop = first && cur && first.price > 0 ? ((first.price - cur.price) / first.price) * 100 : 0;
  const color = tierColor(curIdx, tiers.length);
  const free = Math.max(0, step(p.capacity - p.filled - p.pendingAll));
  const canBook = p.open && free >= p.minOrder;
  const pct = p.capacity > 0 ? Math.min(100, (p.filled / p.capacity) * 100) : 0;
  // Πολλά προϊόντα: κάθε γεμάτη παλέτα στο 3D με το χρώμα/φορτίο του προϊόντος της.
  const segments = React.useMemo(
    () => (multi ? p.items.map((it, i) => ({ pallets: it.active, load: it.load, color: segColor(i), label: it.name, perPallet: it.perPallet })) : undefined),
    [multi, p.items],
  );
  const selIdx = p.items.findIndex((i) => i.id === sel.id);

  // Κράτηση / modal προϊόντος
  const [booking, setBooking] = React.useState(false);
  const [bookItem, setBookItem] = React.useState(sel.id);
  const [pallets, setPallets] = React.useState(Math.max(p.minOrder, 1));
  const [productOpen, setProductOpen] = React.useState<string | null>(null);
  const openBooking = (n: number, itemId = sel.id) => {
    setBookItem(itemId);
    setPallets(Math.min(free, Math.max(p.minOrder, step(n))));
    setProductOpen(null);
    setBooking(true);
  };
  const choose = (id: string) => { setSelId(id); router.replace(`/dashboard/offers/${p.offerId}?p=${id}`, { scroll: false }); };

  // Μπάρες της «σκάλας»: μεγαλώνουν όταν φανούν (σέβεται reduced-motion μέσω CSS).
  const ladderRef = React.useRef<HTMLDivElement>(null);
  const [ladderIn, setLadderIn] = React.useState(false);
  React.useEffect(() => {
    const el = ladderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setLadderIn(true); io.disconnect(); } }, { threshold: 0.1 });
    io.observe(el);
    // Ασφάλεια: αν ο observer δεν «πιάσει» (π.χ. άλμα με anchor), οι μπάρες εμφανίζονται ούτως ή άλλως.
    const t = window.setTimeout(() => setLadderIn(true), 2500);
    return () => { io.disconnect(); window.clearTimeout(t); };
  }, []);
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => { setNow(Date.now()); }, []);

  const withdraw = async (id: string, n: number) => {
    if (!(await confirmAction({ title: 'Απόσυρση αιτήματος', message: `Να αποσυρθεί το αίτημα για ${pal(n)};`, confirmLabel: 'Απόσυρση', destructive: true }))) return;
    const res = await fetch(`/api/portal/offers/${p.offerId}/reservations/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).message ?? 'Αποτυχία'); return; }
    toast.success('Το αίτημα αποσύρθηκε');
    router.refresh();
  };

  const prices = tiers.map((t) => t.price);
  const pMax = Math.max(...prices), pMin = Math.min(...prices);
  const barH = (price: number) => 56 + ((price - pMin) / (pMax - pMin || 1)) * 150;
  const productItem = p.items.find((i) => i.id === productOpen) ?? null;

  return (
    <>
      {/* ══ Σκηνή ══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-[var(--s-paper)] text-[var(--s-ink)]">
        {/* λεπτό πλέγμα «σχεδίου» + φωτεινό κέντρο πίσω από το container — μόνο διακοσμητικά */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(#1C3241_1px,transparent_1px),linear-gradient(90deg,#1C3241_1px,transparent_1px)] [background-size:48px_48px]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_32%_45%,rgba(255,255,255,0.95),transparent_70%)]" />

        <Container className="relative pb-12 pt-8 lg:pb-16">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[length:var(--fs-13)] text-[var(--s-mute)]">
            <Link href={p.homeHref} className="underline-offset-4 hover:text-[var(--s-ink)] hover:underline">Προσφορές</Link>
            <span aria-hidden>/</span>
            <span className="truncate text-[var(--s-ink-2)]">{p.title}</span>
            {p.open && (
              <span className="ml-auto inline-flex items-center gap-2 border border-[#FCA5A5] bg-white px-2.5 py-1 text-[length:var(--fs-12)] font-medium uppercase tracking-[0.16em] text-[#B42318]">
                <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#F87171] opacity-75 motion-reduce:hidden" /><span className="relative inline-flex size-2 rounded-full bg-[#EF4444]" /></span>
                Ζωντανά
              </span>
            )}
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10">
            {/* 3D container */}
            <div className="relative min-w-0">
              <h1 className="font-site max-w-2xl text-[length:var(--fs-32)] font-light leading-tight">{p.title}</h1>
              <p className="mt-2 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">Κοινό container · όσο γεμίζει, η τιμή πέφτει για όλους{multi ? ` · ${p.items.length} προϊόντα` : ''}</p>
              <div className="relative mt-4 aspect-[16/11] w-full overflow-hidden">
                <ContainerScene
                  pallets={p.capacity} perPallet={sel.perPallet} filled={p.filled} load={sel.load}
                  labels={{ container: 'Container', pallet: 'ΠΑΛ', base: sel.unit }}
                  heightClass="h-full" expandable={false} fitScale={0.78}
                  onPickSlots={canBook ? (n) => openBooking(n) : undefined} selectedSlots={booking ? Math.ceil(pallets) : 0} maxSelectable={Math.ceil(free)}
                  segments={segments} highlightSegment={multi ? selIdx : null}
                  className="h-full [&>div>.pointer-events-none]:hidden [&>div]:rounded-none [&>div]:border-0 [&>div]:![background:transparent] [&_figcaption]:hidden"
                />
                {multi && <SegmentLegend items={p.items} selId={sel.id} onChoose={choose} className="absolute left-0 top-2 hidden w-[22rem] max-w-full flex-col xl:flex" />}
                <div className="pointer-events-none absolute bottom-3 left-0 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 border border-[var(--s-line)] bg-white/90 px-3 py-1.5 text-[length:var(--fs-13)] backdrop-blur-sm"><span className="size-2 rounded-full bg-[var(--s-ink)]" aria-hidden />Γεμάτες <b className="font-num font-normal">{num(p.filled)}</b></span>
                  <span className="inline-flex items-center gap-2 border border-[var(--s-line)] bg-white/90 px-3 py-1.5 text-[length:var(--fs-13)] backdrop-blur-sm"><span className="size-2 rounded-full ring-1 ring-[var(--s-mute)]" aria-hidden />Ελεύθερες <b className="font-num font-normal">{num(Math.max(0, p.capacity - p.filled))}</b></span>
                  {canBook && <span className="hidden items-center gap-2 border border-[#0F766E]/40 bg-white/90 px-3 py-1.5 text-[length:var(--fs-13)] text-[#0F766E] backdrop-blur-sm sm:inline-flex"><FiMaximize2 className="size-3.5" aria-hidden />Πατήστε σε ελεύθερη θέση</span>}
                </div>
              </div>
              {multi && <SegmentLegend items={p.items} selId={sel.id} onChoose={choose} className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:hidden" />}
            </div>

            {/* Ζωντανό πάνελ τιμής */}
            <aside aria-label="Τρέχουσα κατάσταση" className="min-w-0 self-start border border-[var(--s-line)] bg-white p-5 shadow-[0_24px_60px_-28px_rgba(28,50,65,0.35)] sm:p-6">
              {multi && (
                <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Προϊόν">
                  {p.items.map((it) => (
                    <button key={it.id} type="button" role="tab" aria-selected={it.id === sel.id} onClick={() => choose(it.id)}
                      className={cn('min-h-9 max-w-full cursor-pointer truncate border px-3 text-[length:var(--fs-13)] transition-colors', it.id === sel.id ? 'border-[var(--s-ink)] bg-[var(--s-ink)] text-white' : 'border-[var(--s-line)] text-[var(--s-ink-2)] hover:border-[var(--s-ink)] hover:text-[var(--s-ink)]')}>
                      {it.name}
                    </button>
                  ))}
                </div>
              )}

              <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">Τιμή τώρα{multi ? ` · ${sel.name}` : ''}</p>
              <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
                <p className="font-num text-[length:var(--fs-48)] font-light leading-none" style={{ color: drop > 0 ? color : undefined }}>{cur ? eur(cur.price) : '—'}</p>
                <p className="pb-1 text-[length:var(--fs-14)] text-[var(--s-mute)]">/ {sel.unit}</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
                {drop > 0 && first && <><s className="text-[var(--s-mute)]">{eur(first.price)}</s><span className="inline-flex items-center gap-1 px-2 py-0.5 font-medium" style={{ background: `${color}1f`, color }}><FiTrendingDown className="size-3.5" aria-hidden />−{num(drop, 1)}%</span></>}
                {drop === 0 && <span className="text-[var(--s-mute)]">Βασική τιμή — πέφτει με το πρώτο κλιμάκιο</span>}
              </div>

              {/* Γέμισμα με τα κλιμάκια */}
              <div className="mt-6">
                <div className="flex justify-between text-[length:var(--fs-13)] text-[var(--s-ink-2)]"><span><b className="font-num font-normal text-[var(--s-ink)]">{num(p.filled)}</b> / {num(p.capacity)} παλέτες</span><span>{Math.round(pct)}%</span></div>
                <div className="relative mt-2 h-2 bg-[var(--s-line)]" role="progressbar" aria-valuemin={0} aria-valuemax={p.capacity} aria-valuenow={p.filled} aria-label="Γέμισμα container">
                  <div className="absolute inset-y-0 left-0 origin-left transition-transform duration-1000 ease-out motion-reduce:transition-none" style={{ width: '100%', transform: `scaleX(${pct / 100})`, background: `linear-gradient(90deg, ${tierColor(0, tiers.length)}, ${color})` }} />
                  {tiers.slice(1).map((t, i) => (
                    <span key={t.level} className="absolute -top-1 h-4 w-0.5" style={{ left: `${(t.fromPallets / Math.max(1, p.capacity)) * 100}%`, background: p.filled >= t.fromPallets ? tierColor(i + 1, tiers.length) : '#CFC9C0' }} aria-hidden />
                  ))}
                </div>
                <p className="mt-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
                  {next
                    ? <>Επόμενη πτώση σε <b className="font-num font-normal text-[var(--s-ink)]">{num(Math.max(0.5, next.fromPallets - p.filled))}</b> παλέτες → <b className="font-num font-normal" style={{ color: tierColor(curIdx + 1, tiers.length) }}>{eur(next.price)}</b></>
                    : 'Καλύτερη τιμή — το container είναι στο χαμηλότερο κλιμάκιο.'}
                </p>
              </div>

              {/* Αντίστροφη μέτρηση */}
              <div className="mt-6 border-t border-[var(--s-line)] pt-5">
                <p className="mb-2 flex items-center gap-2 text-[length:var(--fs-12)] uppercase tracking-[0.16em] text-[var(--s-mute)]"><FiClock className="size-3.5" aria-hidden />{p.closesAt ? 'Κλείνει σε' : 'Προθεσμία'}</p>
                {p.closesAt ? <Countdown until={p.closesAt} tone="light" /> : <p className="text-[length:var(--fs-14)] text-[var(--s-ink-2)]">Κλείνει μόλις γεμίσει το container.</p>}
              </div>

              <dl className="mt-6 grid grid-cols-3 border-t border-[var(--s-line)] pt-5 text-center">
                <div><dt className="text-[length:var(--fs-11)] uppercase tracking-[0.12em] text-[var(--s-mute)]"><FiUsers className="mx-auto mb-1 size-4" aria-hidden />Συμμετέχοντες</dt><dd className="font-num mt-1 text-[length:var(--fs-20)]">{p.participants}</dd></div>
                <div><dt className="text-[length:var(--fs-11)] uppercase tracking-[0.12em] text-[var(--s-mute)]"><FiBox className="mx-auto mb-1 size-4" aria-hidden />Διαθέσιμες</dt><dd className="font-num mt-1 text-[length:var(--fs-20)]">{num(free)}</dd></div>
                <div><dt className="text-[length:var(--fs-11)] uppercase tracking-[0.12em] text-[var(--s-mute)]"><FiTrendingDown className="mx-auto mb-1 size-4" aria-hidden />Δικές σας</dt><dd className="font-num mt-1 text-[length:var(--fs-20)]">{num(p.mine)}</dd></div>
              </dl>

              <div className="mt-6">
                {canBook ? (
                  <>
                    <button type="button" onClick={() => openBooking(Math.max(p.minOrder, 1))} className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 bg-[var(--s-ink)] px-6 text-[length:var(--fs-15)] font-medium text-white transition-colors hover:bg-[#2C4556]">
                      Κλείστε παλέτες <FiArrowRight className="size-4" aria-hidden />
                    </button>
                    <p className="mt-2 text-center text-[length:var(--fs-12)] text-[var(--s-mute)]">ή πατήστε απευθείας σε ελεύθερη θέση στο container · από {pal(p.minOrder)}</p>
                  </>
                ) : (
                  <p className="border-l-2 border-[var(--s-line)] pl-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">{p.open ? 'Δεν υπάρχουν ελεύθερες θέσεις για νέα κράτηση.' : 'Η προσφορά έχει κλείσει.'}</p>
                )}
              </div>
            </aside>
          </div>
        </Container>
      </section>

      {/* ══ Σκάλα τιμής + δραστηριότητα ═════════════════════════════════════ */}
      <section className="border-y border-[var(--s-line)] bg-white text-[var(--s-ink)]">
        <Container className="grid gap-10 py-14 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14 lg:py-16">
          <div ref={ladderRef} className="min-w-0">
            <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">Η σκάλα της τιμής{multi ? ` · ${sel.name}` : ''}</p>
            <h2 className="font-site mt-2 text-[length:var(--fs-24)] font-light">Κάθε σκαλί, χαμηλότερη τιμή για όλους</h2>
            <ol className="mt-8 flex items-end gap-2 sm:gap-3" aria-label="Κλιμάκια τιμής">
              {tiers.map((t, i) => {
                const c = tierColor(i, tiers.length);
                const reached = i <= curIdx;
                const isCur = i === curIdx;
                const missing = i === curIdx + 1 ? Math.max(0.5, t.fromPallets - p.filled) : null;
                return (
                  <li key={t.level} className="flex min-w-0 flex-1 flex-col items-center">
                    <span className={cn('font-num whitespace-nowrap text-[length:var(--fs-13)] sm:text-[length:var(--fs-15)]', reached ? 'text-[var(--s-ink)]' : 'text-[var(--s-mute)]')}>{eur(t.price)}</span>
                    {isCur && <span className="mt-1 bg-[var(--s-ink)] px-1.5 text-[length:var(--fs-11)] font-semibold uppercase tracking-[0.12em] text-white">Τώρα</span>}
                    {missing != null && <span className="mt-1 whitespace-nowrap text-[length:var(--fs-11)] text-[var(--s-ink-2)]">−{num(missing)} παλ.</span>}
                    <div className="mt-2 w-full origin-bottom transition-transform duration-700 ease-out motion-reduce:transition-none"
                      style={{ height: barH(t.price), transform: `scaleY(${ladderIn ? 1 : 0.08})`, transitionDelay: `${i * 70}ms`,
                        background: reached ? c : 'transparent', border: reached ? 'none' : `1.5px dashed ${c}`,
                        boxShadow: isCur ? `0 0 0 2px #fff, 0 0 0 4px ${c}, 0 12px 28px ${c}55` : undefined, opacity: reached ? 1 : 0.8 }} />
                    <span className="mt-2 whitespace-nowrap text-[length:var(--fs-11)] text-[var(--s-mute)] sm:text-[length:var(--fs-12)]">{i === 0 ? 'Αρχή' : `${num(t.fromPallets)} παλ.`}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="min-w-0">
            <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">Δραστηριότητα</p>
            {p.activity.length === 0 ? (
              <p className="mt-4 border border-dashed border-[var(--s-line)] px-4 py-6 text-center text-[length:var(--fs-14)] text-[var(--s-ink-2)]">Καμία κράτηση ακόμη — η πρώτη θέση είναι δική σας.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {p.activity.map((a, i) => (
                  <li key={i} className="flex items-start gap-3 border border-[var(--s-line)] bg-[var(--s-paper)] px-3 py-2.5 text-[length:var(--fs-14)]">
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', a.dropTo ? 'bg-[#15803D]' : 'bg-[var(--s-mute)]')} aria-hidden />
                    <span className="min-w-0 flex-1 text-[var(--s-ink-2)]">
                      Ένας επαγγελματίας έκλεισε <b className="font-num font-normal text-[var(--s-ink)]">{pal(a.pallets)}</b>{multi && a.product ? <> · {a.product}</> : null}
                      {a.dropTo && <span className="mt-0.5 block text-[length:var(--fs-13)] text-[#15803D]">Η τιμή έπεσε στο {a.dropTo}ο κλιμάκιο{(() => { const t = tiers.find((x) => x.level === a.dropTo); return t ? ` · ${eur(t.price)}` : ''; })()}</span>}
                    </span>
                    <time dateTime={a.at} className="shrink-0 text-[length:var(--fs-12)] text-[var(--s-mute)]">{now ? ago(a.at, now) : ''}</time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Container>
      </section>

      {/* ══ Προϊόντα ═════════════════════════════════════════════════════════ */}
      <section className="bg-[var(--s-paper)]">
        <Container className="py-14 lg:py-16">
          <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">{multi ? `${p.items.length} προϊόντα στο container` : 'Το προϊόν'}</p>
          <h2 className="font-site mt-2 text-[length:var(--fs-24)] font-light">Δείτε τα από κοντά — φωτογραφίες, βίντεο, εφαρμογές, τεχνικά</h2>
          <ul className={cn('mt-8 grid grid-cols-1 gap-4', multi ? 'sm:grid-cols-2 lg:grid-cols-3' : 'max-w-xl')}>
            {p.items.map((it) => {
              const t = tierAt(tiersOf(levels, it.prices), p.filled);
              const f0 = it.prices[levels[0]?.level - 1];
              const thumb = it.detail.media.find((m) => m.kind !== 'VIDEO')?.thumb ?? it.detail.media.find((m) => m.kind !== 'VIDEO')?.url ?? stoneFor(it.mtrl);
              const videos = it.detail.media.filter((m) => m.kind === 'VIDEO').length;
              return (
                <li key={it.id} className="min-w-0">
                  <button type="button" onClick={() => setProductOpen(it.id)} className="group block w-full cursor-pointer bg-white text-left transition-shadow hover:shadow-[0_12px_40px_rgba(11,22,32,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--s-ink)]">
                    <div className="relative aspect-[4/3] overflow-hidden bg-[var(--s-paper)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumb} alt="" loading="lazy" className="s-img size-full object-cover" />
                      {videos > 0 && <span className="absolute left-3 top-3 bg-[#0B1620]/85 px-2 py-0.5 text-[length:var(--fs-12)] text-white">{videos} βίντεο</span>}
                    </div>
                    <div className="flex items-end justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-[length:var(--fs-15)]" title={it.name}>{it.name}</p>
                        <p className="mt-0.5 text-[length:var(--fs-12)] text-[var(--s-mute)]">{it.code}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-num text-[length:var(--fs-20)]" style={{ color }}>{t ? eur(t.price) : '—'}</p>
                        {f0 && t && t.price < f0 && <p className="text-[length:var(--fs-12)] text-[var(--s-mute)]"><s>{eur(f0)}</s></p>}
                      </div>
                    </div>
                    <span className="flex items-center gap-1.5 border-t border-[var(--s-line)] px-4 py-3 text-[length:var(--fs-13)] text-[var(--s-ink-2)] group-hover:text-[var(--s-ink)]">Όλα τα στοιχεία <FiArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden /></span>
                  </button>
                </li>
              );
            })}
          </ul>

          {p.myPending.length > 0 && (
            <div className="mt-12 max-w-2xl">
              <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">Τα αιτήματά σας σε αναμονή</p>
              <ul className="mt-3 border-t border-[var(--s-line)]">
                {p.myPending.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 border-b border-[var(--s-line)] py-3 text-[length:var(--fs-14)]">
                    <FiClock className="size-4 text-[#B45309]" aria-hidden />
                    <span>{multi && <span className="mr-1.5">{r.product} ·</span>}<b className="font-medium tabular-nums">{pal(r.pallets)}</b></span>
                    <span className="text-[length:var(--fs-13)] text-[var(--s-mute)]">περιμένει έγκριση</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="ml-auto inline-flex size-11 cursor-pointer items-center justify-center text-[var(--s-ink-2)] hover:text-[var(--s-ink)]" aria-label="Ενέργειες αιτήματος"><FiMoreVertical className="size-4" aria-hidden /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2" onSelect={() => withdraw(r.id, r.pallets)}><FiX className="size-3.5" aria-hidden /> Απόσυρση</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Container>
      </section>

      {/* ══ Κινητό: σταθερή μπάρα τιμής + CTA ══════════════════════════════════ */}
      {canBook && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--s-line)] bg-white/95 px-4 py-3 text-[var(--s-ink)] shadow-[0_-12px_30px_-20px_rgba(28,50,65,0.4)] backdrop-blur-sm lg:hidden" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-num text-[length:var(--fs-20)] leading-none">{cur ? eur(cur.price) : '—'}<span className="font-site text-[length:var(--fs-12)] text-[var(--s-mute)]"> / {sel.unit}</span></p>
              <p className="mt-1 truncate text-[length:var(--fs-12)] text-[var(--s-mute)]">{next ? `πτώση σε ${num(Math.max(0.5, next.fromPallets - p.filled))} παλ. → ${eur(next.price)}` : 'καλύτερη τιμή'}</p>
            </div>
            <button type="button" onClick={() => openBooking(Math.max(p.minOrder, 1))} className="min-h-11 shrink-0 cursor-pointer bg-[var(--s-ink)] px-5 text-[length:var(--fs-14)] font-medium text-white">Κλείστε</button>
          </div>
        </div>
      )}
      {canBook && <div className="h-20 lg:hidden" aria-hidden />}

      <BookingModal
        open={booking} onOpenChange={setBooking} offerId={p.offerId} items={p.items}
        itemId={bookItem} onItem={setBookItem} pallets={pallets} onPallets={setPallets}
        levels={levels} filled={p.filled} capacity={p.capacity} free={free} minOrder={p.minOrder}
      />
      <ProductModal
        item={productItem} open={!!productItem} onOpenChange={(o) => { if (!o) setProductOpen(null); }}
        levels={levels} filled={p.filled} canBook={canBook} onBook={() => productItem && openBooking(Math.max(p.minOrder, 1), productItem.id)}
      />
    </>
  );
}

/** Υπόμνημα του 3D: χρώμα + προϊόν + ενεργές παλέτες· πάτημα = επιλογή προϊόντος (τονίζεται και στο 3D). */
function SegmentLegend({ items, selId, onChoose, className }: { items: AuctionItem[]; selId: string; onChoose: (id: string) => void; className?: string }) {
  return (
    <ul aria-label="Παλέτες ανά προϊόν" className={cn('gap-1', className)}>
      {items.map((it, i) => {
        const on = it.id === selId;
        return (
          <li key={it.id} className="min-w-0">
            <button type="button" onClick={() => onChoose(it.id)} aria-pressed={on}
              className={cn('flex min-h-11 w-full cursor-pointer items-center gap-2 border bg-white/90 px-2.5 py-1 text-left text-[length:var(--fs-12)] backdrop-blur-sm transition-colors motion-reduce:transition-none xl:min-h-9',
                on ? 'border-[var(--s-ink)] text-[var(--s-ink)]' : 'border-[var(--s-line)] text-[var(--s-ink-2)] hover:border-[var(--s-ink)]')}>
              <span className="size-2.5 shrink-0" style={{ background: segColor(i), boxShadow: on ? `0 0 0 2px #fff, 0 0 0 3px ${segColor(i)}` : undefined }} aria-hidden />
              <span className={cn('min-w-0 flex-1 truncate', on && 'font-medium')} title={it.name}>{it.name}</span>
              <b className="font-num shrink-0 font-normal">{num(it.active)} παλ.</b>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
