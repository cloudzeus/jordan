'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiCheck, FiMinus, FiMoreVertical, FiPlus, FiX, FiClock } from 'react-icons/fi';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { OfferShowcase } from '@/components/site/offer-showcase';
import { tierColor } from '@/components/site/tier-colors';
import { btn, inputCls } from '@/components/site/ui';
import { cn } from '@/lib/utils';

type Level = { level: number; fromPallets: number };
type Tier = Level & { price: number };
export type ExperienceItem = { id: string; name: string; code: string; load: 'stones' | 'boxes' | 'sacks'; unit: string; perPallet: number; prices: number[]; mine: number };
export type ExperienceProps = {
  offerId: string;
  open: boolean;
  title: string;
  /** Τα προϊόντα του container (κοινά κλιμάκια, δικές τους τιμές: prices[level-1]). */
  items: ExperienceItem[];
  selectedId: string;
  levels: Level[];
  capacity: number;
  filled: number;
  pendingAll: number;
  minOrder: number;
  participants: number;
  closesAt: string | null;
  mine: number;
  myPending: { id: string; offerItemId: string; product: string; pallets: number; createdAt: string }[];
};

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const num = (n: number, d = 2) => n.toLocaleString('el-GR', { maximumFractionDigits: d });
const pal = (n: number) => `${num(n)} ${n === 1 ? 'παλέτα' : 'παλέτες'}`;
const step = (n: number) => Math.round(n * 2) / 2;
const tierAt = <T extends Level>(tiers: T[], f: number) => tiers.reduce<T | null>((acc, t) => (f + 1e-9 >= t.fromPallets ? t : acc), tiers[0] ?? null);
const tiersOf = (levels: Level[], prices: number[]): Tier[] => levels.map((l) => ({ ...l, price: prices[l.level - 1] ?? 0 }));

/**
 * Η ζωντανή εμπειρία της προσφοράς: 3D container + κλίμακα τιμών του επιλεγμένου προϊόντος· click σε
 * ελεύθερη θέση ανοίγει το modal κράτησης (προϊόν + ½ παλέτα βήμα) με προεπισκόπηση «πού θα πάει η τιμή».
 * Το γέμισμα είναι κοινό: παλέτες οποιουδήποτε προϊόντος ρίχνουν τις τιμές όλων. Το αίτημα μένει σε αναμονή ως την έγκριση.
 */
