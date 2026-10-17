'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { FiRefreshCw, FiCheck, FiSlash, FiAlertTriangle } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { syncErrorMessage } from '@/lib/softone-sync/sync-error';
import type { ProjectListRow } from '@/lib/projects';
import type { ProjectFinancialsRow } from '@/lib/project-profit';
import { ProjectActivityPanel } from './project-activity-panel';
import { ProjectRowActions } from './project-row-actions';

const DASH = <span className="text-muted-foreground/40">—</span>;

export type ProjectFinRow = ProjectListRow & { fin: ProjectFinancialsRow | null };

const eur0 = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const GOOD = '#047857';
const BAD = '#B91C1C';

function MoneyCell({ value, tone }: { value: number | null | undefined; tone?: boolean }) {
  if (value == null) return DASH;
  const color = tone ? (value > 0 ? GOOD : value < 0 ? BAD : undefined) : undefined;
  return <span className="block text-right tabular-nums text-[length:var(--fs-12)]" style={color ? { color } : undefined}>{eur0.format(value)}</span>;
}

/** Ταξινόμηση με τα έργα χωρίς οικονομικά πάντα στο τέλος. */
const finSort = (key: keyof ProjectFinancialsRow) => (a: { original: ProjectFinRow }, b: { original: ProjectFinRow }) =>
  ((a.original.fin?.[key] as number | null | undefined) ?? -Infinity) - ((b.original.fin?.[key] as number | null | undefined) ?? -Infinity);

function Summary({ rows }: { rows: ProjectFinRow[] }) {
  const t = rows.reduce((acc, r) => {
    if (!r.fin) return acc;
    acc.revenue += r.fin.revenue; acc.collected += r.fin.collected; acc.open += Math.max(r.fin.openAmount, 0);
    acc.costs += r.fin.costs + r.fin.overhead; acc.profit += r.fin.netProfit; acc.issues += r.fin.issues > 0 ? 1 : 0;
    return acc;
  }, { revenue: 0, collected: 0, open: 0, costs: 0, profit: 0, issues: 0 });
  const margin = t.revenue > 0 ? (t.profit / t.revenue) * 100 : null;
  const tiles: [string, string, string | null, React.CSSProperties?][] = [
    ['Τιμολογήθηκε', eur0.format(t.revenue), 'καθαρά, χωρίς ΦΠΑ'],
    ['Εισπράχθηκε', eur0.format(t.collected), `ανοιχτά ${eur0.format(t.open)}`],
    ['Κόστος + γενικά', eur0.format(t.costs), null],
    ['Καθαρό κέρδος', eur0.format(t.profit), margin == null ? null : `περιθώριο ${margin.toLocaleString('el-GR', { maximumFractionDigits: 1 })}%`, { color: t.profit < 0 ? BAD : t.profit > 0 ? GOOD : undefined }],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Σύνοψη κερδοφορίας των έργων που φαίνονται">
      {tiles.map(([label, value, sub, style]) => (
        <div key={label} className="min-w-0 rounded-lg border border-border bg-card p-3">
          <p className="text-[length:var(--fs-11)] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-[length:var(--fs-18)] font-semibold tabular-nums" style={style}>{value}</p>
          {sub && <p className="text-[length:var(--fs-11)] text-muted-foreground">{sub}</p>}
        </div>
      ))}
      {t.issues > 0 && (
        <p className="col-span-2 inline-flex items-center gap-1.5 text-[length:var(--fs-12)] text-amber-800 dark:text-amber-200 lg:col-span-4">
          <FiAlertTriangle className="size-3.5 shrink-0" aria-hidden />
          {t.issues} έργ{t.issues === 1 ? 'ο έχει' : 'α έχουν'} «Δεδομένα που λείπουν» στο SoftOne — τα νούμερά τους είναι ελλιπή μέχρι να διορθωθούν (δες την καρτέλα κάθε έργου).
        </p>
      )}
    </div>
  );
}

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : null);

function DateCell({ value }: { value: string | null }) {
  const s = fmtDate(value);
  return s ? <span className="tabular-nums text-[length:var(--fs-12)] text-muted-foreground">{s}</span> : DASH;
}

