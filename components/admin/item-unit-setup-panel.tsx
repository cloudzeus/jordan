'use client';

// «Μονάδες μέτρησης» ΥΠΑΡΧΟΝΤΟΣ είδους: οι 4 θέσεις του SoftOne με εξήγηση, η σχέση πάντα ως
// «1 <μονάδα> = <σχέση> <βασική>», ζωντανό παράδειγμα και έλεγχοι από το lib/item-unit-setup.
// Εδώ γίνονται τα περισσότερα λάθη (ανάποδος συντελεστής, σχέση 1 σε διαφορετικές μονάδες).
import * as React from 'react';
import { FiBox, FiLock, FiAlertTriangle, FiAlertCircle, FiZap, FiHelpCircle, FiArrowRight } from 'react-icons/fi';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormSection, FormSelect, RowHint, fieldCls } from '@/components/admin/form-kit';
import { inferUnitVisual, UnitThumb, type UnitVisualKind } from '@/components/admin/unit-visual';
import {
  checkUnitSetup, containerPalletSqmPreset, describeChain, UNIT_SLOT_HELP, type UnitIssue, type UnitSetup,
} from '@/lib/item-unit-setup';

type Opt = { id: string; name: string };

// three.js μόνο στον browser και μόνο όταν χρειάζεται (βαρύ bundle — όχι στο αρχικό φόρτωμα της φόρμας).
const ContainerScene = dynamic(() => import('@/components/admin/container-scene'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-md bg-muted motion-reduce:animate-none sm:h-72" aria-label="Φόρτωση 3D προβολής" />,
});

/** Τι φορτώνεται στις παλέτες στην 3D προβολή: πλάκες πέτρας (με τις διαστάσεις του είδους) ή κιβώτια. */
export type SceneLoad = { load: 'boxes' | 'stones' | 'sacks'; slab: { l: number; w: number; t: number } | null };
export type UnitMeta = { id: string; shortcut: string; name: string; interCode: string | null; decimals: number };

/** Οι τιμές όπως τις κρατά η φόρμα: λίστες ως id ή '', αριθμοί ως κείμενο. */
export type UnitFormValues = {
  unit1: string; unit2: string; ratio2: string; strict2: boolean;
  unitBuy: string; buyRatio: string; buyStrict: boolean;
  unitSell: string; sellRatio: string; sellStrict: boolean;
};

const NONE = '__none__';
const parseNum = (v: string) => {
  const s = v.trim().replace(/\s/g, '');
  if (!s) return 0;
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
};
const fmtNum = (n: number) => (n ? n.toLocaleString('el-GR', { maximumFractionDigits: 6, useGrouping: false }) : '');

export function toSetup(v: UnitFormValues): UnitSetup {
  return {
    unit1: v.unit1 || null,
    unit2: v.unit2 || null, ratio2: parseNum(v.ratio2), strict2: v.strict2,
    unitBuy: v.unitBuy || null, buyRatio: parseNum(v.buyRatio), buyStrict: v.buyStrict,
    unitSell: v.unitSell || null, sellRatio: parseNum(v.sellRatio), sellStrict: v.sellStrict,
  };
}

/** Βρίσκει τις μονάδες του προτύπου: τ.μ. (m² / «τετραγων»), παλέτα (ΠΑΛ), container (CONT). */
export function presetIds(meta: UnitMeta[]) {
  const norm = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const sqm = meta.find((u) => u.interCode === 'm²' || /τετραγων/.test(norm(u.name)));
  const pallet = meta.find((u) => /^παλ/.test(norm(u.shortcut)) || /^παλετ/.test(norm(u.name)));
  const container = meta.find((u) => /^cont/i.test(u.shortcut) || /container/i.test(u.name));
  return sqm && pallet && container ? { sqm: sqm.id, pallet: pallet.id, container: container.id } : null;
}

