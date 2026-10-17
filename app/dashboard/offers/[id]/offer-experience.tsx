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

type Tier = { level: number; fromPallets: number; price: number };
export type ExperienceProps = {
  offerId: string;
  open: boolean;
  product: { name: string; code: string; load: 'stones' | 'boxes' | 'sacks'; title: string | null };
  unit: string;
  perPallet: number;
  capacity: number;
  filled: number;
  pendingAll: number;
  minOrder: number;
  tiers: Tier[];
  participants: number;
  closesAt: string | null;
  mine: number;
  myPending: { id: string; pallets: number; createdAt: string }[];
};

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const num = (n: number, d = 2) => n.toLocaleString('el-GR', { maximumFractionDigits: d });
const pal = (n: number) => `${num(n)} ${n === 1 ? 'παλέτα' : 'παλέτες'}`;
const step = (n: number) => Math.round(n * 2) / 2;
const tierAt = (tiers: Tier[], f: number) => tiers.reduce<Tier | null>((acc, t) => (f + 1e-9 >= t.fromPallets ? t : acc), tiers[0] ?? null);

/**
 * Η ζωντανή εμπειρία της προσφοράς: 3D container + κλίμακα τιμών· click σε ελεύθερη θέση ανοίγει το
 * modal κράτησης (½ παλέτα βήμα) με προεπισκόπηση «πού θα πάει η τιμή». Το αίτημα μένει σε αναμονή ως την έγκριση.
 */
export function OfferExperience(p: ExperienceProps) {
  const router = useRouter();
  const tiers = React.useMemo(() => [...p.tiers].sort((a, b) => a.fromPallets - b.fromPallets), [p.tiers]);
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

  const now = tierAt(tiers, p.filled);
  const after = tierAt(tiers, p.filled + pallets);
  const afterIdx = after ? tiers.indexOf(after) : 0;

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/portal/offers/${p.offerId}/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pallets, notes }) });
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
    ...(p.mine > 0 ? [{ label: 'Η κράτησή σας', value: `${pal(p.mine)} · ${num(p.mine * p.perPallet)} ${p.unit}` }] : []),
  ];

  return (
    <>
      <OfferShowcase
        mode="live"
        product={{ name: p.product.name, code: p.product.code, load: p.product.load, unit: p.unit, perPallet: p.perPallet, eyebrow: p.product.title ?? 'Κοινό container' }}
        capacity={p.capacity} filled={p.filled}
        tiers={tiers.map((t) => ({ from: t.fromPallets, value: t.price, label: eur(t.price) }))}
        valueCaption={`Τιμή ανά ${p.unit} · για όλους`}
        extra={extra}
        booking={canBook ? { maxPallets: free, onPick: openWith, selected: modal ? Math.ceil(pallets) : 0 } : undefined}
        preview={modal ? pallets : undefined}
        actions={canBook
          ? <button type="button" onClick={() => openWith(Math.max(p.minOrder, 1))} className={cn(btn.primary, 'w-full')}>Κλείστε παλέτες</button>
          : <p className="border-l-2 border-[var(--s-line)] pl-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">{p.open ? 'Δεν υπάρχουν ελεύθερες θέσεις για νέα κράτηση.' : 'Η προσφορά έχει κλείσει.'}</p>}
      />

      {p.myPending.length > 0 && (
        <div className="mt-10 border-t border-[var(--s-line)] pt-6">
          <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">Τα αιτήματά σας σε αναμονή</p>
          <ul className="mt-3">
            {p.myPending.map((r) => (
              <li key={r.id} className="flex items-center gap-3 border-b border-[var(--s-line)] py-3 text-[length:var(--fs-15)]">
                <FiClock className="size-4 text-[#B45309]" aria-hidden />
                <span><b className="font-medium tabular-nums">{pal(r.pallets)}</b> · {num(r.pallets * p.perPallet)} {p.unit}</span>
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
                  Ζητήσατε {pal(pallets)} ({num(pallets * p.perPallet)} {p.unit}). Μόλις εγκριθεί θα λάβετε email και η κράτηση θα μετρήσει στο γέμισμα του container.
                </DialogDescription>
                <button type="button" onClick={() => setModal(false)} className={cn(btn.ghost, 'mt-8')}>Κλείσιμο</button>
              </div>
            ) : (
              <>
                <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]">Κράτηση</p>
                <DialogTitle className="font-site mt-2 pr-10 text-[length:var(--fs-24)] font-light leading-tight">{p.product.name}</DialogTitle>
                <DialogDescription className="mt-1 text-[length:var(--fs-13)] text-[var(--s-mute)]">{p.product.code} · παλέτα {num(p.perPallet)} {p.unit} · ελάχιστη {pal(p.minOrder)}</DialogDescription>

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
                  <p className="mt-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">= <b className="font-medium tabular-nums text-[var(--s-ink)]">{num(pallets * p.perPallet)} {p.unit}</b></p>
                </div>

                {/* Τι αλλάζει στην τιμή */}
                <div className="mt-6 grid grid-cols-2 border-y border-[var(--s-line)]">
                  <div className="border-r border-[var(--s-line)] py-4 pr-4">
                    <p className="text-[length:var(--fs-12)] uppercase tracking-[0.14em] text-[var(--s-mute)]">Τιμή τώρα</p>
                    <p className="font-num mt-1 text-[length:var(--fs-24)] font-light">{now ? eur(now.price) : '—'}</p>
                  </div>
                  <div className="py-4 pl-4">
                    <p className="text-[length:var(--fs-12)] uppercase tracking-[0.14em] text-[var(--s-mute)]">Με την κράτησή σας</p>
                    <p className="font-num mt-1 text-[length:var(--fs-24)] font-light" style={{ color: tierColor(afterIdx, tiers.length) }}>{after ? eur(after.price) : '—'}</p>
                  </div>
                </div>
                {/* Μίνι κλίμακα: πού πέφτει το γέμισμα μετά την κράτηση */}
                <div className="mt-4 flex h-2 overflow-hidden" aria-hidden>
                  {tiers.map((t, i) => {
                    const end = tiers[i + 1]?.fromPallets ?? p.capacity;
                    const w = ((end - (i === 0 ? 0 : t.fromPallets)) / Math.max(1, p.capacity)) * 100;
                    return <span key={t.level} style={{ width: `${w}%`, background: tierColor(i, tiers.length), opacity: i <= afterIdx ? 1 : 0.18 }} />;
                  })}
                </div>
                <p className="mt-3 text-[length:var(--fs-13)] text-[var(--s-ink-2)]">
                  Ενδεικτικό σύνολο: <b className="font-medium tabular-nums text-[var(--s-ink)]">{after ? eur(after.price * pallets * p.perPallet) : '—'}</b> + ΦΠΑ. Αν το container γεμίσει περισσότερο, η τιμή πέφτει κι άλλο — για όλους.
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
