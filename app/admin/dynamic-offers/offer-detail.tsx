'use client';

// Ανοιγμένη γραμμή δυναμικής προσφοράς: Επισκόπηση (3D γέμισμα + κλίμακα), Κρατήσεις, Παραλήπτες
// (με ιστορικό email), Email (προεπισκόπηση). Νέα κράτηση → νέα 3D εικόνα → «η τιμή έπεσε» αν χρειάζεται.
import * as React from 'react';
import dynamic from 'next/dynamic';
import { FiActivity, FiShoppingCart, FiMail, FiUsers, FiPlus, FiMoreVertical, FiXCircle, FiCheckCircle, FiAlertTriangle, FiLoader, FiSearch, FiClock } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field, RowHint, fieldCls } from '@/components/admin/form-kit';
import { uploadOfferSnapshot } from '@/components/admin/container-snapshot';
import { checkReservation, PALLET_STEP, tierAt } from '@/lib/container-pricing';
import type { OfferRow } from '@/lib/container-offers';
import { PriceLadder } from './price-ladder';
import { PaymentBadge, paymentMenuItems, RefundDiffsButton, type PaymentCaps } from './payment-cell';
import type { PaymentSummary } from '@/lib/viva-payments';

const ContainerScene = dynamic(() => import('@/components/admin/container-scene'), {
  ssr: false, loading: () => <div className="h-72 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />,
});

type Reservation = { id: string; trdr: number | null; partnerId: string | null; kind: 'CUSTOMER' | 'PARTNER'; customer: string; customerCode: string | null; offerItemId: string; product: { code: string; name: string }; sqm: number; unit: string; pallets: number; status: string; notes: string | null; decisionNote: string | null; fromPortal: boolean; createdAt: string };
type Recipient = { id: string; kind: string; refId: string; name: string; email: string | null; emails: { kind: string; level: number; status: string; error: string | null; sentAt: string }[] };
type Customer = { refId: string; name: string; sub: string };

const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const TONE = { over: '#0369A1', res: '#047857', rec: '#7C3AED', mail: '#B45309' } as const;
const TRIGGER = cn(
  '!h-full flex-none cursor-pointer gap-1 rounded-none px-2 text-[length:var(--fs-12)] text-muted-foreground sm:gap-1.5 sm:px-3',
  'hover:text-foreground data-[state=active]:font-semibold data-[state=active]:!text-[color:var(--tab-tone)]',
  'after:bg-[var(--tab-tone)] after:!h-[2px] after:!bottom-0',
);
const TH = 'px-2 py-1.5 text-left text-[length:var(--fs-10)] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap';
const TD = 'px-2 py-1.5 text-[length:var(--fs-12)] align-top';
const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });
const strip = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const loadOf = (name: string): 'stones' | 'boxes' | 'sacks' => {
  const n = strip(name);
  if (/κολλ|τσιμεντ|κονιαμ|στοκ|αρμο|σοβα|glue|cement|mortar|grout/.test(n)) return 'sacks';
  if (/πετρ|stone|τραβερτ|travert/.test(n) && !/πλακακι|gres|porcel/.test(n)) return 'stones';
  return 'boxes';
};

function Badge({ n, tone }: { n: number; tone: string }) {
  return <span className="rounded-full px-1.5 text-[length:var(--fs-10)] font-semibold tabular-nums leading-4" style={{ color: tone, backgroundColor: soft(tone, 14) }}>{n}</span>;
}

