'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { FiCopy, FiMail, FiMoreVertical, FiTarget, FiUploadCloud, FiUserMinus } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DataTable } from '@/components/ui/data-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import type { LeadView } from '@/lib/leads';
import type { SubscriberView } from '@/lib/newsletter';

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const DASH = <span className="text-muted-foreground/40">—</span>;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('el-GR') : null);
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const SOFTONE_TONE: Record<string, string> = { PENDING: '#B45309', DISABLED: '#64748B', CREATED: '#047857', LINKED: '#0369A1', FAILED: '#BE123C' };
const SOURCE: Record<string, string> = { appointment: 'Ραντεβού', newsletter: 'Newsletter' };
const NL: Record<string, { label: string; tone: string }> = { PENDING: { label: 'Αναμένει επιβεβαίωση', tone: '#B45309' }, CONFIRMED: { label: 'Επιβεβαιωμένος', tone: '#047857' }, UNSUBSCRIBED: { label: 'Διαγράφηκε', tone: '#64748B' } };
const Pill = ({ tone, children }: { tone: string; children: React.ReactNode }) => <span className="whitespace-nowrap rounded-md px-2 py-0.5 text-(length:--fs-11) font-medium" style={{ color: tone, background: soft(tone, 12) }}>{children}</span>;
const trigger = 'inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground';

