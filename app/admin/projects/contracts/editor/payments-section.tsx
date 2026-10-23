'use client';

// Πρόγραμμα πληρωμών (milestones) της φόρμας: μία κάρτα ανά «ποιος πληρώνει ποιον», μπάρα κάλυψης του
// συνόλου, ποσοστό δίπλα σε κάθε ποσό, έτοιμα προγράμματα και «συμπλήρωση υπολοίπου» με ένα κλικ.
import * as React from 'react';
import { FiCalendar, FiCheckCircle, FiFileText, FiMoreVertical, FiPlus, FiTrash2, FiUser, FiUsers } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { eur, milestoneCoverage } from '@/lib/contracts/core';
import { cn } from '@/lib/utils';

export type EditorMilestone = { uid: string; id: string | null; partyKey: string | null; title: string; deliverables: string | null; dueDate: string | null; amount: number; status: 'PENDING' | 'DONE' | 'PAID' };
export type PlanPreset = { key: string; label: string; steps: [string, number][] };

export const CUSTOMER_PRESETS: PlanPreset[] = [
  { key: '30-40-30', label: '30 / 40 / 30', steps: [['Προκαταβολή με την υπογραφή', 0.3], ['Παράδοση υλικών', 0.4], ['Ολοκλήρωση & παραλαβή', 0.3]] },
  { key: '50-50', label: '50 / 50', steps: [['Προκαταβολή με την υπογραφή', 0.5], ['Ολοκλήρωση & παραλαβή', 0.5]] },
  { key: '100', label: 'Όλο στην παράδοση', steps: [['Εξόφληση με την παράδοση', 1]] },
];
export const CREW_PRESETS: PlanPreset[] = [
  { key: '30-70', label: '30 / 70', steps: [['Έναρξη εργασιών', 0.3], ['Ολοκλήρωση & παραλαβή', 0.7]] },
  { key: '100', label: 'Όλο στην παραλαβή', steps: [['Ολοκλήρωση & παραλαβή', 1]] },
];

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const pct = (a: number, t: number) => (t > 0 ? `${Math.round((a / t) * 100)}%` : '—');

/** Ποσό που κρατά το κείμενο όσο γράφεις (κόμμα ή τελεία). */
function Amount({ value, onValue, label, disabled }: { value: number; onValue: (n: number) => void; label: string; disabled: boolean }) {
  const show = (v: number) => String(v).replace('.', ',');
  const [text, setText] = React.useState(() => show(value));
  const [prev, setPrev] = React.useState(value);
  if (!Object.is(prev, value)) { setPrev(value); if (Number(text.replace(',', '.')) !== value) setText(show(value)); }
  return (
    <span className="relative block">
      <Input inputMode="decimal" value={text} aria-label={label} disabled={disabled}
        onChange={(e) => { setText(e.target.value); const n = Number(e.target.value.replace(',', '.')); onValue(Number.isFinite(n) && n >= 0 ? n : 0); }}
        onBlur={() => setText(show(value))}
        className="h-9 pr-6 text-right text-(length:--fs-12) tabular-nums" />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-(length:--fs-12) text-muted-foreground">€</span>
    </span>
  );
}

