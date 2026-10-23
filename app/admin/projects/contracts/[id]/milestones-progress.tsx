'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { FiAlertCircle, FiCheck, FiCheckCircle, FiCircle, FiDollarSign, FiLoader, FiMoreVertical, FiRotateCcw } from 'react-icons/fi';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { MILESTONE_STATUS_LABEL, dayEl, eur, round2 } from '@/lib/contracts/core';
import type { ContractView } from '@/lib/contracts/service';
import { setMilestoneAction } from '../actions';

type Ms = ContractView['milestones'][number];
const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const STATUS = {
  PENDING: { icon: FiCircle, cls: 'bg-muted text-muted-foreground' },
  DONE: { icon: FiCheck, cls: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200' },
  PAID: { icon: FiCheckCircle, cls: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200' },
} as const;

/** «Εκπρόθεσμη» μόνο για εκκρεμή με παρελθοντική προθεσμία. */
const overdue = (m: Ms, today: string) => m.status !== 'PAID' && !!m.dueDate && m.dueDate < today;

/**
 * Πρόοδος πληρωμών σύμβασης σε εξέλιξη: πόσα εισπράχθηκαν / πληρώθηκαν, και ανά πληρωμή η κατάσταση
 * με ενέργειες στο ⋮ (παραδόθηκε / εξοφλήθηκε / αναίρεση — ενημερώνει και την εργασία του έργου).
 */
export function MilestonesProgress({ contract: c, canManage }: { contract: ContractView; canManage: boolean }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const set = async (mid: string, status: 'PENDING' | 'DONE' | 'PAID') => {
    setBusy(mid);
    const r = await setMilestoneAction(c.id, mid, status);
    setBusy(null);
    if (!r.ok) toast.error(r.message);
  };
  const groups = [
    { key: 'customer', label: 'Εισπράξεις από τον πελάτη', ms: c.milestones.filter((m) => !m.partyKey) },
    ...c.parties.map((p) => ({ key: p.key, label: `Πληρωμές προς ${p.name}`, ms: c.milestones.filter((m) => m.partyKey === p.key) })),
  ].filter((g) => g.ms.length);
  if (!groups.length) return null;

  return (
    <section aria-labelledby="ms-h" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 id="ms-h" className="text-(length:--fs-15) font-semibold">Πρόοδος πληρωμών</h2>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const total = round2(g.ms.reduce((a, m) => a + m.amount, 0));
          const paid = round2(g.ms.filter((m) => m.status === 'PAID').reduce((a, m) => a + m.amount, 0));
          const late = g.ms.filter((m) => overdue(m, today)).length;
          return (
            <div key={g.key} className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="truncate text-(length:--fs-13) font-semibold">{g.label}</h3>
                <span className="text-(length:--fs-12) tabular-nums text-muted-foreground"><b className="text-foreground">{eur(paid)}</b> από {eur(total)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={total ? Math.round((paid / total) * 100) : 0} aria-label={g.label}>
                <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${total ? (paid / total) * 100 : 0}%` }} />
              </div>
              {late > 0 && (
                <p className="mt-1.5 flex items-center gap-1 text-(length:--fs-12) font-medium text-rose-800"><FiAlertCircle className="size-3.5" aria-hidden /> {late} εκπρόθεσμ{late === 1 ? 'η' : 'ες'}</p>
              )}
              <ol className="mt-2 divide-y divide-border rounded-lg border border-border">
                {g.ms.map((m) => {
                  const st = STATUS[m.status];
                  const Icon = st.icon;
                  const late1 = overdue(m, today);
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-(length:--fs-11) font-medium', st.cls)}>
                        <Icon className="size-3" aria-hidden />{MILESTONE_STATUS_LABEL[m.status]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-(length:--fs-13) font-medium">{m.title}</span>
                        <span className={cn('block text-(length:--fs-11) tabular-nums', late1 ? 'font-medium text-rose-800' : 'text-muted-foreground')}>
                          {m.dueDate ? `${late1 ? 'Εκπρόθεσμη · ' : 'έως '}${dayEl(m.dueDate)}` : 'χωρίς προθεσμία'}
                        </span>
                      </span>
                      <span className="shrink-0 text-(length:--fs-13) font-semibold tabular-nums">{eur(m.amount)}</span>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger disabled={busy === m.id} className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ενέργειες για ${m.title}`}>
                            {busy === m.id ? <FiLoader className="size-4 animate-spin" aria-hidden /> : <FiMoreVertical className="size-4" aria-hidden />}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-48">
                            {m.status === 'PENDING' && <DropdownMenuItem className={ITEM} onSelect={() => void set(m.id, 'DONE')}><FiCheck className="size-3.5" />Παραδόθηκε</DropdownMenuItem>}
                            {m.status !== 'PAID' && <DropdownMenuItem className={ITEM} onSelect={() => void set(m.id, 'PAID')}><FiDollarSign className="size-3.5" />Εξοφλήθηκε</DropdownMenuItem>}
                            {m.status !== 'PENDING' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className={ITEM} onSelect={() => void set(m.id, 'PENDING')}><FiRotateCcw className="size-3.5" />Επαναφορά σε εκκρεμή</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
