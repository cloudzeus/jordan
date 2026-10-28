'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  FiAlertTriangle, FiAward, FiEdit2, FiLoader, FiMoreVertical, FiPackage, FiPlus, FiRefreshCw, FiSearch, FiTag, FiTool,
} from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, fieldCls, RowHint } from '@/components/admin/form-kit';
import { cn } from '@/lib/utils';
import { PRODUCT_TABS, type ProductDataRow, type ProductTab } from '@/lib/product-data-core';
import { createCategoryAction, syncProductDataAction, updateCategoryAction } from './actions';

const ICON: Record<ProductTab, React.ReactNode> = {
  brands: <FiAward className="size-3.5" aria-hidden />,
  manufacturers: <FiTool className="size-3.5" aria-hidden />,
  categories: <FiTag className="size-3.5" aria-hidden />,
  groups: <FiPackage className="size-3.5" aria-hidden />,
};
/** Γιατί δεν γράφεται το μητρώο (βλ. lib/product-data.ts) — φαίνεται πάνω από τη λίστα. */
const READ_ONLY_WHY: Partial<Record<ProductTab, string>> = {
  brands: 'Οι μάρκες διαβάζονται από το SoftOne. Η εγγραφή τους (αντικείμενο «$ITEMARK») δεν έχει επιβεβαιωθεί ακόμη ελεγχόμενα — νέα μάρκα προστίθεται από το SoftOne.',
  manufacturers: 'Οι κατασκευαστές διαβάζονται από το SoftOne. Η εγγραφή τους (αντικείμενο «$MTRMANFCTR») δεν έχει επιβεβαιωθεί ακόμη ελεγχόμενα — νέος κατασκευαστής προστίθεται από το SoftOne.',
  groups: 'Οι ομάδες ΔΕΝ γράφονται από την εφαρμογή: σε δοκιμή σε ζωντανό SoftOne το setData έσβησε γραμμή ομάδας. Αλλαγές μόνο από το SoftOne.',
};
const SODTYPE_LABEL: Record<number, string> = { 51: 'Είδη', 52: 'Υπηρεσίες' };
const dt = (s: string | null) => (s ? new Date(s).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export function ProductDataClient({ rows, membersError, canManage, lastSync, initialTab }: {
  rows: Record<ProductTab, ProductDataRow[]>; membersError: string | null; canManage: boolean;
  lastSync: string | null; initialTab: ProductTab;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<ProductTab>(initialTab);
  const [syncing, setSyncing] = React.useState(false);

  const sync = async () => {
    setSyncing(true);
    const r = await syncProductDataAction();
    setSyncing(false);
    if (!r.ok) { toast.error(r.message); return; }
    const { classifications: c, lookups: l, notAnswered } = r.data;
    toast.success(`Συγχρονίστηκαν · ${l.brands} μάρκες, ${l.manufacturers} κατασκευαστές, ${c.created + c.updated} κατηγορίες & ομάδες`);
    if (notAnswered.length) toast.warning(`Δεν απάντησαν: ${notAnswered.join(', ')} — τα μητρώα τους έμειναν ως είχαν`, { duration: 10_000 });
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-(length:--fs-12) text-muted-foreground">
          Τελευταίος συγχρονισμός: <span className="font-medium text-foreground tabular-nums">{dt(lastSync)}</span> · μόνο ανάγνωση από το SoftOne
        </p>
        {canManage && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void sync()} disabled={syncing} aria-busy={syncing}>
            {syncing ? <FiLoader className="size-3.5 animate-spin" aria-hidden /> : <FiRefreshCw className="size-3.5" aria-hidden />}
            Συγχρονισμός από SoftOne
          </Button>
        )}
      </div>

      {membersError && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-(length:--fs-12) text-amber-900">
          <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Το SoftOne δεν απάντησε για τα είδη — οι στήλες «Είδη» είναι κενές. Τα μητρώα φαίνονται κανονικά. ({membersError})
        </p>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as ProductTab)}>
        <TabsList className="flex-wrap">
          {PRODUCT_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
              {ICON[t.key]}{t.label}
              <span className="rounded bg-muted px-1 text-(length:--fs-11) tabular-nums text-muted-foreground">{rows[t.key].length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {PRODUCT_TABS.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <RegistryTable
              tab={t.key} table={t.table} rows={rows[t.key]} canManage={canManage && t.editable}
              readOnlyWhy={t.editable ? null : READ_ONLY_WHY[t.key] ?? null}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/** Ένα μητρώο: αναζήτηση, μία γραμμή ανά εγγραφή, ενέργειες στο ⋮ (μόνο όπου γράφεται). */
function RegistryTable({ tab, table, rows, canManage, readOnlyWhy }: {
  tab: ProductTab; table: string; rows: ProductDataRow[]; canManage: boolean; readOnlyWhy: string | null;
}) {
  const [q, setQ] = React.useState('');
  const [sodtype, setSodtype] = React.useState<number | null>(null);
  const [editing, setEditing] = React.useState<ProductDataRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const hasSodtype = rows.some((r) => r.sodtype != null);

  const s = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => sodtype == null || r.sodtype === sodtype)
    .filter((r) => !s || [r.name, r.shortCode, String(r.code)].some((v) => v?.toLowerCase().includes(s)));
  const used = shown.reduce((n, r) => n + (r.itemCount ?? 0), 0);

  return (
    <div className="space-y-2">
      {readOnlyWhy && <RowHint tone="warn">{readOnlyWhy}</RowHint>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ονομασία, σύντμηση ή κωδικός…" aria-label={`Αναζήτηση — ${table}`} className="h-8 pl-8 text-(length:--fs-13)" />
        </div>
        {hasSodtype && (
          <div role="radiogroup" aria-label="Είδη ή υπηρεσίες" className="inline-flex gap-1 rounded-lg bg-muted p-1">
            {[null, 51, 52].map((v) => (
              <button key={String(v)} type="button" role="radio" aria-checked={sodtype === v} onClick={() => setSodtype(v)}
                className={cn('min-h-7 cursor-pointer rounded-md px-2.5 text-(length:--fs-12) font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                  sodtype === v ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
                {v == null ? 'Όλα' : SODTYPE_LABEL[v]}
              </button>
            ))}
          </div>
        )}
        <span className="text-(length:--fs-12) tabular-nums text-muted-foreground" aria-live="polite">
          {shown.length} εγγραφές{used > 0 ? ` · ${used} είδη` : ''}
        </span>
        {canManage && (
          <Button size="sm" className="ml-auto h-8 gap-1.5" onClick={() => setCreating(true)}><FiPlus className="size-3.5" aria-hidden /> Νέα κατηγορία</Button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-(length:--fs-13) text-muted-foreground">
          {rows.length ? 'Καμία εγγραφή με αυτά τα κριτήρια.' : `Το μητρώο ${table} είναι άδειο — πατήστε «Συγχρονισμός από SoftOne».`}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          <li className="hidden items-center gap-3 bg-muted/50 px-3 py-1.5 text-(length:--fs-11) font-medium text-muted-foreground sm:flex" aria-hidden>
            <span className="w-12 text-right">Κωδ.</span>
            <span className="w-24">Σύντμηση</span>
            <span className="min-w-0 flex-1">Ονομασία</span>
            {hasSodtype && <span className="w-20">Τύπος</span>}
            <span className="w-16 text-right">Είδη</span>
            <span className="w-9" />
          </li>
          {shown.map((r) => (
            <li key={`${r.sodtype ?? ''}:${r.code}`} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 hover:bg-muted/40', !r.isActive && 'opacity-60')}>
              <span className="w-12 shrink-0 text-right font-mono text-(length:--fs-12) text-muted-foreground tabular-nums">{r.code}</span>
              <span className="w-24 shrink-0 truncate font-mono text-(length:--fs-12)" title={r.shortCode ?? undefined}>{r.shortCode ?? '—'}</span>
              <span className="min-w-0 flex-1 basis-40 truncate text-(length:--fs-13) font-medium" title={r.name}>
                {r.name}
                {!r.isActive && <span className="ml-1.5 rounded bg-muted px-1 text-(length:--fs-11) font-normal text-muted-foreground">ανενεργή</span>}
              </span>
              {hasSodtype && <span className="w-20 shrink-0 text-(length:--fs-12) text-muted-foreground">{r.sodtype != null ? SODTYPE_LABEL[r.sodtype] ?? r.sodtype : '—'}</span>}
              <span className="w-16 shrink-0 text-right text-(length:--fs-12) tabular-nums">{r.itemCount == null ? '—' : r.itemCount || <span className="text-muted-foreground">0</span>}</span>
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label={`Ενέργειες για «${r.name}»`}
                    className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                    <FiMoreVertical className="size-4" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem className="cursor-pointer gap-2 text-(length:--fs-12)" onSelect={() => setEditing(r)}>
                      <FiEdit2 className="size-3.5" aria-hidden /> Ονομασία & κατάσταση…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : <span className="w-8 shrink-0" />}
            </li>
          ))}
        </ul>
      )}

      {tab === 'categories' && (
        <>
          <CategoryDialog open={creating} onOpenChange={setCreating} />
          <CategoryDialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }} row={editing} />
        </>
      )}
    </div>
  );
}

/**
 * Νέα ή αλλαγή εμπορικής κατηγορίας. ΓΡΑΦΕΙ στο SoftOne — το λέει ρητά και στο κουμπί.
 */
function CategoryDialog({ open, onOpenChange, row }: { open: boolean; onOpenChange: (o: boolean) => void; row?: ProductDataRow | null }) {
  const router = useRouter();
  const edit = !!row;
  const [sodtype, setSodtype] = React.useState(51);
  const [shortCode, setShortCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [prev, setPrev] = React.useState(false);
  if (open !== prev) {
    setPrev(open);
    if (open) {
      setErr(null); setBusy(false);
      setSodtype(row?.sodtype ?? 51);
      setShortCode(row?.shortCode ?? '');
      setName(row?.name ?? '');
      setIsActive(row?.isActive ?? true);
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = edit && row
      ? await updateCategoryAction(row.sodtype ?? 51, row.code, { shortCode, name, isActive })
      : await createCategoryAction({ sodtype, shortCode, name });
    setBusy(false);
    if (!r.ok) { setErr(r.message); return; }
    toast.success(edit ? 'Η κατηγορία ενημερώθηκε στο SoftOne' : 'Η κατηγορία δημιουργήθηκε στο SoftOne');
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{edit ? 'Εμπορική κατηγορία' : 'Νέα εμπορική κατηγορία'}</DialogTitle>
            <DialogDescription>
              {edit ? `Κωδικός ${row?.code} — η αλλαγή γράφεται στο SoftOne.` : 'Η κατηγορία δημιουργείται στο SoftOne με τον επόμενο ελεύθερο κωδικό.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {!edit && (
              <Field label="Αφορά" htmlFor="pd-sodtype">
                <div role="radiogroup" aria-label="Αφορά" className="inline-flex gap-1 rounded-lg bg-muted p-1">
                  {[51, 52].map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={sodtype === v} onClick={() => setSodtype(v)}
                      className={cn('min-h-8 cursor-pointer rounded-md px-3 text-(length:--fs-12) font-medium',
                        sodtype === v ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
                      {SODTYPE_LABEL[v]}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Σύντμηση" required htmlFor="pd-short">
              <Input id="pd-short" value={shortCode} onChange={(e) => setShortCode(e.target.value)} className={fieldCls} maxLength={10} autoFocus />
            </Field>
            <Field label="Ονομασία" required htmlFor="pd-name">
              <Input id="pd-name" value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} maxLength={100} />
            </Field>
            {edit && (
              <label className="flex cursor-pointer items-center gap-2 text-(length:--fs-13)">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-(--primary)" />
                Ενεργή
              </label>
            )}
            {err && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12) text-destructive">{err}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
            <Button type="submit" disabled={busy || !shortCode.trim() || !name.trim()} aria-busy={busy} className="gap-1.5">
              {busy && <FiLoader className="size-3.5 animate-spin" aria-hidden />}
              {edit ? 'Αποθήκευση στο SoftOne' : 'Δημιουργία στο SoftOne'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
