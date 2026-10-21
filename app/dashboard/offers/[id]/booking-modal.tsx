'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiCheck, FiMinus, FiPlus, FiX } from 'react-icons/fi';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { tierColor } from '@/components/site/tier-colors';
import { btn, inputCls } from '@/components/site/ui';
import { cn } from '@/lib/utils';
import { eur, num, pal, step, tierAt, tiersOf, type AuctionItem, type Level } from './auction-shared';

/**
 * Modal κράτησης: προϊόν + παλέτες (βήμα ½) με «τιμή τώρα → με την κράτησή σας» και ενδεικτικό σύνολο.
 * Στέλνει ΑΙΤΗΜΑ (εγκρίνεται από την εταιρεία· μόνο τότε μετράει στο γέμισμα).
 */
export function BookingModal({ open, onOpenChange, offerId, items, itemId, onItem, pallets, onPallets, levels, filled, capacity, free, minOrder }: {
  open: boolean; onOpenChange: (o: boolean) => void; offerId: string;
  items: AuctionItem[]; itemId: string; onItem: (id: string) => void;
  pallets: number; onPallets: (n: number) => void;
  levels: Level[]; filled: number; capacity: number; free: number; minOrder: number;
}) {
  const router = useRouter();
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Επαναφορά στο άνοιγμα (adjust-state-while-rendering)
  const [prevOpen, setPrevOpen] = React.useState(false);
  if (open !== prevOpen) { setPrevOpen(open); if (open) { setSent(false); setError(null); } }

  const item = items.find((i) => i.id === itemId) ?? items[0];
  const multi = items.length > 1;
  const tiers = tiersOf(levels, item.prices);
  const now = tierAt(tiers, filled);
  const after = tierAt(tiers, filled + pallets);
  const afterIdx = after ? tiers.indexOf(after) : 0;
  const clamp = (n: number) => Math.min(free, Math.max(minOrder, step(n)));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/portal/offers/${offerId}/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offerItemId: item.id, pallets, notes }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.message ?? 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.'); return; }
      setSent(true);
      router.refresh();
    } catch { setError('Δεν υπάρχει σύνδεση. Δοκιμάστε ξανά.'); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[92dvh] gap-0 overflow-y-auto rounded-none border-(--s-line) p-0 sm:max-w-[520px]">
        <div className="site p-6 sm:p-8">
          <button type="button" onClick={() => onOpenChange(false)} className="absolute right-3 top-3 grid size-11 cursor-pointer place-items-center text-(--s-ink-2) hover:text-(--s-ink)" aria-label="Κλείσιμο"><FiX className="size-5" aria-hidden /></button>
          {sent ? (
            <div className="py-6 text-center" role="status">
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#F1F6F1] text-[#2F6B3A]"><FiCheck className="size-6" aria-hidden /></span>
              <DialogTitle className="font-site mt-6 text-(length:--fs-24) font-light">Το αίτημα στάλθηκε</DialogTitle>
              <DialogDescription className="mx-auto mt-3 max-w-sm text-(length:--fs-15) text-(--s-ink-2)">
                Ζητήσατε {pal(pallets)} {multi ? `«${item.name}» ` : ''}({num(pallets * item.perPallet)} {item.unit}). Μόλις εγκριθεί θα λάβετε email και η κράτηση θα μετρήσει στο γέμισμα του container.
              </DialogDescription>
              <button type="button" onClick={() => onOpenChange(false)} className={cn(btn.ghost, 'mt-8')}>Κλείσιμο</button>
            </div>
          ) : (
            <>
              <p className="text-(length:--fs-12) uppercase tracking-[0.18em] text-(--s-mute)">Κράτηση θέσης στο container</p>
              <DialogTitle className="font-site mt-2 pr-10 text-(length:--fs-24) font-light leading-tight">{item.name}</DialogTitle>
              <DialogDescription className="mt-1 text-(length:--fs-13) text-(--s-mute)">{item.code} · παλέτα {num(item.perPallet)} {item.unit} · ελάχιστη {pal(minOrder)}</DialogDescription>

              {multi && (
                <fieldset className="mt-6 min-w-0">
                  <legend className="text-(length:--fs-14) font-medium">Προϊόν</legend>
                  <div className="mt-2 grid min-w-0 gap-2">
                    {items.map((it) => {
                      const cur = tierAt(tiersOf(levels, it.prices), filled);
                      return (
                        <label key={it.id} className={cn('flex min-h-12 min-w-0 cursor-pointer items-center gap-3 border px-3 transition-colors', it.id === item.id ? 'border-(--s-ink) bg-(--s-paper)' : 'border-(--s-line) hover:border-(--s-ink)')}>
                          <input type="radio" name="offer-item" className="size-4 accent-[#1C3241]" checked={it.id === item.id} onChange={() => onItem(it.id)} />
                          <span className="min-w-0 flex-1 truncate text-(length:--fs-14)" title={it.name}>{it.name}</span>
                          <span className="font-num shrink-0 text-(length:--fs-15)">{cur ? eur(cur.price) : '—'}<span className="font-site text-(length:--fs-12) text-(--s-mute)">/{it.unit}</span></span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <div className="mt-8">
                <label htmlFor="pallets" className="text-(length:--fs-14) font-medium">Παλέτες</label>
                <div className="mt-2 flex items-stretch border border-(--s-line)">
                  <button type="button" onClick={() => onPallets(clamp(pallets - 0.5))} disabled={pallets <= minOrder} className="grid w-14 cursor-pointer place-items-center text-(--s-ink) hover:bg-(--s-paper) disabled:cursor-not-allowed disabled:opacity-40" aria-label="Μισή παλέτα λιγότερο"><FiMinus className="size-4" aria-hidden /></button>
                  <input id="pallets" type="number" inputMode="decimal" step={0.5} min={minOrder} max={free} value={pallets}
                    onChange={(e) => onPallets(clamp(Number(e.target.value) || minOrder))}
                    className="font-num h-14 min-w-0 flex-1 border-x border-(--s-line) text-center text-(length:--fs-28) font-light tabular-nums focus:outline-hidden" />
                  <button type="button" onClick={() => onPallets(clamp(pallets + 0.5))} disabled={pallets >= free} className="grid w-14 cursor-pointer place-items-center text-(--s-ink) hover:bg-(--s-paper) disabled:cursor-not-allowed disabled:opacity-40" aria-label="Μισή παλέτα περισσότερο"><FiPlus className="size-4" aria-hidden /></button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[1, 2, 5, free].filter((n, i, a) => n >= minOrder && n <= free && a.indexOf(n) === i).map((n) => (
                    <button key={n} type="button" onClick={() => onPallets(clamp(n))} className={cn('min-h-9 cursor-pointer border px-3 text-(length:--fs-13) transition-colors', pallets === n ? 'border-(--s-ink) bg-(--s-ink) text-white' : 'border-(--s-line) text-(--s-ink-2) hover:border-(--s-ink)')}>
                      {n === free ? `Όλες (${num(n)})` : num(n)}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-(length:--fs-14) text-(--s-ink-2)">= <b className="font-medium tabular-nums text-(--s-ink)">{num(pallets * item.perPallet)} {item.unit}</b></p>
              </div>

              <div className="mt-6 grid grid-cols-2 border-y border-(--s-line)">
                <div className="border-r border-(--s-line) py-4 pr-4">
                  <p className="text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">Τιμή τώρα</p>
                  <p className="font-num mt-1 text-(length:--fs-24) font-light">{now ? eur(now.price) : '—'}</p>
                </div>
                <div className="py-4 pl-4">
                  <p className="text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">Με την κράτησή σας</p>
                  <p className="font-num mt-1 text-(length:--fs-24) font-light" style={{ color: tierColor(afterIdx, tiers.length) }}>{after ? eur(after.price) : '—'}</p>
                </div>
              </div>
              <div className="mt-4 flex h-2 overflow-hidden" aria-hidden>
                {tiers.map((t, i) => {
                  const end = tiers[i + 1]?.fromPallets ?? capacity;
                  const w = ((end - (i === 0 ? 0 : t.fromPallets)) / Math.max(1, capacity)) * 100;
                  return <span key={t.level} style={{ width: `${w}%`, background: tierColor(i, tiers.length), opacity: i <= afterIdx ? 1 : 0.18 }} />;
                })}
              </div>
              <p className="mt-3 text-(length:--fs-13) text-(--s-ink-2)">
                Ενδεικτικό σύνολο: <b className="font-medium tabular-nums text-(--s-ink)">{after ? eur(after.price * pallets * item.perPallet) : '—'}</b> + ΦΠΑ. Αν το container γεμίσει περισσότερο, η τιμή πέφτει κι άλλο — για όλους{multi ? ', σε όλα τα προϊόντα' : ''}.
              </p>

              <div className="mt-6">
                <label htmlFor="notes" className="text-(length:--fs-14) font-medium">Σημειώσεις <span className="font-normal text-(--s-mute)">(προαιρετικά)</span></label>
                <textarea id="notes" rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="π.χ. παράδοση, έργο, διαστάσεις" className={cn(inputCls, 'mt-2 h-auto py-3')} />
              </div>

              {error && <p role="alert" className="mt-4 border-l-2 border-[#B42318] bg-[#FDF3F2] px-4 py-3 text-(length:--fs-14) text-[#8A1C12]">{error}</p>}

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => onOpenChange(false)} className={btn.ghost}>Άκυρο</button>
                <button type="button" onClick={submit} disabled={busy || pallets < minOrder || pallets > free} className={btn.primary}>
                  {busy ? 'Αποστολή…' : `Αίτημα για ${pal(pallets)}`}
                </button>
              </div>
              <p className="mt-4 text-(length:--fs-12) text-(--s-mute)">Το αίτημα εγκρίνεται από εμάς· μόνο τότε μετράει στο γέμισμα και στην τιμή.</p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
