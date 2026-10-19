'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiExternalLink, FiMoreVertical, FiSearch, FiTrash2, FiUsers, FiFlag, FiFileText } from 'react-icons/fi';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { KIND_LABEL, STAGE_LABEL, STATUS_LABEL, dayEl, eur, type ContractKind, type ContractStatus } from '@/lib/contracts/core';
import type { ContractListRow } from '@/lib/contracts/service';
import { StatusBadge } from './status-badge';

const FILTERS: { key: string; label: string; test: (r: ContractListRow) => boolean }[] = [
  { key: 'open', label: 'Ανοιχτές', test: (r) => !['COMPLETED', 'CANCELLED'].includes(r.status) },
  { key: 'offers', label: 'Προσφορές', test: (r) => r.stage === 'OFFER' && r.status !== 'CANCELLED' },
  { key: 'active', label: 'Σε εξέλιξη', test: (r) => r.status === 'ACTIVE' },
  { key: 'all', label: 'Όλες', test: () => true },
];

export function ContractsList({ rows, canManage }: { rows: ContractListRow[]; canManage: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState('open');
  const f = FILTERS.find((x) => x.key === filter)!;
  const s = q.trim().toLowerCase();
  const shown = rows.filter((r) => f.test(r) && (!s || [r.ref, r.title, r.customer, r.projectCode, r.city].some((v) => v?.toLowerCase().includes(s))));

  const remove = async (r: ContractListRow) => {
    if (!(await confirmAction(`Διαγραφή της ${STAGE_LABEL[r.stage]?.toLowerCase() ?? 'σύμβασης'} ${r.ref} «${r.title}»;\nΤα PDF μένουν στα αρχεία.`))) return;
    const res = await fetch(`/api/admin/contracts/${r.id}`, { method: 'DELETE' });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(b.message ?? 'Δεν διαγράφηκε'); return; }
    toast.success('Διαγράφηκε');
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση: αριθμός, έργο, πελάτης, πόλη…" className="h-9 pl-8 text-[length:var(--fs-13)]" aria-label="Αναζήτηση συμβάσεων" />
        </div>
        <div role="tablist" aria-label="Φίλτρο" className="flex gap-1 overflow-x-auto">
          {FILTERS.map((x) => (
            <button key={x.key} role="tab" aria-selected={filter === x.key} onClick={() => setFilter(x.key)}
              className={cn('min-h-9 shrink-0 rounded-md px-3 text-[length:var(--fs-12)] font-medium transition-colors', filter === x.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}>
              {x.label} <span className="tabular-nums opacity-60">{rows.filter(x.test).length}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <FiFileText className="mx-auto mb-3 size-8 text-muted-foreground/60" aria-hidden />
          <p className="text-[length:var(--fs-14)] font-medium">{rows.length ? 'Καμία σύμβαση με αυτά τα κριτήρια' : 'Δεν υπάρχουν ακόμη συμβάσεις'}</p>
          <p className="mt-1 text-[length:var(--fs-12)] text-muted-foreground">Ξεκινήστε με «Νέο έργο»: περίληψη, υλικά, συνεργεία, milestones — το AI συντάσσει τα έγγραφα.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {shown.map((r) => (
            <li key={r.id} className="group relative flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/40 sm:px-4">
              <Link href={`/admin/projects/contracts/${r.id}`} className="absolute inset-0" aria-label={`Άνοιγμα ${r.ref} ${r.title}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-[length:var(--fs-11)] text-muted-foreground">{r.ref}</span>
                  <StatusBadge stage={r.stage} status={r.status as ContractStatus} />
                  <span className="text-[length:var(--fs-11)] text-muted-foreground">{KIND_LABEL[r.kind as ContractKind] ?? r.kind}</span>
                </div>
                <p className="mt-0.5 truncate text-[length:var(--fs-14)] font-medium">{r.title}</p>
                <p className="truncate text-[length:var(--fs-12)] text-muted-foreground">
                  {r.customer}{r.city ? ` · ${r.city}` : ''}{r.projectCode ? ` · Έργο ${r.projectCode}` : ' · χωρίς έργο SoftOne'}
                  {r.startDate ? ` · ${dayEl(r.startDate)}${r.endDate ? `–${dayEl(r.endDate)}` : ''}` : ''}
                </p>
              </div>
              <div className="hidden shrink-0 items-center gap-4 text-[length:var(--fs-12)] text-muted-foreground md:flex">
                <span className="inline-flex items-center gap-1" title="Συνεργεία"><FiUsers className="size-3.5" aria-hidden />{r.parties}</span>
                <span className="inline-flex items-center gap-1" title="Milestones"><FiFlag className="size-3.5" aria-hidden />{r.milestones}</span>
                <span className="inline-flex items-center gap-1" title="Έγγραφα"><FiFileText className="size-3.5" aria-hidden />{r.documents}</span>
              </div>
              <span className="shrink-0 text-right text-[length:var(--fs-13)] font-semibold tabular-nums">{eur(r.gross)}</span>
              <DropdownMenu>
                <DropdownMenuTrigger className="relative z-10 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted" aria-label={`Ενέργειες για ${r.ref}`}>
                  <FiMoreVertical className="size-4" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuItem className="cursor-pointer gap-2 text-[length:var(--fs-12)]" onSelect={() => router.push(`/admin/projects/contracts/${r.id}`)}>
                    <FiExternalLink className="size-3.5" aria-hidden /> Άνοιγμα
                  </DropdownMenuItem>
                  {r.prjc && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-[length:var(--fs-12)]" onSelect={() => router.push(`/admin/projects/${r.prjc}`)}>
                      <FiExternalLink className="size-3.5" aria-hidden /> Έργο {r.projectCode}
                    </DropdownMenuItem>
                  )}
                  {canManage && r.status !== 'ACTIVE' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2 text-[length:var(--fs-12)]" onSelect={() => void remove(r)}>
                        <FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[length:var(--fs-11)] text-muted-foreground">Καταστάσεις: {Object.values(STATUS_LABEL).join(' → ')}</p>
    </div>
  );
}