function Group({ label, icon, total, ms, presets, readOnly, onAdd, onPlan, onSet, onRemove }: {
  label: string; icon: React.ReactNode; total: number; ms: EditorMilestone[]; presets: PlanPreset[]; readOnly: boolean;
  onAdd: () => void; onPlan: (p: PlanPreset) => void; onSet: (uid: string, patch: Partial<EditorMilestone>) => void; onRemove: (uid: string) => void;
}) {
  const [openDeliv, setOpenDeliv] = React.useState<Set<string>>(new Set());
  const cov = milestoneCoverage(ms.map((m) => m.amount), total);
  const ratio = total > 0 ? Math.min(1, cov.sum / total) : 0;
  const over = cov.diff < -0.009;
  const fillRemainder = () => {
    const last = ms[ms.length - 1];
    if (last) onSet(last.uid, { amount: Math.round((last.amount + cov.diff) * 100) / 100 });
  };
  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h3 className="flex min-w-0 items-center gap-2 text-(length:--fs-13) font-semibold">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-3.5">{icon}</span>
          <span className="truncate">{label}</span>
          <span className="font-normal text-muted-foreground tabular-nums">· {eur(total)}</span>
        </h3>
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5"><FiCalendar className="size-3.5" aria-hidden /> Πρόγραμμα</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuLabel className="text-(length:--fs-11) text-muted-foreground">Αντικαθιστά τις πληρωμές της κάρτας</DropdownMenuLabel>
              {presets.map((p) => (
                <DropdownMenuItem key={p.key} className={ITEM} disabled={!total} onSelect={() => onPlan(p)}><FiCalendar className="size-3.5" />{p.label}</DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className={ITEM} onSelect={onAdd}><FiPlus className="size-3.5" />Νέα πληρωμή</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Κάλυψη του συνόλου */}
      <div className="px-3 pt-2.5">
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label={`Κάλυψη: ${label}`}>
          <div className={cn('h-full rounded-full transition-[width] duration-300', cov.ok ? 'bg-emerald-500' : over ? 'bg-rose-500' : 'bg-primary')} style={{ width: `${ratio * 100}%` }} />
        </div>
        <p className="mt-1 flex flex-wrap items-center justify-between gap-2 text-(length:--fs-12)" aria-live="polite">
          {cov.ok
            ? <span className="inline-flex items-center gap-1 font-medium text-emerald-800"><FiCheckCircle className="size-3.5" aria-hidden /> Καλύπτεται όλο το ποσό</span>
            : over
              ? <span className="font-medium text-rose-800">Ξεπερνά το σύνολο κατά {eur(-cov.diff)}</span>
              : <span className="text-muted-foreground">Προγραμματισμένα {eur(cov.sum)} · μένουν <b className="text-foreground">{eur(cov.diff)}</b></span>}
          {!cov.ok && !readOnly && ms.length > 0 && total > 0 && (
            <button type="button" onClick={fillRemainder} className="min-h-8 cursor-pointer font-medium text-primary hover:underline">
              {over ? 'Διόρθωση στην τελευταία' : 'Το υπόλοιπο στην τελευταία'}
            </button>
          )}
        </p>
      </div>

      {ms.length === 0 ? (
        <div className="px-3 pb-3 pt-1 text-(length:--fs-12) text-muted-foreground">
          Καμία πληρωμή ακόμη.{' '}
          {!readOnly && presets[0] && total > 0 && <button type="button" onClick={() => onPlan(presets[0])} className="min-h-8 cursor-pointer font-medium text-primary hover:underline">Πρόγραμμα {presets[0].label}</button>}
        </div>
      ) : (
        <ol className="space-y-2 px-3 pb-3 pt-2">
          {ms.map((m, i) => {
            const showDeliv = openDeliv.has(m.uid) || !!m.deliverables;
            return (
              <li key={m.uid} className="rounded-md bg-muted/30 p-2">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_9.5rem_8.5rem_3rem_auto]">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-background text-(length:--fs-11) font-semibold tabular-nums ring-1 ring-border">{i + 1}</span>
                  <Input value={m.title} onChange={(e) => onSet(m.uid, { title: e.target.value })} placeholder="π.χ. Παράδοση υλικών" disabled={readOnly}
                    className="h-9 text-(length:--fs-12)" aria-label={`Τίτλος πληρωμής ${i + 1}`} />
                  {/* Κινητό: ημερομηνία · ποσό · % σε μία σειρά κάτω από τον τίτλο· από sm και πάνω στο ίδιο grid. */}
                  <div className="col-span-2 col-start-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-center gap-2 sm:contents">
                    <Input type="date" value={m.dueDate ?? ''} onChange={(e) => onSet(m.uid, { dueDate: e.target.value || null })} disabled={readOnly}
                      className="h-9 text-(length:--fs-12)" aria-label={`Προθεσμία πληρωμής ${i + 1}`} />
                    <Amount value={m.amount} onValue={(n) => onSet(m.uid, { amount: n })} label={`Ποσό πληρωμής ${i + 1}`} disabled={readOnly} />
                    <span className="text-right text-(length:--fs-12) tabular-nums text-muted-foreground">{pct(m.amount, total)}</span>
                  </div>
                  {!readOnly ? (
                    <span className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ενέργειες πληρωμής ${i + 1}`}>
                          <FiMoreVertical className="size-4" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-48">
                          <DropdownMenuItem className={ITEM} onSelect={() => setOpenDeliv((s) => new Set(s).add(m.uid))}><FiFileText className="size-3.5" />Παραδοτέα…</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => onRemove(m.uid)}><FiTrash2 className="size-3.5" />Αφαίρεση</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
                  ) : <span />}
                </div>
                {showDeliv && (
                  <Input value={m.deliverables ?? ''} onChange={(e) => onSet(m.uid, { deliverables: e.target.value || null })} disabled={readOnly}
                    placeholder="Παραδοτέα (π.χ. πρωτόκολλο παραλαβής, φωτογραφίες)" aria-label={`Παραδοτέα πληρωμής ${i + 1}`}
                    className="mt-2 h-9 text-(length:--fs-12) sm:ml-8 sm:w-[calc(100%-2rem)]" />
                )}
              </li>
            );
          })}
          {!readOnly && (
            <li>
              <button type="button" onClick={onAdd} className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 text-(length:--fs-12) font-medium text-primary hover:bg-primary/5">
                <FiPlus className="size-3.5" aria-hidden /> Πληρωμή
              </button>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

export function PaymentsSection({ milestones, parties, customerTotal, feeOf, readOnly, onAdd, onPlan, onSet, onRemove }: {
  milestones: EditorMilestone[];
  parties: { key: string; name: string }[];
  customerTotal: number;
  feeOf: (partyKey: string) => number;
  readOnly: boolean;
  onAdd: (partyKey: string | null) => void;
  onPlan: (partyKey: string | null, total: number, preset: PlanPreset) => void;
  onSet: (uid: string, patch: Partial<EditorMilestone>) => void;
  onRemove: (uid: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Group
        label="Ο πελάτης πληρώνει εμάς" icon={<FiUser />} total={customerTotal} presets={CUSTOMER_PRESETS} readOnly={readOnly}
        ms={milestones.filter((m) => !m.partyKey)}
        onAdd={() => onAdd(null)} onPlan={(p) => onPlan(null, customerTotal, p)} onSet={onSet} onRemove={onRemove}
      />
      {parties.map((p) => (
        <Group
          key={p.key} label={`Εμείς πληρώνουμε: ${p.name}`} icon={<FiUsers />} total={feeOf(p.key)} presets={CREW_PRESETS} readOnly={readOnly}
          ms={milestones.filter((m) => m.partyKey === p.key)}
          onAdd={() => onAdd(p.key)} onPlan={(pr) => onPlan(p.key, feeOf(p.key), pr)} onSet={onSet} onRemove={onRemove}
        />
      ))}
    </div>
  );
}