function SlotRow({
  title, help, unit, onUnit, ratio, onRatio, strict, onStrict, opts, optional, baseLabel, unitLabel, issues, locked, lockNote, children, idPrefix, baseId, visual,
}: {
  title: string; help: string; unit: string; onUnit: (v: string) => void; ratio?: string; onRatio?: (v: string) => void;
  strict?: boolean; onStrict?: (v: boolean) => void; opts: Opt[]; optional?: boolean; baseLabel: string; unitLabel: string;
  issues: UnitIssue[]; locked?: boolean; lockNote?: string; children?: React.ReactNode; idPrefix: string; baseId?: string; visual?: UnitVisualKind | null;
}) {
  const own = !!unit && unit !== baseId; // διαφορετική από τη βασική ⇒ χρειάζεται σχέση
  const bad = issues.some((i) => i.level === 'error');
  return (
    <div className={cn('rounded-md border bg-card px-3 py-2', bad ? 'border-destructive/40' : 'border-border')}>
      <div className="grid grid-cols-12 items-center gap-x-3 gap-y-1.5">
        <div className="col-span-12 sm:col-span-4">
          <div className="text-(length:--fs-12) font-semibold">{title}</div>
          <p className="text-(length:--fs-11) leading-snug text-muted-foreground">{help}</p>
        </div>
        <div className="col-span-12 flex items-center gap-2 sm:col-span-3">
          {visual ? <UnitThumb kind={visual} size={36} /> : <span className="size-9 shrink-0 rounded-md border border-dashed border-border" aria-hidden />}
          <FormSelect
            id={`${idPrefix}-unit`} ariaLabel={title} disabled={locked}
            value={unit || (optional ? NONE : '')}
            onChange={(v) => onUnit(v === NONE ? '' : v)}
            opts={optional ? [{ id: NONE, name: '— καμία —' }, ...opts] : opts}
            invalid={!unit && !optional}
            className="min-w-0 flex-1"
          />
        </div>
        {onRatio && (
          <div className="col-span-8 flex items-center gap-1.5 sm:col-span-4">
            {own ? (
              <>
                <span className="shrink-0 whitespace-nowrap text-(length:--fs-12) text-muted-foreground">1 {unitLabel} =</span>
                <Input
                  id={`${idPrefix}-ratio`} inputMode="decimal" value={ratio ?? ''} onChange={(e) => onRatio(e.target.value)}
                  className={cn(fieldCls, 'w-24 tabular-nums')} aria-label={`Πόσες ${baseLabel} κάνει 1 ${unitLabel}`}
                  aria-invalid={bad || undefined}
                />
                <span className="truncate text-(length:--fs-12) font-medium">{baseLabel}</span>
              </>
            ) : <span className="text-(length:--fs-11) text-muted-foreground">ίδια με τη βασική</span>}
          </div>
        )}
        {onStrict && own && (
          <label className="col-span-4 inline-flex cursor-pointer items-center justify-end gap-1.5 text-(length:--fs-11) sm:col-span-1" title="Αυστηρή σχέση: το SoftOne υπολογίζει πάντα τη μία ποσότητα από την άλλη με αυτόν τον συντελεστή.">
            <input type="checkbox" className="size-3.5 accent-[#B45309]" checked={!!strict} onChange={(e) => onStrict(e.target.checked)} />
            Αυστηρή
          </label>
        )}
      </div>
      {locked && lockNote && <p className="mt-1.5 flex items-center gap-1 text-(length:--fs-11) text-muted-foreground"><FiLock className="size-3" aria-hidden /> {lockNote}</p>}
      {children}
      {issues.map((i, n) => (
        <p key={n} role={i.level === 'error' ? 'alert' : undefined} className={cn('mt-1.5 flex items-start gap-1 text-(length:--fs-11) leading-snug', i.level === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300')}>
          {i.level === 'error' ? <FiAlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden /> : <FiAlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />} {i.message}
        </p>
      ))}
    </div>
  );
}

export function ItemUnitSetupPanel({
  value, onChange, opts, meta, originalUnit1, hasMovements, isService, scene,
}: {
  value: UnitFormValues; onChange: (patch: Partial<UnitFormValues>) => void; opts: Opt[]; meta: UnitMeta[];
  originalUnit1: string | null; hasMovements: boolean | null; isService: boolean; scene?: SceneLoad;
}) {
  const [show3d, setShow3d] = React.useState(true);
  const [preset, setPreset] = React.useState<{ sqmPerPallet: string; palletsPerContainer: string } | null>(null);
  const setup = toSetup(value);
  const byId = React.useMemo(() => new Map(meta.map((u) => [u.id, u])), [meta]);
  const label = React.useCallback((id: string | null) => (id ? byId.get(id)?.shortcut ?? opts.find((o) => o.id === id)?.name ?? `#${id}` : '—'), [byId, opts]);
  const issues = checkUnitSetup(setup, label);
  const at = (...fields: (keyof UnitSetup)[]) => issues.filter((i) => fields.includes(i.field));
  const ids = presetIds(meta);
  const baseLabel = label(setup.unit1);
  const visualOf = (id: string | null): UnitVisualKind | null => {
    if (!id) return null;
    const m = byId.get(id);
    return inferUnitVisual(m ?? { name: opts.find((o) => o.id === id)?.name });
  };
  const baseLocked = !!hasMovements && !!originalUnit1;
  const chain = describeChain(setup, label);

  // Container ↔ παλέτες: «πόσες παλέτες σε 1 μονάδα αγορών» γράφει τη σχέση αγορών (= παλέτες × τ.μ. ανά παλέτα).
  const showPalletsPerBuy = !!setup.unit2 && !!setup.unitBuy && setup.unitBuy !== setup.unit1 && setup.unitBuy !== setup.unit2 && setup.ratio2 > 0;
  const palletsPerBuy = showPalletsPerBuy && setup.buyRatio > 0 ? setup.buyRatio / setup.ratio2 : 0;

  if (isService) {
    return (
      <FormSection tone="amber" icon={<FiBox />} title="Μονάδα μέτρησης">
        <SlotRow visual={visualOf(setup.unit1)} idPrefix="u1" title="Βασική μονάδα" help="Η υπηρεσία έχει μία μονάδα (το SoftOne δεν κρατά μονάδες αγορών/πώλησης για υπηρεσίες)."
          unit={value.unit1} onUnit={(v) => onChange({ unit1: v })} opts={opts} baseLabel={baseLabel} unitLabel={baseLabel} issues={at('unit1')} />
      </FormSection>
    );
  }

  return (
    <FormSection
      tone="amber" icon={<FiBox />} title="Μονάδες μέτρησης"
      aside={(
        <Button type="button" variant="outline" size="sm" className="h-7 text-(length:--fs-11)" disabled={!ids || baseLocked && originalUnit1 !== ids?.sqm}
          title={!ids ? 'Λείπουν οι μονάδες Παλέτα / Container / Τετραγωνικά μέτρα — φτιάξε τες στο Operations → Μονάδες μέτρησης' : baseLocked && originalUnit1 !== ids?.sqm ? 'Η βασική μονάδα είναι κλειδωμένη (το είδος έχει κινήσεις) και δεν είναι τ.μ.' : undefined}
          onClick={() => setPreset({ sqmPerPallet: setup.unit2 === ids?.pallet && setup.ratio2 ? fmtNum(setup.ratio2) : '', palletsPerContainer: setup.unitBuy === ids?.container && setup.ratio2 ? fmtNum(setup.buyRatio / setup.ratio2) : '' })}
        >
          <FiZap className="mr-1 size-3" aria-hidden /> Container → Παλέτα → τ.μ.
        </Button>
      )}
    >
      <details data-tint="off" className="group rounded-md bg-amber-50/60 px-3 py-2 text-(length:--fs-12) dark:bg-amber-500/10">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-amber-900 dark:text-amber-200">
          <FiHelpCircle className="size-3.5" aria-hidden /> Πώς δουλεύουν οι μονάδες — διάβασέ το πριν αλλάξεις κάτι
        </summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 leading-snug text-amber-950 dark:text-amber-100">
          <li><strong>Βασική</strong>: σε αυτήν μετράει η αποθήκη, το κόστος και οι τιμές. Όλα καταλήγουν εδώ.</li>
          <li>Κάθε άλλη μονάδα έχει <strong>σχέση = πόσες βασικές χωρούν σε ΜΙΑ από αυτή</strong>. Παράδειγμα: 1 Παλέτα = 52 τ.μ. → γράφεις <strong>52</strong>, όχι 0,019.</li>
          <li><strong>Αγορών</strong>: όταν το τιμολόγιο γράφει «2 Container», η αποθήκη παίρνει 2 × σχέση τ.μ. και το κόστος ανά τ.μ. βγαίνει σωστό.</li>
          <li><strong>Μ.Μ.2</strong>: δεύτερη ποσότητα που κρατιέται δίπλα (π.χ. πόσες παλέτες έχεις). Χωρίς «αυστηρή» σχέση διορθώνεται σε κάθε παραστατικό.</li>
          <li>Ίδια μονάδα με τη βασική ⇒ σχέση <strong>1</strong>. Διαφορετική μονάδα με σχέση 1 είναι σχεδόν πάντα λάθος.</li>
          <li>Η βασική <strong>δεν αλλάζει</strong> μετά τις πρώτες κινήσεις — το ιστορικό και η αποθήκη είναι ήδη σε αυτήν.</li>
        </ul>
      </details>

      {preset && ids && (
        <div className="rounded-md border border-amber-500/40 bg-card px-3 py-2">
          <p className="mb-1.5 text-(length:--fs-12) font-semibold">Πρότυπο για πέτρες / πλακάκια — συμπλήρωσε τα νούμερα ΑΥΤΟΥ του είδους</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-(length:--fs-11) text-muted-foreground">τ.μ. ανά παλέτα
              <Input autoFocus inputMode="decimal" value={preset.sqmPerPallet} onChange={(e) => setPreset({ ...preset, sqmPerPallet: e.target.value })} className={cn(fieldCls, 'w-28 tabular-nums')} />
            </label>
            <label className="grid gap-1 text-(length:--fs-11) text-muted-foreground">παλέτες ανά container
              <Input inputMode="decimal" value={preset.palletsPerContainer} onChange={(e) => setPreset({ ...preset, palletsPerContainer: e.target.value })} className={cn(fieldCls, 'w-28 tabular-nums')} />
            </label>
            {parseNum(preset.sqmPerPallet) > 0 && parseNum(preset.palletsPerContainer) > 0 && (
              <span className="flex h-8 items-center gap-1 text-(length:--fs-12) tabular-nums">
                <FiArrowRight className="size-3.5" aria-hidden /> 1 Container = {(parseNum(preset.sqmPerPallet) * parseNum(preset.palletsPerContainer)).toLocaleString('el-GR', { maximumFractionDigits: 4 })} τ.μ.
              </span>
            )}
            <div className="ml-auto flex gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPreset(null)}>Άκυρο</Button>
              <Button
                type="button" size="sm" disabled={!(parseNum(preset.sqmPerPallet) > 0 && parseNum(preset.palletsPerContainer) > 0)}
                onClick={() => {
                  const p = containerPalletSqmPreset(ids, parseNum(preset.sqmPerPallet), parseNum(preset.palletsPerContainer));
                  onChange({
                    unit1: p.unit1!, unit2: p.unit2!, ratio2: fmtNum(p.ratio2!), strict2: false,
                    unitBuy: p.unitBuy!, buyRatio: fmtNum(p.buyRatio!), buyStrict: true,
                    unitSell: p.unitSell!, sellRatio: '1', sellStrict: true,
                  });
                  setPreset(null);
                }}
              >Εφαρμογή</Button>
            </div>
          </div>
          <RowHint>Βασική και πώληση: τ.μ. · Μ.Μ.2: Παλέτα (ελεύθερη σχέση — το περιεχόμενο αλλάζει) · Αγορές: Container. Τίποτα δεν αποθηκεύεται πριν πατήσεις «Αποθήκευση στο SoftOne».</RowHint>
        </div>
      )}

      <div className="space-y-2">
        <SlotRow idPrefix="u1" title="Βασική (αποθήκη)" help={UNIT_SLOT_HELP.unit1} unit={value.unit1} onUnit={(v) => onChange({ unit1: v })}
          opts={opts} baseLabel={baseLabel} unitLabel={baseLabel} issues={at('unit1')}
          locked={baseLocked} lockNote="Κλειδωμένη: το είδος έχει ήδη κινήσεις στο SoftOne." />
        <SlotRow visual={visualOf(setup.unit2)} baseId={value.unit1} idPrefix="u2" title="Μ.Μ.2 (παράλληλη)" help={UNIT_SLOT_HELP.unit2} optional unit={value.unit2} onUnit={(v) => onChange({ unit2: v, ...(v ? {} : { ratio2: '', strict2: false }) })}
          ratio={value.ratio2} onRatio={(v) => onChange({ ratio2: v })} strict={value.strict2} onStrict={(v) => onChange({ strict2: v })}
          opts={opts} baseLabel={baseLabel} unitLabel={label(setup.unit2)} issues={at('unit2', 'ratio2')} />
        <SlotRow visual={visualOf(setup.unitBuy)} baseId={value.unit1} idPrefix="u3" title="Αγορών" help={UNIT_SLOT_HELP.unitBuy} optional unit={value.unitBuy} onUnit={(v) => onChange({ unitBuy: v, ...(v === value.unit1 || !v ? { buyRatio: '1' } : {}) })}
          ratio={value.buyRatio} onRatio={(v) => onChange({ buyRatio: v })} strict={value.buyStrict} onStrict={(v) => onChange({ buyStrict: v })}
          opts={opts} baseLabel={baseLabel} unitLabel={label(setup.unitBuy)} issues={at('unitBuy', 'buyRatio')}>
          {showPalletsPerBuy && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-(length:--fs-11) text-muted-foreground">
              ή γράψε: 1 {label(setup.unitBuy)} =
              <Input
                inputMode="decimal" aria-label={`Πόσες ${label(setup.unit2)} σε 1 ${label(setup.unitBuy)}`}
                value={palletsPerBuy ? fmtNum(Math.round(palletsPerBuy * 10000) / 10000) : ''}
                onChange={(e) => { const n = parseNum(e.target.value); onChange({ buyRatio: n > 0 ? fmtNum(Math.round(n * setup.ratio2 * 10000) / 10000) : '' }); }}
                className={cn(fieldCls, 'h-7 w-20 tabular-nums')}
              />
              {label(setup.unit2)} (× {fmtNum(setup.ratio2)} {baseLabel})
            </div>
          )}
        </SlotRow>
        <SlotRow visual={visualOf(setup.unitSell)} baseId={value.unit1} idPrefix="u4" title="Πώλησης" help={UNIT_SLOT_HELP.unitSell} optional unit={value.unitSell} onUnit={(v) => onChange({ unitSell: v, ...(v === value.unit1 || !v ? { sellRatio: '1' } : {}) })}
          ratio={value.sellRatio} onRatio={(v) => onChange({ sellRatio: v })} strict={value.sellStrict} onStrict={(v) => onChange({ sellStrict: v })}
          opts={opts} baseLabel={baseLabel} unitLabel={label(setup.unitSell)} issues={at('unitSell', 'sellRatio')} />
      </div>

      {(setup.unitBuy && setup.unitBuy !== setup.unit1) || (setup.unit2 && setup.unit2 !== setup.unit1) ? (
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <p className="mb-1.5 text-(length:--fs-11) font-semibold uppercase tracking-wide text-muted-foreground">Με μια ματιά</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-(length:--fs-13) tabular-nums">
            {setup.unitBuy && setup.unitBuy !== setup.unit1 && setup.buyRatio > 0 && (
              <>
                <span className="inline-flex items-center gap-1.5"><UnitThumb kind={visualOf(setup.unitBuy)!} size={52} /><strong>1</strong> {label(setup.unitBuy)}</span>
                <span className="text-muted-foreground">=</span>
                {showPalletsPerBuy && palletsPerBuy > 0 && (
                  <>
                    <span className="inline-flex items-center gap-1.5"><UnitThumb kind={visualOf(setup.unit2)!} size={52} /><strong>{palletsPerBuy.toLocaleString('el-GR', { maximumFractionDigits: 2 })}</strong> {label(setup.unit2)}</span>
                    <span className="text-muted-foreground">=</span>
                  </>
                )}
                <span className="inline-flex items-center gap-1.5"><UnitThumb kind={visualOf(setup.unit1)!} size={52} /><strong>{setup.buyRatio.toLocaleString('el-GR', { maximumFractionDigits: 4 })}</strong> {baseLabel}</span>
              </>
            )}
            {!(setup.unitBuy && setup.unitBuy !== setup.unit1 && setup.buyRatio > 0) && setup.unit2 && setup.ratio2 > 0 && (
              <>
                <span className="inline-flex items-center gap-1.5"><UnitThumb kind={visualOf(setup.unit2)!} size={52} /><strong>1</strong> {label(setup.unit2)}</span>
                <span className="text-muted-foreground">=</span>
                <span className="inline-flex items-center gap-1.5"><UnitThumb kind={visualOf(setup.unit1)!} size={52} /><strong>{setup.ratio2.toLocaleString('el-GR', { maximumFractionDigits: 4 })}</strong> {baseLabel}</span>
              </>
            )}
          </div>
          <p className="mt-1.5 text-(length:--fs-11) text-muted-foreground">Αγοράζεις σε {label(setup.unitBuy ?? setup.unit1)}, η αποθήκη μετράει σε {baseLabel}, πουλάς σε {label(setup.unitSell ?? setup.unit1)}.</p>
        </div>
      ) : null}

      {showPalletsPerBuy && palletsPerBuy > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-(length:--fs-11) font-semibold uppercase tracking-wide text-muted-foreground">3D προβολή φόρτωσης</span>
            <button type="button" onClick={() => setShow3d((v) => !v)} className="cursor-pointer text-(length:--fs-11) text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              {show3d ? 'Απόκρυψη' : 'Εμφάνιση'}
            </button>
          </div>
          {show3d && (
            <ContainerScene
              pallets={Math.round(palletsPerBuy * 100) / 100}
              perPallet={setup.ratio2}
              labels={{ container: label(setup.unitBuy), pallet: label(setup.unit2), base: baseLabel }}
              load={scene?.load ?? 'boxes'}
              slab={scene?.slab ?? null}
            />
          )}
        </div>
      )}

      {chain.length > 0 && (
        <div className="rounded-md border border-sisyphus-500/25 bg-sisyphus-50/50 px-3 py-2 dark:bg-sisyphus-500/10" aria-live="polite">
          <p className="mb-1 text-(length:--fs-11) font-semibold uppercase tracking-wide text-sisyphus-700 dark:text-sisyphus-300">Τι θα συμβεί στα παραστατικά</p>
          <ul className="space-y-0.5 text-(length:--fs-12) tabular-nums">{chain.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
    </FormSection>
  );
}
