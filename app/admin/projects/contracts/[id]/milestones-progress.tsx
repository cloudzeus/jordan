'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiCheckCircle, FiCircle, FiDollarSign, FiFlag } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { MILESTONE_STATUS_LABEL, dayEl, eur } from '@/lib/contracts/core';
import type { ContractView } from '@/lib/contracts/service';

/** Πρόοδος milestones σύμβασης σε εξέλιξη: παραδόθηκε / εξοφλήθηκε (ενημερώνει και το task του έργου). */
export function MilestonesProgress({ contract: c, canManage }: { contract: ContractView; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const partyName = new Map(c.parties.map((p) => [p.key, p.name]));
  const set = async (mid: string, status: 'PENDING' | 'DONE' | 'PAID') => {
    setBusy(mid);
    const r = await fetch(`/api/admin/contracts/${c.id}/milestones/${mid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    setBusy(null);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(b.message ?? 'Δεν ενημερώθηκε'); return; }
    router.refresh();
  };
  const done = c.milestones.filter((m) => m.status !== 'PENDING').length;
  return (
    <section className="rounded-lg border border-border border-t-[3px] border-t-rose-500 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[length:var(--fs-14)] font-semibold"><span className="inline-flex size-7 items-center justify-center rounded-md bg-rose-600 text-white shadow-sm"><FiFlag className="size-3.5" /></span> Πρόοδος</h2>
        <span className="text-[length:var(--fs-12)] text-muted-foreground">{done}/{c.milestones.length} milestones</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${c.milestones.length ? (done / c.milestones.length) * 100 : 0}%` }} /></div>
      <ol className="space-y-1.5">
        {c.milestones.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
            {m.status === 'PENDING' ? <FiCircle className="size-4 text-muted-foreground" /> : <FiCheckCircle className={cn('size-4', m.status === 'PAID' ? 'text-emerald-600' : 'text-primary')} />}
            <span className="min-w-0 flex-1 text-[length:var(--fs-13)]">
              <span className="font-medium">{m.title}</span>
              <span className="text-muted-foreground"> · {m.partyKey ? `προς ${partyName.get(m.partyKey) ?? 'συνεργείο'}` : 'πελάτης'} · {dayEl(m.dueDate)} · {eur(m.amount)}</span>
            </span>
            <span className="text-[length:var(--fs-11)] text-muted-foreground">{MILESTONE_STATUS_LABEL[m.status]}</span>
            {canManage && (
              <div className="flex gap-1">
                <button type="button" disabled={busy === m.id} onClick={() => set(m.id, m.status === 'PENDING' ? 'DONE' : 'PENDING')}
                  className="min-h-8 rounded-md border border-border px-2 text-[length:var(--fs-11)] hover:bg-muted">{m.status === 'PENDING' ? 'Παραδόθηκε' : 'Αναίρεση'}</button>
                {m.status !== 'PAID' && (
                  <button type="button" disabled={busy === m.id} onClick={() => set(m.id, 'PAID')}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2 text-[length:var(--fs-11)] hover:bg-muted"><FiDollarSign className="size-3" />Εξοφλήθηκε</button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
