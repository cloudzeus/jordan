'use client';

// «Χώροι & δάπεδα» στην καρτέλα έργου: οι χώροι (από τη διαστασιολόγηση κάτοψης ή χειροκίνητα) με
// το τελικό δάπεδο. Από εδώ βγαίνουν οι Προδιαγραφές δαπέδων και οι Οδηγίες προς εργολάβο (Word) και
// τροφοδοτείται η προσφορά/σύμβαση του έργου.
import * as React from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import {
  FiChevronDown, FiDownload, FiFileText, FiGrid, FiHelpCircle, FiLoader, FiPlus, FiSave, FiSquare, FiTool, FiTrash2,
} from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FINISHES, FINISH_BY_KEY, finishLabel, materialNeeds, orderArea, skirtingLength, type RoomView } from '@/lib/project-rooms-core';
import { FinishSwatch, RoomFinishFields, type FinishDraft } from './room-finish-fields';
import { ROOMS_EVENT, fetchRooms, putRooms, toInput } from './rooms-api';

const FloorPlanDialog = dynamic(() => import('@/components/admin/floorplan/floor-plan-dialog').then((m) => m.FloorPlanDialog), { ssr: false });

type Draft = Omit<RoomView, 'prjc' | 'sortOrder' | 'updatedAt'> & { key: string };
const nf = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const key = () => Math.random().toString(36).slice(2, 10);
const fromView = (r: RoomView): Draft => ({ ...r, key: r.id });
const num = (s: string) => { const v = Number(s.replace(',', '.')); return Number.isFinite(v) && v >= 0 ? v : null; };

