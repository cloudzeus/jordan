'use client';

import * as React from 'react';
import { FiEdit3, FiInfo, FiLayers, FiDollarSign, FiSliders, FiLoader, FiAlertTriangle, FiMaximize2, FiTag, FiPlus, FiMoreVertical, FiTrash2, FiArrowUp, FiArrowDown } from 'react-icons/fi';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmAction } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Field, FormSection, FormSelect, RowHint, Segmented, fieldCls } from '@/components/admin/form-kit';
import { ItemUnitSetupPanel, toSetup, type UnitFormValues, type UnitMeta } from '@/components/admin/item-unit-setup-panel';
import { checkUnitSetup, UNIT_FIELDS } from '@/lib/item-unit-setup';

type Opt = { id: string; name: string };
type Options = { units: Opt[]; categories: Opt[]; groups: Opt[]; manufacturers: Opt[]; brands: Opt[]; vats: (Opt & { rate: number | null })[] };

type Rec = {
  mtrl: number; code: string; isService: boolean; object: 'ITEM' | 'SERVICE';
  name: string | null; name2: string | null; code1: string | null; code2: string | null; remarks: string | null;
  isActive: boolean; vat: string | null; category: string | null; group: string | null;
  manufacturer: string | null; brand: string | null; unit1: string | null;
  unit2: string | null; ratio2: number; strict2: boolean;
  unitBuy: string | null; buyRatio: number; buyStrict: boolean;
  unitSell: string | null; sellRatio: number; sellStrict: boolean;
  priceRetail: number; priceWholesale: number; weight: number; grossWeight: number; volume: number;
  dim1: number; dim2: number; dim3: number;
};

type LastPurchase = { unitCost: number; date: string; fincode: string } | null;

/** Τα πεδία σε μορφή φόρμας: αριθμοί ως κείμενο (ελληνική υποδιαστολή), λίστες ως id ή ''. */
type Form = Record<keyof Omit<Rec, 'mtrl' | 'isService' | 'object'>, string | boolean>;

const NONE = '__none__';
const NUMERIC = ['ratio2', 'buyRatio', 'sellRatio', 'priceRetail', 'priceWholesale', 'weight', 'grossWeight', 'volume', 'dim1', 'dim2', 'dim3'] as const;
/** Πεδία που έχει μόνο το είδος (όχι η υπηρεσία). */
const ITEM_ONLY = ['unit2', 'ratio2', 'strict2', 'unitBuy', 'buyRatio', 'buyStrict', 'unitSell', 'sellRatio', 'sellStrict', 'manufacturer', 'brand', 'weight', 'grossWeight', 'volume', 'dim1', 'dim2', 'dim3'];

type Attr = { name: string; value: string; unit: string };
/** Συνηθισμένα χαρακτηριστικά για προτάσεις (ο χρήστης γράφει ό,τι θέλει). */
const ATTR_SUGGESTIONS = ['Χρώμα', 'Υλικό', 'Φινίρισμα', 'Διάσταση πλακιδίου', 'Πάχος', 'Αντιολισθηρότητα', 'Χρήση', 'Χώρα προέλευσης', 'Συσκευασία', 'Τεμάχια ανά κιβώτιο', 'm² ανά κιβώτιο', 'Εγγύηση'];
const normAttrs = (a: Attr[]) => a.map((x) => ({ name: x.name.trim(), value: x.value.trim(), unit: x.unit.trim() })).filter((x) => x.name || x.value || x.unit);
const LABEL: Record<string, string> = {
  code: 'Κωδικός', name: 'Περιγραφή', name2: 'Περιγραφή 2', code1: 'Barcode / EAN', code2: 'Κωδ. εργοστασίου',
  remarks: 'Παρατηρήσεις', isActive: 'Ενεργό', vat: 'ΦΠΑ', category: 'Εμπορική κατηγορία', group: 'Ομάδα',
  manufacturer: 'Κατασκευαστής', brand: 'Μάρκα', unit1: 'Βασική μονάδα', unitBuy: 'Μονάδα αγορών',
  buyRatio: 'Σχέση αγορών', unitSell: 'Μονάδα πώλησης', sellRatio: 'Σχέση πώλησης',
  unit2: 'Μ.Μ.2', ratio2: 'Σχέση Μ.Μ.2', strict2: 'Αυστηρή Μ.Μ.2', buyStrict: 'Αυστηρή αγορών', sellStrict: 'Αυστηρή πώλησης',
  priceRetail: 'Τιμή λιανικής', priceWholesale: 'Τιμή χονδρικής', weight: 'Καθαρό βάρος', grossWeight: 'Μικτό βάρος', volume: 'Όγκος', dim1: 'Μήκος', dim2: 'Πλάτος', dim3: 'Ύψος',
};

