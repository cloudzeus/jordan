'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { FiRefreshCw, FiEdit2, FiSlash, FiHash, FiAlertTriangle, FiMoreVertical, FiEdit3, FiCopy, FiTool } from 'react-icons/fi';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ItemEditDialog } from '@/components/admin/item-edit-dialog';
import { ItemExpandPanel } from '@/components/admin/item-expand-panel';
import { InstallGuideDialog } from '@/components/admin/item-media/install-guide-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FormSection, RowHint, fieldCls } from '@/components/admin/form-kit';
import { DataTable } from '@/components/ui/data-table';
import { syncErrorMessage } from '@/lib/softone-sync/sync-error';

import { MultiSelectCombo, type MultiGroup } from '@/components/ui/multi-select-combo';
import { filterByItemGroups, itemGroupColor, itemGroupFilterOptions } from '@/lib/item-groups';

/** Ομάδα του είδους (πρόταση ή ανατεθειμένη) — lib/item-groups.ts. */
export type ItemGroupTag = { key: string; name: string; path: string; status: string; review: boolean };

export type ItemRecord = {
  mtrl: number;
  code: string;
  code1: string | null;
  code2: string | null;
  name: string;
  name2: string | null;
  price: number | null;
  isService: boolean;
  isActive?: boolean;
  /** Μικρογραφία της κύριας φωτογραφίας (ItemMedia) — αν υπάρχει. */
  thumbUrl?: string | null;
  /** Υπόλοιπα ανά αποθήκη (καθρέφτης SoftoneStock) — μόνο είδη. */
  stock?: Record<string, number>;
  /** Ομάδα κατηγοριοποίησης (ιεραρχία ομάδων) — null αν δεν υπάρχει πρόταση. */
  group?: ItemGroupTag | null;
};

/** Μικρό badge ομάδας: χρώμα του κλάδου· διακεκομμένο περίγραμμα όσο είναι μόνο πρόταση. */
function GroupBadge({ g }: { g: ItemGroupTag }) {
  const color = itemGroupColor(g.key);
  const applied = g.status === 'APPLIED';
  return (
    <span
      title={`${g.path}${applied ? '' : ' · πρόταση (δεν έχει περάσει στο SoftOne)'}${g.review ? ' · θέλει έλεγχο' : ''}`}
      className={cn('inline-flex max-w-full items-center gap-1 truncate rounded-full border px-1.5 py-px text-[length:var(--fs-10)] font-medium leading-tight', !applied && 'border-dashed')}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} ${applied ? 14 : 7}%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate">{g.name}</span>
    </span>
  );
}

const qtyFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 3 });
/** Ποσότητα: 0 αχνό, αρνητικό κόκκινο με σύμβολο (όχι μόνο χρώμα). */
function Qty({ v, strong }: { v: number; strong?: boolean }) {
  if (v === 0) return <span className="block text-right tabular-nums text-muted-foreground">0</span>;
  return (
    <span className={cn('block text-right tabular-nums', v < 0 ? 'font-semibold text-destructive' : strong ? 'font-semibold text-foreground' : 'text-foreground')}>
      {qtyFmt.format(v)}
    </span>
  );
}

/**
 * Διόρθωση ΥΠΑΡΧΟΥΣΑΣ εγγραφής στο SoftOne: νέος κωδικός ή αδρανοποίηση. Ποτέ διαγραφή — η
 * αδρανοποίηση αναιρείται από το SoftOne, η διαγραφή όχι.
 */
