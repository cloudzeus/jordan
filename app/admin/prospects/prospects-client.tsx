'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  FiCheckCircle, FiEdit2, FiExternalLink, FiFileText, FiMap, FiMoreVertical, FiPlus, FiSearch, FiTrash2, FiUserPlus,
} from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { ProspectDialog, type ProspectValue } from '@/components/admin/prospect-dialog';
import { STATUS_LABEL, type ContractStatus } from '@/lib/contracts/core';
import { cn } from '@/lib/utils';
import type { ProspectRow } from '@/lib/prospects';
import { deleteProspectAction } from './actions';

// three.js + pdfjs φορτώνονται μόνο όταν ανοίξει το εργαλείο.
const FloorPlanDialog = dynamic(() => import('@/components/admin/floorplan/floor-plan-dialog').then((m) => m.FloorPlanDialog), { ssr: false });

type Filter = 'open' | 'converted' | 'all';
const FILTERS: { key: Filter; label: string }[] = [{ key: 'open', label: 'Δυνητικοί' }, { key: 'converted', label: 'Έγιναν πελάτες' }, { key: 'all', label: 'Όλοι' }];
const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';

export function ProspectsClient({ rows, canManage, canFiles, openId }: { rows: ProspectRow[]; canManage: boolean; canFiles: boolean; openId: number | null }) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>('open');
  const [editing, setEditing] = React.useState<ProspectValue | null>(() => rows.find((r) => r.id === openId) ?? null);
  const [creating, setCreating] = React.useState(false);
  const [plan, setPlan] = React.useState<ProspectRow | null>(null);

  const s = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => filter === 'all' || (filter === 'open' ? !r.trdr : !!r.trdr))
    .filter((r) => !s || [r.name, r.contactName, r.email, r.phone, r.afm, r.city].some((v) => v?.toLowerCase().includes(s)));

  const remove = async (r: ProspectRow) => {
    if (!(await confirmAction(`Διαγραφή του δυνητικού πελάτη «${r.name}»;`))) return;
    const res = await deleteProspectAction(r.id);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success('Διαγράφηκε');
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Όνομα, email, τηλέφωνο, ΑΦΜ, πόλη…" aria-label="Αναζήτηση δυνητικών πελατών" className="h-9 pl-8" />
        </div>
        <div role="radiogroup" aria-label="Φίλτρο" className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} onClick={() => setFilter(f.key)}
              className={cn('min-h-7 cursor-pointer rounded-md px-3 text-(length:--fs-12) font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                filter === f.key ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-(length:--fs-12) tabular-nums text-muted-foreground" aria-live="polite">{shown.length}</span>
        {canManage && <Button size="sm" className="ml-auto gap-1.5" onClick={() => setCreating(true)}><FiUserPlus className="size-3.5" aria-hidden /> Νέος δυνητικός πελάτης</Button>}
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <FiUserPlus className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-(length:--fs-14) font-medium">{rows.length ? 'Κανένας με αυτά τα κριτήρια' : 'Δεν υπάρχουν δυνητικοί πελάτες'}</p>
          <p className="max-w-md text-(length:--fs-12) text-muted-foreground">Καταχωρίστε κάποιον που δεν υπάρχει στο SoftOne και φτιάξτε του προσφορά. Γίνεται πελάτης SoftOne — με το έργο του — μόνο όταν την αποδεχθεί.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {shown.map((r) => (
            <li key={r.id} className="flex min-w-0 items-center gap-3 px-3 py-2 hover:bg-muted/40">
              <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-full', r.trdr ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800')}>
                {r.trdr ? <FiCheckCircle className="size-4" /> : <FiUserPlus className="size-4" />}
              </span>
              <button type="button" onClick={() => setEditing(r)} className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-(length:--fs-14) font-medium">{r.name}</span>
                  {r.trdr
                    ? <span className="shrink-0 rounded bg-emerald-50 px-1.5 text-(length:--fs-11) font-medium text-emerald-800 ring-1 ring-emerald-200">Πελάτης SoftOne {r.customerCode ?? ''}</span>
                    : <span className="shrink-0 rounded bg-amber-50 px-1.5 text-(length:--fs-11) font-medium text-amber-900 ring-1 ring-amber-200">μόνο στην εφαρμογή</span>}
                </span>
                <span className="block truncate text-(length:--fs-12) text-muted-foreground">
                  {[r.contactName, r.email, r.phone, r.city, r.afm && `ΑΦΜ ${r.afm}`].filter(Boolean).join(' · ') || 'Χωρίς στοιχεία επικοινωνίας'}
                </span>
              </button>
              <div className="hidden min-w-0 max-w-[40%] shrink flex-wrap justify-end gap-1 md:flex">
                {r.contracts.slice(0, 3).map((c) => (
                  <Link key={c.id} href={`/admin/projects/contracts/${c.id}`} title={c.title}
                    className="inline-flex max-w-56 items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-(length:--fs-11) hover:bg-muted">
                    <FiFileText className="size-3 shrink-0" aria-hidden /><span className="font-mono">{c.ref}</span>
                    <span className="truncate text-muted-foreground">{STATUS_LABEL[c.status as ContractStatus] ?? c.status}</span>
                  </Link>
                ))}
                {r.contracts.length > 3 && <span className="text-(length:--fs-11) text-muted-foreground">+{r.contracts.length - 3}</span>}
                {!r.contracts.length && <span className="text-(length:--fs-11) text-muted-foreground">Καμία προσφορά</span>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger aria-label={`Ενέργειες για «${r.name}»`}
                  className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                  <FiMoreVertical className="size-4" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem className={ITEM} onSelect={() => setEditing(r)}><FiEdit2 className="size-3.5" aria-hidden /> Στοιχεία</DropdownMenuItem>
                  {canManage && (
                    <DropdownMenuItem className={ITEM} asChild>
                      <Link href={r.trdr ? `/admin/projects/contracts/new?trdr=${r.trdr}` : `/admin/projects/contracts/new?prospect=${r.id}`}><FiPlus className="size-3.5" aria-hidden /> Νέα προσφορά</Link>
                    </DropdownMenuItem>
                  )}
                  {canManage && !r.trdr && <DropdownMenuItem className={ITEM} onSelect={() => setPlan(r)}><FiMap className="size-3.5" aria-hidden /> Διαστασιολόγηση κάτοψης…</DropdownMenuItem>}
                  {r.contracts.length > 0 && <DropdownMenuSeparator />}
                  {r.contracts.map((c) => (
                    <DropdownMenuItem key={c.id} className={ITEM} asChild>
                      <Link href={`/admin/projects/contracts/${c.id}`}><FiFileText className="size-3.5" aria-hidden /><span className="truncate">{c.ref} · {c.title}</span></Link>
                    </DropdownMenuItem>
                  ))}
                  {r.trdr && (
                    <DropdownMenuItem className={ITEM} asChild>
                      <Link href={`/admin/traders?q=${encodeURIComponent(r.customerCode ?? r.name)}`}><FiExternalLink className="size-3.5" aria-hidden /> Καρτέλα πελάτη</Link>
                    </DropdownMenuItem>
                  )}
                  {canManage && !r.contracts.length && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => void remove(r)}><FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <ProspectDialog open={creating} onOpenChange={setCreating} onSaved={() => router.refresh()} />
      <ProspectDialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }} initial={editing} onSaved={() => router.refresh()} />
      {plan && (
        <FloorPlanDialog owner={{ prospect: plan.id }} projectLabel={plan.name} canSave={canFiles} canOffer={canManage}
          open onOpenChange={(o) => { if (!o) { setPlan(null); router.refresh(); } }} />
      )}
    </div>
  );
}
