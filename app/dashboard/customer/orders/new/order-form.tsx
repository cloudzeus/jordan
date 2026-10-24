'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FiMinus, FiPlus, FiSearch, FiTrash2 } from 'react-icons/fi';
import { btn, Field, inputCls, Notice } from '@/components/site/ui';
import { ProductPlaceholder } from '@/components/site/visuals';
import { cn } from '@/lib/utils';

export type CartLine = { mtrl: number; code: string | null; name: string; unit: string | null; photo: string | null; qty: number; note: string };
type Hit = Omit<CartLine, 'qty' | 'note'>;

const today = () => new Date().toISOString().slice(0, 10);

function Thumb({ p }: { p: Hit }) {
  return (
    <span className="relative block size-14 shrink-0 overflow-hidden bg-(--s-paper)">
      {p.photo ? <img src={p.photo} alt="" className="size-full object-cover" /> : <ProductPlaceholder mtrl={p.mtrl} name={p.name} label={false} />}
    </span>
  );
}

/** Φόρμα αιτήματος παραγγελίας: αναζήτηση καταλόγου → καλάθι → στοιχεία παράδοσης → αποστολή. */
export function OrderForm({ initial, projects, initialProject }: { initial: CartLine[]; projects: { prjc: number; label: string }[]; initialProject: number | null }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>(initial);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const seq = useRef(0);

  // Αναζήτηση με μικρή καθυστέρηση· κρατάμε μόνο την τελευταία απάντηση.
  // Κάτω από 2 χαρακτήρες: καθαρισμός αποτελεσμάτων (adjust-state-while-rendering)
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) { setPrevQ(q); if (q.trim().length < 2) setHits(null); }
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/portal/catalog?q=${encodeURIComponent(term)}`).catch(() => null);
      const data = res?.ok ? await res.json() : { items: [] };
      if (id === seq.current) { setHits(data.items ?? []); setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const inCart = new Set(cart.map((l) => l.mtrl));
  const add = (h: Hit) => setCart((c) => (c.some((l) => l.mtrl === h.mtrl) ? c.map((l) => (l.mtrl === h.mtrl ? { ...l, qty: l.qty + 1 } : l)) : [...c, { ...h, qty: 1, note: '' }]));
  const patch = (mtrl: number, p: Partial<CartLine>) => setCart((c) => c.map((l) => (l.mtrl === mtrl ? { ...l, ...p } : l)));
  const remove = (mtrl: number) => setCart((c) => c.filter((l) => l.mtrl !== mtrl));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!cart.length) { setError('Προσθέστε τουλάχιστον ένα υλικό.'); return; }
    if (cart.some((l) => !(l.qty > 0))) { setError('Κάθε υλικό θέλει ποσότητα μεγαλύτερη από 0.'); return; }
    const f = new FormData(e.currentTarget);
    const s = (k: string) => (f.get(k)?.toString() ?? '').trim();
    setSending(true);
    const res = await fetch('/api/portal/order-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lines: cart.map((l) => ({ mtrl: l.mtrl, qty: l.qty, note: l.note || null })),
        prjc: s('prjc') ? Number(s('prjc')) : null,
        customerRef: s('customerRef'), deliveryDate: s('deliveryDate'), deliveryAddress: s('deliveryAddress'), notes: s('notes'),
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (!res?.ok) { setSending(false); setError(data?.message ?? 'Δεν στάλθηκε το αίτημα. Δοκιμάστε ξανά.'); return; }
    router.push(`/dashboard/customer/orders?requested=${data.request.number}`);
  }

  return (
    <form onSubmit={submit} className="grid gap-14 lg:grid-cols-[1fr_380px] lg:gap-16">
      <div className="min-w-0">
        <h2 className="font-site text-(length:--fs-24) font-medium">Υλικά</h2>
        <div className="relative mt-5">
          <label htmlFor="catalog-q" className="sr-only">Αναζήτηση στον κατάλογο</label>
          <input id="catalog-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση — όνομα ή κωδικός υλικού" className={cn(inputCls, 'pr-12 [&::-webkit-search-cancel-button]:hidden')} autoComplete="off" />
          <FiSearch className="pointer-events-none absolute right-4 top-4 size-4 text-(--s-ink-2)" aria-hidden />
        </div>
        {hits && (
          <ul className="mt-2 max-h-80 overflow-y-auto border border-(--s-line)" aria-live="polite" aria-busy={searching}>
            {hits.length === 0 && <li className="px-4 py-4 text-(length:--fs-14) text-(--s-ink-2)">{searching ? 'Αναζήτηση…' : 'Δεν βρέθηκε υλικό'}</li>}
            {hits.map((h) => (
              <li key={h.mtrl} className="border-b border-(--s-line) last:border-b-0">
                <button type="button" onClick={() => add(h)} className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-(--s-paper)">
                  <Thumb p={h} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-(length:--fs-15)">{h.name}</span>
                    <span className="block text-(length:--fs-13) text-(--s-mute)">{h.code}{h.unit ? ` · ${h.unit}` : ''}</span>
                  </span>
                  <span className="shrink-0 text-(length:--fs-13) font-medium">{inCart.has(h.mtrl) ? '+1' : 'Προσθήκη'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {cart.length === 0 ? (
          <p className="mt-8 border border-dashed border-(--s-line) px-6 py-10 text-center text-(length:--fs-14) text-(--s-ink-2)">Αναζητήστε υλικά παραπάνω και προσθέστε τα στην παραγγελία.</p>
        ) : (
          <ul className="mt-8 border-t border-(--s-line)">
            {cart.map((l) => (
              <li key={l.mtrl} className="grid gap-3 border-b border-(--s-line) py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <Thumb p={l} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-(length:--fs-15)">{l.name}</p>
                    <p className="text-(length:--fs-13) text-(--s-mute)">{l.code}</p>
                    <label className="sr-only" htmlFor={`note-${l.mtrl}`}>Σημείωση για {l.name}</label>
                    <input id={`note-${l.mtrl}`} value={l.note} maxLength={300} onChange={(e) => patch(l.mtrl, { note: e.target.value })} placeholder="Σημείωση (χρώμα, φινίρισμα…)" className="mt-1 h-11 w-full border-b border-transparent bg-transparent text-(length:--fs-14) placeholder:text-[#A8A29E] focus:border-(--s-ink) focus:outline-hidden" />
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <button type="button" onClick={() => patch(l.mtrl, { qty: Math.max(0, Math.round((l.qty - 1) * 1000) / 1000) })} className="grid size-11 cursor-pointer place-items-center border border-(--s-line) hover:border-(--s-ink)" aria-label={`Μείωση ποσότητας ${l.name}`}><FiMinus className="size-4" aria-hidden /></button>
                  <label className="sr-only" htmlFor={`qty-${l.mtrl}`}>Ποσότητα {l.name}</label>
                  <input id={`qty-${l.mtrl}`} type="number" inputMode="decimal" min={0} step="any" value={l.qty} onChange={(e) => patch(l.mtrl, { qty: Number(e.target.value) })} className={cn(inputCls, 'h-11 w-24 px-2 text-center tabular-nums')} />
                  <button type="button" onClick={() => patch(l.mtrl, { qty: l.qty + 1 })} className="grid size-11 cursor-pointer place-items-center border border-(--s-line) hover:border-(--s-ink)" aria-label={`Αύξηση ποσότητας ${l.name}`}><FiPlus className="size-4" aria-hidden /></button>
                  <span className="w-12 text-(length:--fs-13) text-(--s-ink-2)">{l.unit ?? ''}</span>
                  <button type="button" onClick={() => remove(l.mtrl)} className="grid size-11 cursor-pointer place-items-center text-(--s-ink-2) hover:text-[#B42318]" aria-label={`Αφαίρεση ${l.name}`}><FiTrash2 className="size-4" aria-hidden /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <h2 className="font-site text-(length:--fs-24) font-medium">Στοιχεία</h2>
        {projects.length > 0 && (
          <Field label="Έργο" htmlFor="prjc">
            <select id="prjc" name="prjc" defaultValue={initialProject ?? ''} className={inputCls}>
              <option value="">— Χωρίς έργο —</option>
              {projects.map((p) => <option key={p.prjc} value={p.prjc}>{p.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Δικό σας σημείωμα (προαιρετικό)" htmlFor="customerRef" hint="Π.χ. «Μπάνιο ορόφου» ή αριθμός εντολής — θα το βλέπετε στην παραγγελία.">
          <input id="customerRef" name="customerRef" maxLength={80} aria-describedby="customerRef-hint" className={inputCls} />
        </Field>
        <Field label="Επιθυμητή ημερομηνία παράδοσης" htmlFor="deliveryDate">
          <input id="deliveryDate" name="deliveryDate" type="date" min={today()} className={inputCls} />
        </Field>
        <Field label="Διεύθυνση παράδοσης" htmlFor="deliveryAddress">
          <input id="deliveryAddress" name="deliveryAddress" maxLength={300} autoComplete="street-address" className={inputCls} />
        </Field>
        <Field label="Σχόλια" htmlFor="notes">
          <textarea id="notes" name="notes" rows={4} maxLength={2000} className={cn(inputCls, 'h-auto py-3')} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <button type="submit" disabled={sending || cart.length === 0} className={cn(btn.primary, 'w-full')}>
          {sending ? 'Αποστολή…' : `Αποστολή αιτήματος${cart.length ? ` · ${cart.length} ${cart.length === 1 ? 'υλικό' : 'υλικά'}` : ''}`}
        </button>
        <p className="text-(length:--fs-13) text-(--s-mute)">Δεν δεσμεύεστε μέχρι να σας επιβεβαιώσουμε τιμή και παράδοση. Οι τιμές είναι αυτές που έχουμε συμφωνήσει μαζί σας.</p>
      </aside>
    </form>
  );
}