function NumField({ label, value, unit, onValue, disabled, id }: { label: string; value: number | null; unit: string; onValue: (v: number | null) => void; disabled?: boolean; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[length:var(--fs-11)] text-muted-foreground">{label}</label>
      <div className="relative">
        <input
          id={id} inputMode="decimal" disabled={disabled} key={String(value)} defaultValue={value == null ? '' : String(value).replace('.', ',')}
          onBlur={(e) => onValue(e.target.value.trim() ? num(e.target.value) : null)}
          className="h-8 w-full rounded-lg border border-input bg-transparent pl-2.5 pr-8 font-mono text-[length:var(--fs-12)] tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[length:var(--fs-11)] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

export function ProjectRoomsPanel({ prjc, projectLabel, canManage, canSaveFiles = false }: {
  prjc: number; projectLabel: string; canManage: boolean; canSaveFiles?: boolean;
}) {
  const [rooms, setRooms] = React.useState<Draft[] | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [plan, setPlan] = React.useState<'closed' | 'open' | 'hidden'>('closed');
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;

  const load = React.useCallback(async () => {
    try { setRooms((await fetchRooms(prjc)).map(fromView)); setDirty(false); }
    catch { setRooms([]); }
  }, [prjc]);
  React.useEffect(() => { void load(); }, [load]);
  // Αποθήκευση από τη διαστασιολόγηση ⇒ ξαναφόρτωση (αν δεν έχουμε δικές μας αλλαγές σε εξέλιξη).
  React.useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent<{ prjc: number }>).detail?.prjc !== prjc) return;
      if (dirtyRef.current) toast.message('Οι χώροι του έργου άλλαξαν — αποθήκευσε ή ακύρωσε τις αλλαγές σου για να τους δεις.');
      else void load();
    };
    window.addEventListener(ROOMS_EVENT, h);
    return () => window.removeEventListener(ROOMS_EVENT, h);
  }, [prjc, load]);
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const patch = (k: string, p: Partial<Draft>) => { setRooms((rs) => rs?.map((r) => (r.key === k ? { ...r, ...p } : r)) ?? rs); setDirty(true); };
  const add = () => {
    const r: Draft = { key: key(), id: '', name: `Χώρος ${(rooms?.length ?? 0) + 1}`, areaM2: 0, perimeterM: null, finish: null, mtrl: null, itemCode: null, itemName: null, itemUnit: null, wastePct: 10, skirting: false, pattern: null, notes: null, source: 'manual', thumbUrl: null };
    setRooms((rs) => [...(rs ?? []), r]); setOpen(r.key); setDirty(true);
  };
  const remove = (k: string) => { setRooms((rs) => rs?.filter((r) => r.key !== k) ?? rs); setDirty(true); };
  const save = async () => {
    if (!rooms) return;
    setSaving(true);
    try {
      const saved = await putRooms(prjc, rooms.map((r) => toInput({ ...r, id: r.id || null })));
      setRooms(saved.map(fromView)); setDirty(false); setOpen(null);
      toast.success('Οι χώροι αποθηκεύτηκαν.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Η αποθήκευση απέτυχε.');
    } finally { setSaving(false); }
  };
  const docx = (kind: 'spec' | 'contractor') => {
    if (dirty) { toast.error('Αποθήκευσε πρώτα τις αλλαγές στους χώρους.'); return; }
    window.location.href = `/api/admin/projects/${prjc}/rooms/doc?kind=${kind}`;
  };

  const views = (rooms ?? []) as unknown as RoomView[];
  const total = views.reduce((s, r) => s + r.areaM2, 0);
  const needs = materialNeeds(views);
  const byFinish = FINISHES.map((f) => ({ f, m2: views.filter((r) => r.finish === f.key).reduce((s, r) => s + r.areaM2, 0) })).filter((x) => x.m2 > 0);
  const unset = views.filter((r) => !r.finish).reduce((s, r) => s + r.areaM2, 0);

  return (
    <section aria-label="Χώροι & δάπεδα" className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[length:var(--fs-14)] font-semibold">
            <FiGrid className="size-4 text-muted-foreground" aria-hidden /> Χώροι & δάπεδα
            <a href="/wiki/operations/project-rooms" target="_blank" rel="noopener noreferrer" title="Βοήθεια: Χώροι & δάπεδα" aria-label="Βοήθεια: Χώροι & δάπεδα"
              className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"><FiHelpCircle className="size-3.5" /></a>
          </h2>
          <p className="mt-0.5 text-[length:var(--fs-12)] text-muted-foreground">
            {rooms == null ? 'Φόρτωση…' : rooms.length === 0 ? 'Κανένας χώρος ακόμη' : <><b className="font-mono tabular-nums text-foreground">{nf.format(total)} m²</b> σε {rooms.length} χώρ{rooms.length === 1 ? 'ο' : 'ους'} · τροφοδοτούν προσφορά, προδιαγραφές και εργολάβο</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setPlan('open')}><FiSquare aria-hidden /> Διαστασιολόγηση κάτοψης</Button>
          {canManage && <Button size="sm" variant="outline" onClick={add}><FiPlus aria-hidden /> Χώρος</Button>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary" disabled={!rooms?.length}><FiFileText aria-hidden /> Έγγραφα <FiChevronDown aria-hidden /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-[length:var(--fs-11)] text-muted-foreground">Word (.docx)</DropdownMenuLabel>
              <DropdownMenuItem className="cursor-pointer gap-2 text-[length:var(--fs-12)]" onSelect={() => docx('spec')}><FiDownload className="size-3.5" aria-hidden /> Προδιαγραφές δαπέδων</DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer gap-2 text-[length:var(--fs-12)]" onSelect={() => docx('contractor')}><FiTool className="size-3.5" aria-hidden /> Οδηγίες προς εργολάβο</DropdownMenuItem>
              <DropdownMenuSeparator />
              <p className="px-2 py-1 text-[length:var(--fs-11)] text-muted-foreground">Στην προσφορά/σύμβαση: «Προσθήκη → Υλικά από Χώροι & δάπεδα».</p>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Κατανομή ανά τύπο δαπέδου */}
      {total > 0 && (
        <div className="px-3 pt-3 sm:px-4">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={byFinish.map((x) => `${x.f.label} ${nf.format(x.m2)} m²`).join(', ')}>
            {byFinish.map((x) => <div key={x.f.key} style={{ width: `${(x.m2 / total) * 100}%`, background: x.f.color }} />)}
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-11)] text-muted-foreground">
            {byFinish.map((x) => (
              <span key={x.f.key} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: x.f.color }} aria-hidden />{x.f.label} <b className="font-mono tabular-nums text-foreground">{nf.format(x.m2)}</b> m²</span>
            ))}
            {unset > 0 && <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden />Χωρίς υλικό <b className="font-mono tabular-nums text-foreground">{nf.format(unset)}</b> m²</span>}
          </p>
        </div>
      )}

      <div className="p-3 sm:p-4">
        {rooms == null ? (
          <p className="flex items-center gap-2 py-4 text-[length:var(--fs-12)] text-muted-foreground"><FiLoader className="size-3.5 animate-spin" aria-hidden /> Φόρτωση χώρων…</p>
        ) : rooms.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center">
            <div className="flex gap-1.5">{FINISHES.slice(0, 3).map((f) => <FinishSwatch key={f.key} f={f} className="size-7" />)}</div>
            <p className="text-[length:var(--fs-13)] font-medium">Όρισε τους χώρους και το δάπεδο κάθε χώρου</p>
            <p className="max-w-md text-[length:var(--fs-12)] text-muted-foreground">Μέτρησε τα m² από την κάτοψη με τη «Διαστασιολόγηση κάτοψης» ή πρόσθεσε χώρους χειροκίνητα· μετά διάλεξε πλακάκι, πέτρα ή τσιμεντοκονία.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {rooms.map((r) => {
              const f = r.finish ? FINISH_BY_KEY.get(r.finish) ?? null : null;
              const expanded = open === r.key;
              const v = r as unknown as RoomView;
              return (
                <li key={r.key} className="bg-background">
                  <button
                    type="button" onClick={() => setOpen(expanded ? null : r.key)} aria-expanded={expanded}
                    className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    style={{ boxShadow: `inset 3px 0 0 ${f?.color ?? 'var(--border)'}` }}
                  >
                    {f ? (r.thumbUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={r.thumbUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                      : <FinishSwatch f={f} className="size-8" />)
                      : <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground">—</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[length:var(--fs-13)] font-medium">{r.name}</span>
                      <span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">
                        {f ? <><span style={{ color: f.color }} className="font-medium">{f.label}</span>{r.itemName ? ` · ${r.itemName}` : ''}{r.pattern ? ` · ${r.pattern}` : ''}</> : 'Χωρίς υλικό — άνοιξε για επιλογή'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-[length:var(--fs-13)] font-semibold tabular-nums">{nf.format(r.areaM2)}<span className="ml-0.5 text-[10px] font-normal text-muted-foreground">m²</span></span>
                      {f && <span className="block font-mono text-[10px] text-muted-foreground">παραγγ. {nf.format(orderArea(v))}{skirtingLength(v) ? ` · σοβ. ${nf.format(skirtingLength(v))} m` : ''}</span>}
                    </span>
                    <FiChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                  {expanded && (
                    <div className="space-y-3 border-t border-border bg-muted/20 px-3 py-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
                        <div>
                          <label htmlFor={`room-${r.key}-name`} className="mb-1 block text-[length:var(--fs-11)] text-muted-foreground">Όνομα χώρου</label>
                          <input id={`room-${r.key}-name`} value={r.name} disabled={!canManage} onChange={(e) => patch(r.key, { name: e.target.value })}
                            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-[length:var(--fs-12)] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
                        </div>
                        <NumField id={`room-${r.key}-area`} label="Εμβαδό" unit="m²" value={r.areaM2} disabled={!canManage} onValue={(n) => patch(r.key, { areaM2: n ?? 0 })} />
                        <NumField id={`room-${r.key}-per`} label="Περίμετρος" unit="m" value={r.perimeterM} disabled={!canManage} onValue={(n) => patch(r.key, { perimeterM: n })} />
                      </div>
                      <RoomFinishFields idPrefix={`room-${r.key}`} value={r as FinishDraft} disabled={!canManage} onChange={(p) => patch(r.key, p)} />
                      {canManage && (
                        <div className="flex justify-between gap-2">
                          <span className="text-[length:var(--fs-11)] text-muted-foreground">{r.source === 'floorplan' ? 'Από τη διαστασιολόγηση κάτοψης' : 'Χειροκίνητος χώρος'}</span>
                          <Button size="xs" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => remove(r.key)}><FiTrash2 aria-hidden /> Διαγραφή χώρου</Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Υλικά ανά είδος */}
        {needs.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1.5 text-[length:var(--fs-11)] font-medium uppercase tracking-wide text-muted-foreground">Υλικά δαπέδων</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[length:var(--fs-12)]">
                <thead className="bg-muted/50 text-left text-[length:var(--fs-11)] text-muted-foreground">
                  <tr><th className="px-3 py-1.5 font-medium">Υλικό</th><th className="px-3 py-1.5 text-right font-medium">Καθαρά</th><th className="px-3 py-1.5 text-right font-medium">Με φύρα</th><th className="px-3 py-1.5 text-right font-medium">Σοβατεπί</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {needs.map((n) => {
                    const f = n.finish ? FINISH_BY_KEY.get(n.finish) : null;
                    return (
                      <tr key={n.key}>
                        <td className="px-3 py-1.5">
                          <span className="flex items-center gap-2">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: f?.color ?? 'var(--muted-foreground)' }} aria-hidden />
                            <span className="min-w-0"><span className="block truncate font-medium">{n.name}</span><span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">{finishLabel(n.finish)} · {n.rooms.join(', ')}</span></span>
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{nf.format(n.netM2)} m²</td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">{nf.format(n.orderM2)} m²</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{n.skirtingM ? `${nf.format(n.skirtingM)} m` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {canManage && dirty && (
        <footer className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-card/95 px-3 py-2 backdrop-blur sm:px-4">
          <span className="mr-auto text-[length:var(--fs-12)] text-muted-foreground">Μη αποθηκευμένες αλλαγές</span>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={saving}>Ακύρωση</Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? <FiLoader className="animate-spin" aria-hidden /> : <FiSave aria-hidden />} Αποθήκευση</Button>
        </footer>
      )}

      {plan !== 'closed' && (
        <FloorPlanDialog
          prjc={prjc} projectLabel={projectLabel} canSave={canSaveFiles} canManage={canManage}
          open={plan === 'open'} onOpenChange={(o) => setPlan(o ? 'open' : 'hidden')}
        />
      )}
    </section>
  );
}
