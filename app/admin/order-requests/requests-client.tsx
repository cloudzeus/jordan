'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { FiCheck, FiClock, FiMoreVertical, FiShoppingCart, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { staffCanMove, type OrderRequestStatus } from '@/lib/order-requests-core';
import type { listOrderRequests } from '@/lib/order-requests';

type Row = Awaited<ReturnType<typeof listOrderRequests>>[number];

const DASH = <span className="text-muted-foreground/40">—</span>;
const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 3 });
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('el-GR') : null);
const TONE: Record<OrderRequestStatus, string> = { SUBMITTED: '#B45309', IN_REVIEW: '#0369A1', CONFIRMED: '#047857', REJECTED: '#BE123C', CANCELLED: '#475569' };
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';

async function patch(id: string, body: unknown) {
  const res = await fetch(`/api/admin/order-requests/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message ?? 'Η ενέργεια απέτυχε');
}

type Decision = { row: Row; status: 'CONFIRMED' | 'REJECTED' };

function DecisionDialog({ decision, onClose, onDone }: { decision: Decision | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const confirm = decision?.status === 'CONFIRMED';
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!decision) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await patch(decision.row.id, { status: decision.status, staffNote: f.get('staffNote')?.toString() ?? null, ...(confirm ? { softoneFincode: f.get('fincode')?.toString() ?? null } : {}) });
      toast.success(confirm ? `Το ${decision.row.code} επιβεβαιώθηκε` : `Το ${decision.row.code} απορρίφθηκε`);
      onDone();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={decision != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{confirm ? 'Επιβεβαίωση αιτήματος' : 'Απόρριψη αιτήματος'} {decision?.row.code}</DialogTitle>
            <DialogDescription>{decision?.row.customer}. {confirm ? 'Καταχωρίστε πρώτα την παραγγελία στο SoftOne (σειρά «Παραγγελία») — η εφαρμογή δεν γράφει στο ERP.' : 'Ο πελάτης θα δει το σχόλιό σας στο portal.'}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {confirm && (
              <label className="block space-y-1 text-(length:--fs-12) font-medium">
                <span>Παραστατικό SoftOne (προαιρετικό)</span>
                <Input name="fincode" placeholder="π.χ. ΠΑΡ0000057" maxLength={40} defaultValue={decision?.row.softoneFincode ?? ''} />
              </label>
            )}
            <label className="block space-y-1 text-(length:--fs-12) font-medium">
              <span>Σχόλιο προς τον πελάτη</span>
              <textarea name="staffNote" rows={3} maxLength={1000} defaultValue={decision?.row.staffNote ?? ''} className="w-full rounded-md border border-input bg-background px-3 py-2 text-(length:--fs-13) font-normal" placeholder={confirm ? 'π.χ. Παράδοση την Πέμπτη' : 'π.χ. Το υλικό δεν είναι διαθέσιμο'} />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Άκυρο</Button>
            <Button type="submit" disabled={busy} variant={confirm ? 'default' : 'destructive'}>{confirm ? 'Επιβεβαίωση' : 'Απόρριψη'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Lines({ r }: { r: Row }) {
  return (
    <div className="space-y-3 px-2 py-3 text-(length:--fs-12)">
      <table className="w-full max-w-3xl">
        <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3 font-medium">Κωδικός</th><th className="py-1 pr-3 font-medium">Υλικό</th><th className="py-1 text-right font-medium">Ποσότητα</th></tr></thead>
        <tbody>
          {r.lines.map((l) => (
            <tr key={l.id} className="border-t border-border/60 align-top">
              <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{l.code ?? '—'}</td>
              <td className="py-1.5 pr-3">{l.name}{l.note && <span className="block text-muted-foreground">{l.note}</span>}</td>
              <td className="py-1.5 text-right tabular-nums">{num(l.qty)} {l.unit ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="grid max-w-3xl grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
        {r.requester && <><dt className="text-muted-foreground">Χρήστης</dt><dd>{r.requester.name ?? ''} {r.requester.email}</dd></>}
        {r.deliveryAddress && <><dt className="text-muted-foreground">Διεύθυνση</dt><dd>{r.deliveryAddress}</dd></>}
        {r.notes && <><dt className="text-muted-foreground">Σχόλια πελάτη</dt><dd className="whitespace-pre-wrap">{r.notes}</dd></>}
        {r.staffNote && <><dt className="text-muted-foreground">Απάντηση</dt><dd>{r.staffNote}</dd></>}
      </dl>
    </div>
  );
}

export function RequestsClient({ rows, canManage }: { rows: Row[]; canManage: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<'open' | 'all' | OrderRequestStatus>('open');
  const [decision, setDecision] = React.useState<Decision | null>(null);
  const refresh = () => router.refresh();
  const isOpen = (s: string) => s === 'SUBMITTED' || s === 'IN_REVIEW';
  const data = rows.filter((r) => (filter === 'all' ? true : filter === 'open' ? isOpen(r.status) : r.status === filter));
  const count = (f: typeof filter) => rows.filter((r) => (f === 'all' ? true : f === 'open' ? isOpen(r.status) : r.status === f)).length;

  const columns = React.useMemo<ColumnDef<Row>[]>(() => [
    { accessorKey: 'code', header: 'Αίτημα', size: 110, cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.code}</span> },
    { accessorKey: 'createdAt', header: 'Ημ/νία', size: 96, cell: ({ row }) => <span className="tabular-nums">{day(row.original.createdAt)}</span> },
    { id: 'customer', accessorFn: (r) => `${r.customer} ${r.customerCode ?? ''} ${r.customerRef ?? ''}`, header: 'Πελάτης', size: 260, cell: ({ row }) => (
      <span className="min-w-0"><span className="block truncate font-medium">{row.original.customer}</span>{row.original.customerRef && <span className="block truncate text-(length:--fs-11) text-muted-foreground">Αναφ.: {row.original.customerRef}</span>}</span>
    ) },
    { id: 'project', accessorFn: (r) => r.project?.name ?? '', header: 'Έργο', size: 200, cell: ({ row }) => (row.original.project ? <span className="truncate">{row.original.project.name}</span> : DASH) },
    { id: 'lines', accessorFn: (r) => r.lines.length, header: 'Γραμμές', size: 80, cell: ({ row }) => <span className="tabular-nums">{row.original.lines.length}</span> },
    { accessorKey: 'deliveryDate', header: 'Παράδοση', size: 96, cell: ({ row }) => (row.original.deliveryDate ? <span className="tabular-nums">{day(row.original.deliveryDate)}</span> : DASH) },
    { accessorKey: 'status', header: 'Κατάσταση', size: 140, cell: ({ row }) => {
      const s = row.original.status;
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-md px-2 py-0.5 text-(length:--fs-11) font-medium" style={{ color: TONE[s], background: soft(TONE[s], 12) }}>{row.original.statusLabel}</span>
          {row.original.softoneFincode && <span className="text-(length:--fs-11) tabular-nums text-muted-foreground">{row.original.softoneFincode}</span>}
        </span>
      );
    } },
    {
      id: 'actions', header: () => <span className="sr-only">Ενέργειες</span>, size: 44, enableSorting: false, enableHiding: false, enableResizing: false,
      cell: ({ row }) => {
        const r = row.original;
        if (!canManage || !(['IN_REVIEW', 'CONFIRMED', 'REJECTED'] as const).some((s) => staffCanMove(r.status, s))) return null;
        const review = async () => { try { await patch(r.id, { status: 'IN_REVIEW' }); toast.success(`Το ${r.code} είναι σε επεξεργασία`); refresh(); } catch (e) { toast.error((e as Error).message); } };
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Ενέργειες ${r.code}`}><FiMoreVertical className="size-4" aria-hidden /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {staffCanMove(r.status, 'IN_REVIEW') && <DropdownMenuItem className={ITEM} onSelect={review}><FiClock className="size-3.5" aria-hidden /> Σε επεξεργασία</DropdownMenuItem>}
                <DropdownMenuItem className={ITEM} onSelect={() => setDecision({ row: r, status: 'CONFIRMED' })}><FiCheck className="size-3.5" aria-hidden /> Επιβεβαίωση…</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => setDecision({ row: r, status: 'REJECTED' })}><FiX className="size-3.5" aria-hidden /> Απόρριψη…</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (active: boolean) => cn('inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-(length:--fs-11) font-medium transition',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground');
  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {([['open', 'Ανοιχτά'], ['CONFIRMED', 'Επιβεβαιωμένα'], ['REJECTED', 'Απορριφθέντα'], ['CANCELLED', 'Ακυρωμένα'], ['all', 'Όλα']] as const).map(([f, l]) => (
        <button key={f} type="button" className={chip(filter === f)} aria-pressed={filter === f} onClick={() => setFilter(f)}>{l} <span className="tabular-nums opacity-70">{count(f)}</span></button>
      ))}
    </div>
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        searchKey="customer"
        filterAllColumns
        searchPlaceholder="Αναζήτηση (πελάτης, αίτημα, έργο…)"
        persistKey="admin.order-requests.table.v1"
        toolbar={toolbar}
        pageSize={25}
        growColumnId="customer"
        responsiveHide={['project', 'lines', 'deliveryDate', 'createdAt']}
        expandable={(r) => <Lines r={r} />}
        emptyState={(
          <div className="space-y-2 py-10 text-center">
            <FiShoppingCart className="mx-auto size-8 text-muted-foreground/50" aria-hidden />
            <p className="text-(length:--fs-13) text-muted-foreground">{rows.length ? 'Κανένα αίτημα με αυτό το φίλτρο.' : 'Δεν υπάρχουν ακόμη αιτήματα παραγγελίας από το portal.'}</p>
          </div>
        )}
      />
      <DecisionDialog decision={decision} onClose={() => setDecision(null)} onDone={() => { setDecision(null); refresh(); }} />
    </>
  );
}
