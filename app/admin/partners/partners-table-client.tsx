'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { FiPlus, FiBriefcase, FiUser, FiCheck, FiSlash } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import type { PartnerLinkOptions, PartnerListRow } from '@/lib/partners';
import { PartnerFormDialog, PartnerOptionsContext } from './partner-dialogs';
import { PartnerExpandPanel } from './partner-expand-panel';
import { PartnerRowActions } from './partner-row-actions';

const DASH = <span className="text-muted-foreground/40">—</span>;
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const TYPE_TONE = { COMPANY: '#0369A1', PERSON: '#7C3AED' } as const;

function Count({ n, tone }: { n: number; tone: string }) {
  return n
    ? <span className="inline-flex min-w-6 justify-center rounded-full px-1.5 text-[length:var(--fs-11)] font-semibold tabular-nums" style={{ color: tone, backgroundColor: soft(tone, 12) }}>{n}</span>
    : <span className="tabular-nums text-[length:var(--fs-12)] text-muted-foreground/50">0</span>;
}

type Filter = 'all' | 'COMPANY' | 'PERSON' | 'inactive';

export function PartnersTableClient({
  rows, options, canManage,
}: {
  rows: PartnerListRow[]; options: PartnerLinkOptions; canManage: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<Filter>('all');
  const [creating, setCreating] = React.useState(false);

  const counts = React.useMemo(() => ({
    all: rows.filter((r) => r.isActive).length,
    COMPANY: rows.filter((r) => r.isActive && r.type === 'COMPANY').length,
    PERSON: rows.filter((r) => r.isActive && r.type === 'PERSON').length,
    inactive: rows.filter((r) => !r.isActive).length,
  }), [rows]);

  const data = React.useMemo(() => rows.filter((r) => (
    filter === 'inactive' ? !r.isActive : r.isActive && (filter === 'all' || r.type === filter)
  )), [rows, filter]);

  const columns = React.useMemo<ColumnDef<PartnerListRow>[]>(() => [
    {
      accessorKey: 'name', header: 'Συνεργάτης', size: 300,
      cell: ({ row }) => {
        const r = row.original;
        const tone = TYPE_TONE[r.type];
        return (
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md [&_svg]:size-3.5" style={{ color: tone, backgroundColor: soft(tone, 12) }}>
              {r.type === 'COMPANY' ? <FiBriefcase /> : <FiUser />}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[length:var(--fs-12)] font-medium">{r.name}</div>
              <div className="truncate text-[length:var(--fs-11)] text-muted-foreground">
                <span className="sr-only">{r.type === 'COMPANY' ? 'Εταιρία' : 'Φυσικό πρόσωπο'} · </span>
                {[r.tradeName, r.afm && `ΑΦΜ ${r.afm}`].filter(Boolean).join(' · ') || (r.type === 'COMPANY' ? 'Εταιρία' : 'Φυσικό πρόσωπο')}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'specialty', header: 'Ιδιότητα', size: 160,
      cell: ({ row }) => (row.original.specialty
        ? <span className="inline-flex rounded-sm bg-muted px-1.5 py-0.5 text-[length:var(--fs-11)] font-medium">{row.original.specialty}</span>
        : DASH),
    },
    {
      id: 'contact', accessorFn: (r) => [r.phone, r.mobile, r.email].filter(Boolean).join(' '), header: 'Επικοινωνία', size: 200,
      cell: ({ row }) => {
        const r = row.original;
        const tel = r.mobile ?? r.phone;
        return tel || r.email ? (
          <div className="min-w-0 text-[length:var(--fs-12)]">
            {tel && <div className="tabular-nums">{tel}</div>}
            {r.email && <div className="truncate text-[length:var(--fs-11)] text-muted-foreground">{r.email}</div>}
          </div>
        ) : DASH;
      },
    },
    { accessorKey: 'city', header: 'Πόλη', size: 110, cell: ({ row }) => row.original.city ? <span className="text-[length:var(--fs-12)]">{row.original.city}</span> : DASH },
    {
      accessorKey: 'customers', header: 'Πελάτες', size: 220,
      cell: ({ row }) => (row.original.customers
        ? <span className="line-clamp-2 text-[length:var(--fs-12)]" title={row.original.customers}>{row.original.customers}</span>
        : DASH),
    },
    { accessorKey: 'contactCount', header: 'Πρόσωπα', size: 80, cell: ({ row }) => (row.original.type === 'COMPANY' ? <Count n={row.original.contactCount} tone="#7C3AED" /> : DASH) },
    { accessorKey: 'projectCount', header: 'Έργα', size: 70, cell: ({ row }) => <Count n={row.original.projectCount} tone="#B45309" /> },
    {
      accessorKey: 'isActive', header: 'Ενεργός', size: 90,
      cell: ({ row }) => (row.original.isActive ? (
        <span className="inline-flex items-center gap-1 text-[length:var(--fs-12)]" style={{ color: '#047857' }}><FiCheck className="size-3.5" aria-hidden /> Ναι</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[length:var(--fs-12)] text-muted-foreground"><FiSlash className="size-3.5" aria-hidden /> Όχι</span>
      )),
    },
    {
      id: 'actions', header: () => <span className="sr-only">Ενέργειες</span>, size: 44,
      enableSorting: false, enableHiding: false, enableResizing: false,
      cell: ({ row }) => <div className="flex justify-end"><PartnerRowActions row={row.original} canManage={canManage} /></div>,
    },
  ], [canManage]);

  const chip = (active: boolean) => cn(
    'inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-[length:var(--fs-11)] font-medium transition',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground',
  );
  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Όλοι' }, { key: 'COMPANY', label: 'Εταιρίες' }, { key: 'PERSON', label: 'Πρόσωπα' }, { key: 'inactive', label: 'Ανενεργοί' },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTERS.filter((f) => f.key !== 'inactive' || counts.inactive > 0).map((f) => (
        <button key={f.key} type="button" className={chip(filter === f.key)} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}>
          {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
        </button>
      ))}
      {canManage && (
        <Button size="sm" onClick={() => setCreating(true)}>
          <FiPlus className="mr-1.5 size-3.5" aria-hidden /> Νέος συνεργάτης
        </Button>
      )}
    </div>
  );

  return (
    <PartnerOptionsContext.Provider value={options}>
      <DataTable
        columns={columns}
        data={data}
        searchKey="name"
        filterAllColumns
        searchPlaceholder="Αναζήτηση (όνομα, ΑΦΜ, ιδιότητα, πελάτης…)"
        persistKey="admin.partners.table.v1"
        toolbar={toolbar}
        pageSize={50}
        growColumnId="name"
        responsiveHide={['isActive', 'city', 'contactCount', 'customers', 'contact', 'specialty', 'projectCount']}
        expandable={(r) => <PartnerExpandPanel row={r} canManage={canManage} />}
        emptyState={(
          <div className="space-y-2 py-8 text-center">
            <p className="text-[length:var(--fs-13)] text-muted-foreground">{rows.length ? 'Κανένας συνεργάτης με αυτό το φίλτρο.' : 'Δεν υπάρχουν ακόμη συνεργάτες.'}</p>
            {canManage && !rows.length && <Button size="sm" onClick={() => setCreating(true)}><FiPlus className="mr-1.5 size-3.5" aria-hidden /> Νέος συνεργάτης</Button>}
          </div>
        )}
      />
      {canManage && (
        <PartnerFormDialog open={creating} onOpenChange={(o) => { setCreating(o); if (!o) router.refresh(); }} partnerId={null} />
      )}
    </PartnerOptionsContext.Provider>
  );
}
