'use client';

// Οδηγός «Δυναμική προσφορά» σε 4 βήματα:
//   1 Προϊόντα (ένα ή περισσότερα, με τ.μ. ανά παλέτα το καθένα) · 2 Container (χωρητικότητα σε παλέτες,
//   προαιρετικά και οι μονάδες των ειδών στο SoftOne) · 3 Τιμές (ΚΟΙΝΑ σημεία πτώσης W01…W08 + τιμή
//   κάθε προϊόντος σε κάθε σημείο, η 01 η μεγαλύτερη) · 4 Δημοσίευση (ημερομηνία, προθεσμία,
//   παραλήπτες πελάτες/συνεργάτες, προεπισκόπηση email).
import * as React from 'react';
import dynamic from 'next/dynamic';
import {
  FiPackage, FiBox, FiTrendingDown, FiSend, FiSearch, FiCheck, FiChevronLeft, FiChevronRight, FiLoader, FiPlus,
  FiMoreVertical, FiTrash2, FiZap, FiMail, FiAlertTriangle, FiUsers, FiUserCheck, FiEye, FiArrowUp, FiArrowDown,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field, FormSection, RowHint, Segmented, fieldCls } from '@/components/admin/form-kit';
import { UnitThumb } from '@/components/admin/unit-visual';
import { presetIds, type UnitMeta } from '@/components/admin/item-unit-setup-panel';
import { uploadOfferSnapshot } from '@/components/admin/container-snapshot';
import { checkLevels, checkPrices, isStep, itemTiers, MAX_TIERS, PALLET_STEP, priceField, roundStep, type Level } from '@/lib/container-pricing';
import { applyUnits, unitsPatch } from '@/lib/offer-units';
import { PriceLadder } from './price-ladder';

const ContainerScene = dynamic(() => import('@/components/admin/container-scene'), {
  ssr: false, loading: () => <div className="h-64 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />,
});

type ItemHit = { mtrl: number; code: string; name: string; photo: string | null; baseUnit: string | null; price: number | null };
type Rec = Record<string, unknown> & { name: string; unit1: string | null; unit2: string | null; ratio2: number; unitBuy: string | null; buyRatio: number; dim1: number; dim2: number; dim3: number };
type Option = { kind: 'CUSTOMER' | 'PARTNER'; refId: string; name: string; sub: string; email: string | null };
/** Προϊόν στον οδηγό: τιμές ανά κλιμάκιο ως κείμενο (prices[i] → W0{i+1}). */
type Row = {
  mtrl: number; code: string; name: string; photo: string | null; baseUnit: string | null;
  sqmPerPallet: string; prices: string[]; booked: number; rec: Rec | null; hasMovements: boolean | null;
};