const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const fmtNum = (n: number) => (n ? n.toLocaleString('el-GR', { maximumFractionDigits: 6, useGrouping: false }) : '');
/** «1.234,5» ή «1234.5» → 1234.5 · κενό → 0 · άκυρο → NaN. */
function parseNum(v: string): number {
  const s = v.trim().replace(/\s/g, '');
  if (!s) return 0;
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
}

/** Τα πεδία μονάδων της φόρμας στη μορφή του πάνελ. */
function unitValues(f: Form): UnitFormValues {
  const s = (k: keyof Form) => String(f[k] ?? '');
  return {
    unit1: s('unit1'), unit2: s('unit2'), ratio2: s('ratio2'), strict2: !!f.strict2,
    unitBuy: s('unitBuy'), buyRatio: s('buyRatio'), buyStrict: !!f.buyStrict,
    unitSell: s('unitSell'), sellRatio: s('sellRatio'), sellStrict: !!f.sellStrict,
  };
}

const strip = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/**
 * Πέτρα ή πλακάκι για την 3D προβολή: από την ομάδα («Πέτρες») ή την περιγραφή. Η πλάκα παίρνει τις
 * διαστάσεις του είδους (Διάσταση 1/2/3, σε εκατοστά) — αλλιώς ενδεικτική.
 */
function sceneLoad(f: Form, r: Rec, o: Options): { load: 'boxes' | 'stones' | 'sacks'; slab: { l: number; w: number; t: number } | null } {
  const group = o.groups.find((g) => g.id === String(f.group))?.name ?? '';
  const isStone = /πετρ|stone|τραβερτ|travert/.test(strip(`${group} ${f.name ?? ''} ${r.name ?? ''}`)) && !/πλακακι|gres|porcel/.test(strip(String(f.name ?? '')));
  const cm = (k: keyof Form) => parseNum(String(f[k] ?? ''));
  const [l, w, t] = [cm('dim1'), cm('dim2'), cm('dim3')];
  // Κόλλες, τσιμέντα, κονιάματα, στόκοι, αρμόστοκοι, σοβάδες, χρωστικές σκόνες → σακιά.
  const isSack = /κολλ|τσιμεντ|κονιαμ|στοκ|αρμο|σοβα|μπετ|glue|adhesive|cement|mortar|grout/.test(strip(`${f.name ?? ''} ${r.name ?? ''}`));
  return { load: isSack ? 'sacks' : isStone ? 'stones' : 'boxes', slab: l > 0 && w > 0 ? { l: l / 100, w: w / 100, t: (t > 0 ? t : 2) / 100 } : null };
}

function toForm(r: Rec): Form {
  const f: Partial<Form> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === 'mtrl' || k === 'isService' || k === 'object') continue;
    f[k as keyof Form] = typeof v === 'boolean' ? v : typeof v === 'number' ? fmtNum(v) : (v ?? '');
  }
  return f as Form;
}

/** Οι τιμές της φόρμας στη μορφή του API· `null` για κενές λίστες/κείμενα. */
function fromForm(f: Form): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if ((NUMERIC as readonly string[]).includes(k)) out[k] = parseNum(String(v));
    else if (typeof v === 'boolean') out[k] = v;
    else out[k] = String(v).trim() === '' ? null : String(v).trim();
  }
  return out;
}

