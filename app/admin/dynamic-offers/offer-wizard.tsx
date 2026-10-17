'use client';

// Οδηγός «Δυναμική προσφορά» σε 4 βήματα:
//   1 Προϊόν · 2 Μονάδες (τ.μ. container / παλέτας, προαιρετικά και στο είδος του SoftOne)
//   3 Τιμές (σημεία πτώσης σε παλέτες → PRICEW01…05, η 01 η μεγαλύτερη) · 4 Δημοσίευση (ημερομηνία,
//   προθεσμία, παραλήπτες πελάτες/συνεργάτες, προεπισκόπηση email).
import * as React from 'react';
import dynamic from 'next/dynamic';
import {
  FiPackage, FiBox, FiTrendingDown, FiSend, FiSearch, FiCheck, FiChevronLeft, FiChevronRight, FiLoader, FiPlus,
  FiMoreVertical, FiTrash2, FiZap, FiMail, FiAlertTriangle, FiUsers, FiUserCheck, FiEye,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field, FormSection, RowHint, Segmented, fieldCls } from '@/components/admin/form-kit';
import { UnitThumb } from '@/components/admin/unit-visual';
import { presetIds, type UnitMeta } from '@/components/admin/item-unit-setup-panel';
import { uploadOfferSnapshot } from '@/components/admin/container-snapshot';
import { capacityPallets, checkTiers, MAX_TIERS, PALLET_STEP, roundStep, type Tier } from '@/lib/container-pricing';
import { PriceLadder } from './price-ladder';

const ContainerScene = dynamic(() => import('@/components/admin/container-scene'), {
  ssr: false, loading: () => <div className="h-64 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />,
});

type ItemHit = { mtrl: number; code: string; name: string; photo: string | null; baseUnit: string | null; price: number | null };
type Rec = Record<string, unknown> & { name: string; unit1: string | null; unit2: string | null; ratio2: number; unitBuy: string | null; buyRatio: number; dim1: number; dim2: number; dim3: number; priceWholesale: number };
type Option = { kind: 'CUSTOMER' | 'PARTNER'; refId: string; name: string; sub: string; email: string | null };
type TierRow = { from: string; price: string };

const STEPS = [
  { title: 'Προϊόν', icon: FiPackage },
  { title: 'Μονάδες', icon: FiBox },
  { title: 'Τιμές', icon: FiTrendingDown },
  { title: 'Δημοσίευση', icon: FiSend },
] as const;

const parse = (v: string) => { const s = v.trim().replace(/\s/g, ''); return s ? Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) : NaN; };
const fmt = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n !== 0 ? n.toLocaleString('el-GR', { maximumFractionDigits: 4, useGrouping: false }) : '');
const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const strip = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '');
const loadOf = (name: string): 'stones' | 'boxes' | 'sacks' => {
  const n = strip(name);
  if (/κολλ|τσιμεντ|κονιαμ|στοκ|αρμο|σοβα|glue|cement|mortar|grout/.test(n)) return 'sacks';
  if (/πετρ|stone|τραβερτ|travert/.test(n) && !/πλακακι|gres|porcel/.test(n)) return 'stones';
  return 'boxes';
};
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Πρόταση σημείων: ½ παλέτα, ¼, ½, ¾ και γεμάτο container (ανά ½ παλέτα). */
function suggestPoints(capacity: number, n: number): number[] {
  const marks = [0, 0.25, 0.5, 0.75, 1].slice(0, n).map((f, i) => (i === 0 ? PALLET_STEP : roundStep(capacity * f)));
  return marks.map((v, i) => (i > 0 && v <= marks[i - 1] ? marks[i - 1] + PALLET_STEP : v));
}