const STEPS = [
  { title: 'Προϊόντα', icon: FiPackage },
  { title: 'Container', icon: FiBox },
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
const resize = (a: string[], n: number) => Array.from({ length: n }, (_, i) => a[i] ?? '');

/** Πρόταση σημείων: ½ παλέτα και μετά ίσα διαστήματα ως το γεμάτο container (ανά ½ παλέτα). */
function suggestPoints(capacity: number, n: number): number[] {
  const marks = Array.from({ length: n }, (_, i) => (i === 0 ? PALLET_STEP : roundStep((capacity * i) / (n - 1 || 1))));
  return marks.map((v, i) => (i > 0 && v <= marks[i - 1] ? marks[i - 1] + PALLET_STEP : v));
}

export function OfferWizard({ open, onOpenChange, offerId, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; offerId: string | null; onDone: () => void;
}) {
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [filledNow, setFilledNow] = React.useState(0);
  const [status, setStatus] = React.useState<string>('DRAFT');
  // 1
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<ItemHit[]>([]);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [meta, setMeta] = React.useState<UnitMeta[]>([]);
  // 2
  const [capacityTxt, setCapacityTxt] = React.useState('');
  const [syncUnits, setSyncUnits] = React.useState(false);
  // 3 — κοινά σημεία: levels[i] = «από Χ παλέτες» του W0{i+1} (το 1ο = ελάχιστη παραγγελία)
  const [levels, setLevels] = React.useState<string[]>([]);
  const [chartItem, setChartItem] = React.useState(0);
  // 4
  const [title, setTitle] = React.useState('');
  const [when, setWhen] = React.useState<'now' | 'later' | 'draft'>('now');
  const [publishAt, setPublishAt] = React.useState('');
  const [closesAt, setClosesAt] = React.useState('');
  const [options, setOptions] = React.useState<{ customers: Option[]; partners: Option[] } | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [rq, setRq] = React.useState('');
  const [preview, setPreview] = React.useState<{ id: string; kind: 'publish' | 'drop'; t: number } | null>(null);
  const savedId = React.useRef<string | null>(null);
  const autoTitle = React.useRef(''); // ο αυτόματος τίτλος ακολουθεί τα προϊόντα όσο δεν τον άλλαξε ο χρήστης

  // Επαναφορά στο άνοιγμα (ή αλλαγή προσφοράς): το state με adjust-state-while-rendering,
  // τα refs και η φόρτωση στο effect παρακάτω.
  const [prevDeps, setPrevDeps] = React.useState<{ open: boolean; offerId: string | null }>({ open: false, offerId });
  if (prevDeps.open !== open || prevDeps.offerId !== offerId) {
    setPrevDeps({ open, offerId });
    if (open) {
      setStep(0); setBusy(null); setFilledNow(0); setStatus('DRAFT'); setQ(''); setHits([]); setRows([]); setMeta([]);
      setCapacityTxt(''); setSyncUnits(false); setLevels([]); setChartItem(0); setTitle(''); setWhen('now'); setPublishAt(''); setClosesAt('');
      setPicked(new Set()); setRq('');
      if (offerId) setBusy('Φόρτωση…');
    }
  }

  /** Ζωντανή καρτέλα του είδους (μονάδες, PRICEW, κινήσεις) → προτάσεις τ.μ./παλέτα και τιμών. */
  const loadRecord = React.useCallback((mtrl: number) => {
    fetch(`/api/admin/softone/items/${mtrl}/full`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (!d.record) return;
      const r = d.record as Rec;
      if (d.unitsMeta?.length) setMeta((m) => (m.length ? m : d.unitsMeta));
      setRows((cur) => cur.map((x) => {
        if (x.mtrl !== mtrl) return x;
        const prices = Array.from({ length: MAX_TIERS }, (_, i) => Number(r[`priceW0${i + 1}`]) || 0);
        const hasPrices = x.prices.some((p) => p.trim());
        return {
          ...x, rec: r, hasMovements: d.hasMovements ?? null,
          sqmPerPallet: x.sqmPerPallet || (r.unit2 && r.unit2 !== r.unit1 && r.ratio2 > 0 ? fmt(r.ratio2) : ''),
          prices: hasPrices ? x.prices : prices.map((p) => fmt(p)),
        };
      }));
      setCapacityTxt((c) => c || (r.unitBuy && r.unitBuy !== r.unit1 && r.buyRatio > 0 && r.unit2 && r.ratio2 > 0 ? fmt(Math.floor((r.buyRatio / r.ratio2) * 2) / 2) : ''));
    }).catch(() => null);
  }, []);

  // Επεξεργασία υπάρχουσας: φόρτωση όλων.
  React.useEffect(() => {
    if (!open) return;
    savedId.current = null; autoTitle.current = '';
    if (!offerId) return;
    savedId.current = offerId;
    fetch(`/api/admin/dynamic-offers/${offerId}`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      const o = d.offer;
      const n = o.levels.length;
      setRows(o.items.map((it: { mtrl: number; code: string; name: string; baseUnit: string | null; sqmPerPallet: number; prices: number[]; booked: number; pending: number }) => ({
        mtrl: it.mtrl, code: it.code, name: it.name, photo: null, baseUnit: it.baseUnit, sqmPerPallet: fmt(it.sqmPerPallet),
        prices: resize(it.prices.map((p) => fmt(p)), n), booked: it.booked + it.pending, rec: null, hasMovements: null,
      })));
      for (const it of o.items) loadRecord(it.mtrl);
      setCapacityTxt(fmt(o.capacity));
      setLevels(o.levels.map((l: Level) => fmt(l.fromPallets)));
      setTitle(o.title ?? ''); autoTitle.current = o.title ?? '';
      setClosesAt(o.closesAt ? o.closesAt.slice(0, 10) : '');
      setStatus(o.status); setFilledNow(o.filled);
      setWhen(o.status === 'OPEN' ? 'now' : o.status === 'SCHEDULED' ? 'later' : 'now');
      if (o.publishAt && o.status === 'SCHEDULED') setPublishAt(localInput(new Date(o.publishAt)));
      setPicked(new Set(d.recipients.map((r: { kind: string; refId: string }) => `${r.kind}:${r.refId}`)));
      setStep(o.status === 'OPEN' ? 2 : 0);
    }).catch(() => toast.error('Αποτυχία φόρτωσης')).finally(() => setBusy(null));
  }, [open, offerId, loadRecord]);

  // 1 · αναζήτηση προϊόντων (με καθυστέρηση πληκτρολόγησης)
  React.useEffect(() => {
    if (!open || step !== 0) return;
    const h = setTimeout(() => {
      fetch(`/api/admin/dynamic-offers/options?items=${encodeURIComponent(q)}`).then((r) => r.json()).then((d) => setHits(d.items ?? [])).catch(() => null);
    }, 220);
    return () => clearTimeout(h);
  }, [q, open, step]);

  // Αυτόματος τίτλος από τα προϊόντα (όσο δεν τον άλλαξε ο χρήστης).
  React.useEffect(() => {
    if (title && title !== autoTitle.current) return;
    const next = rows.length === 0 ? '' : rows.length === 1 ? `${rows[0].name} — Κοινό container` : `Κοινό container — ${rows.length} προϊόντα`;
    autoTitle.current = next; setTitle(next);
  }, [rows.length, rows[0]?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const capacity = parse(capacityTxt);
  const nLevels = levels.length;
  const levelList: Level[] = levels.map((v, i) => ({ level: i + 1, fromPallets: i === 0 ? PALLET_STEP : parse(v) }));
  const levelIssues = capacity > 0 && nLevels ? checkLevels(levelList, capacity) : [];
  const priceIssues = rows.map((r) => checkPrices(resize(r.prices, nLevels).map(parse), nLevels));
  const errorsCount = levelIssues.filter((i) => i.level === 'error').length + priceIssues.flat().filter((i) => i.level === 'error').length;
  const ids = presetIds(meta);
  const first = rows[0];
  const sceneLoad = loadOf(first?.name ?? '');
  const slab = first?.rec && first.rec.dim1 > 0 && first.rec.dim2 > 0 ? { l: first.rec.dim1 / 100, w: first.rec.dim2 / 100, t: (first.rec.dim3 > 0 ? first.rec.dim3 : 2) / 100 } : null;
  const perPallet0 = parse(first?.sqmPerPallet ?? '');

  const allOptions = React.useMemo(() => [...(options?.customers ?? []), ...(options?.partners ?? [])], [options]);
  React.useEffect(() => {
    if (step === 3 && !options) fetch('/api/admin/dynamic-offers/options').then((r) => r.json()).then(setOptions).catch(() => toast.error('Αποτυχία φόρτωσης παραληπτών'));
  }, [step, options]);

  const canNext = [
    rows.length > 0 && rows.every((r) => parse(r.sqmPerPallet) > 0),
    capacity >= PALLET_STEP && isStep(capacity) && capacity >= filledNow,
    nLevels > 0 && errorsCount === 0,
    true,
  ][step];

  const addItem = (h: ItemHit) => {
    if (rows.some((r) => r.mtrl === h.mtrl)) return;
    setRows((cur) => [...cur, { mtrl: h.mtrl, code: h.code, name: h.name, photo: h.photo, baseUnit: h.baseUnit, sqmPerPallet: '', prices: resize([], nLevels), booked: 0, rec: null, hasMovements: null }]);
    loadRecord(h.mtrl);
  };
  const patchRow = (mtrl: number, patch: Partial<Row>) => setRows((cur) => cur.map((r) => (r.mtrl === mtrl ? { ...r, ...patch } : r)));
  const moveRow = (i: number, d: -1 | 1) => setRows((cur) => { const n = [...cur]; const j = i + d; if (j < 0 || j >= n.length) return cur; [n[i], n[j]] = [n[j], n[i]]; return n; });

  // Αλλαγή πλήθους κλιμακίων: οι τιμές κάθε προϊόντος ακολουθούν (κόβονται/συμπληρώνονται).
  const setLevelCount = (n: number) => {
    const k = Math.max(1, Math.min(MAX_TIERS, n));
    setLevels((cur) => Array.from({ length: k }, (_, i) => cur[i] ?? (i === 0 ? '0,5' : '')));
    setRows((cur) => cur.map((r) => ({ ...r, prices: r.prices.length >= k ? r.prices : resize(r.prices, k) })));
  };
  const removeLevel = (i: number) => {
    if (nLevels <= 1) return;
    setLevels((cur) => cur.filter((_, j) => j !== i).map((v, j) => (j === 0 ? '0,5' : v)));
    setRows((cur) => cur.map((r) => ({ ...r, prices: r.prices.filter((_, j) => j !== i) })));
  };

  // ── Αποθήκευση: μονάδες (προαιρετικά) → προσφορά → παραλήπτες → 3D εικόνα ──
  const persist = async (): Promise<string> => {
    if (!rows.length) throw new Error('Δεν επιλέχθηκαν προϊόντα');
    // Προαιρετικά οι μονάδες των ειδών στο SoftOne — ΠΟΤΕ δεν σταματά την αποθήκευση της προσφοράς
    // (τ.μ./παλέτα και παλέτες/container ζουν στην προσφορά). Ανά είδος· με παραστατικά μόνο μονάδα αγορών.
    if (syncUnits && ids) {
      const locked = rows.filter((r) => r.hasMovements === true);
      const ok = await confirmAction({
        title: 'Ενημέρωση μονάδων στο SoftOne',
        message: `Σε ${rows.length} είδη: Μονάδα αγορών = Container (${fmt(capacity)} παλέτες × τ.μ. παλέτας) και, όπου επιτρέπεται, Μ.Μ.2 = Παλέτα.${locked.length ? ` ${locked.length} είδη έχουν παραστατικά (${locked.map((s) => s.code).join(', ')}) — εκεί η Μ.Μ.2 δεν αλλάζει, ενημερώνεται μόνο η μονάδα αγορών.` : ''} Η προσφορά αποθηκεύεται ό,τι κι αν γίνει. Συνέχεια;`,
        confirmLabel: 'Ενημέρωση',
      });
      if (ok) {
        const results = [];
        for (const r of rows) {
          setBusy(`Μονάδες στο SoftOne · ${r.code}…`);
          const patch = unitsPatch({ ids, perPallet: parse(r.sqmPerPallet), capacity, hasMovements: r.hasMovements, current: r.rec ? { unit2: r.rec.unit2, ratio2: r.rec.ratio2 } : null });
          results.push(await applyUnits(r.code, patch, async (body) => {
            const res = await fetch(`/api/admin/softone/items/${r.mtrl}/full`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const d = await res.json().catch(() => ({}));
            return { ok: res.ok, message: d.message ?? null, code: d.error ?? null };
          }));
        }
        const failed = results.filter((x) => !x.ok);
        const partial = results.filter((x) => x.ok && x.partial);
        if (failed.length) toast.warning(`Οι μονάδες δεν άλλαξαν σε ${failed.length} από ${results.length} είδη — η προσφορά αποθηκεύεται κανονικά`, { description: failed.map((f) => `${f.code}: ${f.message}`).join(' · ') });
        else if (partial.length) toast.message(`Μονάδες ενημερώθηκαν · σε ${partial.length} είδη μόνο η μονάδα αγορών (έχουν παραστατικά)`);
        else toast.success('Οι μονάδες των ειδών ενημερώθηκαν');
      }
    }
    setBusy('Αποθήκευση προσφοράς…');
    const body = {
      title: title || null, capacityPallets: capacity, minOrder: PALLET_STEP,
      closesAt: closesAt ? new Date(`${closesAt}T23:59:00`).toISOString() : null, notes: null,
      tiers: levelList,
      items: rows.map((r) => ({ mtrl: r.mtrl, sqmPerPallet: parse(r.sqmPerPallet), prices: resize(r.prices, nLevels).map(parse) })),
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
    await uploadOfferSnapshot(newId, { pallets: capacity, perPallet: perPallet0 || 1, filled: filledNow > 0 ? filledNow : capacity, load: sceneLoad, slab });
    return newId;
  };

  const finish = async (mode: 'draft' | 'publish') => {
    try {
      const id = await persist();
      if (mode === 'publish' && status !== 'OPEN') {
        const at = when === 'later' && publishAt ? new Date(publishAt) : null;
        if (when === 'later' && (!at || at.getTime() < new Date().getTime())) throw new Error('Διάλεξε μελλοντική ημερομηνία δημοσίευσης');
        const fields = `PRICEW01…${priceField(nLevels)}`;
        const ok = await confirmAction({
          title: at ? 'Προγραμματισμός δημοσίευσης' : 'Δημοσίευση τώρα',
          message: at
            ? `Η προσφορά θα δημοσιευτεί ${at.toLocaleString('el-GR')} και θα σταλεί σε ${picked.size} παραλήπτες. Οι τιμές ${fields} γράφονται στα ${rows.length} είδη στο SoftOne τη στιγμή της δημοσίευσης.`
            : `Θα γραφτούν οι τιμές ${fields} σε ${rows.length} είδη στο SoftOne (${rows.map((r) => r.code).join(', ')}) και θα σταλεί email σε ${picked.size} παραλήπτες. Συνέχεια;`,
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
    try { const id = await persist(); setPreview({ id, kind, t: new Date().getTime() }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  // ── Βήματα ──
  const chosen = new Set(rows.map((r) => r.mtrl));
  const stepProducts = (
    <div className="space-y-3">
      {rows.length > 0 && (
        <FormSection tone="emerald" icon={<FiPackage />} title="Προϊόντα στο container" aside={<span className="tabular-nums">{rows.length}</span>}>
          <ul className="space-y-1.5">
            {rows.map((r, i) => (
              <li key={r.mtrl} className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-2 sm:grid-cols-[auto_1fr_11rem_auto]">
                {r.photo ? <img src={r.photo} alt="" className="size-10 rounded object-cover" /> : <span className="grid size-10 place-items-center rounded bg-muted"><FiPackage className="size-4 text-muted-foreground" aria-hidden /></span>}
                <div className="min-w-0">
                  <div className="truncate text-(length:--fs-13) font-semibold">{r.name}</div>
                  <div className="truncate text-(length:--fs-11) text-muted-foreground">{r.code}{r.baseUnit ? ` · ${r.baseUnit}` : ''}{r.booked > 0 ? ` · ${fmt(r.booked)} παλ. σε κρατήσεις` : ''}</div>
                </div>
                <label className="col-span-3 flex items-center gap-1.5 text-(length:--fs-12) text-muted-foreground sm:col-span-1">
                  <Input inputMode="decimal" value={r.sqmPerPallet} onChange={(e) => patchRow(r.mtrl, { sqmPerPallet: e.target.value })} className={cn(fieldCls, 'w-24 tabular-nums')} aria-label={`${r.baseUnit ?? 'τ.μ.'} ανά παλέτα για ${r.name}`} placeholder="—" />
                  {r.baseUnit ?? 'τ.μ.'}/παλ.
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger className="row-start-1 col-start-3 inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted sm:col-start-4" aria-label={`Ενέργειες για ${r.name}`}><FiMoreVertical className="size-4" aria-hidden /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem className="cursor-pointer gap-2 text-(length:--fs-12)" disabled={i === 0} onSelect={() => moveRow(i, -1)}><FiArrowUp className="size-3.5" aria-hidden /> Πιο πάνω</DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer gap-2 text-(length:--fs-12)" disabled={i === rows.length - 1} onSelect={() => moveRow(i, 1)}><FiArrowDown className="size-3.5" aria-hidden /> Πιο κάτω</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2 text-(length:--fs-12)" disabled={r.booked > 0} onSelect={() => setRows((cur) => cur.filter((x) => x.mtrl !== r.mtrl))}>
                      <FiTrash2 className="size-3.5" aria-hidden /> {r.booked > 0 ? 'Έχει κρατήσεις' : 'Αφαίρεση'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
          {rows.some((r) => !(parse(r.sqmPerPallet) > 0)) && <RowHint tone="warn">Συμπλήρωσε τα τ.μ. ανά παλέτα για κάθε προϊόν (προτείνονται από τη ρύθμιση μονάδων του είδους, αν υπάρχει).</RowHint>}
        </FormSection>
      )}
      <div className="relative">
        <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση προϊόντος για προσθήκη (κωδικός ή περιγραφή)…" className={cn(fieldCls, 'h-10 pl-8')} autoFocus aria-label="Αναζήτηση προϊόντος" />
      </div>
      <ul className="grid max-h-[40dvh] gap-1.5 overflow-y-auto sm:grid-cols-2" aria-label="Αποτελέσματα">
        {hits.map((h) => {
          const on = chosen.has(h.mtrl);
          return (
            <li key={h.mtrl}>
              <button type="button" onClick={() => addItem(h)} disabled={on}
                className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted/60 disabled:cursor-default', on ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/10' : 'border-border bg-card')}>
                {h.photo ? <img src={h.photo} alt="" className="size-10 shrink-0 rounded object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded bg-muted"><FiPackage className="size-4 text-muted-foreground" aria-hidden /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-(length:--fs-13) font-medium">{h.name}</span>
                  <span className="block truncate text-(length:--fs-11) text-muted-foreground">{h.code}{h.baseUnit ? ` · ${h.baseUnit}` : ''}</span>
                </span>
                {on ? <FiCheck className="size-4 shrink-0 text-emerald-600" aria-label="Προστέθηκε" /> : <FiPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              </button>
            </li>
          );
        })}
        {hits.length === 0 && <li className="col-span-full py-6 text-center text-(length:--fs-12) text-muted-foreground">Κανένα προϊόν</li>}
      </ul>
    </div>
  );

  const stepContainer = (
    <div className="space-y-3">
      <FormSection tone="amber" icon={<FiBox />} title="Χωρητικότητα" aside={<span>κοινή για όλα τα προϊόντα</span>}>
        <div className="grid gap-2.5 sm:grid-cols-[12rem_1fr] sm:items-end">
          <Field label="Παλέτες στο container" required htmlFor="w-cap">
            <Input id="w-cap" inputMode="decimal" value={capacityTxt} onChange={(e) => setCapacityTxt(e.target.value)} className={cn(fieldCls, 'tabular-nums')} autoFocus />
          </Field>
          <RowHint>Ελάχιστη παραγγελία πελάτη: ½ παλέτα, από οποιοδήποτε προϊόν. Οι κρατήσεις γίνονται ανά ½ παλέτα και μετράνε όλες στο ίδιο γέμισμα.</RowHint>
        </div>
        {capacity > 0 && !isStep(capacity) && <RowHint tone="bad">Η χωρητικότητα δίνεται ανά ½ παλέτα (π.χ. 20 ή 20,5).</RowHint>}
        {filledNow > 0 && <RowHint tone="warn">Υπάρχουν κρατήσεις {fmt(filledNow)} παλετών — η χωρητικότητα δεν μπορεί να πέσει κάτω από αυτές.</RowHint>}
      </FormSection>

      {capacity > 0 && (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full text-(length:--fs-12)">
            <thead className="bg-muted/40"><tr>
              <th className="px-2.5 py-1.5 text-left font-semibold text-muted-foreground">Προϊόν</th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-muted-foreground">ανά παλέτα</th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-muted-foreground">αν γεμίσει μόνο με αυτό</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const pp = parse(r.sqmPerPallet);
                return (
                  <tr key={r.mtrl}>
                    <td className="px-2.5 py-1.5"><span className="inline-flex items-center gap-2"><UnitThumb kind={loadOf(r.name) === 'sacks' ? 'sack' : loadOf(r.name) === 'stones' ? 'piece' : 'box'} size={28} />{r.name}</span></td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmt(pp) || '—'} {r.baseUnit ?? 'τ.μ.'}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{pp > 0 ? `${fmt(capacity * pp)} ${r.baseUnit ?? 'τ.μ.'}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {capacity > 0 && isStep(capacity) && (
        <ContainerScene pallets={capacity} perPallet={perPallet0 || 1} filled={filledNow || undefined} load={sceneLoad} slab={slab}
          labels={{ container: 'Container', pallet: 'ΠΑΛ', base: first?.baseUnit ?? 'τ.μ.' }} heightClass="h-64 sm:h-72" />
      )}
      <label className={cn('flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-(length:--fs-12)', !ids && 'opacity-60')}>
        <input type="checkbox" className="mt-0.5 size-4 accent-[#B45309]" checked={syncUnits} disabled={!ids} onChange={(e) => setSyncUnits(e.target.checked)} />
        <span>
          <strong>Ενημέρωση και των μονάδων των ειδών στο SoftOne</strong> — σε κάθε είδος: Μ.Μ.2 = Παλέτα (τα τ.μ. του), Μονάδα αγορών = Container ({fmt(capacity) || '…'} παλέτες).
          {rows.some((r) => r.hasMovements) && <span className="block text-amber-800">Το είδος έχει παραστατικά — το SoftOne δεν επιτρέπει αλλαγή της Μ.Μ.2· θα ενημερωθεί μόνο η μονάδα αγορών ({rows.filter((r) => r.hasMovements).map((r) => r.code).join(', ')}).</span>}
          <span className="block text-muted-foreground">Η προσφορά δεν εξαρτάται από αυτό: αν το SoftOne αρνηθεί, αποθηκεύεται κανονικά με προειδοποίηση.</span>
          {!ids && <span className="block text-muted-foreground">Λείπουν οι μονάδες Παλέτα/Container — φτιάξε τες στο Operations → Μονάδες μέτρησης.</span>}
        </span>
      </label>
    </div>
  );

  const setPrice = (mtrl: number, i: number, v: string) => setRows((cur) => cur.map((r) => (r.mtrl === mtrl ? { ...r, prices: resize(r.prices, nLevels).map((p, j) => (j === i ? v : p)) } : r)));
  const chartRow = rows[Math.min(chartItem, rows.length - 1)];
  const chartTiers = chartRow ? itemTiers(levelList, resize(chartRow.prices, nLevels).map(parse)) : [];
  const stepPrices = (
    <div className="space-y-3">
      <FormSection tone="emerald" icon={<FiTrendingDown />} title="Κοινά σημεία πτώσης και τιμές" aside={(
        <Button type="button" variant="outline" size="sm" className="h-7 text-(length:--fs-11)" disabled={!(capacity > 0)}
          onClick={() => {
            const n = nLevels > 1 ? nLevels : Math.min(5, MAX_TIERS);
            setLevelCount(n);
            setLevels(suggestPoints(capacity, n).map((p) => fmt(p) || '0,5'));
          }}
        ><FiZap className="mr-1 size-3" aria-hidden /> Πρόταση σημείων</Button>
      )}>
        <p className="text-(length:--fs-12) text-muted-foreground">
          Τα σημεία είναι <strong>κοινά</strong>: «όταν κλειστούν Χ παλέτες (από οποιοδήποτε προϊόν), ισχύει η W0n» — για <strong>όλους</strong>. Η <strong>PRICEW01</strong> κάθε προϊόντος είναι η μεγαλύτερη· κάθε επόμενη φθηνότερη.
        </p>
        {nLevels === 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setLevelCount(1)}><FiPlus className="mr-1 size-3.5" aria-hidden /> Πρώτο κλιμάκιο</Button>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-136 text-(length:--fs-12)">
              <thead>
                <tr className="bg-muted/40">
                  <th className="sticky left-0 z-10 bg-muted/40 px-2 py-1.5 text-left font-semibold text-muted-foreground">Σημείο</th>
                  {levels.map((_, i) => {
                    const bad = levelIssues.some((x) => x.tier === i + 1 && x.level === 'error');
                    return (
                      <th key={i} className="px-1.5 py-1.5 text-left align-top">
                        <div className="flex items-center justify-between gap-1">
                          <span className="rounded-sm bg-emerald-100 px-1.5 py-0.5 font-mono text-(length:--fs-11) text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">W0{i + 1}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted" aria-label={`Ενέργειες για W0${i + 1}`}><FiMoreVertical className="size-3.5" aria-hidden /></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2 text-(length:--fs-12)" disabled={nLevels === 1} onSelect={() => removeLevel(i)}><FiTrash2 className="size-3.5" aria-hidden /> Αφαίρεση</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <label className="mt-1 flex items-center gap-1 font-normal text-muted-foreground">
                          {i === 0 ? 'από' : 'σε'}
                          <Input inputMode="decimal" value={i === 0 ? '0,5' : levels[i]} disabled={i === 0} onChange={(e) => setLevels((cur) => cur.map((v, j) => (j === i ? e.target.value : v)))}
                            className={cn(fieldCls, 'h-7 w-14 px-1.5 tabular-nums', bad && 'border-destructive')} aria-label={`Παλέτες για ${priceField(i + 1)}`} />
                          παλ.
                        </label>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, ri) => (
                  <tr key={r.mtrl}>
                    <th scope="row" className="sticky left-0 z-10 max-w-44 bg-card px-2 py-1.5 text-left font-medium">
                      <span className="block truncate" title={r.name}>{r.name}</span>
                      <span className="block truncate text-(length:--fs-10) font-normal text-muted-foreground">€/{r.baseUnit ?? 'τ.μ.'}</span>
                    </th>
                    {levels.map((_, i) => {
                      const bad = priceIssues[ri]?.some((x) => x.tier === i + 1 && x.level === 'error');
                      return (
                        <td key={i} className="px-1.5 py-1.5">
                          <Input inputMode="decimal" value={r.prices[i] ?? ''} onChange={(e) => setPrice(r.mtrl, i, e.target.value)}
                            className={cn(fieldCls, 'h-8 w-20 px-1.5 font-semibold tabular-nums', bad && 'border-destructive')} aria-label={`${priceField(i + 1)} για ${r.name}`} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={nLevels >= MAX_TIERS} onClick={() => setLevelCount(nLevels + 1)}>
            <FiPlus className="mr-1 size-3.5" aria-hidden /> Σημείο πτώσης (έως {MAX_TIERS})
          </Button>
        </div>
        {[...levelIssues.filter((x) => x.level === 'error'), ...priceIssues.flatMap((p, ri) => p.filter((x) => x.level === 'error').map((x) => ({ ...x, message: `${rows[ri].name}: ${x.message}` })))]
          .slice(0, 6).map((x, k) => <RowHint key={k} tone="bad">{x.message}</RowHint>)}
      </FormSection>
      {rows.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Γράφημα για">
          {rows.map((r, i) => (
            <button key={r.mtrl} type="button" role="tab" aria-selected={chartItem === i} onClick={() => setChartItem(i)}
              className={cn('h-7 max-w-56 cursor-pointer truncate rounded-md border px-2.5 text-(length:--fs-11) font-medium', chartItem === i ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground')}>
              {r.name}
            </button>
          ))}
        </div>
      )}
      {chartRow && <PriceLadder tiers={chartTiers} capacity={capacity} filled={filledNow} unit={chartRow.baseUnit ?? 'τ.μ.'} />}
      {chartTiers.length > 1 && errorsCount === 0 && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-(length:--fs-12) text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
          {chartRow.name}: από {eur(chartTiers[0].price)} έως {eur(chartTiers[chartTiers.length - 1].price)}/{chartRow.baseUnit ?? 'τ.μ.'}
          ({Math.round((1 - chartTiers[chartTiers.length - 1].price / chartTiers[0].price) * 100)}%) όταν γεμίσει το container.
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
          <span className="text-(length:--fs-12) font-semibold">{t}</span>
          <span className="text-(length:--fs-11) text-muted-foreground">{opts.filter((o) => picked.has(`${o.kind}:${o.refId}`)).length}/{opts.length}</span>
          <button type="button" className="ml-auto cursor-pointer text-(length:--fs-11) text-sisyphus-600 hover:underline" onClick={() => setPicked((s) => { const n = new Set(s); for (const o of shown) { const k = `${o.kind}:${o.refId}`; if (allOn) n.delete(k); else if (o.email) n.add(k); } return n; })}>
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
                    <span className="block truncate text-(length:--fs-12) font-medium">{o.name}</span>
                    <span className="block truncate text-(length:--fs-11) text-muted-foreground">{o.email ?? <span className="text-amber-700">χωρίς email</span>}{o.sub ? ` · ${o.sub}` : ''}</span>
                  </span>
                </label>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-2.5 py-4 text-center text-(length:--fs-11) text-muted-foreground">Κανένας</li>}
        </ul>
      </div>
    );
  };
  const noEmail = allOptions.filter((o) => picked.has(`${o.kind}:${o.refId}`) && !o.email).length;

  const stepPublish = (
    <div className="space-y-3">
      <FormSection tone="blue" icon={<FiSend />} title="Δημοσίευση">
        <Field label="Τίτλος (θέμα στο email)" htmlFor="w-title"><Input id="w-title" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} className={fieldCls} placeholder="π.χ. Travertino & πλακάκια — Container Νοεμβρίου" /></Field>
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
        <span className="text-(length:--fs-12)">Προεπισκόπηση email (αποθηκεύει πρόχειρο):</span>
        <Button type="button" variant="outline" size="sm" onClick={() => openPreview('publish')} disabled={!!busy}>Προσφορά</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => openPreview('drop')} disabled={!!busy}>«Η τιμή έπεσε»</Button>
      </div>
    </div>
  );

  const body = [stepProducts, stepContainer, stepPrices, stepPublish][step];
  const last = step === STEPS.length - 1;
  const primaryLabel = status === 'OPEN' ? 'Αποθήκευση αλλαγών' : when === 'draft' ? 'Αποθήκευση πρόχειρου' : when === 'later' ? 'Προγραμματισμός' : 'Δημοσίευση τώρα';

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent className="flex max-h-[94dvh] w-[97vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="border-b border-border px-4 py-3 pr-12 text-left">
            <DialogTitle className="text-(length:--fs-16)">{offerId ? 'Επεξεργασία δυναμικής προσφοράς' : 'Νέα δυναμική προσφορά'}</DialogTitle>
            <DialogDescription className="text-(length:--fs-12)">Κοινό container με ένα ή περισσότερα προϊόντα: όσο γεμίζει, οι τιμές πέφτουν για όλους.</DialogDescription>
            <ol className="mt-2 grid grid-cols-4 gap-1.5" aria-label="Βήματα">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const done = i < step; const cur = i === step;
                return (
                  <li key={s.title}>
                    <button type="button" disabled={i > step || !!busy} onClick={() => setStep(i)} aria-current={cur ? 'step' : undefined}
                      className={cn('flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-(length:--fs-12) transition-colors',
                        cur ? 'border-sisyphus-500 bg-sisyphus-50 font-semibold text-sisyphus-700 dark:bg-sisyphus-500/15 dark:text-sisyphus-300' : done ? 'cursor-pointer border-emerald-500/40 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-border text-muted-foreground')}>
                      <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-(length:--fs-10) font-bold', cur ? 'bg-sisyphus-600 text-white' : done ? 'bg-emerald-600 text-white' : 'bg-muted')}>{done ? <FiCheck className="size-3" aria-hidden /> : i + 1}</span>
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
            <span className="mr-auto flex min-w-0 items-center gap-1.5 text-(length:--fs-11) text-muted-foreground" aria-live="polite">
              {busy ? <><FiLoader className="size-3.5 animate-spin" aria-hidden /> {busy}</> : rows.length ? <span className="truncate">{rows.length === 1 ? `${rows[0].code} · ${rows[0].name}` : `${rows.length} προϊόντα`}{capacity > 0 ? ` · ${fmt(capacity)} παλ.` : ''}{nLevels ? ` · ${nLevels} κλιμάκια` : ''}</span> : null}
            </span>
            {step > 0 && <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={!!busy}><FiChevronLeft className="mr-1 size-4" aria-hidden /> Πίσω</Button>}
            {!last && <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext || !!busy}>Επόμενο <FiChevronRight className="ml-1 size-4" aria-hidden /></Button>}
            {last && (
              <Button onClick={() => finish(when === 'draft' && status !== 'OPEN' ? 'draft' : 'publish')} disabled={!!busy || errorsCount > 0 || (when !== 'draft' && status !== 'OPEN' && picked.size === 0)}>
                {busy ? <FiLoader className="mr-1.5 size-4 animate-spin" aria-hidden /> : <FiSend className="mr-1.5 size-4" aria-hidden />}{primaryLabel}
              </Button>
            )}
          </DialogFooter>
          {last && when !== 'draft' && status !== 'OPEN' && picked.size === 0 && (
            <p className="flex items-center gap-1.5 border-t border-border bg-amber-50 px-4 py-1.5 text-(length:--fs-11) text-amber-900"><FiAlertTriangle className="size-3.5" aria-hidden /> Διάλεξε παραλήπτες για να δημοσιευτεί.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="flex h-[92dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-border px-4 py-2.5 pr-12 text-left">
            <DialogTitle className="text-(length:--fs-15)">Προεπισκόπηση email — {preview?.kind === 'drop' ? '«Η τιμή έπεσε»' : 'Προσφορά'}</DialogTitle>
            <DialogDescription className="text-(length:--fs-11)">Όπως θα το δει ο παραλήπτης (όνομα παραδείγματος).</DialogDescription>
          </DialogHeader>
          {preview && <iframe title="Προεπισκόπηση email" src={`/api/admin/dynamic-offers/${preview.id}/email-preview?kind=${preview.kind}&t=${preview.t}`} className="min-h-0 w-full flex-1 bg-slate-100" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
