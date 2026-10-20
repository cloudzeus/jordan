'use client';

import * as React from 'react';
import { FiChevronLeft, FiChevronRight, FiPlay, FiX } from 'react-icons/fi';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { tierColor } from '@/components/site/tier-colors';
import { btn } from '@/components/site/ui';
import { cn } from '@/lib/utils';
import { eur, num, tierAt, tiersOf, type AuctionItem, type Level, type MediaItem } from './auction-shared';

/** Ενδεικτικές εφαρμογές (Adobe Stock) όταν το είδος δεν έχει δικές του φωτογραφίες έργων. */
export const APPLICATIONS = [
  { src: '/site/apps/apartment.jpg', caption: 'Δάπεδο κατοικίας' },
  { src: '/site/bathroom.jpg', caption: 'Μπάνιο' },
  { src: '/site/apps/terrace.jpg', caption: 'Βεράντα & πέτρινοι τοίχοι' },
  { src: '/site/apps/kitchen.jpg', caption: 'Κουζίνα' },
  { src: '/site/apps/patio.jpg', caption: 'Αυλή' },
  { src: '/site/apps/stone-house.jpg', caption: 'Εξοχική κατοικία' },
];
const STONES = 9;
const stoneFor = (mtrl: number, k = 0) => `/site/stones/stone-${(Math.abs(Math.imul(mtrl + k, 2654435761)) % STONES) + 1}.jpg`;

type Tab = 'overview' | 'apps' | 'specs';

/**
 * Όλα για ένα προϊόν της προσφοράς σε ένα modal: μεγάλη προβολή (φωτογραφίες, βίντεο, πανοράματα) με
 * μικρογραφίες και πλοήγηση με βέλη, τιμή ανά κλιμάκιο, εφαρμογές και τεχνικά χαρακτηριστικά.
 */