/** Λίστα με επιλογή «— χωρίς —» για τα προαιρετικά πεδία (το form-kit δεν έχει «κενό»). */
function OptSelect({ id, value, onChange, opts, optional, invalid }: {
  id: string; value: string; onChange: (v: string) => void; opts: Opt[]; optional?: boolean; invalid?: boolean;
}) {
  // Τρέχουσα τιμή που δεν υπάρχει στο τοπικό μητρώο: φαίνεται ως «#id», ώστε να μη χαθεί σιωπηλά.
  const all = value && !opts.some((o) => o.id === value) ? [{ id: value, name: `#${value} (εκτός μητρώου)` }, ...opts] : opts;
  return (
    <FormSelect
      id={id}
      value={value || (optional ? NONE : '')}
      onChange={(v) => onChange(v === NONE ? '' : v)}
      opts={optional ? [{ id: NONE, name: '— χωρίς —' }, ...all] : all}
      invalid={invalid}
    />
  );
}

export function ItemEditDialog({ mtrl, open, onOpenChange, onSaved }: {
  mtrl: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [rec, setRec] = React.useState<Rec | null>(null);
  const [opts, setOpts] = React.useState<Options | null>(null);
  const [lastBuy, setLastBuy] = React.useState<LastPurchase>(null);
  const [form, setForm] = React.useState<Form | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // Το SoftOne αρνήθηκε αλλαγή Μ.Μ.2 (είδος με παραστατικά) → προτείνεται η εγκεκριμένη αλλαγή μέσω script.
  const [unit2Locked, setUnit2Locked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [attrs, setAttrs] = React.useState<Attr[]>([]);
  const [attrsOrig, setAttrsOrig] = React.useState<Attr[]>([]);
  const [unitsMeta, setUnitsMeta] = React.useState<UnitMeta[]>([]);
  const [hasMovements, setHasMovements] = React.useState<boolean | null>(null);

  const load = React.useCallback(async () => {
    if (!mtrl) return;
    setRec(null); setForm(null); setLoadError(null); setSaveError(null);
    try {
      // Παράλληλα: καρτέλα (SoftOne), χαρακτηριστικά (βάση) και τελευταία τιμή αγοράς (αργή — δεν την περιμένουμε).
      setLastBuy(null);
      void fetch(`/api/admin/softone/items/${mtrl}/last-purchase`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setLastBuy(d.lastPurchase ?? null); }).catch(() => null);
      const attrsP = fetch(`/api/admin/items/${mtrl}/attributes`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { attributes: [] })).catch(() => ({ attributes: [] }));
      const res = await fetch(`/api/admin/softone/items/${mtrl}/full?lp=0`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Αποτυχία ανάγνωσης από το SoftOne');
      setRec(body.record); setOpts(body.options); setForm(toForm(body.record));
      setUnitsMeta(body.unitsMeta ?? []); setHasMovements(body.hasMovements ?? null);
      // Χαρακτηριστικά: δικά μας δεδομένα — αποτυχία εδώ δεν μπλοκάρει την καρτέλα του SoftOne.
      const ar = await attrsP;
      const list: Attr[] = (ar.attributes ?? []).map((a: { name: string; value: string; unit: string | null }) => ({ name: a.name, value: a.value, unit: a.unit ?? '' }));
      setAttrs(list); setAttrsOrig(list);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [mtrl]);

  // Το load ξεκινά σε microtask: τα setState του γίνονται σε callback, όχι σύγχρονα στο σώμα του effect.
  React.useEffect(() => { if (open) void Promise.resolve().then(load); }, [open, load]);

  const set = (k: keyof Form) => (v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const text = (k: keyof Form) => ({
    value: String(form?.[k] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k)(e.target.value),
  });

  // Αλλαγές = πεδία που διαφέρουν από τη ζωντανή καρτέλα (μόνο αυτά φεύγουν στο SoftOne).
  const original = React.useMemo(() => (rec ? fromForm(toForm(rec)) : null), [rec]);
  const current = React.useMemo(() => (form ? fromForm(form) : null), [form]);
  const changes = React.useMemo(() => {
    if (!original || !current) return [] as string[];
    return Object.keys(current).filter((k) => {
      if (rec?.isService && ITEM_ONLY.includes(k)) return false;
      const a = original[k]; const b = current[k];
      return typeof a === 'number' || typeof b === 'number' ? Math.abs(Number(a) - Number(b)) > 1e-9 : a !== b;
    });
  }, [original, current, rec]);

  const errors = React.useMemo(() => {
    const e: Record<string, string> = {};
    if (!current) return e;
    if (!current.name) e.name = 'Η περιγραφή είναι υποχρεωτική.';
    if (!current.code) e.code = 'Ο κωδικός είναι υποχρεωτικός.';
    if (!current.unit1) e.unit1 = 'Υποχρεωτική.';
    if (!current.vat) e.vat = 'Υποχρεωτικό.';
    for (const k of NUMERIC) {
      const n = Number(current[k]);
      if (!Number.isFinite(n) || n < 0) e[k] = 'Μη έγκυρος αριθμός.';
    }
    // Μονάδες: οι κανόνες του lib/item-unit-setup — μόνο όταν αλλάζει κάτι σε αυτές (παλιές
    // ρυθμίσεις που δεν αγγίζονται δεν μπλοκάρουν άλλες αλλαγές· ο server κάνει τον ίδιο έλεγχο).
    if (!rec?.isService && form && changes.some((k) => (UNIT_FIELDS as readonly string[]).includes(k))) {
      const issues = checkUnitSetup(toSetup(unitValues(form))).filter((i) => i.level === 'error');
      if (issues.length) e.units = issues[0].message;
    }
    return e;
  }, [current, rec, form, changes]);
  const attrsChanged = JSON.stringify(normAttrs(attrs)) !== JSON.stringify(normAttrs(attrsOrig));
  const attrError = React.useMemo(() => {
    const list = normAttrs(attrs);
    if (list.some((a) => !a.name || !a.value)) return 'Κάθε χαρακτηριστικό χρειάζεται όνομα και τιμή.';
    const names = list.map((a) => a.name.toLocaleLowerCase('el'));
    if (new Set(names).size !== names.length) return 'Το ίδιο χαρακτηριστικό υπάρχει δύο φορές.';
    return null;
  }, [attrs]);
  const valid = Object.keys(errors).length === 0 && !attrError;
  const anyChange = changes.length > 0 || attrsChanged;
  const setAttr = (i: number, patch: Partial<Attr>) => setAttrs((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const moveAttr = (i: number, dir: -1 | 1) => setAttrs((a) => { const b = [...a]; [b[i], b[i + dir]] = [b[i + dir], b[i]]; return b; });

  const save = async () => {
    if (!rec || !current || !anyChange || !valid) return;
    const parts = [
      changes.length ? `στο SoftOne (${rec.code}): ${changes.map((k) => LABEL[k] ?? k).join(', ')}` : '',
      attrsChanged ? `στην εφαρμογή: χαρακτηριστικά (${normAttrs(attrs).length})` : '',
    ].filter(Boolean);
    const ok = await confirmAction({
      title: changes.length ? 'Αποθήκευση στο SoftOne' : 'Αποθήκευση χαρακτηριστικών',
      message: `Θα αλλάξουν ${parts.join(' και ')}. Συνέχεια;`,
      confirmLabel: 'Αποθήκευση',
    });
    if (!ok) return;
    setBusy(true); setSaveError(null); setUnit2Locked(false);
    try {
      // Πρώτα τα χαρακτηριστικά (δικά μας, ασφαλή) — έτσι μια αποτυχία του SoftOne δεν τα χάνει.
      if (attrsChanged) {
        const ra = await fetch(`/api/admin/items/${rec.mtrl}/attributes`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attributes: normAttrs(attrs).map((a) => ({ ...a, unit: a.unit || null })) }),
        });
        const ba = await ra.json().catch(() => ({}));
        if (!ra.ok) throw new Error(ba.message || 'Η αποθήκευση των χαρακτηριστικών απέτυχε');
        setAttrsOrig(attrs);
        toast.success('Αποθηκεύτηκαν τα χαρακτηριστικά');
      }
      if (changes.length) {
        const payload = Object.fromEntries(changes.map((k) => [k, current[k]]));
        const res = await fetch(`/api/admin/softone/items/${rec.mtrl}/full`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (body.error === 'unit2_locked') setUnit2Locked(true);
          throw new Error(body.message || 'Η αποθήκευση απέτυχε');
        }
        toast.success(`Αποθηκεύτηκε στο SoftOne και επαληθεύτηκε: ${body.changed.map((c: { label: string }) => c.label).join(', ')}`);
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setSaveError((e as Error).message);
      // Μερική αποθήκευση: ξαναδιάβασε την καρτέλα ώστε η φόρμα να δείχνει την αλήθεια του SoftOne.
      void load();
    } finally {
      setBusy(false);
    }
  };

  /**
   * ΕΞΑΙΡΕΣΗ (εγκεκριμένη): Μ.Μ.2 μέσω του script του SoftOne, μετά οι υπόλοιπες αλλαγές από το επίσημο setData.
   * Ο server κάνει dry-run, εγγραφή, ανάγνωση και καταγραφή στο ιστορικό.
   */
  const applyUnit2ViaScript = async () => {
    if (!rec || !current) return;
    const unit2 = current.unit2 as string | null;
    if (!unit2) return;
    const ok = await confirmAction({
      title: 'Αλλαγή Μ.Μ.2 μέσω script',
      message: `Το SoftOne δεν αλλάζει τη Μ.Μ.2 μέσω Web Services επειδή το ${rec.code} έχει παραστατικά. Θα γραφτεί απευθείας η Μ.Μ.2 με σχέση ${current.ratio2} προς τη βασική (script με ελέγχους: καμία γραμμή με ποσότητα Μ.Μ.2, ίδια εταιρεία, έγκυρη μονάδα). Τα παλιά παραστατικά μένουν όπως είναι. Συνέχεια;`,
      confirmLabel: 'Αλλαγή Μ.Μ.2',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true); setSaveError(null);
    try {
      const res = await fetch(`/api/admin/softone/items/${rec.mtrl}/unit2`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit2, ratio2: Number(current.ratio2), strict2: !!current.strict2 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Η αλλαγή Μ.Μ.2 απέτυχε');
      toast.success('Η Μ.Μ.2 άλλαξε μέσω script και επαληθεύτηκε από το SoftOne');
      setUnit2Locked(false);
      // Οι υπόλοιπες αλλαγές (χωρίς Μ.Μ.2) από το επίσημο setData.
      const rest = changes.filter((k) => k !== 'unit2' && k !== 'ratio2' && k !== 'strict2');
      if (rest.length) {
        const r2 = await fetch(`/api/admin/softone/items/${rec.mtrl}/full`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(rest.map((k) => [k, current[k]]))),
        });
        const b2 = await r2.json().catch(() => ({}));
        if (!r2.ok) throw new Error(`Η Μ.Μ.2 άλλαξε, αλλά τα υπόλοιπα όχι: ${b2.message || 'σφάλμα'}`);
        toast.success(`Αποθηκεύτηκαν και: ${b2.changed.map((c: { label: string }) => c.label).join(', ')}`);
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setSaveError((e as Error).message);
      void load();
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) => (errors[k] ? errors[k] : null);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[92dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-2.5 pr-12">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-sisyphus-50 text-sisyphus-600 dark:bg-sisyphus-500/15 [&_svg]:size-4">
            <FiEdit3 />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-(length:--fs-15)">
              {rec ? (rec.isService ? 'Επεξεργασία υπηρεσίας' : 'Επεξεργασία είδους') : 'Επεξεργασία'}
            </DialogTitle>
            <DialogDescription className="truncate text-(length:--fs-11)">
              {rec ? `${rec.code} — ${rec.name ?? ''} · ζωντανά από το SoftOne` : 'Φόρτωση από το SoftOne…'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-3 bg-muted/20 px-4 py-3">
          {loadError && (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12)">
              <FiAlertTriangle className="size-4 text-destructive" aria-hidden />
              <span className="flex-1">{loadError}</span>
              <Button size="sm" variant="outline" onClick={load}>Δοκιμή ξανά</Button>
            </div>
          )}

          {!form && !loadError && (
            <div className="space-y-3" aria-busy="true" aria-label="Φόρτωση">
              {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}
            </div>
          )}

          {form && rec && opts && (
            <>
              <FormSection tone="blue" icon={<FiInfo />} title="Γενικά" aside={
                <Segmented
                  ariaLabel="Κατάσταση" value={form.isActive ? 'on' : 'off'}
                  onChange={(v) => set('isActive')(v === 'on')}
                  options={[{ value: 'on', label: 'Ενεργό' }, { value: 'off', label: 'Ανενεργό' }]}
                />
              }>
                <div className="grid grid-cols-12 gap-x-3 gap-y-2">
                  <Field label="Κωδικός" required htmlFor="it-code" className="col-span-12 sm:col-span-4" error={err('code')}>
                    <Input id="it-code" {...text('code')} className={cn(fieldCls, 'font-mono')} aria-invalid={!!err('code')} />
                  </Field>
                  <Field label="Περιγραφή" required htmlFor="it-name" className="col-span-12 sm:col-span-8" error={err('name')}>
                    <Input id="it-name" {...text('name')} maxLength={128} className={fieldCls} aria-invalid={!!err('name')} />
                  </Field>
                  <Field label="Περιγραφή 2" htmlFor="it-name2" className="col-span-12">
                    <Input id="it-name2" {...text('name2')} maxLength={128} className={fieldCls} />
                  </Field>
                  <Field label="Barcode / EAN" htmlFor="it-code1" className="col-span-6">
                    <Input id="it-code1" {...text('code1')} maxLength={50} className={cn(fieldCls, 'font-mono')} />
                  </Field>
                  <Field label="Κωδ. εργοστασίου" htmlFor="it-code2" className="col-span-6">
                    <Input id="it-code2" {...text('code2')} maxLength={50} className={cn(fieldCls, 'font-mono')} />
                  </Field>
                </div>
                {String(form.code) !== rec.code && (
                  <RowHint tone="warn">Αλλαγή κωδικού: ελέγχεται η μάσκα και η μοναδικότητα σε όλο το μητρώο του SoftOne.</RowHint>
                )}
              </FormSection>

              <FormSection tone="violet" icon={<FiLayers />} title="Εμπορική ταξινόμηση">
                <div className="grid grid-cols-12 gap-x-3 gap-y-2">
                  <Field label="Εμπορική κατηγορία" htmlFor="it-cat" className="col-span-12 sm:col-span-6">
                    <OptSelect id="it-cat" value={String(form.category)} onChange={set('category')} opts={opts.categories} optional />
                  </Field>
                  <Field label="Ομάδα" htmlFor="it-grp" className="col-span-12 sm:col-span-6">
                    <OptSelect id="it-grp" value={String(form.group)} onChange={set('group')} opts={opts.groups} optional />
                  </Field>
                  {!rec.isService && (
                    <>
                      <Field label="Κατασκευαστής" htmlFor="it-man" className="col-span-12 sm:col-span-6">
                        <OptSelect id="it-man" value={String(form.manufacturer)} onChange={set('manufacturer')} opts={opts.manufacturers} optional />
                      </Field>
                      <Field label="Μάρκα" htmlFor="it-brand" className="col-span-12 sm:col-span-6">
                        <OptSelect id="it-brand" value={String(form.brand)} onChange={set('brand')} opts={opts.brands} optional />
                      </Field>
                    </>
                  )}
                  <Field label="Κατηγορία ΦΠΑ" required htmlFor="it-vat" className="col-span-12 sm:col-span-6" error={err('vat')}>
                    <OptSelect id="it-vat" value={String(form.vat)} onChange={set('vat')} opts={opts.vats} invalid={!!err('vat')} />
                  </Field>
                </div>
              </FormSection>

              <ItemUnitSetupPanel
                value={unitValues(form)}
                onChange={(patch) => setForm((f) => (f ? { ...f, ...patch } : f))}
                opts={opts.units} meta={unitsMeta} originalUnit1={rec.unit1} hasMovements={hasMovements} isService={rec.isService}
                scene={sceneLoad(form, rec, opts)}
              />
              <FormSection tone="emerald" icon={<FiDollarSign />} title="Τιμές" aside={
                lastBuy
                  ? <span className="tabular-nums">Τελ. αγορά: <strong>{eur.format(lastBuy.unitCost)}</strong> · {new Date(lastBuy.date).toLocaleDateString('el-GR', { timeZone: 'UTC' })} · {lastBuy.fincode}</span>
                  : <span>Καμία αγορά στο SoftOne</span>
              }>
                <div className="grid grid-cols-12 gap-x-3 gap-y-2">
                  <Field label="Τιμή λιανικής (€)" htmlFor="it-pr" className="col-span-6 sm:col-span-4" error={err('priceRetail')}>
                    <Input id="it-pr" inputMode="decimal" {...text('priceRetail')} placeholder="0,00" className={cn(fieldCls, 'tabular-nums')} aria-invalid={!!err('priceRetail')} />
                  </Field>
                  <Field label="Τιμή χονδρικής (€)" htmlFor="it-pw" className="col-span-6 sm:col-span-4" error={err('priceWholesale')}>
                    <Input id="it-pw" inputMode="decimal" {...text('priceWholesale')} placeholder="0,00" className={cn(fieldCls, 'tabular-nums')} aria-invalid={!!err('priceWholesale')} />
                  </Field>
                </div>
              </FormSection>

              {!rec.isService && (
                <FormSection tone="blue" icon={<FiMaximize2 />} title="Διαστάσεις & βάρος">
                  <div className="grid grid-cols-12 gap-x-3 gap-y-2">
                    {([['dim1', 'Μήκος'], ['dim2', 'Πλάτος'], ['dim3', 'Ύψος']] as const).map(([k, label]) => (
                      <Field key={k} label={label} htmlFor={`it-${k}`} className="col-span-4" error={err(k)}>
                        <Input id={`it-${k}`} inputMode="decimal" {...text(k)} placeholder="0" className={cn(fieldCls, 'tabular-nums')} aria-invalid={!!err(k)} />
                      </Field>
                    ))}
                    <Field label="Καθαρό βάρος (kg)" htmlFor="it-w" className="col-span-4" error={err('weight')}>
                      <Input id="it-w" inputMode="decimal" {...text('weight')} placeholder="0" className={cn(fieldCls, 'tabular-nums')} aria-invalid={!!err('weight')} />
                    </Field>
                    <Field label="Μικτό βάρος (kg)" htmlFor="it-gw" className="col-span-4" error={err('grossWeight')}>
                      <Input id="it-gw" inputMode="decimal" {...text('grossWeight')} placeholder="0" className={cn(fieldCls, 'tabular-nums')} aria-invalid={!!err('grossWeight')} />
                    </Field>
                    <Field label="Όγκος" htmlFor="it-v" className="col-span-4" error={err('volume')}>
                      <Input id="it-v" inputMode="decimal" {...text('volume')} placeholder="0" className={cn(fieldCls, 'tabular-nums')} aria-invalid={!!err('volume')} />
                    </Field>
                  </div>
                  <RowHint>Οι διαστάσεις γράφονται στη μονάδα που χρησιμοποιεί η εταιρία (π.χ. εκατοστά). Αποθηκεύονται στο SoftOne (Διάσταση 1/2/3, Μάζα, Μικτό βάρος, Όγκος).</RowHint>
                </FormSection>
              )}

              <FormSection tone="violet" icon={<FiTag />} title="Χαρακτηριστικά" aside={<span>αποθηκεύονται στην εφαρμογή</span>}>
                <datalist id="attr-names">{ATTR_SUGGESTIONS.map((n) => <option key={n} value={n} />)}</datalist>
                {attrs.length === 0 && (
                  <p className="text-(length:--fs-12) text-muted-foreground">Κανένα χαρακτηριστικό. Πρόσθεσε π.χ. «Χρώμα: Λευκό» ή «Πάχος: 10 mm».</p>
                )}
                {attrs.map((a, i) => (
                  <div key={i} className="grid grid-cols-12 items-end gap-x-2 gap-y-1">
                    <Field label={i === 0 ? 'Όνομα' : ''} htmlFor={`at-n-${i}`} className="col-span-12 sm:col-span-4">
                      <Input id={`at-n-${i}`} list="attr-names" value={a.name} onChange={(e) => setAttr(i, { name: e.target.value })} maxLength={80} placeholder="π.χ. Χρώμα" className={fieldCls} aria-label={`Όνομα χαρακτηριστικού ${i + 1}`} />
                    </Field>
                    <Field label={i === 0 ? 'Τιμή' : ''} htmlFor={`at-v-${i}`} className="col-span-7 sm:col-span-5">
                      <Input id={`at-v-${i}`} value={a.value} onChange={(e) => setAttr(i, { value: e.target.value })} maxLength={300} placeholder="π.χ. Λευκό" className={fieldCls} aria-label={`Τιμή χαρακτηριστικού ${i + 1}`} />
                    </Field>
                    <Field label={i === 0 ? 'Μονάδα' : ''} htmlFor={`at-u-${i}`} className="col-span-3 sm:col-span-2">
                      <Input id={`at-u-${i}`} value={a.unit} onChange={(e) => setAttr(i, { unit: e.target.value })} maxLength={20} placeholder="mm" className={fieldCls} aria-label={`Μονάδα χαρακτηριστικού ${i + 1}`} />
                    </Field>
                    <div className="col-span-2 flex justify-end sm:col-span-1">
                      {/* Οι ενέργειες ζουν ΠΑΝΤΑ σε dropdown (κανόνας του project). */}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
                          aria-label={`Ενέργειες για χαρακτηριστικό ${a.name || i + 1}`}
                        >
                          <FiMoreVertical className="size-4" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem className="cursor-pointer gap-2 text-(length:--fs-12)" disabled={i === 0} onSelect={() => moveAttr(i, -1)}>
                            <FiArrowUp className="size-3.5" aria-hidden /> Μετακίνηση πάνω
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer gap-2 text-(length:--fs-12)" disabled={i === attrs.length - 1} onSelect={() => moveAttr(i, 1)}>
                            <FiArrowDown className="size-3.5" aria-hidden /> Μετακίνηση κάτω
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2 text-(length:--fs-12)" onSelect={() => setAttrs((x) => x.filter((_, j) => j !== i))}>
                            <FiTrash2 className="size-3.5" aria-hidden /> Αφαίρεση
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAttrs((x) => [...x, { name: '', value: '', unit: '' }])}>
                    <FiPlus className="mr-1 size-3.5" aria-hidden /> Προσθήκη χαρακτηριστικού
                  </Button>
                  {attrError && <RowHint tone="bad">{attrError}</RowHint>}
                </div>
              </FormSection>

              <FormSection tone="slate" icon={<FiSliders />} title="Παρατηρήσεις">
                <textarea
                  id="it-rem" rows={2} maxLength={2000} {...text('remarks')} aria-label="Παρατηρήσεις"
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-(length:--fs-13) outline-hidden focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </FormSection>

              {saveError && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12) text-destructive">
                  {saveError}
                </p>
              )}
              {unit2Locked && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-(length:--fs-12) text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                  <FiAlertTriangle className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">Το SoftOne ζητά επιβεβαίωση για αλλαγή Μ.Μ.2 σε είδος με παραστατικά — μέσω Web Services δεν γίνεται. Διαχειριστές μπορούν να την περάσουν με το εγκεκριμένο script.</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-amber-100 dark:hover:bg-amber-500/20" aria-label="Ενέργειες Μ.Μ.2"><FiMoreVertical className="size-4" aria-hidden /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuItem className="cursor-pointer gap-2 text-(length:--fs-12)" disabled={busy} onSelect={() => void applyUnit2ViaScript()}><FiLayers className="size-3.5" aria-hidden /> Αλλαγή Μ.Μ.2 μέσω script</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter className="mx-0 mb-0 items-center gap-2 border-t border-border bg-card px-4 py-2.5">
          <span className="mr-auto text-(length:--fs-11) text-muted-foreground" aria-live="polite">
            {!anyChange ? 'Καμία αλλαγή' : [...changes.map((k) => LABEL[k] ?? k), ...(attrsChanged ? ['Χαρακτηριστικά'] : [])].join(', ')}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button onClick={save} disabled={busy || !anyChange || !valid}>
            {busy && <FiLoader className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
            {busy ? 'Αποστολή…' : changes.length ? 'Αποθήκευση στο SoftOne' : 'Αποθήκευση'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