export function OfferExperience(p: ExperienceProps) {
  const router = useRouter();
  const levels = React.useMemo(() => [...p.levels].sort((a, b) => a.fromPallets - b.fromPallets), [p.levels]);
  const sel = p.items.find((i) => i.id === p.selectedId) ?? p.items[0];
  const multi = p.items.length > 1;
  const [itemId, setItemId] = React.useState(sel.id);
  React.useEffect(() => { setItemId(sel.id); }, [sel.id]);
  const item = p.items.find((i) => i.id === itemId) ?? sel;
  const tiers = React.useMemo(() => tiersOf(levels, sel.prices), [levels, sel.prices]);
  const itemTiers = React.useMemo(() => tiersOf(levels, item.prices), [levels, item.prices]);
  const choose = (id: string) => router.replace(`/dashboard/offers/${p.offerId}?p=${id}`, { scroll: false });
  const free = Math.max(0, step(p.capacity - p.filled - p.pendingAll));
  const canBook = p.open && free >= p.minOrder;

  const [modal, setModal] = React.useState(false);
  const [pallets, setPallets] = React.useState(Math.max(p.minOrder, 1));
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const clamp = (n: number) => Math.min(free, Math.max(p.minOrder, step(n)));
  const openWith = (n: number) => { setPallets(clamp(n)); setSent(false); setError(null); setModal(true); };

  const now = tierAt(itemTiers, p.filled);
  const after = tierAt(itemTiers, p.filled + pallets);
  const afterIdx = after ? itemTiers.indexOf(after) : 0;

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/portal/offers/${p.offerId}/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offerItemId: item.id, pallets, notes }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.message ?? 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.'); return; }
      setSent(true);
      router.refresh();
    } catch { setError('Δεν υπάρχει σύνδεση. Δοκιμάστε ξανά.'); } finally { setBusy(false); }
  };

  const withdraw = async (id: string, n: number) => {
    if (!(await confirmAction({ title: 'Απόσυρση αιτήματος', message: `Να αποσυρθεί το αίτημα για ${pal(n)};`, confirmLabel: 'Απόσυρση', destructive: true }))) return;
    const res = await fetch(`/api/portal/offers/${p.offerId}/reservations/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).message ?? 'Αποτυχία'); return; }
    toast.success('Το αίτημα αποσύρθηκε');
    router.refresh();
  };

  const extra = [
    { label: 'Συμμετέχοντες', value: String(p.participants) },
    { label: 'Ελάχιστη παραγγελία', value: pal(p.minOrder) },
    { label: 'Διαθέσιμες για κράτηση', value: pal(free) },
    ...(p.closesAt ? [{ label: 'Συμμετοχή έως', value: new Date(p.closesAt).toLocaleDateString('el-GR', { day: 'numeric', month: 'long' }) }] : []),
    ...(multi ? [{ label: 'Προϊόντα στο container', value: String(p.items.length) }] : []),
    ...(sel.mine > 0 ? [{ label: multi ? `Η κράτησή σας · ${sel.name}` : 'Η κράτησή σας', value: `${pal(sel.mine)} · ${num(sel.mine * sel.perPallet)} ${sel.unit}` }] : []),
    ...(multi && p.mine > sel.mine ? [{ label: 'Οι κρατήσεις σας συνολικά', value: pal(p.mine) }] : []),
  ];

  return (
    <>
      {multi && (
        <div className="mb-8 flex flex-wrap gap-2" role="tablist" aria-label="Προϊόν">
          {p.items.map((it) => (
            <button key={it.id} type="button" role="tab" aria-selected={it.id === sel.id} onClick={() => choose(it.id)}
              className={cn('inline-flex min-h-11 cursor-pointer items-center gap-2 border px-4 text-[length:var(--fs-14)] transition-colors', it.id === sel.id ? 'border-[var(--s-ink)] bg-[var(--s-ink)] text-white' : 'border-[var(--s-line)] bg-white text-[var(--s-ink-2)] hover:border-[var(--s-ink)]')}>
              {it.name}
            </button>
          ))}
        </div>
      )}
      <OfferShowcase
        key={sel.id}
        mode="live"
        product={{ name: sel.name, code: sel.code, load: sel.load, unit: sel.unit, perPallet: sel.perPallet, eyebrow: multi ? p.title : 'Κοινό container' }}
        capacity={p.capacity} filled={p.filled}
        tiers={tiers.map((t) => ({ from: t.fromPallets, value: t.price, label: eur(t.price) }))}
        valueCaption={multi ? `Τιμή ανά ${sel.unit} · κοινό γέμισμα για ${p.items.length} προϊόντα` : `Τιμή ανά ${sel.unit} · για όλους`}
        extra={extra}
        booking={canBook ? { maxPallets: free, onPick: (n) => { setItemId(sel.id); openWith(n); }, selected: modal ? Math.ceil(pallets) : 0 } : undefined}
        preview={modal ? pallets : undefined}
        actions={canBook
          ? <button type="button" onClick={() => { setItemId(sel.id); openWith(Math.max(p.minOrder, 1)); }} className={cn(btn.primary, 'w-full')}>{multi ? `Κλείστε παλέτες · ${sel.name}` : 'Κλείστε παλέτες'}</button>
          : <p className="border-l-2 border-[var(--s-line)] pl-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">{p.open ? 'Δεν υπάρχουν ελεύθερες θέσεις για νέα κράτηση.' : 'Η προσφορά έχει κλείσει.'}</p>}
      />

      {p.myPending.length > 0 && (
        <div className="mt-10 border-t border-[var(--s-line)] pt-6">
          <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">Τα αιτήματά σας σε αναμονή</p>
          <ul className="mt-3">
            {p.myPending.map((r) => (
              <li key={r.id} className="flex items-center gap-3 border-b border-[var(--s-line)] py-3 text-[length:var(--fs-15)]">
                <FiClock className="size-4 text-[#B45309]" aria-hidden />
                <span>{multi && <span className="mr-1.5">{r.product} ·</span>}<b className="font-medium tabular-nums">{pal(r.pallets)}</b>{(() => { const it = p.items.find((x) => x.id === r.offerItemId); return it ? ` · ${num(r.pallets * it.perPallet)} ${it.unit}` : ''; })()}</span>
                <span className="text-[length:var(--fs-13)] text-[var(--s-mute)]">{new Date(r.createdAt).toLocaleDateString('el-GR')} · περιμένει έγκριση</span>
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

      <Dialog open={modal} onOpenChange={(o) => { setModal(o); if (!o) setSent(false); }}>
        <DialogContent showCloseButton={false} className="max-h-[92dvh] gap-0 overflow-y-auto rounded-none border-[var(--s-line)] p-0 sm:max-w-[520px]">
          <div className="site p-6 sm:p-8">
            <button type="button" onClick={() => setModal(false)} className="absolute right-3 top-3 grid size-11 cursor-pointer place-items-center text-[var(--s-ink-2)] hover:text-[var(--s-ink)]" aria-label="Κλείσιμο"><FiX className="size-5" aria-hidden /></button>
            {sent ? (
              <div className="py-6 text-center" role="status">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#F1F6F1] text-[#2F6B3A]"><FiCheck className="size-6" aria-hidden /></span>
                <DialogTitle className="font-site mt-6 text-[length:var(--fs-24)] font-light">Το αίτημα στάλθηκε</DialogTitle>
                <DialogDescription className="mx-auto mt-3 max-w-sm text-[length:var(--fs-15)] text-[var(--s-ink-2)]">
                  Ζητήσατε {pal(pallets)} {multi ? `«${item.name}» ` : ''}({num(pallets * item.perPallet)} {item.unit}). Μόλις εγκριθεί θα λάβετε email και η κράτηση θα μετρήσει στο γέμισμα του container.
                </DialogDescription>
                <button type="button" onClick={() => setModal(false)} className={cn(btn.ghost, 'mt-8')}>Κλείσιμο</button>
              </div>
            ) : (
              <>
                <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">Κράτηση</p>
                <DialogTitle className="font-site mt-2 pr-10 text-[length:var(--fs-24)] font-light leading-tight">{item.name}</DialogTitle>
                <DialogDescription className="mt-1 text-[length:var(--fs-13)] text-[var(--s-mute)]">{item.code} · παλέτα {num(item.perPallet)} {item.unit} · ελάχιστη {pal(p.minOrder)}</DialogDescription>

                {multi && (
                  <fieldset className="mt-6 min-w-0">
                    <legend className="text-[length:var(--fs-14)] font-medium">Προϊόν</legend>
                    <div className="mt-2 grid min-w-0 gap-2">
                      {p.items.map((it) => {
                        const cur = tierAt(tiersOf(levels, it.prices), p.filled);
                        return (
                          <label key={it.id} className={cn('flex min-h-12 min-w-0 cursor-pointer items-center gap-3 border px-3 transition-colors', it.id === item.id ? 'border-[var(--s-ink)] bg-[var(--s-paper)]' : 'border-[var(--s-line)] hover:border-[var(--s-ink)]')}>
                            <input type="radio" name="offer-item" className="size-4 accent-[#1C3241]" checked={it.id === item.id} onChange={() => setItemId(it.id)} />
                            <span className="min-w-0 flex-1 truncate text-[length:var(--fs-14)]" title={it.name}>{it.name}</span>
                            <span className="font-num shrink-0 text-[length:var(--fs-15)]">{cur ? eur(cur.price) : '—'}<span className="font-site text-[length:var(--fs-12)] text-[var(--s-mute)]">/{it.unit}</span></span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}

                {/* Ποσότητα */}
                <div className="mt-8">
                  <label htmlFor="pallets" className="text-[length:var(--fs-14)] font-medium">Παλέτες</label>
                  <div className="mt-2 flex items-stretch border border-[var(--s-line)]">
                    <button type="button" onClick={() => setPallets((n) => clamp(n - 0.5))} disabled={pallets <= p.minOrder} className="grid w-14 cursor-pointer place-items-center text-[var(--s-ink)] hover:bg-[var(--s-paper)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Μισή παλέτα λιγότερο"><FiMinus className="size-4" aria-hidden /></button>
                    <input
                      id="pallets" type="number" inputMode="decimal" step={0.5} min={p.minOrder} max={free} value={pallets}
                      onChange={(e) => setPallets(clamp(Number(e.target.value) || p.minOrder))}
                      className="font-num h-14 min-w-0 flex-1 border-x border-[var(--s-line)] text-center text-[length:var(--fs-28)] font-light tabular-nums focus:outline-none"
                    />
                    <button type="button" onClick={() => setPallets((n) => clamp(n + 0.5))} disabled={pallets >= free} className="grid w-14 cursor-pointer place-items-center text-[var(--s-ink)] hover:bg-[var(--s-paper)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Μισή παλέτα περισσότερο"><FiPlus className="size-4" aria-hidden /></button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[1, 2, 5, free].filter((n, i, a) => n >= p.minOrder && n <= free && a.indexOf(n) === i).map((n) => (
                      <button key={n} type="button" onClick={() => setPallets(clamp(n))} className={cn('min-h-9 cursor-pointer border px-3 text-[length:var(--fs-13)] transition-colors', pallets === n ? 'border-[var(--s-ink)] bg-[var(--s-ink)] text-white' : 'border-[var(--s-line)] text-[var(--s-ink-2)] hover:border-[var(--s-ink)]')}>
                        {n === free ? `Όλες (${num(n)})` : num(n)}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">= <b className="font-medium tabular-nums text-[var(--s-ink)]">{num(pallets * item.perPallet)} {item.unit}</b></p>
                </div>

                {/* Τι αλλάζει στην τιμή */}
                <div className="mt-6 grid grid-cols-2 border-y border-[var(--s-line)]">
                  <div className="border-r border-[var(--s-line)] py-4 pr-4">
                    <p className="text-[length:var(--fs-12)] uppercase tracking-[0.14em] text-[var(--s-mute)]">Τιμή τώρα</p>
                    <p className="font-num mt-1 text-[length:var(--fs-24)] font-light">{now ? eur(now.price) : '—'}</p>
                  </div>
                  <div className="py-4 pl-4">
                    <p className="text-[length:var(--fs-12)] uppercase tracking-[0.14em] text-[var(--s-mute)]">Με την κράτησή σας</p>
                    <p className="font-num mt-1 text-[length:var(--fs-24)] font-light" style={{ color: tierColor(afterIdx, itemTiers.length) }}>{after ? eur(after.price) : '—'}</p>
                  </div>
                </div>
                {/* Μίνι κλίμακα: πού πέφτει το γέμισμα μετά την κράτηση */}
                <div className="mt-4 flex h-2 overflow-hidden" aria-hidden>
                  {itemTiers.map((t, i) => {
                    const end = itemTiers[i + 1]?.fromPallets ?? p.capacity;
                    const w = ((end - (i === 0 ? 0 : t.fromPallets)) / Math.max(1, p.capacity)) * 100;
                    return <span key={t.level} style={{ width: `${w}%`, background: tierColor(i, itemTiers.length), opacity: i <= afterIdx ? 1 : 0.18 }} />;
                  })}
                </div>
                <p className="mt-3 text-[length:var(--fs-13)] text-[var(--s-ink-2)]">
                  Ενδεικτικό σύνολο: <b className="font-medium tabular-nums text-[var(--s-ink)]">{after ? eur(after.price * pallets * item.perPallet) : '—'}</b> + ΦΠΑ. Αν το container γεμίσει περισσότερο, η τιμή πέφτει κι άλλο — για όλους{multi ? ', σε όλα τα προϊόντα' : ''}.
                </p>

                <div className="mt-6">
                  <label htmlFor="notes" className="text-[length:var(--fs-14)] font-medium">Σημειώσεις <span className="font-normal text-[var(--s-mute)]">(προαιρετικά)</span></label>
                  <textarea id="notes" rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="π.χ. παράδοση, έργο, διαστάσεις" className={cn(inputCls, 'mt-2 h-auto py-3')} />
                </div>

                {error && <p role="alert" className="mt-4 border-l-2 border-[#B42318] bg-[#FDF3F2] px-4 py-3 text-[length:var(--fs-14)] text-[#8A1C12]">{error}</p>}

                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setModal(false)} className={btn.ghost}>Άκυρο</button>
                  <button type="button" onClick={submit} disabled={busy || pallets < p.minOrder || pallets > free} className={btn.primary}>
                    {busy ? 'Αποστολή…' : `Αίτημα για ${pal(pallets)}`}
                  </button>
                </div>
                <p className="mt-4 text-[length:var(--fs-12)] text-[var(--s-mute)]">Το αίτημα εγκρίνεται από εμάς· μόνο τότε μετράει στο γέμισμα και στην τιμή.</p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