export function ProductModal({ item, open, onOpenChange, levels, filled, onBook, canBook }: {
  item: AuctionItem | null; open: boolean; onOpenChange: (o: boolean) => void;
  levels: Level[]; filled: number; onBook: () => void; canBook: boolean;
}) {
  const [idx, setIdx] = React.useState(0);
  const [tab, setTab] = React.useState<Tab>('overview');
  React.useEffect(() => { if (open) { setIdx(0); setTab('overview'); } }, [open, item?.id]);
  if (!item) return null;

  // Χωρίς δικά του media: ενδεικτικές φωτογραφίες πέτρας (σήμανση) ώστε να μη μείνει άδειο.
  const own = item.detail.media;
  const media: (MediaItem & { placeholder?: boolean })[] = own.length
    ? own
    : [0, 1, 2].map((k) => ({ kind: 'IMAGE' as const, url: stoneFor(item.mtrl, k), thumb: stoneFor(item.mtrl, k), title: null, mime: 'image/jpeg', placeholder: true }));
  const cur = media[Math.min(idx, media.length - 1)];
  const go = (d: number) => setIdx((i) => (i + d + media.length) % media.length);
  const tiers = tiersOf(levels, item.prices);
  const now = tierAt(tiers, filled);
  const curIdx = now ? tiers.indexOf(now) : 0;
  const specs: [string, string][] = [
    ['Κωδικός', item.code],
    ...(item.detail.category ? [['Κατηγορία', item.detail.category] as [string, string]] : []),
    ...(item.detail.group ? [['Ομάδα', item.detail.group] as [string, string]] : []),
    ['Μονάδα', item.detail.unitName ?? item.unit],
    ['Ανά παλέτα', `${num(item.perPallet)} ${item.unit}`],
    ...item.detail.attributes.map((a) => [a.name, `${a.value}${a.unit ? ` ${a.unit}` : ''}`] as [string, string]),
  ];
  const videos = own.filter((m) => m.kind === 'VIDEO').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[94dvh] gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-[1100px]">
        <div className="site grid max-h-[94dvh] overflow-y-auto lg:grid-cols-[1.25fr_1fr] lg:overflow-hidden">
          {/* ── Προβολή media ── */}
          <div className="relative flex min-h-0 flex-col bg-(--s-paper)">
            <div className="relative aspect-4/3 w-full lg:aspect-auto lg:min-h-0 lg:flex-1"
              onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }} tabIndex={-1}>
              {cur.kind === 'VIDEO' ? (
                <video key={cur.url} src={cur.url} poster={cur.thumb ?? undefined} controls playsInline preload="metadata" className="absolute inset-0 size-full bg-black object-contain" aria-label={cur.title ?? `Βίντεο ${item.name}`} />
              ) : cur.kind === 'PANORAMA' ? (
                <div className="absolute inset-0 overflow-x-auto" aria-label="Πανόραμα — σύρετε οριζόντια">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cur.url} alt={cur.title ?? `Πανόραμα ${item.name}`} className="h-full max-w-none" />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={cur.url} src={cur.url} alt={cur.title ?? item.name} className="absolute inset-0 size-full object-cover" />
              )}
              {'placeholder' in cur && cur.placeholder && <span className="absolute bottom-3 left-3 bg-white/85 px-2 py-0.5 text-(length:--fs-11) text-(--s-ink-2)">Ενδεικτική φωτογραφία</span>}
              {media.length > 1 && (
                <>
                  <button type="button" onClick={() => go(-1)} className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 cursor-pointer place-items-center bg-white/85 text-(--s-ink) transition-colors hover:bg-white" aria-label="Προηγούμενο"><FiChevronLeft className="size-5" aria-hidden /></button>
                  <button type="button" onClick={() => go(1)} className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 cursor-pointer place-items-center bg-white/85 text-(--s-ink) transition-colors hover:bg-white" aria-label="Επόμενο"><FiChevronRight className="size-5" aria-hidden /></button>
                </>
              )}
            </div>
            {media.length > 1 && (
              <ul className="flex gap-2 overflow-x-auto p-3" aria-label="Μικρογραφίες">
                {media.map((m, i) => (
                  <li key={m.url + i}>
                    <button type="button" onClick={() => setIdx(i)} aria-current={i === idx} aria-label={`${m.kind === 'VIDEO' ? 'Βίντεο' : m.kind === 'PANORAMA' ? 'Πανόραμα' : 'Φωτογραφία'} ${i + 1}`}
                      className={cn('relative block size-16 shrink-0 cursor-pointer overflow-hidden border-2 transition-opacity', i === idx ? 'border-(--s-ink)' : 'border-transparent opacity-60 hover:opacity-100')}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {m.thumb ? <img src={m.thumb} alt="" className="size-full object-cover" /> : <span className="block size-full bg-(--s-line)" />}
                      {m.kind === 'VIDEO' && <span className="absolute inset-0 grid place-items-center bg-black/35 text-white"><FiPlay className="size-5" aria-hidden /></span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Στοιχεία ── */}
          <div className="relative flex min-h-0 flex-col bg-white">
            <button type="button" onClick={() => onOpenChange(false)} className="absolute right-3 top-3 z-10 grid size-11 cursor-pointer place-items-center text-(--s-ink-2) hover:text-(--s-ink)" aria-label="Κλείσιμο"><FiX className="size-5" aria-hidden /></button>
            <div className="px-6 pt-6 sm:px-8 sm:pt-8">
              <p className="text-(length:--fs-12) uppercase tracking-[0.18em] text-(--s-mute)">{item.code}{videos ? ` · ${videos} ${videos === 1 ? 'βίντεο' : 'βίντεο'}` : ''}</p>
              <DialogTitle className="font-site mt-2 pr-10 text-(length:--fs-24) font-light leading-tight">{item.name}</DialogTitle>
              <DialogDescription className="mt-3 flex items-baseline gap-2">
                <span className="font-num text-(length:--fs-32) font-light" style={{ color: tierColor(curIdx, tiers.length) }}>{now ? eur(now.price) : '—'}</span>
                <span className="text-(length:--fs-14) text-(--s-mute)">/ {item.unit} τώρα{tiers[0] && now && now.price < tiers[0].price ? <> · <s>{eur(tiers[0].price)}</s></> : ''}</span>
              </DialogDescription>
              <div role="tablist" aria-label="Ενότητες προϊόντος" className="mt-6 flex gap-6 border-b border-(--s-line)">
                {([['overview', 'Τιμές'], ['apps', 'Εφαρμογές'], ['specs', 'Τεχνικά']] as [Tab, string][]).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={cn('-mb-px min-h-11 cursor-pointer border-b-2 text-(length:--fs-14) transition-colors', tab === k ? 'border-(--s-ink) text-(--s-ink)' : 'border-transparent text-(--s-mute) hover:text-(--s-ink)')}>{l}</button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8" role="tabpanel">
              {tab === 'overview' && (
                <ol className="space-y-1.5">
                  {tiers.map((t, i) => {
                    const c = tierColor(i, tiers.length);
                    return (
                      <li key={t.level} className={cn('flex items-center gap-3 border px-3 py-2.5', i === curIdx ? 'border-(--s-ink)' : 'border-(--s-line)')}>
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: c, opacity: i <= curIdx ? 1 : 0.35 }} aria-hidden />
                        <span className="flex-1 text-(length:--fs-14) text-(--s-ink-2)">{i === 0 ? 'Από την αρχή' : `Από ${num(t.fromPallets)} παλέτες`}{i === curIdx && <b className="ml-2 font-medium text-(--s-ink)">· ισχύει τώρα</b>}</span>
                        <span className="font-num text-(length:--fs-18)" style={{ color: c }}>{eur(t.price)}</span>
                      </li>
                    );
                  })}
                  {item.detail.name2 && item.detail.name2 !== item.name && <li className="pt-4 text-(length:--fs-15) text-(--s-ink-2)">{item.detail.name2}</li>}
                </ol>
              )}
              {tab === 'apps' && (
                <>
                  <ul className="grid grid-cols-2 gap-3">
                    {APPLICATIONS.map((a) => (
                      <li key={a.src} className="relative aspect-4/3 overflow-hidden bg-(--s-paper)">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.src} alt={a.caption} loading="lazy" className="size-full object-cover" />
                        <span className="absolute bottom-0 left-0 bg-white/90 px-2 py-1 text-(length:--fs-12)">{a.caption}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-(length:--fs-12) text-(--s-mute)">Ενδεικτικές φωτογραφίες εφαρμογής.</p>
                </>
              )}
              {tab === 'specs' && (
                <dl className="border-t border-(--s-line)">
                  {specs.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[9rem_1fr] gap-4 border-b border-(--s-line) py-2.5 text-(length:--fs-14)"><dt className="text-(--s-mute)">{k}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
              )}
            </div>

            <div className="border-t border-(--s-line) px-6 py-4 sm:px-8">
              {canBook
                ? <button type="button" onClick={onBook} className={cn(btn.primary, 'w-full')}>Κλείστε παλέτες από αυτό το προϊόν</button>
                : <p className="text-(length:--fs-14) text-(--s-ink-2)">Δεν υπάρχουν ελεύθερες θέσεις για νέα κράτηση.</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
