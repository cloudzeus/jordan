'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { FiPlus, FiMoreVertical, FiEdit3, FiSend, FiLock, FiUnlock, FiXCircle, FiTrash2, FiRepeat } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { OfferRow } from '@/lib/container-offers';
import { OfferWizard } from './offer-wizard';
import { OfferDetail } from './offer-detail';

const DASH = <span className="text-muted-foreground/40">—</span>;
const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });
const STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Πρόχειρη', tone: '#475569' },
  SCHEDULED: { label: 'Προγραμματισμένη', tone: '#7C3AED' },
  OPEN: { label: 'Ανοιχτή', tone: '#047857' },
  CLOSED: { label: 'Κλεισμένη', tone: '#0369A1' },
  CANCELLED: { label: 'Ακυρωμένη', tone: '#BE123C' },
};
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';

async function call(url: string, body?: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message ?? 'Η ενέργεια απέτυχε');
  return d;
}

function RowActions({ o, onEdit, onChanged }: { o: OfferRow; onEdit: () => void; onChanged: () => void }) {
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error((e as Error).message); } };
  const setStatus = (status: string, ok: string) => act(() => call(`/api/admin/dynamic-offers/${o.id}/status`, { status }), ok);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted" aria-label={`Ενέργειες για ${o.title}`} onClick={(e) => e.stopPropagation()}>
        <FiMoreVertical className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate text-[length:var(--fs-11)] font-semibold text-muted-foreground">{o.title}</DropdownMenuLabel>
        {o.status !== 'CLOSED' && o.status !== 'CANCELLED' && (
          <DropdownMenuItem className={ITEM} onSelect={onEdit}><FiEdit3 className="size-3.5" style={{ color: '#0369A1' }} aria-hidden /> {o.status === 'DRAFT' || o.status === 'SCHEDULED' ? 'Συνέχεια στον οδηγό' : 'Επεξεργασία τιμών/στοιχείων'}</DropdownMenuItem>
        )}
        {o.status === 'OPEN' && (
          <>
            <DropdownMenuItem className={ITEM} onSelect={async () => {
              if (await confirmAction({ title: 'Αποστολή ξανά', message: 'Θα σταλεί η προσφορά σε όσους δεν την έχουν λάβει (νέοι παραλήπτες ή αποτυχίες).', confirmLabel: 'Αποστολή' })) {
                await act(async () => { const d = await call(`/api/admin/dynamic-offers/${o.id}/resend`); toast.message(`Στάλθηκαν ${d.sent}${d.failed ? `, απέτυχαν ${d.failed}` : ''}`); }, 'Ολοκληρώθηκε');
              }
            }}><FiRepeat className="size-3.5" aria-hidden /> Αποστολή σε όσους λείπουν</DropdownMenuItem>
            <DropdownMenuItem className={ITEM} onSelect={async () => {
              if (await confirmAction({ title: 'Κλείσιμο container', message: 'Η προσφορά κλείνει: δεν δέχεται νέες κρατήσεις και η τελική τιμή κλειδώνει.', confirmLabel: 'Κλείσιμο' })) await setStatus('CLOSED', 'Η προσφορά έκλεισε');
            }}><FiLock className="size-3.5" aria-hidden /> Κλείσιμο container</DropdownMenuItem>
          </>
        )}
        {o.status === 'CLOSED' && <DropdownMenuItem className={ITEM} onSelect={() => setStatus('OPEN', 'Η προσφορά άνοιξε ξανά')}><FiUnlock className="size-3.5" aria-hidden /> Άνοιγμα ξανά</DropdownMenuItem>}
        {(o.status === 'DRAFT' || o.status === 'SCHEDULED' || o.status === 'OPEN') && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className={ITEM} onSelect={async () => {
              if (await confirmAction({ title: 'Ακύρωση προσφοράς', message: `Ακύρωση της «${o.title}»; ${o.customers ? `Υπάρχουν κρατήσεις ${o.customers} συμμετεχόντων — ενημέρωσέ τους.` : ''}`, confirmLabel: 'Ακύρωση προσφοράς', destructive: true })) await setStatus('CANCELLED', 'Η προσφορά ακυρώθηκε');
            }}><FiXCircle className="size-3.5" aria-hidden /> Ακύρωση</DropdownMenuItem>
          </>
        )}
        {(o.status === 'DRAFT' || o.status === 'SCHEDULED') && o.filled === 0 && (
          <DropdownMenuItem variant="destructive" className={ITEM} onSelect={async () => {
            if (await confirmAction({ title: 'Διαγραφή', message: `Διαγραφή της «${o.title}»;`, confirmLabel: 'Διαγραφή', destructive: true })) {
              await act(async () => { const r = await fetch(`/api/admin/dynamic-offers/${o.id}`, { method: 'DELETE' }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'Αποτυχία'); }, 'Διαγράφηκε');
            }
          }}><FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Filter = 'active' | 'all' | 'CLOSED' | 'CANCELLED';

export function OffersClient({ offers, canManage }: { offers: OfferRow[]; canManage: boolean }) {
  const router = useRouter();
  const [wizard, setWizard] = React.useState<{ id: string | null } | null>(null);
  const [filter, setFilter] = React.useState<Filter>('active');
  const refresh = () => router.refresh();
  const data = React.useMemo(() => offers.filter((o) => filter === 'all' ? true : filter === 'active' ? ['DRAFT', 'SCHEDULED', 'OPEN'].includes(o.status) : o.status === filter), [offers, filter]);
  const count = (f: Filter) => offers.filter((o) => f === 'all' ? true : f === 'active' ? ['DRAFT', 'SCHEDULED', 'OPEN'].includes(o.status) : o.status === f).length;

  const columns = React.useMemo<ColumnDef<OfferRow>[]>(() => [
    {
      accessorKey: 'name', header: 'Προσφορά', size: 300,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate text-[length:var(--fs-12)] font-medium">{row.original.title}</div>
          <div className="truncate text-[length:var(--fs-11)] text-muted-foreground" title={row.original.name}>
            {row.original.items.length > 1 && <span className="mr-1 rounded-sm bg-sky-100 px-1 font-semibold text-sky-800">{row.original.items.length} προϊόντα</span>}
            {row.original.items.length === 1 ? `${row.original.code} · ${row.original.name}` : row.original.name}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'status', header: 'Κατάσταση', size: 130,
      cell: ({ row }) => { const s = STATUS[row.original.status]; return <span className="inline-flex rounded-sm px-1.5 py-0.5 text-[length:var(--fs-11)] font-semibold" style={{ color: s.tone, backgroundColor: soft(s.tone, 12) }}>{s.label}</span>; },
    },
    {
      id: 'fill', accessorFn: (o) => o.percent, header: 'Γέμισμα', size: 170,
      cell: ({ row }) => {
        const o = row.original;
        return (
          <div className="min-w-0">
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${o.percent}%` }} /></div>
            <div className="mt-0.5 text-[length:var(--fs-11)] tabular-nums text-muted-foreground">{num(o.filled)}/{num(o.capacity)} παλ. · {Math.round(o.percent)}%</div>
          </div>
        );
      },
    },
    {
      id: 'price', accessorFn: (o) => o.currentLevel, header: 'Τιμή τώρα', size: 120,
      cell: ({ row }) => {
        const o = row.original; const it = o.items[0];
        if (!it?.current) return DASH;
        return o.items.length === 1
          ? <span className="text-[length:var(--fs-13)] font-bold tabular-nums text-emerald-700">{eur(it.current.price)}<span className="text-[length:var(--fs-10)] font-normal text-muted-foreground">/{it.baseUnit ?? 'τ.μ.'}</span></span>
          : <span className="text-[length:var(--fs-12)] tabular-nums"><strong className="text-emerald-700">W0{o.currentLevel}</strong> <span className="text-muted-foreground">από {o.levels.length}</span></span>;
      },
    },
    {
      id: 'next', accessorFn: (o) => o.nextLevel?.missing ?? 0, header: 'Επόμενη πτώση', size: 150,
      cell: ({ row }) => {
        const o = row.original; const it = o.items[0];
        if (!o.nextLevel) return <span className="text-[length:var(--fs-12)] text-emerald-700">καλύτερη ✓</span>;
        return <span className="text-[length:var(--fs-12)] tabular-nums">{o.items.length === 1 && it?.next ? eur(it.next.tier.price) : `W0${o.nextLevel.level}`} <span className="text-muted-foreground">σε {num(o.nextLevel.missing)} παλ.</span></span>;
      },
    },
    { accessorKey: 'customers', header: 'Συμμετέχοντες', size: 110, cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5 tabular-nums text-[length:var(--fs-12)]">
        {row.original.customers}
        {row.original.pending > 0 && <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[length:var(--fs-10)] font-semibold text-amber-800" title="Αιτήματα κράτησης από το portal που περιμένουν έγκριση">{row.original.pending} παλ. σε αναμονή</span>}
      </span>
    ) },
    {
      accessorKey: 'closesAt', header: 'Λήξη', size: 100,
      cell: ({ row }) => (row.original.closesAt ? <span className="tabular-nums text-[length:var(--fs-12)] text-muted-foreground">{new Date(row.original.closesAt).toLocaleDateString('el-GR')}</span> : DASH),
    },
    {
      id: 'actions', header: () => <span className="sr-only">Ενέργειες</span>, size: 44, enableSorting: false, enableHiding: false, enableResizing: false,
      cell: ({ row }) => (canManage ? <div className="flex justify-end"><RowActions o={row.original} onEdit={() => setWizard({ id: row.original.id })} onChanged={refresh} /></div> : null),
    },
  ], [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (active: boolean) => cn('inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-[length:var(--fs-11)] font-medium transition',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground');
  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {([['active', 'Ενεργές'], ['CLOSED', 'Κλεισμένες'], ['CANCELLED', 'Ακυρωμένες'], ['all', 'Όλες']] as const).map(([f, l]) => (
        <button key={f} type="button" className={chip(filter === f)} aria-pressed={filter === f} onClick={() => setFilter(f)}>{l} <span className="tabular-nums opacity-70">{count(f)}</span></button>
      ))}
      {canManage && <Button size="sm" onClick={() => setWizard({ id: null })}><FiPlus className="mr-1.5 size-3.5" aria-hidden /> Νέα δυναμική προσφορά</Button>}
    </div>
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        searchKey="name"
        filterAllColumns
        searchPlaceholder="Αναζήτηση (τίτλος, προϊόν, κωδικός…)"
        persistKey="admin.dynamic-offers.table.v1"
        toolbar={toolbar}
        pageSize={25}
        growColumnId="name"
        responsiveHide={['closesAt', 'customers', 'next', 'status', 'price']}
        expandable={(o) => <OfferDetail offer={o} canManage={canManage} onChanged={refresh} />}
        emptyState={(
          <div className="space-y-2 py-10 text-center">
            <FiSend className="mx-auto size-8 text-muted-foreground/50" aria-hidden />
            <p className="text-[length:var(--fs-13)] text-muted-foreground">{offers.length ? 'Καμία προσφορά με αυτό το φίλτρο.' : 'Δεν υπάρχουν ακόμη δυναμικές προσφορές.'}</p>
            {canManage && !offers.length && <Button size="sm" onClick={() => setWizard({ id: null })}><FiPlus className="mr-1.5 size-3.5" aria-hidden /> Δημιουργία της πρώτης</Button>}
          </div>
        )}
      />
      {canManage && <OfferWizard open={wizard != null} onOpenChange={(o) => { if (!o) setWizard(null); }} offerId={wizard?.id ?? null} onDone={refresh} />}
    </>
  );
}
