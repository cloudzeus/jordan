'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import {
  FiRefreshCw, FiPlus, FiMoreVertical, FiEdit3, FiSlash, FiCheck, FiCopy, FiLock, FiTag, FiLayers, FiLoader, FiAlertTriangle,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import { confirmAction } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Field, FormSection, RowHint, Segmented, fieldCls } from '@/components/admin/form-kit';
import { syncErrorMessage } from '@/lib/softone-sync/sync-error';
import type { ClassificationRow } from '@/lib/item-classifications';

const DASH = <span className="text-muted-foreground/40">—</span>;
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const KIND = {
  CATEGORY: { label: 'Κατηγορία', tone: '#0369A1', icon: FiTag },
  GROUP: { label: 'Ομάδα', tone: '#7C3AED', icon: FiLayers },
} as const;
const REG: Record<number, { label: string; tone: string }> = { 51: { label: 'Είδη', tone: '#B45309' }, 52: { label: 'Υπηρεσίες', tone: '#047857' } };
const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d.message ?? 'Η ενέργεια απέτυχε'), { field: d.field as string | undefined });
  return d;
}

// ── Νέα / επεξεργασία κατηγορίας ────────────────────────────────────────────────────────────

function CategoryDialog({
  open, onOpenChange, row, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; row: ClassificationRow | null; onSaved: () => void;
}) {
  const [sodtype, setSodtype] = React.useState<'51' | '52'>('51');
  const [shortCode, setShortCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setSodtype(row ? (String(row.sodtype) as '51' | '52') : '51');
    setShortCode(row?.shortCode ?? '');
    setName(row?.name ?? '');
  }, [open, row]);

  const save = async () => {
    setBusy(true);
    try {
      if (row) {
        const body: Record<string, string> = {};
        if (name.trim() !== row.name) body.name = name;
        if (shortCode.trim() !== (row.shortCode ?? '')) body.shortCode = shortCode;
        if (!Object.keys(body).length) { onOpenChange(false); return; }
        await send(`/api/admin/classifications/categories/${row.sodtype}/${row.code}`, 'PATCH', body);
        toast.success('Η κατηγορία ενημερώθηκε στο SoftOne');
      } else {
        const d = await send('/api/admin/classifications/categories', 'POST', { sodtype: Number(sodtype), shortCode, name });
        toast.success(`Δημιουργήθηκε στο SoftOne: ${d.category.code} · ${d.category.name}`);
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const err = e as Error & { field?: string };
      if (err.field) setErrors({ [err.field]: err.message });
      toast.error(err.message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[92dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-2.5 pr-12">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4" style={{ color: KIND.CATEGORY.tone, backgroundColor: soft(KIND.CATEGORY.tone, 12) }}><FiTag /></span>
          <div className="min-w-0 flex-1 text-left">
            <DialogTitle className="text-(length:--fs-15)">{row ? 'Επεξεργασία κατηγορίας' : 'Νέα εμπορική κατηγορία'}</DialogTitle>
            <DialogDescription className="truncate text-(length:--fs-11)">
              {row ? `${REG[row.sodtype]?.label} · κωδ. ${row.code}` : 'Γράφεται απευθείας στο SoftOne'}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-3 bg-muted/20 px-4 py-3">
          <FormSection tone="blue" icon={<FiTag />} title="Κατηγορία">
            {!row && (
              <Field label="Μητρώο">
                <Segmented ariaLabel="Μητρώο" value={sodtype} onChange={setSodtype} options={[{ value: '51', label: 'Είδη' }, { value: '52', label: 'Υπηρεσίες' }]} />
              </Field>
            )}
            <div className="grid gap-2.5 sm:grid-cols-[7rem_1fr]">
              <Field label="Σύντμηση" required htmlFor="cat-short" error={errors.shortCode}>
                <Input id="cat-short" value={shortCode} maxLength={10} onChange={(e) => { setShortCode(e.target.value.toUpperCase()); setErrors({}); }} className={cn(fieldCls, 'uppercase')} autoFocus={!row} />
              </Field>
              <Field label="Ονομασία" required htmlFor="cat-name" error={errors.name}>
                <Input id="cat-name" value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setErrors({}); }} className={fieldCls} autoFocus={!!row} />
              </Field>
            </div>
            <RowHint>Ο αριθμός της κατηγορίας δίνεται αυτόματα (επόμενος ελεύθερος). Μετά την αποθήκευση γίνεται έλεγχος ότι το SoftOne την κράτησε.</RowHint>
          </FormSection>
        </DialogBody>
        <DialogFooter className="mx-0 mb-0 items-center gap-2 border-t border-border bg-card px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button size="sm" onClick={save} disabled={busy || !name.trim() || !shortCode.trim()}>
            {busy ? <FiLoader className="mr-1.5 size-3.5 animate-spin" /> : <FiCheck className="mr-1.5 size-3.5" />}
            {row ? 'Αποθήκευση' : 'Δημιουργία'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Ανοιγμένη γραμμή: τα είδη της κατηγορίας/ομάδας ─────────────────────────────────────────

function MembersPanel({ row }: { row: ClassificationRow }) {
  const [items, setItems] = React.useState<{ mtrl: number; code: string; name: string }[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState('');

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/classifications/members?kind=${row.kind}&sodtype=${row.sodtype}&code=${row.code}`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message ?? 'Αποτυχία φόρτωσης από το SoftOne');
      setItems(d.items);
    } catch (e) { setError((e as Error).message); }
  }, [row.kind, row.sodtype, row.code]);
  React.useEffect(() => { void load(); }, [load]);

  const tone = KIND[row.kind].tone;
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12)">
        <FiAlertTriangle className="size-4 text-destructive" aria-hidden /><span className="flex-1">{error}</span>
        <button type="button" onClick={load} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2.5 hover:bg-muted"><FiRefreshCw className="size-3.5" aria-hidden /> Δοκιμή ξανά</button>
      </div>
    );
  }
  if (!items) return <div className="h-24 animate-pulse rounded-md bg-muted motion-reduce:animate-none" aria-busy="true" aria-label="Φόρτωση" />;

  const n = q.trim().toLocaleLowerCase('el');
  const shown = n ? items.filter((i) => `${i.code} ${i.name}`.toLocaleLowerCase('el').includes(n)) : items;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm px-1.5 py-0.5 text-(length:--fs-11) font-semibold" style={{ color: tone, backgroundColor: soft(tone, 12) }}>
          {items.length} ενεργά {row.sodtype === 52 ? 'υπηρεσίες' : 'είδη'}
        </span>
        {items.length > 8 && (
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Φίλτρο (κωδικός, περιγραφή)…" className={cn(fieldCls, 'ml-auto w-full sm:w-64')} aria-label="Φίλτρο ειδών" />
        )}
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-(length:--fs-12) text-muted-foreground">Κανένα ενεργό {row.sodtype === 52 ? 'υπηρεσία' : 'είδος'} σε αυτή την {row.kind === 'CATEGORY' ? 'κατηγορία' : 'ομάδα'}.</p>
      ) : (
        <ul className="grid max-h-80 gap-x-4 overflow-y-auto rounded-md border border-border bg-card px-3 py-1 sm:grid-cols-2 lg:grid-cols-3">
          {shown.slice(0, 300).map((i) => (
            <li key={i.mtrl} className="flex min-w-0 items-baseline gap-2 border-b border-border/60 py-1.5 text-(length:--fs-12) last:border-0">
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{i.code}</span>
              <span className="truncate" title={i.name}>{i.name}</span>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 300 && <RowHint>Εμφανίζονται τα πρώτα 300 — χρησιμοποίησε το φίλτρο.</RowHint>}
    </div>
  );
}

// ── Μενού ενεργειών ─────────────────────────────────────────────────────────────────────────

function RowActions({ row, canManage, onEdit, onChanged }: { row: ClassificationRow; canManage: boolean; onEdit: () => void; onChanged: () => void }) {
  const isCat = row.kind === 'CATEGORY';
  const toggle = async () => {
    const activate = !row.isActive;
    if (!activate && !(await confirmAction({
      title: `Απενεργοποίηση «${row.name}»;`,
      message: 'Η κατηγορία δεν θα προσφέρεται σε νέα είδη. Γράφεται στο SoftOne· ενεργοποιείται ξανά από εδώ.',
      confirmLabel: 'Απενεργοποίηση', destructive: true,
    }))) return;
    try {
      await send(`/api/admin/classifications/categories/${row.sodtype}/${row.code}`, 'PATCH', { isActive: activate });
      toast.success(activate ? 'Η κατηγορία ενεργοποιήθηκε' : 'Η κατηγορία απενεργοποιήθηκε');
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${row.code} ${row.shortCode ?? ''} ${row.name}`.trim()); toast.success('Αντιγράφηκε'); } catch { toast.error('Δεν επετράπη η αντιγραφή'); }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground"
        aria-label={`Ενέργειες για ${row.name}`} onClick={(e) => e.stopPropagation()}
      >
        <FiMoreVertical className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="truncate text-(length:--fs-11) font-semibold text-muted-foreground">{KIND[row.kind].label} · {row.name}</DropdownMenuLabel>
        {canManage && isCat && (
          <>
            <DropdownMenuItem className={ITEM} onSelect={onEdit}><FiEdit3 className="size-3.5" style={{ color: KIND.CATEGORY.tone }} aria-hidden /> Μετονομασία / σύντμηση</DropdownMenuItem>
            <DropdownMenuItem className={ITEM} onSelect={toggle} disabled={row.isActive && (row.itemCount ?? 0) > 0}>
              {row.isActive ? <><FiSlash className="size-3.5" aria-hidden /> Απενεργοποίηση{(row.itemCount ?? 0) > 0 ? ' (έχει είδη)' : ''}</> : <><FiCheck className="size-3.5" style={{ color: '#047857' }} aria-hidden /> Ενεργοποίηση</>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {!isCat && (
          <>
            <DropdownMenuItem className="gap-2 text-(length:--fs-11) leading-snug" disabled>
              <FiLock className="size-3.5 shrink-0" aria-hidden /> Οι ομάδες αλλάζουν μόνο στο SoftOne — μετά «Συγχρονισμός»
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem className={ITEM} onSelect={copy}><FiCopy className="size-3.5" aria-hidden /> Αντιγραφή κωδικού</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Πίνακας ─────────────────────────────────────────────────────────────────────────────────

type KindFilter = 'all' | 'CATEGORY' | 'GROUP';
type RegFilter = 'all' | 51 | 52;

export function ClassificationsTableClient({
  rows, membersError, canManage, lastSync,
}: {
  rows: ClassificationRow[]; membersError: string | null; canManage: boolean; lastSync: string | null;
}) {
  const router = useRouter();
  const [kind, setKind] = React.useState<KindFilter>('all');
  const [reg, setReg] = React.useState<RegFilter>('all');
  const [showInactive, setShowInactive] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [dialog, setDialog] = React.useState<{ row: ClassificationRow | null } | null>(null);

  const data = React.useMemo(() => rows.filter((r) =>
    (kind === 'all' || r.kind === kind) && (reg === 'all' || r.sodtype === reg) && (showInactive || r.isActive),
  ), [rows, kind, reg, showInactive]);
  const inactive = rows.filter((r) => !r.isActive).length;
  const count = (k: KindFilter, s: RegFilter) => rows.filter((r) => (k === 'all' || r.kind === k) && (s === 'all' || r.sodtype === s) && (showInactive || r.isActive)).length;

  const sync = async () => {
    setBusy(true);
    const res = await fetch('/api/admin/classifications/sync', { method: 'POST' });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      toast.success(`Συγχρονισμός: νέες ${d.created}, ενημερώσεις ${d.updated}${d.deactivated ? `, ανενεργές ${d.deactivated}` : ''}`);
      router.refresh();
    } else {
      toast.error(syncErrorMessage(await res.json().catch(() => ({})), 'Αποτυχία συγχρονισμού'));
    }
  };

  const columns = React.useMemo<ColumnDef<ClassificationRow>[]>(() => [
    {
      accessorKey: 'name', header: 'Ονομασία', size: 300,
      cell: ({ row }) => {
        const r = row.original;
        const k = KIND[r.kind];
        const Icon = k.icon;
        return (
          <div className={cn('flex min-w-0 items-center gap-2', !r.isActive && 'opacity-60')}>
            <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md [&_svg]:size-3.5" style={{ color: k.tone, backgroundColor: soft(k.tone, 12) }}><Icon /></span>
            <div className="min-w-0">
              <div className="truncate text-(length:--fs-12) font-medium">{r.name}</div>
              <div className="truncate text-(length:--fs-11) text-muted-foreground">{k.label} {REG[r.sodtype]?.label.toLocaleLowerCase('el')}</div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'code', header: 'Κωδ.', size: 70,
      cell: ({ row }) => <span className="font-mono tabular-nums text-(length:--fs-12) text-muted-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'shortCode', header: 'Σύντμηση', size: 115,
      cell: ({ row }) => (row.original.shortCode ? <span className="font-mono text-(length:--fs-12)">{row.original.shortCode}</span> : DASH),
    },
    {
      id: 'register', accessorFn: (r) => REG[r.sodtype]?.label ?? '', header: 'Μητρώο', size: 100,
      cell: ({ row }) => {
        const g = REG[row.original.sodtype];
        return g ? <span className="inline-flex rounded-sm px-1.5 py-0.5 text-(length:--fs-11) font-medium" style={{ color: g.tone, backgroundColor: soft(g.tone, 12) }}>{g.label}</span> : DASH;
      },
    },
    {
      accessorKey: 'itemCount', header: 'Είδη', size: 70,
      cell: ({ row }) => (row.original.itemCount == null ? DASH : (
        <span className={cn('tabular-nums text-(length:--fs-12)', !row.original.itemCount && 'text-muted-foreground')}>{row.original.itemCount.toLocaleString('el-GR')}</span>
      )),
    },
    {
      accessorKey: 'isActive', header: 'Ενεργή', size: 95,
      cell: ({ row }) => (row.original.isActive
        ? <span className="inline-flex items-center gap-1 text-(length:--fs-12)" style={{ color: '#047857' }}><FiCheck className="size-3.5" aria-hidden /> Ναι</span>
        : <span className="inline-flex items-center gap-1 text-(length:--fs-12) text-muted-foreground"><FiSlash className="size-3.5" aria-hidden /> Όχι</span>),
    },
    {
      id: 'actions', header: () => <span className="sr-only">Ενέργειες</span>, size: 44,
      enableSorting: false, enableHiding: false, enableResizing: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActions row={row.original} canManage={canManage} onEdit={() => setDialog({ row: row.original })} onChanged={() => router.refresh()} />
        </div>
      ),
    },
  ], [canManage, router]);

  const chip = (active: boolean) => cn(
    'inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-(length:--fs-11) font-medium transition',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground',
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {([['all', 'Όλες'], ['CATEGORY', 'Κατηγορίες'], ['GROUP', 'Ομάδες']] as const).map(([k, l]) => (
        <button key={k} type="button" className={chip(kind === k)} aria-pressed={kind === k} onClick={() => setKind(k)}>{l} <span className="tabular-nums opacity-70">{count(k, reg)}</span></button>
      ))}
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      {([['all', 'Όλα τα μητρώα'], [51, 'Είδη'], [52, 'Υπηρεσίες']] as const).map(([s, l]) => (
        <button key={s} type="button" className={chip(reg === s)} aria-pressed={reg === s} onClick={() => setReg(s)}>{l}</button>
      ))}
      {inactive > 0 && (
        <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 px-1 text-(length:--fs-11) text-muted-foreground">
          <input type="checkbox" className="size-3.5 accent-[#0369A1]" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Ανενεργές ({inactive})
        </label>
      )}
      {canManage && (
        <>
          <Button variant="secondary" size="sm" onClick={sync} disabled={busy}>
            <FiRefreshCw className={cn('mr-1.5 size-3.5', busy && 'animate-spin')} /> {busy ? 'Συγχρονισμός…' : 'Συγχρονισμός'}
          </Button>
          <Button size="sm" onClick={() => setDialog({ row: null })}><FiPlus className="mr-1.5 size-3.5" aria-hidden /> Νέα κατηγορία</Button>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      {membersError && (
        <p role="alert" className="rounded-md border border-amber-500/30 bg-amber-50/70 px-3 py-2 text-(length:--fs-12) text-amber-900 dark:bg-amber-500/10 dark:text-amber-300">
          Δεν διαβάστηκαν τα είδη από το SoftOne ({membersError}) — το πλήθος ειδών δεν εμφανίζεται.
        </p>
      )}
      <DataTable
        columns={columns}
        data={data}
        searchKey="name"
        filterAllColumns
        searchPlaceholder="Αναζήτηση (ονομασία, σύντμηση…)"
        persistKey="admin.classifications.table.v1"
        toolbar={toolbar}
        pageSize={50}
        growColumnId="name"
        responsiveHide={['isActive', 'shortCode', 'register', 'code']}
        expandable={(r) => <MembersPanel row={r} />}
        emptyState={<p className="py-8 text-center text-(length:--fs-13) text-muted-foreground">{rows.length ? 'Καμία εγγραφή με αυτά τα φίλτρα.' : 'Δεν υπάρχουν εγγραφές. Πάτησε «Συγχρονισμός».'}</p>}
      />
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-(length:--fs-11) text-muted-foreground">
        <span className="inline-flex items-center gap-1"><FiLock className="size-3" aria-hidden /> Οι ομάδες είναι μόνο για ανάγνωση: η εγγραφή τους μέσω Web Services δεν είναι ασφαλής σε αυτή την εγκατάσταση.</span>
        {lastSync && <span>Τελευταίος συγχρονισμός: {new Date(lastSync).toLocaleString('el-GR')}</span>}
      </p>
      {canManage && <CategoryDialog open={dialog != null} onOpenChange={(o) => { if (!o) setDialog(null); }} row={dialog?.row ?? null} onSaved={() => router.refresh()} />}
    </div>
  );
}