/** Νέα κράτηση: πελάτης + παλέτες ανά ½ (με +/−). */
function ReservationDialog({ open, onOpenChange, offer, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; offer: OfferRow; onSaved: (pallets: number) => Promise<void> }) {
  const [customers, setCustomers] = React.useState<Customer[] | null>(null);
  const [q, setQ] = React.useState('');
  const [trdr, setTrdr] = React.useState<string | null>(null);
  const [itemId, setItemId] = React.useState(offer.items[0]?.id ?? '');
  const [pallets, setPallets] = React.useState(offer.minOrder);
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setQ(''); setTrdr(null); setItemId(offer.items[0]?.id ?? ''); setPallets(offer.minOrder); setNotes('');
    if (!customers) fetch('/api/admin/dynamic-offers/options').then((r) => r.json()).then((d) => setCustomers(d.customers)).catch(() => null);
  }, [open, offer.minOrder, offer.items, customers]);
  const err = checkReservation(pallets, offer.free, offer.minOrder);
  const item = offer.items.find((i) => i.id === itemId) ?? offer.items[0];
  const after = tierAt(offer.levels, offer.filled + pallets);
  const n = strip(q.trim());
  const shown = (customers ?? []).filter((c) => !n || strip(`${c.name} ${c.sub}`).includes(n)).slice(0, 200);
  const save = async () => {
    if (!trdr || err) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/dynamic-offers/${offer.id}/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offerItemId: item.id, trdr: Number(trdr), pallets, notes }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message ?? 'Η κράτηση απέτυχε');
      await onSaved(pallets);
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[92dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[length:var(--fs-15)]">Νέα κράτηση</DialogTitle>
          <DialogDescription className="truncate text-[length:var(--fs-11)]">{offer.title} · ελεύθερες {num(offer.free)} παλέτες</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 bg-muted/20 px-4 py-3">
          <Field label="Πελάτης" required>
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση πελάτη…" className={cn(fieldCls, 'pl-8')} autoFocus aria-label="Αναζήτηση πελάτη" />
            </div>
          </Field>
          <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card" aria-busy={!customers}>
            {shown.map((c) => (
              <li key={c.refId}>
                <label className={cn('flex min-h-11 cursor-pointer items-center gap-2 px-2.5 py-1.5 hover:bg-muted/50', trdr === c.refId && 'bg-emerald-50 dark:bg-emerald-500/10')}>
                  <input type="radio" name="res-customer" className="size-4 accent-[#047857]" checked={trdr === c.refId} onChange={() => setTrdr(c.refId)} />
                  <span className="min-w-0"><span className="block truncate text-[length:var(--fs-12)] font-medium">{c.name}</span><span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">{c.sub}</span></span>
                </label>
              </li>
            ))}
          </ul>
          {offer.items.length > 1 && (
            <Field label="Προϊόν" required htmlFor="res-item">
              <select id="res-item" value={item?.id} onChange={(e) => setItemId(e.target.value)} className={cn(fieldCls, 'h-9 w-full rounded-md border border-input bg-background px-2')}>
                {offer.items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
              </select>
            </Field>
          )}
          <Field label="Παλέτες (ανά ½)" required>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="size-9 p-0 text-[length:var(--fs-16)]" onClick={() => setPallets((p) => Math.max(offer.minOrder, p - PALLET_STEP))} aria-label="Μισή παλέτα λιγότερη">−</Button>
              <span className="min-w-20 text-center text-[length:var(--fs-18)] font-bold tabular-nums">{num(pallets)}</span>
              <Button type="button" variant="outline" size="sm" className="size-9 p-0 text-[length:var(--fs-16)]" onClick={() => setPallets((p) => Math.min(offer.free, p + PALLET_STEP))} aria-label="Μισή παλέτα περισσότερη">+</Button>
              <span className="text-[length:var(--fs-12)] text-muted-foreground">= {num(pallets * (item?.sqmPerPallet ?? 0))} {item?.baseUnit ?? 'τ.μ.'}</span>
            </div>
          </Field>
          {err ? <RowHint tone="bad">{err}</RowHint> : after && after.level !== offer.currentLevel
            ? <RowHint tone="ok">Με αυτή την κράτηση περνάμε στο W0{after.level}{item ? ` (${item.name}: ${eur(item.prices[after.level - 1] ?? 0)})` : ''} — πέφτουν οι τιμές όλων των προϊόντων και θα σταλεί «η τιμή έπεσε».</RowHint>
            : null}
          <Field label="Σημείωση" htmlFor="res-notes"><Input id="res-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className={fieldCls} /></Field>
        </DialogBody>
        <DialogFooter className="mx-0 mb-0 items-center gap-2 border-t border-border bg-card px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button size="sm" onClick={save} disabled={busy || !trdr || !item || !!err}>{busy && <FiLoader className="mr-1.5 size-3.5 animate-spin" aria-hidden />}Κράτηση</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// canReserve = δικαίωμα dynamic_offers.reservations (νέες κρατήσεις, ακύρωση, έγκριση/απόρριψη αιτημάτων).
export function OfferDetail({ offer, canReserve, onChanged }: { offer: OfferRow; canReserve: boolean; onChanged: () => void }) {
  const [data, setData] = React.useState<{ reservations: Reservation[]; recipients: Recipient[]; payments: Record<string, PaymentSummary> | null; paymentCaps: PaymentCaps } | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [previewKind, setPreviewKind] = React.useState<'publish' | 'drop'>('publish');
  const [chartItem, setChartItem] = React.useState(0);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  // Το onChanged του γονέα δεν είναι σταθερό — μέσω ref, ώστε το load να μην ξανατρέχει σε κάθε render.
  const onChangedRef = React.useRef(onChanged);
  onChangedRef.current = onChanged;
  const load = React.useCallback(() => {
    fetch(`/api/admin/dynamic-offers/${offer.id}`, { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          // 404: η προσφορά διαγράφηκε στο μεταξύ (π.χ. από άλλη καρτέλα) — ανανέωση της λίστας.
          setLoadError(r.status === 404 ? 'Η προσφορά δεν υπάρχει πια — ανανεώνεται η λίστα.' : (d.message ?? 'Αποτυχία φόρτωσης'));
          if (r.status === 404) onChangedRef.current();
          return;
        }
        setLoadError(null);
        setData({ reservations: d.reservations ?? [], recipients: d.recipients ?? [], payments: d.payments ?? null, paymentCaps: d.paymentCaps ?? { read: false, manage: false, refund: false } });
      })
      .catch(() => setLoadError('Αποτυχία φόρτωσης — έλεγξε τη σύνδεση.'));
  }, [offer.id]);
  React.useEffect(() => { load(); }, [load]);
  const first = offer.items[0];
  const unit = first?.baseUnit ?? 'τ.μ.';
  const load3d = loadOf(first?.name ?? '');
  const active = data?.reservations.filter((r) => r.status === 'ACTIVE') ?? [];
  const pending = data?.reservations.filter((r) => r.status === 'PENDING') ?? [];

  /** Μετά από αλλαγή γεμίσματος: νέα 3D εικόνα (για τα email) και «η τιμή έπεσε» αν πέρασε κλιμάκιο. */
  const refreshSnapshot = async (filled: number) => {
    try {
      const r = await uploadOfferSnapshot(offer.id, { pallets: offer.capacity, perPallet: first?.sqmPerPallet ?? 1, filled, load: load3d, slab: null }, true);
      if (r.drop) toast.success(`Οι τιμές έπεσαν στο W0${r.drop.level} — email: ${r.drop.sent} στάλθηκαν${r.drop.failed ? `, ${r.drop.failed} απέτυχαν` : ''}`);
    } catch (e) { toast.error((e as Error).message); }
  };

  const cancel = async (r: Reservation) => {
    if (!(await confirmAction({ title: 'Ακύρωση κράτησης', message: `Ακύρωση της κράτησης ${num(r.pallets)} παλετών του «${r.customer}»; Η τιμή δεν ανεβαίνει για όσους έχουν ήδη ενημερωθεί.`, confirmLabel: 'Ακύρωση κράτησης', destructive: true }))) return;
    const res = await fetch(`/api/admin/dynamic-offers/${offer.id}/reservations/${r.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).message ?? 'Αποτυχία'); return; }
    toast.success('Η κράτηση ακυρώθηκε');
    await refreshSnapshot(Math.max(0, offer.filled - r.pallets));
    load(); onChanged();
  };

  /** Αίτημα από το portal: έγκριση (μετράει στο γέμισμα → νέα 3D εικόνα + «η τιμή έπεσε») ή απόρριψη. */
  const decide = async (r: Reservation, decision: 'approve' | 'reject') => {
    let note: string | null = null;
    if (decision === 'reject') {
      if (!(await confirmAction({ title: 'Απόρριψη αιτήματος', message: `Απόρριψη του αιτήματος ${num(r.pallets)} παλετών του «${r.customer}»; Θα ενημερωθεί με email.`, confirmLabel: 'Απόρριψη', destructive: true }))) return;
    } else if (!(await confirmAction({ title: 'Έγκριση κράτησης', message: `Έγκριση ${num(r.pallets)} παλετών «${r.product.name}» για «${r.customer}»; Θα μετρήσει στο γέμισμα και αν περάσει κλιμάκιο θα σταλεί «η τιμή έπεσε».`, confirmLabel: 'Έγκριση' }))) return;
    const res = await fetch(`/api/admin/dynamic-offers/${offer.id}/reservations/${r.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note }) });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).message ?? 'Αποτυχία'); return; }
    const out = await res.json().catch(() => ({}));
    toast.success(decision === 'approve' ? 'Η κράτηση εγκρίθηκε' : 'Το αίτημα απορρίφθηκε');
    if (out.payment?.created) toast.success(out.payment.emailed ? 'Στάλθηκε αίτημα πληρωμής Viva' : `Αίτημα πληρωμής Viva χωρίς email${out.payment.emailError ? `: ${out.payment.emailError}` : ''}`);
    else if (out.payment && out.payment.reason !== 'disabled') toast.error(`Πληρωμή Viva: ${out.payment.message}`);
    if (decision === 'approve') await refreshSnapshot(offer.filled + r.pallets);
    load(); onChanged();
  };

  const statusCell = (r: Reservation) => {
    if (r.status === 'ACTIVE') return <span className="inline-flex items-center gap-1 text-emerald-700"><FiCheckCircle className="size-3.5" aria-hidden /> Ενεργή</span>;
    if (r.status === 'PENDING') return <span className="inline-flex items-center gap-1 font-medium text-amber-700"><FiClock className="size-3.5" aria-hidden /> Αίτημα · αναμονή</span>;
    if (r.status === 'REJECTED') return <span className="inline-flex items-center gap-1 text-muted-foreground" title={r.decisionNote ?? undefined}><FiXCircle className="size-3.5" aria-hidden /> Απορρίφθηκε</span>;
    return <span className="inline-flex items-center gap-1 text-muted-foreground" title={r.decisionNote ?? undefined}><FiXCircle className="size-3.5" aria-hidden /> {r.decisionNote ? 'Αποσύρθηκε' : 'Ακυρώθηκε'}</span>;
  };

  if (loadError) {
    return (
      <p role="alert" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)] text-destructive">
        <FiAlertTriangle className="size-4 shrink-0" aria-hidden /> {loadError}
      </p>
    );
  }

  return (
    <>
      <Tabs defaultValue="overview" className="gap-3">
        <div className="flex items-center gap-2 border-b border-border">
          <TabsList variant="line" className="h-9 min-w-0 flex-1 justify-start gap-0 overflow-x-auto overflow-y-hidden p-0">
            <TabsTrigger value="overview" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.over }}><FiActivity className="hidden size-3.5 sm:inline" aria-hidden /> Επισκόπηση</TabsTrigger>
            <TabsTrigger value="res" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.res }}><FiShoppingCart className="hidden size-3.5 sm:inline" aria-hidden /> Κρατήσεις <Badge n={active.length} tone={TONE.res} />{pending.length > 0 && <Badge n={pending.length} tone="#B45309" />}</TabsTrigger>
            <TabsTrigger value="rec" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.rec }}><FiUsers className="hidden size-3.5 sm:inline" aria-hidden /> Παραλήπτες <Badge n={data?.recipients.length ?? 0} tone={TONE.rec} /></TabsTrigger>
            <TabsTrigger value="mail" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.mail }}><FiMail className="hidden size-3.5 sm:inline" aria-hidden /> Email</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
            <ContainerScene pallets={offer.capacity} perPallet={first?.sqmPerPallet ?? 1} filled={offer.filled} load={load3d} labels={{ container: 'Container', pallet: 'ΠΑΛ', base: unit }} heightClass="h-72" />
            <div className="min-w-0 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: soft('#047857', 35), backgroundColor: soft('#047857', 6) }}>
                  <div className="text-[length:var(--fs-11)] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Κλιμάκιο τώρα</div>
                  <div className="text-[length:var(--fs-24)] font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">W0{offer.currentLevel}</div>
                  <div className="text-[length:var(--fs-11)] text-muted-foreground">από {offer.levels.length} · κοινό για {offer.items.length} {offer.items.length === 1 ? 'προϊόν' : 'προϊόντα'}</div>
                </div>
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: soft('#B45309', 35), backgroundColor: soft('#B45309', 6) }}>
                  <div className="text-[length:var(--fs-11)] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Επόμενη πτώση</div>
                  {offer.nextLevel
                    ? <><div className="text-[length:var(--fs-24)] font-extrabold tabular-nums text-amber-700 dark:text-amber-300">W0{offer.nextLevel.level}</div><div className="text-[length:var(--fs-11)] text-muted-foreground">σε {num(offer.nextLevel.missing)} παλέτες ακόμη</div></>
                    : <div className="pt-1 text-[length:var(--fs-13)] font-semibold text-emerald-700">Καλύτερη τιμή ✓</div>}
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[length:var(--fs-12)] tabular-nums"><span><strong>{num(offer.filled)}</strong> / {num(offer.capacity)} παλέτες</span><span className="text-muted-foreground">{Math.round(offer.percent)}%{offer.pending > 0 ? ` · ${num(offer.pending)} σε αναμονή` : ''}</span></div>
                <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(offer.percent)} aria-valuemin={0} aria-valuemax={100} aria-label="Γέμισμα container">
                  <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${offer.percent}%` }} />
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full">
                  <thead className="bg-muted/40"><tr><th className={TH}>Προϊόν</th><th className={cn(TH, 'text-right')}>Τώρα</th><th className={cn(TH, 'text-right')}>Επόμενη</th><th className={cn(TH, 'text-right')}>Κρατ.</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {offer.items.map((it, i) => (
                      <tr key={it.id} className={cn('cursor-pointer hover:bg-muted/30', chartItem === i && offer.items.length > 1 && 'bg-sky-50/60 dark:bg-sky-500/5')} onClick={() => setChartItem(i)}>
                        <td className={TD}><span className="block max-w-56 truncate font-medium" title={it.name}>{it.name}</span><span className="text-[length:var(--fs-11)] text-muted-foreground">{it.code} · {num(it.sqmPerPallet)} {it.baseUnit ?? 'τ.μ.'}/παλ.</span></td>
                        <td className={cn(TD, 'text-right font-bold tabular-nums text-emerald-700')}>{it.current ? eur(it.current.price) : '—'}</td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{it.next ? eur(it.next.tier.price) : <span className="text-emerald-700">✓</span>}</td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{num(it.booked)}{it.pending > 0 && <span className="ml-1 text-amber-700">+{num(it.pending)}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {offer.items[chartItem] && <PriceLadder tiers={offer.items[chartItem].tiers} capacity={offer.capacity} filled={offer.filled} unit={offer.items[chartItem].baseUnit ?? 'τ.μ.'} height={170} />}
              {offer.items.length > 1 && <p className="text-[length:var(--fs-11)] text-muted-foreground">Γράφημα: {offer.items[chartItem]?.name} — πατήστε σε προϊόν για άλλο.</p>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="res" className="space-y-2">
          {data?.payments && data.paymentCaps.refund && offer.status === 'CLOSED' && (
            <div className="flex justify-end"><RefundDiffsButton offerId={offer.id} payments={data.payments} onDone={load} /></div>
          )}
          {canReserve && (
            <div className="flex items-center justify-end gap-2">
              {offer.status !== 'OPEN' && <span className="text-[length:var(--fs-11)] text-muted-foreground">Κρατήσεις γίνονται όταν η προσφορά είναι δημοσιευμένη.</span>}
              <Button size="sm" onClick={() => setAddOpen(true)} disabled={offer.status !== 'OPEN' || offer.full}><FiPlus className="mr-1 size-3.5" aria-hidden /> Νέα κράτηση</Button>
            </div>
          )}
          {!data ? <div className="h-24 animate-pulse rounded-md bg-muted" /> : data.reservations.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-[length:var(--fs-12)] text-muted-foreground">Καμία κράτηση ακόμη.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full">
                <thead className="bg-muted/40"><tr><th className={TH}>Πελάτης</th>{offer.items.length > 1 && <th className={TH}>Προϊόν</th>}<th className={cn(TH, 'text-right')}>Παλέτες</th><th className={cn(TH, 'text-right')}>Ποσότητα</th><th className={cn(TH, 'hidden sm:table-cell')}>Ημ/νία</th><th className={TH}>Κατάσταση</th>{data.payments && <th className={TH}>Πληρωμή</th>}{(canReserve || data.paymentCaps.read) && <th className={TH}><span className="sr-only">Ενέργειες</span></th>}</tr></thead>
                <tbody className="divide-y divide-border">
                  {data.reservations.map((r) => {
                    const pay = data.payments?.[r.id];
                    const payItems = data.payments ? paymentMenuItems({ offerId: offer.id, reservation: r, p: pay, caps: data.paymentCaps, onDone: load }) : [];
                    const resActions = canReserve && (r.status === 'ACTIVE' || r.status === 'PENDING') && offer.status !== 'CLOSED';
                    return (
                    <tr key={r.id} className={cn('hover:bg-muted/30', r.status === 'PENDING' && 'bg-amber-50/60 dark:bg-amber-500/5', r.status !== 'ACTIVE' && r.status !== 'PENDING' && 'opacity-55')}>
                      <td className={TD}><span className="font-medium">{r.customer}</span>{r.kind === 'PARTNER' && <span className="ml-1.5 rounded-sm bg-violet-100 px-1 text-[length:var(--fs-10)] font-semibold text-violet-800">Συνεργάτης</span>}{r.fromPortal && <span className="ml-1.5 rounded-sm bg-sky-100 px-1 text-[length:var(--fs-10)] font-semibold text-sky-800">portal</span>}{r.notes && <div className="text-[length:var(--fs-11)] text-muted-foreground">{r.notes}</div>}</td>
                      {offer.items.length > 1 && <td className={TD}><span className="block max-w-48 truncate" title={r.product.name}>{r.product.name}</span><span className="text-[length:var(--fs-11)] text-muted-foreground">{r.product.code}</span></td>}
                      <td className={cn(TD, 'text-right font-semibold tabular-nums')}>{num(r.pallets)}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{num(r.sqm)} <span className="text-muted-foreground">{r.unit}</span></td>
                      <td className={cn(TD, 'hidden tabular-nums text-muted-foreground sm:table-cell')}>{new Date(r.createdAt).toLocaleDateString('el-GR')}</td>
                      <td className={TD}>{statusCell(r)}</td>
                      {data.payments && <td className={TD}><PaymentBadge p={pay} reservationStatus={r.status} /></td>}
                      {(canReserve || data.paymentCaps.read) && (
                        <td className={cn(TD, 'w-10 text-right')}>
                          {(resActions || payItems.length > 0) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={`Ενέργειες για ${r.customer}`}><FiMoreVertical className="size-4" aria-hidden /></DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                {!resActions ? null : r.status === 'PENDING' ? (
                                  <>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-[length:var(--fs-12)]" disabled={offer.status !== 'OPEN'} onSelect={() => decide(r, 'approve')}><FiCheckCircle className="size-3.5 text-emerald-600" aria-hidden /> Έγκριση</DropdownMenuItem>
                                    <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2 text-[length:var(--fs-12)]" onSelect={() => decide(r, 'reject')}><FiXCircle className="size-3.5" aria-hidden /> Απόρριψη</DropdownMenuItem>
                                  </>
                                ) : (
                                  <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2 text-[length:var(--fs-12)]" onSelect={() => cancel(r)}><FiXCircle className="size-3.5" aria-hidden /> Ακύρωση κράτησης</DropdownMenuItem>
                                )}
                                {resActions ? payItems : payItems.slice(1)}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rec">
          {!data ? <div className="h-24 animate-pulse rounded-md bg-muted" /> : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full">
                <thead className="bg-muted/40"><tr><th className={TH}>Παραλήπτης</th><th className={cn(TH, 'hidden sm:table-cell')}>Email</th><th className={TH}>Αποστολές</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {data.recipients.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className={TD}><span className="font-medium">{r.name}</span><div className="text-[length:var(--fs-11)] text-muted-foreground">{r.kind === 'CUSTOMER' ? 'Πελάτης' : 'Συνεργάτης'}</div></td>
                      <td className={cn(TD, 'hidden sm:table-cell')}>{r.email ?? <span className="inline-flex items-center gap-1 text-amber-700"><FiAlertTriangle className="size-3.5" aria-hidden /> χωρίς email</span>}</td>
                      <td className={TD}>
                        <div className="flex flex-wrap gap-1">
                          {r.emails.length === 0 && <span className="inline-flex items-center gap-1 text-[length:var(--fs-11)] text-muted-foreground"><FiClock className="size-3" aria-hidden /> δεν στάλθηκε</span>}
                          {r.emails.map((e, i) => (
                            <span key={i} title={e.error ?? new Date(e.sentAt).toLocaleString('el-GR')} className={cn('rounded-sm px-1.5 py-0.5 text-[length:var(--fs-10)] font-semibold', e.status === 'SENT' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-red-100 text-red-800')}>
                              {e.kind === 'PUBLISH' ? 'Προσφορά' : `Πτώση → W0${e.level}`} {e.status === 'SENT' ? '✓' : '✗'}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="mail" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[length:var(--fs-12)] text-muted-foreground">Προεπισκόπηση:</span>
            {(['publish', 'drop'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setPreviewKind(k)} className={cn('h-7 cursor-pointer rounded-md border px-2.5 text-[length:var(--fs-11)] font-medium', previewKind === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground')}>
                {k === 'publish' ? 'Προσφορά' : '«Η τιμή έπεσε»'}
              </button>
            ))}
          </div>
          <iframe title="Προεπισκόπηση email" src={`/api/admin/dynamic-offers/${offer.id}/email-preview?kind=${previewKind}`} className="h-[640px] w-full rounded-md border border-border bg-slate-100" />
        </TabsContent>
      </Tabs>
      {canReserve && (
        <ReservationDialog open={addOpen} onOpenChange={setAddOpen} offer={offer} onSaved={async (p) => {
          toast.success('Η κράτηση καταχωρίστηκε');
          await refreshSnapshot(offer.filled + p);
          load(); onChanged();
        }} />
      )}
    </>
  );
}