export function OfferWizard({ open, onOpenChange, offerId, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; offerId: string | null; onDone: () => void;
}) {
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [locked, setLocked] = React.useState(false); // υπάρχουν κρατήσεις → προϊόν/χωρητικότητα «παγωμένα»
  const [filledNow, setFilledNow] = React.useState(0);
  const [status, setStatus] = React.useState<string>('DRAFT');
  // 1
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<ItemHit[]>([]);
  const [item, setItem] = React.useState<ItemHit | null>(null);
  // 2
  const [rec, setRec] = React.useState<Rec | null>(null);
  const [meta, setMeta] = React.useState<UnitMeta[]>([]);
  const [sqmPallet, setSqmPallet] = React.useState('');
  const [sqmContainer, setSqmContainer] = React.useState('');
  const [syncUnits, setSyncUnits] = React.useState(false);
  // 3
  const [tiers, setTiers] = React.useState<TierRow[]>([]);
  // 4
  const [title, setTitle] = React.useState('');
  const [when, setWhen] = React.useState<'now' | 'later' | 'draft'>('now');
  const [publishAt, setPublishAt] = React.useState('');
  const [closesAt, setClosesAt] = React.useState('');
  const [options, setOptions] = React.useState<{ customers: Option[]; partners: Option[] } | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [rq, setRq] = React.useState('');
  const [preview, setPreview] = React.useState<{ id: string; kind: 'publish' | 'drop' } | null>(null);
  const savedId = React.useRef<string | null>(null);
  const autoTitle = React.useRef(''); // ο αυτόματος τίτλος ακολουθεί το προϊόν όσο δεν τον άλλαξε ο χρήστης

  const reset = React.useCallback(() => {
    setStep(0); setBusy(null); setLocked(false); setFilledNow(0); setStatus('DRAFT'); setQ(''); setHits([]); setItem(null); setRec(null); setMeta([]);
    setSqmPallet(''); setSqmContainer(''); setSyncUnits(false); setTiers([]); setTitle(''); setWhen('now'); setPublishAt(''); setClosesAt('');
    setPicked(new Set()); setRq(''); savedId.current = null;
  }, []);

  // Επεξεργασία υπάρχουσας: φόρτωση όλων.
  React.useEffect(() => {
    if (!open) return;
    reset();
    if (!offerId) return;
    savedId.current = offerId;
    setBusy('Φόρτωση…');
    fetch(`/api/admin/dynamic-offers/${offerId}`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      const o = d.offer;
      setItem({ mtrl: o.mtrl, code: o.code, name: o.name, photo: null, baseUnit: o.baseUnit, price: null });
      setSqmPallet(fmt(o.sqmPerPallet)); setSqmContainer(fmt(o.sqmPerContainer));
      setTiers(o.tiers.map((t: Tier) => ({ from: fmt(t.fromPallets), price: fmt(t.price) })));
      setTitle(o.title ?? ''); setClosesAt(o.closesAt ? o.closesAt.slice(0, 10) : '');
      setStatus(o.status); setFilledNow(o.filled); setLocked(o.filled > 0);
      setWhen(o.status === 'OPEN' ? 'now' : o.status === 'SCHEDULED' ? 'later' : 'now');
      if (o.publishAt && o.status === 'SCHEDULED') setPublishAt(localInput(new Date(o.publishAt)));
      setPicked(new Set(d.recipients.map((r: { kind: string; refId: string }) => `${r.kind}:${r.refId}`)));
      setStep(o.status === 'OPEN' ? 2 : 0);
    }).catch(() => toast.error('Αποτυχία φόρτωσης')).finally(() => setBusy(null));
  }, [open, offerId, reset]);

  // 1 · αναζήτηση προϊόντων (με καθυστέρηση πληκτρολόγησης)
  React.useEffect(() => {
    if (!open || step !== 0) return;
    const h = setTimeout(() => {
      fetch(`/api/admin/dynamic-offers/options?items=${encodeURIComponent(q)}`).then((r) => r.json()).then((d) => setHits(d.items ?? [])).catch(() => null);
    }, 220);
    return () => clearTimeout(h);
  }, [q, open, step]);

  // 2 · ζωντανή καρτέλα του είδους (μονάδες, διαστάσεις, PRICEW)
  React.useEffect(() => {
    if (!item) return;
    let alive = true;
    fetch(`/api/admin/softone/items/${item.mtrl}/full`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (!alive || !d.record) return;
      setRec(d.record); setMeta(d.unitsMeta ?? []);
      const r = d.record as Rec;
      setSqmPallet((v) => v || (r.unit2 && r.unit2 !== r.unit1 && r.ratio2 > 0 ? fmt(r.ratio2) : ''));
      setSqmContainer((v) => v || (r.unitBuy && r.unitBuy !== r.unit1 && r.buyRatio > 0 ? fmt(r.buyRatio) : ''));
      setTiers((cur) => {
        if (cur.length) return cur;
        const prices = [1, 2, 3, 4, 5].map((i) => Number(r[`priceW0${i}`]) || 0);
        return prices.some((p) => p > 0) ? prices.filter((p) => p > 0).map((p) => ({ from: '', price: fmt(p) })) : [];
      });
    }).catch(() => null);
    return () => { alive = false; };
  }, [item]);

  const perPallet = parse(sqmPallet);
  const perContainer = parse(sqmContainer);
  const capacity = capacityPallets(perContainer, perPallet);
  const unit = item?.baseUnit ?? 'τ.μ.';
  const ids = presetIds(meta);
  const sceneLoad = loadOf(item?.name ?? '');
  const slab = rec && rec.dim1 > 0 && rec.dim2 > 0 ? { l: rec.dim1 / 100, w: rec.dim2 / 100, t: (rec.dim3 > 0 ? rec.dim3 : 2) / 100 } : null;

  const tierList: Tier[] = tiers.map((t, i) => ({ level: i + 1, fromPallets: parse(t.from), price: parse(t.price) }));
  const tierIssues = capacity > 0 ? checkTiers(tierList, capacity) : [];
  const tierErrors = tierIssues.filter((i) => i.level === 'error');

  const allOptions = React.useMemo(() => [...(options?.customers ?? []), ...(options?.partners ?? [])], [options]);
  React.useEffect(() => {
    if (step === 3 && !options) fetch('/api/admin/dynamic-offers/options').then((r) => r.json()).then(setOptions).catch(() => toast.error('Αποτυχία φόρτωσης παραληπτών'));
  }, [step, options]);

  const canNext = [
    !!item,
    perPallet > 0 && perContainer > 0 && capacity >= PALLET_STEP,
    tiers.length > 0 && tierErrors.length === 0,
    true,
  ][step];

  // ── Αποθήκευση: μονάδες (προαιρετικά) → προσφορά → παραλήπτες → 3D εικόνα ──
  const persist = async (): Promise<string> => {
    if (!item) throw new Error('Δεν επιλέχθηκε προϊόν');
    if (syncUnits && rec && ids) {
      const ok = await confirmAction({
        title: 'Ενημέρωση μονάδων στο SoftOne',
        message: `Στο είδος ${item.code} θα γραφτούν: Μ.Μ.2 = Παλέτα (1 = ${fmt(perPallet)} ${unit}) και Μονάδα αγορών = Container (1 = ${fmt(perContainer)} ${unit}). Συνέχεια;`,
        confirmLabel: 'Ενημέρωση',
      });
      if (ok) {
        setBusy('Ενημέρωση μονάδων στο SoftOne…');
        const res = await fetch(`/api/admin/softone/items/${item.mtrl}/full`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unit2: ids.pallet, ratio2: perPallet, strict2: false, unitBuy: ids.container, buyRatio: perContainer }),
        });
        const b = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(b.message ?? 'Η ενημέρωση των μονάδων απέτυχε');
      }
    }
    setBusy('Αποθήκευση προσφοράς…');
    const body = {
      mtrl: item.mtrl, title: title || null, sqmPerContainer: perContainer, sqmPerPallet: perPallet, minOrder: PALLET_STEP,
      closesAt: closesAt ? new Date(`${closesAt}T23:59:00`).toISOString() : null, notes: null, tiers: tierList,
    };
    const id = savedId.current;
    const res = await fetch(id ? `/api/admin/dynamic-offers/${id}` : '/api/admin/dynamic-offers', {
      method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.message ?? 'Η αποθήκευση απέτυχε');
    const newId: string = id ?? d.offer.id;
    savedId.current = newId;
    setBusy('Παραλήπτες…');
    const recipients = [...picked].map((k) => { const [kind, ...rest] = k.split(':'); return { kind, refId: rest.join(':') }; });
    const rr = await fetch(`/api/admin/dynamic-offers/${newId}/recipients`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipients }) });
    if (!rr.ok) throw new Error((await rr.json().catch(() => ({}))).message ?? 'Αποτυχία αποθήκευσης παραληπτών');
    setBusy('3D εικόνα για το email…');
    // Πρώτη αποστολή: ΓΕΜΑΤΟ container (τι παίρνει ο πελάτης)· αν υπάρχουν κρατήσεις, το πραγματικό γέμισμα.
    await uploadOfferSnapshot(newId, { pallets: capacity, perPallet, filled: filledNow > 0 ? filledNow : capacity, load: sceneLoad, slab });
    return newId;
  };

  const finish = async (mode: 'draft' | 'publish') => {
    try {
      const id = await persist();
      if (mode === 'publish' && status !== 'OPEN') {
        const at = when === 'later' && publishAt ? new Date(publishAt) : null;
        if (when === 'later' && (!at || at.getTime() < Date.now())) throw new Error('Διάλεξε μελλοντική ημερομηνία δημοσίευσης');
        const ok = await confirmAction({
          title: at ? 'Προγραμματισμός δημοσίευσης' : 'Δημοσίευση τώρα',
          message: at
            ? `Η προσφορά θα δημοσιευτεί ${at.toLocaleString('el-GR')} και θα σταλεί σε ${picked.size} παραλήπτες. Οι τιμές PRICEW01…0${tierList.length} γράφονται στο SoftOne τη στιγμή της δημοσίευσης.`
            : `Θα γραφτούν οι τιμές PRICEW01…0${tierList.length} στο είδος ${item?.code} στο SoftOne και θα σταλεί email σε ${picked.size} παραλήπτες. Συνέχεια;`,
          confirmLabel: at ? 'Προγραμματισμός' : 'Δημοσίευση',
        });
        if (!ok) { setBusy(null); return; }
        setBusy(at ? 'Προγραμματισμός…' : 'Δημοσίευση και αποστολή email…');
        const res = await fetch(`/api/admin/dynamic-offers/${id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publishAt: at?.toISOString() ?? null }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.message ?? 'Η δημοσίευση απέτυχε');
        toast.success(d.scheduled
          ? `Προγραμματίστηκε για ${new Date(d.publishAt).toLocaleString('el-GR')}`
          : `Δημοσιεύτηκε · email: ${d.sent} στάλθηκαν${d.failed ? `, ${d.failed} απέτυχαν` : ''}${d.skipped ? `, ${d.skipped} χωρίς email` : ''}`);
      } else {
        toast.success(status === 'OPEN' ? 'Η προσφορά ενημερώθηκε (και οι τιμές στο SoftOne)' : 'Αποθηκεύτηκε ως πρόχειρο');
      }
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  };

  const openPreview = async (kind: 'publish' | 'drop') => {
    try { const id = await persist(); setPreview({ id, kind }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  // ── Βήματα ──
  const stepProduct = (
    <div className="space-y-3">
      <div className="relative">
        <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση προϊόντος (κωδικός ή περιγραφή)…" className={cn(fieldCls, 'h-10 pl-8')} autoFocus disabled={locked} aria-label="Αναζήτηση προϊόντος" />
      </div>
      {item && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-emerald-500/50 bg-emerald-50/60 px-3 py-2 dark:bg-emerald-500/10">
          {item.photo ? <img src={item.photo} alt="" className="size-14 rounded-md object-cover" /> : <span className="grid size-14 place-items-center rounded-md bg-muted"><FiPackage className="size-6 text-muted-foreground" aria-hidden /></span>}
          <div className="min-w-0 flex-1">
            <div className="text-[length:var(--fs-11)] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Επιλεγμένο προϊόν</div>
            <div className="truncate text-[length:var(--fs-14)] font-semibold">{item.name}</div>
            <div className="text-[length:var(--fs-12)] text-muted-foreground">{item.code}{item.baseUnit ? ` · μονάδα ${item.baseUnit}` : ''}</div>
          </div>
          <FiCheck className="size-6 text-emerald-600" aria-hidden />
        </div>
      )}
      {locked && <RowHint tone="warn">Υπάρχουν ήδη κρατήσεις — το προϊόν δεν αλλάζει.</RowHint>}
      {!locked && (
        <ul className="grid max-h-[46dvh] gap-1.5 overflow-y-auto sm:grid-cols-2" aria-label="Αποτελέσματα">
          {hits.map((h) => (
            <li key={h.mtrl}>
              <button
                type="button" onClick={() => { setItem(h); setRec(null); setSqmPallet(''); setSqmContainer(''); setTiers([]); if (!title || title === autoTitle.current) { autoTitle.current = `${h.name} — Κοινό container`; setTitle(autoTitle.current); } }}
                className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted/60', item?.mtrl === h.mtrl ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/10' : 'border-border bg-card')}
              >
                {h.photo ? <img src={h.photo} alt="" className="size-10 shrink-0 rounded object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded bg-muted"><FiPackage className="size-4 text-muted-foreground" aria-hidden /></span>}
                <span className="min-w-0">
                  <span className="block truncate text-[length:var(--fs-13)] font-medium">{h.name}</span>
                  <span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">{h.code}{h.baseUnit ? ` · ${h.baseUnit}` : ''}</span>
                </span>
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="col-span-full py-6 text-center text-[length:var(--fs-12)] text-muted-foreground">Κανένα προϊόν</li>}
        </ul>
      )}
    </div>
  );

  const stepUnits = (
    <div className="space-y-3">
      <FormSection tone="amber" icon={<FiBox />} title="Χωρητικότητα" aside={<span>σε {unit} — τη βασική μονάδα του είδους</span>}>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Field label={`${unit} ανά παλέτα`} required htmlFor="w-pallet">
            <Input id="w-pallet" inputMode="decimal" value={sqmPallet} onChange={(e) => setSqmPallet(e.target.value)} className={cn(fieldCls, 'tabular-nums')} disabled={locked} autoFocus />
          </Field>
          <Field label={`${unit} σε όλο το container`} required htmlFor="w-cont">
            <Input id="w-cont" inputMode="decimal" value={sqmContainer} onChange={(e) => setSqmContainer(e.target.value)} className={cn(fieldCls, 'tabular-nums')} disabled={locked} />
          </Field>
          <Field label="Παλέτες στο container">
            <div className="flex h-8 items-center rounded-md bg-muted/60 px-2.5 text-[length:var(--fs-14)] font-semibold tabular-nums">{capacity > 0 ? fmt(capacity) : '—'}</div>
          </Field>
        </div>
        <RowHint>Ελάχιστη παραγγελία πελάτη: ½ παλέτα ({perPallet > 0 ? fmt(perPallet / 2) : '—'} {unit}). Οι κρατήσεις γίνονται ανά ½ παλέτα.</RowHint>
        {locked && <RowHint tone="warn">Υπάρχουν κρατήσεις ({fmt(filledNow)} παλέτες) — η χωρητικότητα δεν αλλάζει.</RowHint>}
      </FormSection>

      {capacity > 0 && (
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <p className="mb-1.5 text-[length:var(--fs-11)] font-semibold uppercase tracking-wide text-muted-foreground">Με μια ματιά</p>
          <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-13)] tabular-nums">
            <span className="inline-flex items-center gap-1.5"><UnitThumb kind="container" size={52} /><strong>1</strong> Container</span>
            <span className="text-muted-foreground">=</span>
            <span className="inline-flex items-center gap-1.5"><UnitThumb kind="pallet" size={52} /><strong>{fmt(capacity)}</strong> παλέτες</span>
            <span className="text-muted-foreground">=</span>
            <span className="inline-flex items-center gap-1.5"><UnitThumb kind={sceneLoad === 'sacks' ? 'sack' : 'sqm'} size={52} /><strong>{fmt(capacity * perPallet)}</strong> {unit}</span>
          </div>
          {Math.abs(capacity * perPallet - perContainer) > 1e-6 && <RowHint tone="warn">Τα {fmt(perContainer)} {unit} δεν διαιρούνται ακριβώς σε παλέτες — μετράνε {fmt(capacity)} γεμάτες (= {fmt(capacity * perPallet)} {unit}).</RowHint>}
        </div>
      )}
      {capacity > 0 && (
        <ContainerScene pallets={capacity} perPallet={perPallet} filled={filledNow || undefined} load={sceneLoad} slab={slab}
          labels={{ container: 'Container', pallet: 'ΠΑΛ', base: unit }} heightClass="h-64 sm:h-72" />
      )}
      <label className={cn('flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-[length:var(--fs-12)]', !ids && 'opacity-60')}>
        <input type="checkbox" className="mt-0.5 size-4 accent-[#B45309]" checked={syncUnits} disabled={!ids || !rec} onChange={(e) => setSyncUnits(e.target.checked)} />
        <span>
          <strong>Ενημέρωση και των μονάδων του είδους στο SoftOne</strong> — Μ.Μ.2 = Παλέτα ({fmt(perPallet) || '…'} {unit}), Μονάδα αγορών = Container ({fmt(perContainer) || '…'} {unit}).
          {!ids && <span className="block text-muted-foreground">Λείπουν οι μονάδες Παλέτα/Container — φτιάξε τες στο Operations → Μονάδες μέτρησης.</span>}
        </span>
      </label>
    </div>
  );

  const setTier = (i: number, patch: Partial<TierRow>) => setTiers((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const stepPrices = (
    <div className="space-y-3">
      <FormSection tone="emerald" icon={<FiTrendingDown />} title="Σημεία πτώσης τιμής" aside={(
        <Button type="button" variant="outline" size="sm" className="h-7 text-[length:var(--fs-11)]" disabled={!(capacity > 0)}
          onClick={() => {
            const n = Math.max(tiers.length, Math.min(MAX_TIERS, Math.max(2, Math.floor(capacity / PALLET_STEP))));
            const pts = suggestPoints(capacity, Math.min(n, MAX_TIERS));
            setTiers(pts.map((p, i) => ({ from: fmt(p) || '0,5', price: tiers[i]?.price ?? '' })));
          }}
        ><FiZap className="mr-1 size-3" aria-hidden /> Πρόταση σημείων</Button>
      )}>
        <p className="text-[length:var(--fs-12)] text-muted-foreground">
          Η <strong>PRICEW01</strong> είναι η μεγαλύτερη τιμή (ισχύει από την πρώτη ½ παλέτα). Κάθε επόμενο σημείο: «όταν κλειστούν Χ παλέτες, η τιμή πέφτει σε…» — για <strong>όλους</strong>.
        </p>
        <div className="space-y-1.5">
          {tiers.map((t, i) => {
            const issues = tierIssues.filter((x) => x.tier === i + 1);
            return (
              <div key={i} className="rounded-md border border-border bg-card px-2.5 py-2">
                <div className="grid grid-cols-12 items-center gap-2">
                  <span className="col-span-12 inline-flex items-center gap-1.5 text-[length:var(--fs-12)] font-semibold sm:col-span-2">
                    <span className="rounded-sm bg-emerald-100 px-1.5 py-0.5 font-mono text-[length:var(--fs-11)] text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">W0{i + 1}</span>
                  </span>
                  <label className="col-span-6 flex items-center gap-1.5 text-[length:var(--fs-12)] text-muted-foreground sm:col-span-4">
                    {i === 0 ? 'από' : 'όταν φτάσει'}
                    <Input inputMode="decimal" value={t.from} onChange={(e) => setTier(i, { from: e.target.value })} disabled={i === 0} className={cn(fieldCls, 'w-20 tabular-nums')} aria-label={`Παλέτες για PRICEW0${i + 1}`} placeholder={i === 0 ? '0,5' : ''} />
                    παλ.
                  </label>
                  <label className="col-span-5 flex items-center gap-1.5 text-[length:var(--fs-12)] text-muted-foreground sm:col-span-5">
                    τιμή
                    <Input inputMode="decimal" value={t.price} onChange={(e) => setTier(i, { price: e.target.value })} className={cn(fieldCls, 'w-24 tabular-nums font-semibold')} aria-label={`Τιμή PRICEW0${i + 1}`} />
                    €/{unit}
                  </label>
                  <div className="col-span-1 flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={`Ενέργειες για PRICEW0${i + 1}`}><FiMoreVertical className="size-4" aria-hidden /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2 text-[length:var(--fs-12)]" disabled={tiers.length === 1} onSelect={() => setTiers((x) => x.filter((_, j) => j !== i))}>
                          <FiTrash2 className="size-3.5" aria-hidden /> Αφαίρεση
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {issues.map((x, k) => <p key={k} className={cn('mt-1 text-[length:var(--fs-11)]', x.level === 'error' ? 'text-destructive' : 'text-amber-800')}>{x.message}</p>)}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={tiers.length >= MAX_TIERS} onClick={() => setTiers((t) => [...t, { from: t.length === 0 ? '0,5' : '', price: '' }])}>
            <FiPlus className="mr-1 size-3.5" aria-hidden /> Σημείο πτώσης (έως 5)
          </Button>
          {tierIssues.filter((x) => x.tier == null).map((x, k) => <RowHint key={k} tone="bad">{x.message}</RowHint>)}
        </div>
      </FormSection>
      <PriceLadder tiers={tierList} capacity={capacity} filled={filledNow} unit={unit} />
      {tierList.length > 1 && tierErrors.length === 0 && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-[length:var(--fs-12)] text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
          Από {eur(tierList[0].price)} έως {eur(tierList[tierList.length - 1].price)}/{unit} — όφελος έως {eur(tierList[0].price - tierList[tierList.length - 1].price)}/{unit}
          ({Math.round((1 - tierList[tierList.length - 1].price / tierList[0].price) * 100)}%) όταν γεμίσει το container.
        </p>
      )}
    </div>
  );

  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const listOf = (opts: Option[]) => {
    const n = strip(rq.trim());
    return n ? opts.filter((o) => strip(`${o.name} ${o.sub} ${o.email ?? ''}`).includes(n)) : opts;
  };
  const recipientList = (t: string, icon: React.ReactNode, opts: Option[]) => {
    const shown = listOf(opts);
    const allOn = shown.length > 0 && shown.every((o) => picked.has(`${o.kind}:${o.refId}`));
    return (
      <div className="min-w-0 rounded-md border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
          <span className="text-muted-foreground [&_svg]:size-3.5" aria-hidden>{icon}</span>
          <span className="text-[length:var(--fs-12)] font-semibold">{t}</span>
          <span className="text-[length:var(--fs-11)] text-muted-foreground">{opts.filter((o) => picked.has(`${o.kind}:${o.refId}`)).length}/{opts.length}</span>
          <button type="button" className="ml-auto cursor-pointer text-[length:var(--fs-11)] text-sisyphus-600 hover:underline" onClick={() => setPicked((s) => { const n = new Set(s); for (const o of shown) { const k = `${o.kind}:${o.refId}`; if (allOn) n.delete(k); else if (o.email) n.add(k); } return n; })}>
            {allOn ? 'Καμία' : 'Όλοι με email'}
          </button>
        </div>
        <ul className="max-h-60 divide-y divide-border overflow-y-auto">
          {shown.slice(0, 300).map((o) => {
            const k = `${o.kind}:${o.refId}`;
            return (
              <li key={k}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 px-2.5 py-1.5 hover:bg-muted/50">
                  <input type="checkbox" className="size-4 accent-[#0369A1]" checked={picked.has(k)} onChange={() => toggle(k)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--fs-12)] font-medium">{o.name}</span>
                    <span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">{o.email ?? <span className="text-amber-700">χωρίς email</span>}{o.sub ? ` · ${o.sub}` : ''}</span>
                  </span>
                </label>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-2.5 py-4 text-center text-[length:var(--fs-11)] text-muted-foreground">Κανένας</li>}
        </ul>
      </div>
    );
  };
  const noEmail = allOptions.filter((o) => picked.has(`${o.kind}:${o.refId}`) && !o.email).length;

  const stepPublish = (
    <div className="space-y-3">
      <FormSection tone="blue" icon={<FiSend />} title="Δημοσίευση">
        <Field label="Τίτλος (θέμα στο email)" htmlFor="w-title"><Input id="w-title" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} className={fieldCls} placeholder="π.χ. Travertino Classic — Container Νοεμβρίου" /></Field>
        {status !== 'OPEN' ? (
          <div className="grid gap-2.5 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
            <Field label="Πότε">
              <Segmented ariaLabel="Πότε δημοσιεύεται" value={when} onChange={setWhen} options={[{ value: 'now', label: 'Τώρα' }, { value: 'later', label: 'Προγραμματισμός' }, { value: 'draft', label: 'Πρόχειρο' }]} />
            </Field>
            {when === 'later' ? (
              <Field label="Ημερομηνία & ώρα δημοσίευσης" htmlFor="w-at"><Input id="w-at" type="datetime-local" value={publishAt} min={localInput(new Date())} onChange={(e) => setPublishAt(e.target.value)} className={fieldCls} /></Field>
            ) : <span />}
            <Field label="Συμμετοχή έως (προθεσμία)" htmlFor="w-close"><Input id="w-close" type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={fieldCls} /></Field>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <RowHint tone="ok">Η προσφορά είναι ήδη δημοσιευμένη — οι αλλαγές τιμών γράφονται αμέσως στο SoftOne.</RowHint>
            <Field label="Συμμετοχή έως (προθεσμία)" htmlFor="w-close"><Input id="w-close" type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={fieldCls} /></Field>
          </div>
        )}
      </FormSection>
      <FormSection tone="violet" icon={<FiMail />} title="Παραλήπτες" aside={<span className="tabular-nums">{picked.size} επιλεγμένοι</span>}>
        <div className="relative">
          <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={rq} onChange={(e) => setRq(e.target.value)} placeholder="Αναζήτηση (όνομα, email, πόλη, ιδιότητα)…" className={cn(fieldCls, 'pl-8')} aria-label="Αναζήτηση παραλήπτη" />
        </div>
        {!options ? <div className="h-40 animate-pulse rounded-md bg-muted motion-reduce:animate-none" /> : (
          <div className="grid gap-2 md:grid-cols-2">
            {recipientList('Πελάτες', <FiUserCheck />, options.customers)}
            {recipientList('Συνεργάτες', <FiUsers />, options.partners)}
          </div>
        )}
        {noEmail > 0 && <RowHint tone="warn">{noEmail} επιλεγμένοι δεν έχουν email — θα μείνουν στη λίστα αλλά δεν θα λάβουν μήνυμα.</RowHint>}
      </FormSection>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <FiEye className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-[length:var(--fs-12)]">Προεπισκόπηση email (αποθηκεύει πρόχειρο):</span>
        <Button type="button" variant="outline" size="sm" onClick={() => openPreview('publish')} disabled={!!busy}>Προσφορά</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => openPreview('drop')} disabled={!!busy}>«Η τιμή έπεσε»</Button>
      </div>
    </div>
  );

  const body = [stepProduct, stepUnits, stepPrices, stepPublish][step];
  const last = step === STEPS.length - 1;
  const primaryLabel = status === 'OPEN' ? 'Αποθήκευση αλλαγών' : when === 'draft' ? 'Αποθήκευση πρόχειρου' : when === 'later' ? 'Προγραμματισμός' : 'Δημοσίευση τώρα';

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent className="flex max-h-[94dvh] w-[97vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b border-border px-4 py-3 pr-12 text-left">
            <DialogTitle className="text-[length:var(--fs-16)]">{offerId ? 'Επεξεργασία δυναμικής προσφοράς' : 'Νέα δυναμική προσφορά'}</DialogTitle>
            <DialogDescription className="text-[length:var(--fs-12)]">Κοινό container: όσο γεμίζει με παραγγελίες πελατών, η τιμή πέφτει για όλους.</DialogDescription>
            <ol className="mt-2 grid grid-cols-4 gap-1.5" aria-label="Βήματα">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const done = i < step; const cur = i === step;
                return (
                  <li key={s.title}>
                    <button type="button" disabled={i > step || !!busy} onClick={() => setStep(i)} aria-current={cur ? 'step' : undefined}
                      className={cn('flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[length:var(--fs-12)] transition-colors',
                        cur ? 'border-sisyphus-500 bg-sisyphus-50 font-semibold text-sisyphus-700 dark:bg-sisyphus-500/15 dark:text-sisyphus-300' : done ? 'cursor-pointer border-emerald-500/40 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-border text-muted-foreground')}>
                      <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[length:var(--fs-10)] font-bold', cur ? 'bg-sisyphus-600 text-white' : done ? 'bg-emerald-600 text-white' : 'bg-muted')}>{done ? <FiCheck className="size-3" aria-hidden /> : i + 1}</span>
                      <Icon className="hidden size-3.5 shrink-0 sm:inline" aria-hidden />
                      <span className="truncate">{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </DialogHeader>
          <DialogBody className="bg-muted/20 px-4 py-3">{body}</DialogBody>
          <DialogFooter className="mx-0 mb-0 flex-row items-center gap-2 border-t border-border bg-card px-4 py-2.5">
            <span className="mr-auto flex min-w-0 items-center gap-1.5 text-[length:var(--fs-11)] text-muted-foreground" aria-live="polite">
              {busy ? <><FiLoader className="size-3.5 animate-spin" aria-hidden /> {busy}</> : item ? <span className="truncate">{item.code} · {item.name}{capacity > 0 ? ` · ${fmt(capacity)} παλ.` : ''}</span> : null}
            </span>
            {step > 0 && <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={!!busy}><FiChevronLeft className="mr-1 size-4" aria-hidden /> Πίσω</Button>}
            {!last && <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext || !!busy}>Επόμενο <FiChevronRight className="ml-1 size-4" aria-hidden /></Button>}
            {last && (
              <Button onClick={() => finish(when === 'draft' && status !== 'OPEN' ? 'draft' : 'publish')} disabled={!!busy || tierErrors.length > 0 || (when !== 'draft' && status !== 'OPEN' && picked.size === 0)}>
                {busy ? <FiLoader className="mr-1.5 size-4 animate-spin" aria-hidden /> : <FiSend className="mr-1.5 size-4" aria-hidden />}{primaryLabel}
              </Button>
            )}
          </DialogFooter>
          {last && when !== 'draft' && status !== 'OPEN' && picked.size === 0 && (
            <p className="flex items-center gap-1.5 border-t border-border bg-amber-50 px-4 py-1.5 text-[length:var(--fs-11)] text-amber-900"><FiAlertTriangle className="size-3.5" aria-hidden /> Διάλεξε παραλήπτες για να δημοσιευτεί.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="flex h-[92dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-border px-4 py-2.5 pr-12 text-left">
            <DialogTitle className="text-[length:var(--fs-15)]">Προεπισκόπηση email — {preview?.kind === 'drop' ? '«Η τιμή έπεσε»' : 'Προσφορά'}</DialogTitle>
            <DialogDescription className="text-[length:var(--fs-11)]">Όπως θα το δει ο παραλήπτης (όνομα παραδείγματος).</DialogDescription>
          </DialogHeader>
          {preview && <iframe title="Προεπισκόπηση email" src={`/api/admin/dynamic-offers/${preview.id}/email-preview?kind=${preview.kind}&t=${Date.now()}`} className="min-h-0 w-full flex-1 bg-slate-100" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
