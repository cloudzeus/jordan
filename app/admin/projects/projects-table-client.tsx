'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { FiRefreshCw, FiCheck, FiSlash } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { syncErrorMessage } from '@/lib/softone-sync/sync-error';
import type { ProjectListRow } from '@/lib/projects';
import { ProjectActivityPanel } from './project-activity-panel';
import { ProjectRowActions } from './project-row-actions';

const DASH = <span className="text-muted-foreground/40">—</span>;

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : null);

function DateCell({ value }: { value: string | null }) {
  const s = fmtDate(value);
  return s ? <span className="tabular-nums text-[length:var(--fs-12)] text-muted-foreground">{s}</span> : DASH;
}

export function ProjectsTableClient({
  rows,
  canManage,
  lastSync,
}: {
  rows: ProjectListRow[];
  canManage: boolean;
  lastSync: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<number | 'all'>('all');

  const statuses = React.useMemo(() => {
    const m = new Map<number, { label: string; n: number }>();
    for (const r of rows) {
      if (r.actStatus == null) continue;
      const e = m.get(r.actStatus) ?? { label: r.statusLabel, n: 0 };
      e.n++;
      m.set(r.actStatus, e);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);

  const data = React.useMemo(
    () => (status === 'all' ? rows : rows.filter((r) => r.actStatus === status)),
    [rows, status],
  );

  const sync = async () => {
    setBusy(true);
    const res = await fetch('/api/admin/metadata/sync-projects-softone', { method: 'POST' });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      const extra = d.deactivated ? ` · ${d.deactivated} απενεργοποιήσεις` : '';
      toast.success(`Έργα: ${d.total.toLocaleString('el-GR')} (νέα ${d.created}, ενημερώσεις ${d.updated})${extra}`);
      router.refresh();
    } else {
      const e = await res.json().catch(() => ({}));
      toast.error(syncErrorMessage(e, 'Αποτυχία συγχρονισμού'));
    }
  };

  const columns = React.useMemo<ColumnDef<ProjectListRow>[]>(() => [
    {
      accessorKey: 'code', header: 'Κωδικός', size: 110,
      cell: ({ row }) => <span className="font-mono text-[length:var(--fs-12)] tabular-nums text-muted-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'name', header: 'Έργο', size: 340,
      cell: ({ row }) => (
        <Link href={`/admin/projects/${row.original.prjc}`} className="font-medium text-foreground text-[length:var(--fs-12)] hover:text-primary hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'customer', header: 'Πελάτης', size: 260,
      cell: ({ row }) => (row.original.customer
        ? <span className="text-[length:var(--fs-12)] text-foreground">{row.original.customer}</span>
        : DASH),
    },
    {
      accessorKey: 'statusLabel', header: 'Status', size: 120,
      cell: ({ row }) => (row.original.actStatus != null
        ? <span className="inline-flex rounded-sm bg-muted px-1.5 py-0.5 text-[length:var(--fs-11)] font-medium text-foreground">{row.original.statusLabel}</span>
        : DASH),
    },
    { accessorKey: 'fromDate', header: 'Έναρξη', size: 100, cell: ({ row }) => <DateCell value={row.original.fromDate} /> },
    { accessorKey: 'finalDate', header: 'Λήξη', size: 100, cell: ({ row }) => <DateCell value={row.original.finalDate} /> },
    { accessorKey: 'closeDate', header: 'Κλείσιμο', size: 100, cell: ({ row }) => <DateCell value={row.original.closeDate} /> },
    {
      accessorKey: 'isActive', header: 'Ενεργό', size: 90,
      // Κατάσταση = εικονίδιο + κείμενο (όχι μόνο χρώμα).
      cell: ({ row }) => (row.original.isActive ? (
        <span className="inline-flex items-center gap-1 text-[length:var(--fs-12)]" style={{ color: '#047857' }}>
          <FiCheck className="h-3.5 w-3.5" aria-hidden /> Ναι
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[length:var(--fs-12)] text-muted-foreground">
          <FiSlash className="h-3.5 w-3.5" aria-hidden /> Όχι
        </span>
      )),
    },
    {
      id: 'actions', header: () => <span className="sr-only">Ενέργειες</span>, size: 44,
      enableSorting: false, enableHiding: false, enableResizing: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <ProjectRowActions prjc={row.original.prjc} code={row.original.code} name={row.original.name} canManage={canManage} />
        </div>
      ),
    },
  ], [canManage]);

  const chip = (active: boolean) => cn(
    'inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[length:var(--fs-11)] font-medium transition',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground',
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={chip(status === 'all')} onClick={() => setStatus('all')}>
        Όλα <span className="tabular-nums opacity-70">{rows.length}</span>
      </button>
      {statuses.map(([code, s]) => (
        <button key={code} type="button" className={chip(status === code)} onClick={() => setStatus(code)}>
          {s.label} <span className="tabular-nums opacity-70">{s.n}</span>
        </button>
      ))}
      {canManage && (
        <Button variant="secondary" size="sm" onClick={sync} disabled={busy}>
          <FiRefreshCw className={cn('mr-1.5 h-3.5 w-3.5', busy && 'animate-spin')} />
          {busy ? 'Συγχρονισμός…' : 'Συγχρονισμός από SoftOne'}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      <DataTable
        columns={columns}
        data={data}
        searchKey="name"
        filterAllColumns
        searchPlaceholder="Αναζήτηση (κωδικός, έργο, πελάτης…)"
        persistKey="admin.projects.table.v1"
        toolbar={toolbar}
        pageSize={50}
        growColumnId="name"
        // Σειρά θυσίας σε στενή οθόνη — κωδικός και όνομα μένουν πάντα.
        responsiveHide={['closeDate', 'isActive', 'finalDate', 'fromDate', 'statusLabel', 'customer']}
        expandable={(r) => <ProjectActivityPanel prjc={r.prjc} canManage={canManage} projectLabel={`${r.code} · ${r.name}`} />}
        emptyState={<p className="py-8 text-center text-[length:var(--fs-13)] text-muted-foreground">Δεν υπάρχουν έργα. Πάτησε «Συγχρονισμός από SoftOne».</p>}
      />
      {lastSync && (
        <p className="text-[length:var(--fs-11)] text-muted-foreground">
          Τελευταίος συγχρονισμός: {new Date(lastSync).toLocaleString('el-GR')}
        </p>
      )}
    </div>
  );
}