function ItemActions({ row, onDone }: { row: ItemRecord; onDone: () => void }) {
  const [mode, setMode] = React.useState<'code' | 'deactivate' | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [guide, setGuide] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const openCode = async () => {
    setMode('code');
    setCode('');
    // Πρόταση από την αρίθμηση της εγκατάστασης — ο χρήστης μπορεί να γράψει άλλον.
    const r = await fetch(`/api/admin/ocr/new-items/next-code?kind=${row.isService ? 'service' : 'product'}`).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    if (d?.code) setCode((c) => c || String(d.code));
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/softone/items/${row.mtrl}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'code' ? { code } : { deactivate: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d.message ?? 'Η ενημέρωση απέτυχε.'); return; }
      toast.success(mode === 'code'
        ? `Νέος κωδικός ${d.after.code} (ήταν ${d.before.code}) — επαληθεύτηκε στο SoftOne.`
        : `Η εγγραφή ${d.before.code} αδρανοποιήθηκε στο SoftOne.`);
      setMode(null);
      onDone();
    } catch {
      toast.error('Σφάλμα δικτύου — δεν έγινε καμία αλλαγή.');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex justify-end gap-1">
      {/* Οι ενέργειες διαχείρισης ζουν ΠΑΝΤΑ σε dropdown (κανόνας του project). */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
          aria-label={`Ενέργειες για ${row.code}`}
        >
          <FiMoreVertical className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate text-[length:var(--fs-11)] font-semibold text-muted-foreground">{row.code} · {row.name}</DropdownMenuLabel>
          <DropdownMenuItem className="cursor-pointer gap-2 text-[length:var(--fs-12)]" onSelect={() => setEditing(true)}>
            <FiEdit3 className="size-3.5" aria-hidden /> Επεξεργασία στοιχείων
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer gap-2 text-[length:var(--fs-12)]" onSelect={() => setGuide(true)}>
            <FiTool className="size-3.5 text-amber-700 dark:text-amber-400" aria-hidden /> Οδηγίες εγκατάστασης
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer gap-2 text-[length:var(--fs-12)]" onSelect={() => void openCode()}>
            <FiEdit2 className="size-3.5" aria-hidden /> Αλλαγή κωδικού
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-[length:var(--fs-12)]"
            onSelect={() => { navigator.clipboard.writeText(row.code).then(() => toast.success(`Αντιγράφηκε ο κωδικός ${row.code}`), () => toast.error('Δεν επετράπη η αντιγραφή')); }}
          >
            <FiCopy className="size-3.5" aria-hidden /> Αντιγραφή κωδικού
          </DropdownMenuItem>
          {row.isActive !== false && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2 text-[length:var(--fs-12)]" onSelect={() => setMode('deactivate')}>
                <FiSlash className="size-3.5" aria-hidden /> Αδρανοποίηση
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ItemEditDialog mtrl={editing ? row.mtrl : null} open={editing} onOpenChange={setEditing} onSaved={onDone} />
      {guide && <InstallGuideDialog mtrl={row.mtrl} open={guide} onOpenChange={setGuide} canManage />}
      <Dialog open={mode !== null} onOpenChange={(o) => { if (!o && !busy) setMode(null); }}>
        <DialogContent className="w-[95vw] gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-2.5 pr-12">
            <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4',
              mode === 'deactivate' ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300' : 'bg-sisyphus-50 text-sisyphus-600 dark:bg-sisyphus-500/15')}>
              {mode === 'deactivate' ? <FiSlash /> : <FiEdit2 />}
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[length:var(--fs-15)]">{mode === 'code' ? 'Αλλαγή κωδικού' : 'Αδρανοποίηση εγγραφής'}</DialogTitle>
              <DialogDescription className="truncate text-[length:var(--fs-11)]" title={`${row.code} — ${row.name}`}>
                {row.code} — {row.name}
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="space-y-3 bg-muted/20 px-4 py-3">
            {mode === 'code' ? (
              <FormSection tone="amber" icon={<FiHash />} title="Κωδικός">
                <div className="grid grid-cols-12 gap-x-3 gap-y-2">
                  <Field label="Τρέχων" className="col-span-5">
                    <div className={cn(fieldCls, 'flex items-center truncate rounded-lg border border-border bg-muted/50 px-2.5 font-mono text-muted-foreground')}>{row.code || '—'}</div>
                  </Field>
                  <Field label="Νέος κωδικός" required htmlFor={`item-code-${row.mtrl}`} className="col-span-7">
                    <Input id={`item-code-${row.mtrl}`} value={code} onChange={(e) => setCode(e.target.value)} autoFocus
                      className={cn(fieldCls, 'font-mono')} />
                  </Field>
                </div>
                <RowHint>Ελέγχεται η μάσκα και η μοναδικότητα σε όλο το μητρώο. Οι γραμμές παραστατικών μένουν συνδεδεμένες.</RowHint>
              </FormSection>
            ) : (
              <div role="note" className="flex gap-2.5 rounded-lg border border-red-500/25 bg-red-50/60 px-3 py-2.5 dark:bg-red-500/10">
                <FiAlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-300" />
                <p className="text-[length:var(--fs-13)] text-foreground">
                  Η εγγραφή θα γίνει <strong>ανενεργή</strong> στο SoftOne και δεν θα προτείνεται για νέες γραμμές. Δεν διαγράφεται:
                  αν χρειαστεί, ενεργοποιείται ξανά από το SoftOne.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="mx-0 mb-0 gap-2 border-t border-border bg-card px-4 py-2.5">
            <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>Άκυρο</Button>
            <Button onClick={submit} disabled={busy || (mode === 'code' && !code.trim())}
              variant={mode === 'deactivate' ? 'destructive' : 'default'}>
              {busy ? 'Αποστολή…' : mode === 'code' ? 'Αλλαγή στο SoftOne' : 'Αδρανοποίηση'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const DASH = <span className="text-muted-foreground/40">—</span>;
const mono = (v: string | null) =>
  v ? <span className="font-mono text-[length:var(--fs-12)] tabular-nums text-muted-foreground">{v}</span> : DASH;

function fmtPrice(n: number | null) {
  if (n == null || n === 0) return DASH;
  return <span className="tabular-nums">{new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(n)}</span>;
}

export function ItemsTableClient({
  rows,
  variant,
  canManage,
  lastSync,
  warehouses = [],
}: {
  rows: ItemRecord[];
  variant: 'products' | 'services';
  canManage: boolean;
  lastSync: string | null;
  /** Μία στήλη υπολοίπου ανά αποθήκη + «Σύνολο» (μόνο στα είδη). */
  warehouses?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  // Φίλτρο κατηγοριών (multi-select): φύλλα του δέντρου ομάδων + «Χωρίς κατηγορία».
  const [groupFilter, setGroupFilter] = React.useState<string[]>([]);
  const kind = variant === 'services' ? 'service' : 'item';
  const groupOptions = React.useMemo<MultiGroup[]>(() => itemGroupFilterOptions(rows, kind), [rows, kind]);
  const shownRows = React.useMemo(() => filterByItemGroups(rows, groupFilter), [rows, groupFilter]);

  const sync = async () => {
    setBusy(true);
    const res = await fetch('/api/admin/metadata/sync-items-softone', { method: 'POST' });
    // Στα είδη ανανεώνονται μαζί και τα υπόλοιπα αποθηκών — αλλιώς οι στήλες δείχνουν παλιές ποσότητες.
    const stock = res.ok && variant === 'products'
      ? await fetch('/api/admin/metadata/sync-stock-softone', { method: 'POST' }).then((r) => r.json().then((b) => ({ ok: r.ok, b }))).catch(() => null)
      : null;
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      const extra = stock?.ok ? ` · υπόλοιπα για ${Number(stock.b.items ?? 0).toLocaleString('el-GR')} είδη` : stock ? ' · τα υπόλοιπα δεν ανανεώθηκαν' : '';
      toast.success(`Συγχρονίστηκαν ${d.products.toLocaleString('el-GR')} είδη + ${d.services.toLocaleString('el-GR')} υπηρεσίες${extra}`);
      router.refresh();
    } else {
      const e = await res.json().catch(() => ({}));
      toast.error(syncErrorMessage(e, 'Αποτυχία συγχρονισμού'));
    }
  };

  const columns = React.useMemo<ColumnDef<ItemRecord>[]>(() => {
    const base: ColumnDef<ItemRecord>[] = [
      {
        accessorKey: 'code', header: 'Κωδικός', size: 130,
        cell: ({ row }) => <span className="font-mono text-[length:var(--fs-12)] tabular-nums text-foreground">{row.original.code || '—'}</span>,
      },
      {
        accessorKey: 'name', header: 'Περιγραφή', size: 320,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            {row.original.thumbUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={row.original.thumbUrl} alt="" loading="lazy" className="size-7 shrink-0 rounded border border-border object-cover" />
              : <span aria-hidden className="size-7 shrink-0 rounded border border-dashed border-border bg-muted/40" />}
          <div className="min-w-0">
            <div className="font-medium text-foreground text-[length:var(--fs-12)] truncate">
              {row.original.name || '—'}
              {row.original.isActive === false && <span className="ml-1.5 rounded bg-muted px-1.5 py-px text-[length:var(--fs-10)] font-semibold text-muted-foreground">ανενεργό</span>}
            </div>
            {row.original.name2 && <div className="text-[length:var(--fs-10)] text-muted-foreground truncate">{row.original.name2}</div>}
            {row.original.group && <div className="mt-0.5 flex min-w-0"><GroupBadge g={row.original.group} /></div>}
          </div>
          </div>
        ),
      },
    ];
    // EAN + factory code only matter for products.
    if (variant === 'products') {
      base.push(
        { accessorKey: 'code1', header: 'Barcode / EAN', size: 150, cell: ({ row }) => mono(row.original.code1) },
        { accessorKey: 'code2', header: 'Κωδ. εργοστασίου', size: 160, cell: ({ row }) => mono(row.original.code2) },
      );
    }
    if (variant === 'products' && warehouses.length > 0) {
      for (const w of warehouses) {
        base.push({
          id: `wh_${w.id}`, header: () => <span className="block text-right" title={w.name}>{w.name}</span>, size: 110,
          accessorFn: (r) => r.stock?.[w.id] ?? 0,
          cell: ({ row }) => <Qty v={row.original.stock?.[w.id] ?? 0} />,
        });
      }
      base.push({
        id: 'stockTotal', header: () => <span className="block text-right">Σύνολο</span>, size: 100,
        accessorFn: (r) => Object.values(r.stock ?? {}).reduce((a, b) => a + b, 0),
        cell: ({ row }) => <Qty v={Object.values(row.original.stock ?? {}).reduce((a, b) => a + b, 0)} strong />,
      });
    }
    base.push({
      accessorKey: 'price', header: () => <span className="block text-right">Τιμή λιανικής</span>, size: 130,
      cell: ({ row }) => <span className="block text-right">{fmtPrice(row.original.price)}</span>,
    });
    if (canManage) {
      base.push({
        id: 'actions', header: () => <span className="sr-only">Ενέργειες</span>, size: 48, enableSorting: false,
        cell: ({ row }) => <ItemActions row={row.original} onDone={() => router.refresh()} />,
      });
    }
    return base;
  }, [variant, canManage, router, warehouses]);

  // Μπάρα: φίλτρο κατηγοριών δίπλα στην αναζήτηση, πλήθος όταν υπάρχει φίλτρο, συγχρονισμός στο τέλος.
  const toolbar = (
    <>
      {groupOptions.length > 0 && (
        <MultiSelectCombo id={`items-groups-${variant}`} label="Κατηγορία" groups={groupOptions} value={groupFilter} onChange={setGroupFilter} placeholder="Όλες" className="max-w-[18rem]" />
      )}
      {groupFilter.length > 0 && (
        <span className="text-[length:var(--fs-12)] tabular-nums text-muted-foreground">
          {shownRows.length.toLocaleString('el-GR')} από {rows.length.toLocaleString('el-GR')}
        </span>
      )}
      {canManage && (
        <Button variant="secondary" size="sm" onClick={sync} disabled={busy} title="Συγχρονισμός ειδών και υπολοίπων από SoftOne">
          <FiRefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
          <span className="hidden md:inline">{busy ? 'Συγχρονισμός…' : 'Συγχρονισμός'}</span>
        </Button>
      )}
    </>
  );

  return (
    <div className="space-y-2">
      <DataTable
        columns={columns}
        data={shownRows}
        searchKey="name"
        searchPlaceholder="Αναζήτηση (κωδικός, EAN, εργοστασίου, περιγραφή…)"
        persistKey={`admin.${variant}.table.v1`}
        toolbar={toolbar}
        // Ανοιγμένη γραμμή: Info (υπόλοιπα, στοιχεία) · Media · Αγορές.
        expandable={(r) => <ItemExpandPanel mtrl={r.mtrl} canManage={canManage} isService={r.isService} />}
        pageSize={50}
      />
      {lastSync && (
        <p className="text-[length:var(--fs-11)] text-muted-foreground">
          Τελευταίος συγχρονισμός: {new Date(lastSync).toLocaleString('el-GR')}
        </p>
      )}
    </div>
  );
}