export function ProjectsTableClient({
  rows,
  showFinancials,
  financialsAt,
  financialsError,
  canManage,
  lastSync,
}: {
  rows: ProjectFinRow[];
  showFinancials: boolean;
  financialsAt: string | null;
  financialsError: string | null;
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

  const finColumns = React.useMemo<ColumnDef<ProjectFinRow>[]>(() => (showFinancials ? [
    { id: 'revenue', accessorFn: (r) => r.fin?.revenue ?? null, header: 'Τιμολογήθηκε', size: 120, sortingFn: finSort('revenue'), cell: ({ row }) => <MoneyCell value={row.original.fin?.revenue} /> },
    { id: 'collected', accessorFn: (r) => r.fin?.collected ?? null, header: 'Εισπράχθηκε', size: 120, sortingFn: finSort('collected'), cell: ({ row }) => <MoneyCell value={row.original.fin?.collected} /> },
    { id: 'costs', accessorFn: (r) => (r.fin ? r.fin.costs + r.fin.overhead : null), header: 'Κόστος + γενικά', size: 130, sortingFn: (a, b) => ((a.original.fin ? a.original.fin.costs + a.original.fin.overhead : -Infinity) - (b.original.fin ? b.original.fin.costs + b.original.fin.overhead : -Infinity)), cell: ({ row }) => <MoneyCell value={row.original.fin ? row.original.fin.costs + row.original.fin.overhead : null} /> },
    {
      id: 'netProfit', accessorFn: (r) => r.fin?.netProfit ?? null, header: 'Καθαρό κέρδος', size: 130, sortingFn: finSort('netProfit'),
      cell: ({ row }) => (
        <span className="flex items-center justify-end gap-1">
          {(row.original.fin?.issues ?? 0) > 0 && (
            <FiAlertTriangle className="size-3.5 shrink-0 text-amber-600" title={`${row.original.fin!.issues} θέματα «Δεδομένα που λείπουν»`} />
          )}
          <MoneyCell value={row.original.fin?.netProfit} tone />
        </span>
      ),
    },
    {
      id: 'marginPct', accessorFn: (r) => r.fin?.marginPct ?? null, header: 'Περιθ. %', size: 90, sortingFn: finSort('marginPct'),
      cell: ({ row }) => (row.original.fin?.marginPct == null ? DASH : (
        <span className="block text-right tabular-nums text-[length:var(--fs-12)]">{row.original.fin.marginPct.toLocaleString('el-GR', { maximumFractionDigits: 1 })}%</span>
      )),
    },
  ] : []), [showFinancials]);

  const columns = React.useMemo<ColumnDef<ProjectFinRow>[]>(() => [
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
    ...finColumns,
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
          <ProjectRowActions prjc={row.original.prjc} code={row.original.code} name={row.original.name} canManage={canManage} exportDoc={showFinancials && (row.original.fin?.issues ?? 0) > 0} />
        </div>
      ),
    },
  ], [canManage, finColumns, showFinancials]);

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
      {showFinancials && <Summary rows={data} />}
      {financialsError && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)] text-destructive">
          Το SoftOne δεν απάντησε ({financialsError}) — τα οικονομικά είναι από τον προηγούμενο υπολογισμό.
        </p>
      )}
      <DataTable
        columns={columns}
        data={data}
        searchKey="name"
        filterAllColumns
        searchPlaceholder="Αναζήτηση (κωδικός, έργο, πελάτης…)"
        persistKey="admin.projects.table.v2"
        toolbar={toolbar}
        pageSize={50}
        growColumnId="name"
        // Σειρά θυσίας σε στενή οθόνη — κωδικός και όνομα μένουν πάντα.
        responsiveHide={['closeDate', 'isActive', 'finalDate', 'fromDate', 'statusLabel', 'costs', 'collected', 'customer', 'marginPct', 'revenue']}
        expandable={(r) => <ProjectActivityPanel prjc={r.prjc} canManage={canManage} projectLabel={`${r.code} · ${r.name}`} />}
        emptyState={<p className="py-8 text-center text-[length:var(--fs-13)] text-muted-foreground">Δεν υπάρχουν έργα. Πάτησε «Συγχρονισμός από SoftOne».</p>}
      />
      {lastSync && (
        <p className="text-[length:var(--fs-11)] text-muted-foreground">
          Τελευταίος συγχρονισμός: {new Date(lastSync).toLocaleString('el-GR')}
          {showFinancials && financialsAt && <> · οικονομικά: {new Date(financialsAt).toLocaleString('el-GR')}</>}
        </p>
      )}
    </div>
  );
}