export function LeadsClient({ leads, subscribers, canManage, softoneEnabled }: { leads: LeadView[]; subscribers: SubscriberView[]; canManage: boolean; softoneEnabled: boolean }) {
  const router = useRouter();
  const [nlFilter, setNlFilter] = React.useState<'CONFIRMED' | 'PENDING' | 'UNSUBSCRIBED' | 'all'>('CONFIRMED');

  async function pushLead(l: LeadView) {
    const res = await fetch(`/api/admin/leads/${l.id}/softone`, { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (res.ok) toast.success(`${l.email}: ${d.label}`); else toast.error(d.message ?? d.label ?? 'Η αποστολή απέτυχε');
    router.refresh();
  }
  async function unsubscribe(s: SubscriberView) {
    if (!(await confirmAction({ message: `Διαγραφή του ${s.email} από το newsletter;`, confirmLabel: 'Διαγραφή', destructive: true }))) return;
    const res = await fetch(`/api/admin/newsletter/${s.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Διαγράφηκε από τη λίστα'); router.refresh(); } else toast.error('Η διαγραφή απέτυχε');
  }
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success('Αντιγράφηκε'), () => toast.error('Δεν αντιγράφηκε'));

  const leadCols = React.useMemo<ColumnDef<LeadView>[]>(() => [
    { id: 'who', accessorFn: (l) => `${l.company ?? ''} ${l.name ?? ''} ${l.email}`, header: 'Επαφή', size: 280, cell: ({ row }) => (
      <span className="min-w-0"><span className="block truncate font-medium">{row.original.company || row.original.name || row.original.email}</span><span className="block truncate text-(length:--fs-11) text-muted-foreground">{[row.original.name, (row.original.company || row.original.name) ? row.original.email : null].filter(Boolean).join(' · ') || 'Newsletter'}</span></span>
    ) },
    { accessorKey: 'phone', header: 'Τηλέφωνο', size: 130, cell: ({ row }) => (row.original.phone ? <span className="tabular-nums">{row.original.phone}</span> : DASH) },
    { id: 'sources', accessorFn: (l) => l.sources.join(' '), header: 'Πηγή', size: 170, cell: ({ row }) => (
      <span className="flex flex-wrap gap-1">{row.original.sources.map((s) => <span key={s} className="rounded border border-border px-1.5 text-(length:--fs-11)">{SOURCE[s] ?? s}</span>)}{row.original.appointments > 1 && <span className="text-(length:--fs-11) text-muted-foreground">×{row.original.appointments}</span>}</span>
    ) },
    { accessorKey: 'softoneStatus', header: 'SoftOne', size: 190, cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5" title={row.original.softoneError ?? undefined}><Pill tone={SOFTONE_TONE[row.original.softoneStatus] ?? '#64748B'}>{row.original.softoneCode ? `${row.original.softoneStatus === 'LINKED' ? 'Πελάτης' : 'Υποψήφιος'} ${row.original.softoneCode}` : row.original.softoneLabel}</Pill></span>
    ) },
    { accessorKey: 'createdAt', header: 'Από', size: 96, cell: ({ row }) => <span className="tabular-nums">{day(row.original.createdAt)}</span> },
    { id: 'actions', header: () => <span className="sr-only">Ενέργειες</span>, size: 44, enableSorting: false, enableHiding: false, enableResizing: false, cell: ({ row }) => {
      const l = row.original;
      const canPush = canManage && softoneEnabled && l.softoneStatus !== 'CREATED' && l.softoneStatus !== 'LINKED';
      return (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger className={trigger} aria-label={`Ενέργειες ${l.email}`}><FiMoreVertical className="size-4" aria-hidden /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem className={ITEM} asChild><a href={`mailto:${l.email}`}><FiMail className="size-3.5" aria-hidden /> Email</a></DropdownMenuItem>
              <DropdownMenuItem className={ITEM} onSelect={() => copy(l.email)}><FiCopy className="size-3.5" aria-hidden /> Αντιγραφή email</DropdownMenuItem>
              {canManage && (<><DropdownMenuSeparator />
                <DropdownMenuItem className={ITEM} disabled={!canPush} onSelect={() => pushLead(l)}><FiUploadCloud className="size-3.5" aria-hidden /> {softoneEnabled ? (l.softoneStatus === 'FAILED' ? 'Ξανά στο SoftOne' : 'Αποστολή στο SoftOne') : 'SoftOne: κλειστό στις Ρυθμίσεις'}</DropdownMenuItem></>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    } },
  ], [canManage, softoneEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const subCols = React.useMemo<ColumnDef<SubscriberView>[]>(() => [
    { id: 'who', accessorFn: (s) => `${s.email} ${s.name ?? ''}`, header: 'Email', size: 300, cell: ({ row }) => <span className="min-w-0"><span className="block truncate font-medium">{row.original.email}</span>{row.original.name && <span className="block truncate text-(length:--fs-11) text-muted-foreground">{row.original.name}</span>}</span> },
    { accessorKey: 'status', header: 'Κατάσταση', size: 170, cell: ({ row }) => <Pill tone={NL[row.original.status]?.tone ?? '#64748B'}>{NL[row.original.status]?.label ?? row.original.status}</Pill> },
    { accessorKey: 'source', header: 'Από', size: 120, cell: ({ row }) => ({ footer: 'Footer', modal: 'Modal', page: 'Σελίδα', appointment: 'Ραντεβού' } as Record<string, string>)[row.original.source ?? ''] ?? DASH },
    { accessorKey: 'createdAt', header: 'Εγγραφή', size: 96, cell: ({ row }) => <span className="tabular-nums">{day(row.original.createdAt)}</span> },
    { accessorKey: 'confirmedAt', header: 'Επιβεβαίωση', size: 110, cell: ({ row }) => (row.original.confirmedAt ? <span className="tabular-nums">{day(row.original.confirmedAt)}</span> : DASH) },
    { id: 'actions', header: () => <span className="sr-only">Ενέργειες</span>, size: 44, enableSorting: false, enableHiding: false, enableResizing: false, cell: ({ row }) => (
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger className={trigger} aria-label={`Ενέργειες ${row.original.email}`}><FiMoreVertical className="size-4" aria-hidden /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem className={ITEM} onSelect={() => copy(row.original.email)}><FiCopy className="size-3.5" aria-hidden /> Αντιγραφή email</DropdownMenuItem>
            {canManage && row.original.status !== 'UNSUBSCRIBED' && (<><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => unsubscribe(row.original)}><FiUserMinus className="size-3.5" aria-hidden /> Διαγραφή από τη λίστα…</DropdownMenuItem></>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ) },
  ], [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (active: boolean) => cn('inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-(length:--fs-11) font-medium transition',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground');
  const subs = subscribers.filter((s) => nlFilter === 'all' || s.status === nlFilter);
  const confirmedEmails = subscribers.filter((s) => s.status === 'CONFIRMED').map((s) => s.email);

  return (
    <Tabs defaultValue="leads">
      <TabsList className="mb-3">
        <TabsTrigger value="leads"><FiTarget className="size-3.5" aria-hidden /> Leads <span className="tabular-nums opacity-70">{leads.length}</span></TabsTrigger>
        <TabsTrigger value="newsletter">Newsletter <span className="tabular-nums opacity-70">{confirmedEmails.length}</span></TabsTrigger>
      </TabsList>
      <TabsContent value="leads">
        <DataTable columns={leadCols} data={leads} searchKey="email" filterAllColumns searchPlaceholder="Αναζήτηση (εταιρεία, όνομα, email…)" persistKey="admin.leads.table.v1"
          pageSize={25} growColumnId="who" responsiveHide={['phone', 'createdAt', 'sources']}
          expandable={(l) => l.softoneError ? <p className="px-2 py-3 text-(length:--fs-12) text-destructive">SoftOne: {l.softoneError}</p> : <p className="px-2 py-3 text-(length:--fs-12) text-muted-foreground">{l.profession ?? 'Χωρίς δραστηριότητα'} · {l.appointments} ραντεβού{l.newsletter ? ` · newsletter: ${NL[l.newsletter]?.label ?? l.newsletter}` : ''}</p>}
          emptyState={<div className="space-y-2 py-10 text-center"><FiTarget className="mx-auto size-8 text-muted-foreground/50" aria-hidden /><p className="text-(length:--fs-13) text-muted-foreground">Δεν υπάρχουν ακόμη leads από το website.</p></div>} />
      </TabsContent>
      <TabsContent value="newsletter">
        <DataTable columns={subCols} data={subs} searchKey="email" filterAllColumns searchPlaceholder="Αναζήτηση email…" persistKey="admin.newsletter.table.v1" pageSize={25} growColumnId="who" responsiveHide={['source', 'confirmedAt', 'createdAt']}
          toolbar={(
            <div className="flex flex-wrap items-center gap-1.5">
              {([['CONFIRMED', 'Επιβεβαιωμένοι'], ['PENDING', 'Σε αναμονή'], ['UNSUBSCRIBED', 'Διαγραμμένοι'], ['all', 'Όλοι']] as const).map(([f, l]) => (
                <button key={f} type="button" className={chip(nlFilter === f)} aria-pressed={nlFilter === f} onClick={() => setNlFilter(f)}>{l} <span className="tabular-nums opacity-70">{subscribers.filter((s) => f === 'all' || s.status === f).length}</span></button>
              ))}
              {confirmedEmails.length > 0 && <button type="button" className={chip(false)} onClick={() => copy(confirmedEmails.join(', '))}><FiCopy className="size-3" aria-hidden /> Αντιγραφή επιβεβαιωμένων</button>}
            </div>
          )}
          emptyState={<p className="py-10 text-center text-(length:--fs-13) text-muted-foreground">Κανένας συνδρομητής με αυτό το φίλτρο.</p>} />
      </TabsContent>
    </Tabs>
  );
}
