'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import {
  FiRefreshCw, FiPlus, FiMoreVertical, FiEdit3, FiSlash, FiCheck, FiCopy, FiMaximize2, FiLoader, FiAlertTriangle, FiFileText,
  FiImage, FiUpload, FiCpu, FiTrash2,
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
import { Field, FormSection, FormSelect, RowHint, fieldCls } from '@/components/admin/form-kit';
import { syncErrorMessage } from '@/lib/softone-sync/sync-error';
import type { UnitRow } from '@/lib/units';
import { inferUnitVisual, UnitThumb, UNIT_VISUAL_LABEL } from '@/components/admin/unit-visual';

const DASH = <span className="text-muted-foreground/40">—</span>;
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const TONE = '#0369A1';
const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';
const ROLE: Record<string, { label: string; tone: string }> = {
  base: { label: 'Βασική', tone: '#0369A1' }, buy: { label: 'Αγορών', tone: '#B45309' }, sell: { label: 'Πώλησης', tone: '#047857' },
};
// Ίδιος πίνακας με το lib/units (MYDATA_UNITS) — εδώ για τη φόρμα του client.
const MYDATA_OPTS = [
  { id: '1', name: '1 · Τεμάχια' }, { id: '2', name: '2 · Κιλά' }, { id: '3', name: '3 · Λίτρα' }, { id: '4', name: '4 · Μέτρα' },
  { id: '5', name: '5 · Τετραγωνικά μέτρα' }, { id: '6', name: '6 · Κυβικά μέτρα' }, { id: '7', name: '7 · Τεμάχια (λοιπές περιπτώσεις)' },
];
const DECIMAL_OPTS = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ id: String(n), name: n === 0 ? '0 — ακέραιες' : String(n) }));

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d.message ?? 'Η ενέργεια απέτυχε'), { field: d.field as string | undefined });
  return d;
}

// ── Νέα / επεξεργασία μονάδας ───────────────────────────────────────────────────────────────

function UnitDialog({ open, onOpenChange, row, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; row: UnitRow | null; onSaved: () => void }) {
  const [f, setF] = React.useState({ shortcut: '', name: '', interCode: '', decimals: '2', myDataCode: '1' });
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setF({
      shortcut: row?.shortcut ?? '', name: row?.name ?? '', interCode: row?.interCode ?? '',
      decimals: String(row?.decimals ?? 2), myDataCode: String(row?.myDataCode ?? 1),
    });
  }, [open, row]);

  const set = (k: keyof typeof f) => (v: string) => { setF((s) => ({ ...s, [k]: v })); setErrors({}); };

  const save = async () => {
    setBusy(true);
    try {
      const next = { shortcut: f.shortcut, name: f.name, interCode: f.interCode || null, decimals: Number(f.decimals), myDataCode: Number(f.myDataCode) };
      if (row) {
        const body: Record<string, unknown> = {};
        if (next.shortcut.trim() !== row.shortcut) body.shortcut = next.shortcut;
        if (next.name.trim() !== row.name) body.name = next.name;
        if ((next.interCode?.trim() || null) !== row.interCode) body.interCode = next.interCode;
        if (next.decimals !== row.decimals) body.decimals = next.decimals;
        if (next.myDataCode !== row.myDataCode) body.myDataCode = next.myDataCode;
        if (!Object.keys(body).length) { onOpenChange(false); return; }
        await send(`/api/admin/units/${row.code}`, 'PATCH', body);
        toast.success('Η μονάδα ενημερώθηκε στο SoftOne');
      } else {
        const d = await send('/api/admin/units', 'POST', next);
        toast.success(`Δημιουργήθηκε στο SoftOne: ${d.unit.code} · ${d.unit.shortcut}`);
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
      <DialogContent className="flex max-h-[92dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-2.5 pr-12">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4" style={{ color: TONE, backgroundColor: soft(TONE, 12) }}><FiMaximize2 /></span>
          <div className="min-w-0 flex-1 text-left">
            <DialogTitle className="text-[length:var(--fs-15)]">{row ? 'Επεξεργασία μονάδας' : 'Νέα μονάδα μέτρησης'}</DialogTitle>
            <DialogDescription className="truncate text-[length:var(--fs-11)]">{row ? `Κωδ. ${row.code} · ${row.name}` : 'Γράφεται απευθείας στο SoftOne'}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-3 bg-muted/20 px-4 py-3">
          <FormSection tone="blue" icon={<FiMaximize2 />} title="Μονάδα" aside={(
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <UnitThumb kind={inferUnitVisual({ shortcut: f.shortcut, name: f.name, interCode: f.interCode })} src={row?.iconUrl} size={44} />
              {UNIT_VISUAL_LABEL[inferUnitVisual({ shortcut: f.shortcut, name: f.name, interCode: f.interCode })]}
            </span>
          )}>
            <div className="grid gap-2.5 sm:grid-cols-[6rem_1fr]">
              <Field label="Σύντμηση" required htmlFor="unit-short" error={errors.shortcut}>
                <Input id="unit-short" value={f.shortcut} maxLength={5} onChange={(e) => set('shortcut')(e.target.value)} className={fieldCls} autoFocus />
              </Field>
              <Field label="Περιγραφή" required htmlFor="unit-name" error={errors.name}>
                <Input id="unit-name" value={f.name} maxLength={50} onChange={(e) => set('name')(e.target.value)} className={fieldCls} />
              </Field>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-[6rem_1fr]">
              <Field label="Διεθνής κωδ." htmlFor="unit-inter" error={errors.interCode}>
                <Input id="unit-inter" value={f.interCode} maxLength={5} onChange={(e) => set('interCode')(e.target.value)} className={fieldCls} placeholder="π.χ. m²" />
              </Field>
              <Field label="Δεκαδικά ποσότητας" required>
                <FormSelect value={f.decimals} onChange={set('decimals')} opts={DECIMAL_OPTS} ariaLabel="Δεκαδικά ποσότητας" />
              </Field>
            </div>
            <RowHint>Η σύντμηση φαίνεται στα παραστατικά (έως 5 χαρακτήρες). Τα δεκαδικά ορίζουν πόσα ψηφία δέχεται η ποσότητα.</RowHint>
          </FormSection>
          <FormSection tone="amber" icon={<FiFileText />} title="myDATA">
            <Field label="Μονάδα myDATA (ΑΑΔΕ)" required error={errors.myDataCode}>
              <FormSelect value={f.myDataCode} onChange={set('myDataCode')} opts={MYDATA_OPTS} ariaLabel="Μονάδα myDATA" />
            </Field>
            <RowHint>Η αντιστοίχιση που στέλνεται στην ΑΑΔΕ με τα παραστατικά.</RowHint>
          </FormSection>
        </DialogBody>
        <DialogFooter className="mx-0 mb-0 items-center gap-2 border-t border-border bg-card px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button size="sm" onClick={save} disabled={busy || !f.shortcut.trim() || !f.name.trim()}>
            {busy ? <FiLoader className="mr-1.5 size-3.5 animate-spin" /> : <FiCheck className="mr-1.5 size-3.5" />}
            {row ? 'Αποθήκευση' : 'Δημιουργία'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Εικονίδιο μονάδας: ανέβασμα ή δημιουργία με AI (μόνο στην εφαρμογή, όχι στο SoftOne) ──────────

function UnitIconDialog({ row, onOpenChange, onChanged }: { row: UnitRow | null; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  const [iconUrl, setIconUrl] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState('');
  const [busy, setBusy] = React.useState<'upload' | 'ai' | 'remove' | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (row) { setIconUrl(row.iconUrl); setHint(''); } }, [row]);
  if (!row) return null;

  const done = (url: string | null, msg: string) => { setIconUrl(url); toast.success(msg); onChanged(); };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy('upload');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/units/${row.code}/icon`, { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message ?? 'Το ανέβασμα απέτυχε');
      done(d.iconUrl, 'Το εικονίδιο αποθηκεύτηκε');
    } catch (e) { toast.error((e as Error).message); } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const generate = async () => {
    setBusy('ai');
    try {
      const d = await send(`/api/admin/units/${row.code}/icon/generate`, 'POST', { hint: hint.trim() || null });
      done(d.iconUrl, 'Το εικονίδιο δημιουργήθηκε με AI');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!(await confirmAction({
      title: 'Αφαίρεση εικονιδίου;', message: 'Η μονάδα θα δείχνει ξανά την αυτόματη μικρογραφία. Το αρχείο διαγράφεται από τη βιβλιοθήκη πολυμέσων.',
      confirmLabel: 'Αφαίρεση', destructive: true,
    }))) return;
    setBusy('remove');
    try {
      await send(`/api/admin/units/${row.code}/icon`, 'DELETE', {});
      done(null, 'Το εικονίδιο αφαιρέθηκε');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const spin = <FiLoader className="mr-1.5 size-3.5 animate-spin" aria-hidden />;

  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[92dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-2.5 pr-12">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4" style={{ color: TONE, backgroundColor: soft(TONE, 12) }}><FiImage /></span>
          <div className="min-w-0 flex-1 text-left">
            <DialogTitle className="text-[length:var(--fs-15)]">Εικονίδιο μονάδας</DialogTitle>
            <DialogDescription className="truncate text-[length:var(--fs-11)]">{row.shortcut} · {row.name} — αποθηκεύεται στην εφαρμογή, όχι στο SoftOne</DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-3 bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-3">
            <UnitThumb kind={inferUnitVisual(row)} src={iconUrl} size={112} className="relative" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-[length:var(--fs-12)] text-muted-foreground">
                {iconUrl ? 'Δικό της εικονίδιο.' : 'Χωρίς εικονίδιο — φαίνεται η αυτόματη μικρογραφία.'}
              </p>
              {iconUrl && (
                <Button variant="ghost" size="sm" onClick={remove} disabled={!!busy} className="text-destructive hover:text-destructive">
                  {busy === 'remove' ? spin : <FiTrash2 className="mr-1.5 size-3.5" aria-hidden />} Αφαίρεση
                </Button>
              )}
            </div>
          </div>
          <FormSection tone="blue" icon={<FiUpload />} title="Ανέβασμα">
            <input ref={fileRef} type="file" accept="image/*,.svg" className="sr-only" aria-label="Αρχείο εικονιδίου" onChange={(e) => upload(e.target.files?.[0])} />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy === 'upload' ? spin : <FiUpload className="mr-1.5 size-3.5" aria-hidden />} {busy === 'upload' ? 'Ανέβασμα…' : 'Επιλογή εικόνας'}
            </Button>
            <RowHint>PNG, JPG, WebP ή SVG, έως 5 MB. Μπαίνει στη βιβλιοθήκη πολυμέσων (φάκελος «Εικονίδια μονάδων»).</RowHint>
          </FormSection>
          <FormSection tone="violet" icon={<FiCpu />} title="Δημιουργία με AI">
            <Field label="Οδηγία (προαιρετικά)" htmlFor="unit-icon-hint">
              <textarea
                id="unit-icon-hint" value={hint} maxLength={300} rows={2} onChange={(e) => setHint(e.target.value)} disabled={!!busy}
                placeholder="π.χ. ξύλινη παλέτα με πλακάκια, μπλε τόνοι"
                className={cn(fieldCls, 'h-auto min-h-16 w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5')}
              />
            </Field>
            <Button size="sm" onClick={generate} disabled={!!busy}>
              {busy === 'ai' ? spin : <FiCpu className="mr-1.5 size-3.5" aria-hidden />} {busy === 'ai' ? 'Δημιουργία… (έως ~30″)' : iconUrl ? 'Νέο εικονίδιο με AI' : 'Δημιουργία με AI'}
            </Button>
            <RowHint>Το AI φτιάχνει ένα απλό εικονίδιο από την περιγραφή της μονάδας (~0,04 $ ανά εικόνα). Αν δεν σου αρέσει, πάτα ξανά.</RowHint>
          </FormSection>
        </DialogBody>
        <DialogFooter className="mx-0 mb-0 items-center gap-2 border-t border-border bg-card px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={!!busy}>Κλείσιμο</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Ανοιγμένη γραμμή: είδη που χρησιμοποιούν τη μονάδα ───────────────────────────────────────

type Member = { mtrl: number; code: string; name: string; isService: boolean; roles: string[] };

function MembersPanel({ row }: { row: UnitRow }) {
  const [items, setItems] = React.useState<Member[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState('');

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/units/${row.code}/members`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message ?? 'Αποτυχία φόρτωσης από το SoftOne');
      setItems(d.items);
    } catch (e) { setError((e as Error).message); }
  }, [row.code]);
  React.useEffect(() => { void load(); }, [load]);

  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)]">
        <FiAlertTriangle className="size-4 text-destructive" aria-hidden /><span className="flex-1">{error}</span>
        <button type="button" onClick={load} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2.5 hover:bg-muted"><FiRefreshCw className="size-3.5" aria-hidden /> Δοκιμή ξανά</button>
      </div>
    );
  }
  if (!items) return <div className="h-24 animate-pulse rounded-md bg-muted motion-reduce:animate-none" aria-busy="true" aria-label="Φόρτωση" />;

  const counts = { base: 0, buy: 0, sell: 0 } as Record<string, number>;
  for (const i of items) for (const r of i.roles) counts[r]++;
  const n = q.trim().toLocaleLowerCase('el');
  const shown = n ? items.filter((i) => `${i.code} ${i.name}`.toLocaleLowerCase('el').includes(n)) : items;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[length:var(--fs-12)] font-semibold">{items.length} ενεργά είδη/υπηρεσίες</span>
        {Object.entries(ROLE).map(([k, r]) => counts[k] ? (
          <span key={k} className="rounded-sm px-1.5 py-0.5 text-[length:var(--fs-11)] font-medium" style={{ color: r.tone, backgroundColor: soft(r.tone, 12) }}>{r.label}: {counts[k]}</span>
        ) : null)}
        {items.length > 8 && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Φίλτρο (κωδικός, περιγραφή)…" className={cn(fieldCls, 'ml-auto w-full sm:w-64')} aria-label="Φίλτρο ειδών" />}
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-[length:var(--fs-12)] text-muted-foreground">Κανένα ενεργό είδος δεν χρησιμοποιεί αυτή τη μονάδα.</p>
      ) : (
        <ul className="grid max-h-80 gap-x-4 overflow-y-auto rounded-md border border-border bg-card px-3 py-1 sm:grid-cols-2">
          {shown.slice(0, 300).map((i) => (
            <li key={i.mtrl} className="flex min-w-0 items-center gap-2 border-b border-border/60 py-1.5 text-[length:var(--fs-12)] last:border-0">
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{i.code}</span>
              <span className="min-w-0 flex-1 truncate" title={i.name}>{i.name}</span>
              <span className="flex shrink-0 gap-1">
                {i.roles.map((r) => <span key={r} className="rounded-sm px-1 text-[length:var(--fs-10)] font-semibold" style={{ color: ROLE[r]?.tone, backgroundColor: soft(ROLE[r]?.tone ?? TONE, 12) }}>{ROLE[r]?.label}</span>)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 300 && <RowHint>Εμφανίζονται τα πρώτα 300 — χρησιμοποίησε το φίλτρο.</RowHint>}
    </div>
  );
}

// ── Μενού ενεργειών ─────────────────────────────────────────────────────────────────────────

function RowActions({ row, canManage, onEdit, onIcon, onChanged }: { row: UnitRow; canManage: boolean; onEdit: () => void; onIcon: () => void; onChanged: () => void }) {
  const used = (row.itemCount ?? 0) > 0;
  const toggle = async () => {
    const activate = !row.isActive;
    if (!activate && !(await confirmAction({
      title: `Απενεργοποίηση «${row.name}»;`,
      message: 'Η μονάδα δεν θα προσφέρεται σε νέα είδη. Γράφεται στο SoftOne· ενεργοποιείται ξανά από εδώ.',
      confirmLabel: 'Απενεργοποίηση', destructive: true,
    }))) return;
    try {
      await send(`/api/admin/units/${row.code}`, 'PATCH', { isActive: activate });
      toast.success(activate ? 'Η μονάδα ενεργοποιήθηκε' : 'Η μονάδα απενεργοποιήθηκε');
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${row.code} ${row.shortcut} ${row.name}`); toast.success('Αντιγράφηκε'); } catch { toast.error('Δεν επετράπη η αντιγραφή'); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground"
        aria-label={`Ενέργειες για ${row.name}`} onClick={(e) => e.stopPropagation()}
      >
        <FiMoreVertical className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate text-[length:var(--fs-11)] font-semibold text-muted-foreground">{row.shortcut} · {row.name}</DropdownMenuLabel>
        {canManage && (
          <>
            <DropdownMenuItem className={ITEM} onSelect={onEdit}><FiEdit3 className="size-3.5" style={{ color: TONE }} aria-hidden /> Επεξεργασία</DropdownMenuItem>
            <DropdownMenuItem className={ITEM} onSelect={onIcon}><FiImage className="size-3.5" style={{ color: '#7C3AED' }} aria-hidden /> {row.iconUrl ? 'Αλλαγή εικονιδίου' : 'Εικονίδιο (ανέβασμα / AI)'}</DropdownMenuItem>
            <DropdownMenuItem className={ITEM} onSelect={toggle} disabled={row.isActive && used}>
              {row.isActive
                ? <><FiSlash className="size-3.5" aria-hidden /> Απενεργοποίηση{used ? ' (σε χρήση)' : ''}</>
                : <><FiCheck className="size-3.5" style={{ color: '#047857' }} aria-hidden /> Ενεργοποίηση</>}
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

export function UnitsTableClient({ rows, usageError, canManage, lastSync }: { rows: UnitRow[]; usageError: string | null; canManage: boolean; lastSync: string | null }) {
  const router = useRouter();
  const [showInactive, setShowInactive] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [dialog, setDialog] = React.useState<{ row: UnitRow | null } | null>(null);
  const [iconRow, setIconRow] = React.useState<UnitRow | null>(null);
  const data = React.useMemo(() => rows.filter((r) => showInactive || r.isActive), [rows, showInactive]);
  const inactive = rows.length - rows.filter((r) => r.isActive).length;

  const sync = async () => {
    setBusy(true);
    const res = await fetch('/api/admin/units/sync', { method: 'POST' });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      toast.success(`Συγχρονισμός: νέες ${d.created}, ενημερώσεις ${d.updated}${d.deactivated ? `, ανενεργές ${d.deactivated}` : ''}`);
      router.refresh();
    } else toast.error(syncErrorMessage(await res.json().catch(() => ({})), 'Αποτυχία συγχρονισμού'));
  };

  const columns = React.useMemo<ColumnDef<UnitRow>[]>(() => [
    {
      accessorKey: 'name', header: 'Μονάδα', size: 260,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className={cn('flex min-w-0 items-center gap-2', !r.isActive && 'opacity-60')}>
            <UnitThumb kind={inferUnitVisual(r)} src={r.iconUrl} size={36} />
            <span className="inline-flex h-7 min-w-11 shrink-0 items-center justify-center rounded-md px-1.5 font-mono text-[length:var(--fs-11)] font-semibold" style={{ color: TONE, backgroundColor: soft(TONE, 12) }}>{r.shortcut}</span>
            <span className="truncate text-[length:var(--fs-12)] font-medium">{r.name}</span>
          </div>
        );
      },
    },
    { accessorKey: 'code', header: 'Κωδ.', size: 70, cell: ({ row }) => <span className="font-mono tabular-nums text-[length:var(--fs-12)] text-muted-foreground">{row.original.code}</span> },
    { accessorKey: 'interCode', header: 'Διεθνής', size: 90, cell: ({ row }) => (row.original.interCode ? <span className="font-mono text-[length:var(--fs-12)]">{row.original.interCode}</span> : DASH) },
    { accessorKey: 'decimals', header: 'Δεκαδικά', size: 105, cell: ({ row }) => <span className="tabular-nums text-[length:var(--fs-12)]">{row.original.decimals}</span> },
    {
      id: 'myData', accessorFn: (r) => r.myDataLabel ?? '', header: 'myDATA', size: 170,
      cell: ({ row }) => (row.original.myDataCode != null
        ? <span className="text-[length:var(--fs-12)]"><span className="tabular-nums text-muted-foreground">{row.original.myDataCode} · </span>{row.original.myDataLabel ?? '—'}</span>
        : DASH),
    },
    {
      accessorKey: 'itemCount', header: 'Είδη', size: 70,
      cell: ({ row }) => (row.original.itemCount == null ? DASH
        : <span className={cn('tabular-nums text-[length:var(--fs-12)]', !row.original.itemCount && 'text-muted-foreground')}>{row.original.itemCount.toLocaleString('el-GR')}</span>),
    },
    {
      accessorKey: 'isActive', header: 'Ενεργή', size: 95,
      cell: ({ row }) => (row.original.isActive
        ? <span className="inline-flex items-center gap-1 text-[length:var(--fs-12)]" style={{ color: '#047857' }}><FiCheck className="size-3.5" aria-hidden /> Ναι</span>
        : <span className="inline-flex items-center gap-1 text-[length:var(--fs-12)] text-muted-foreground"><FiSlash className="size-3.5" aria-hidden /> Όχι</span>),
    },
    {
      id: 'actions', header: () => <span className="sr-only">Ενέργειες</span>, size: 44, enableSorting: false, enableHiding: false, enableResizing: false,
      cell: ({ row }) => <div className="flex justify-end"><RowActions row={row.original} canManage={canManage} onEdit={() => setDialog({ row: row.original })} onIcon={() => setIconRow(row.original)} onChanged={() => router.refresh()} /></div>,
    },
  ], [canManage, router]);

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {inactive > 0 && (
        <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 px-1 text-[length:var(--fs-11)] text-muted-foreground">
          <input type="checkbox" className="size-3.5 accent-[#0369A1]" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Ανενεργές ({inactive})
        </label>
      )}
      {canManage && (
        <>
          <Button variant="secondary" size="sm" onClick={sync} disabled={busy}>
            <FiRefreshCw className={cn('mr-1.5 size-3.5', busy && 'animate-spin')} /> {busy ? 'Συγχρονισμός…' : 'Συγχρονισμός'}
          </Button>
          <Button size="sm" onClick={() => setDialog({ row: null })}><FiPlus className="mr-1.5 size-3.5" aria-hidden /> Νέα μονάδα</Button>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      {usageError && (
        <p role="alert" className="rounded-md border border-amber-500/30 bg-amber-50/70 px-3 py-2 text-[length:var(--fs-12)] text-amber-900 dark:bg-amber-500/10 dark:text-amber-300">
          Δεν διαβάστηκαν τα είδη από το SoftOne ({usageError}) — η χρήση ανά μονάδα δεν εμφανίζεται.
        </p>
      )}
      <DataTable
        columns={columns}
        data={data}
        searchKey="name"
        filterAllColumns
        searchPlaceholder="Αναζήτηση (περιγραφή, σύντμηση…)"
        persistKey="admin.units.table.v1"
        toolbar={toolbar}
        pageSize={50}
        growColumnId="name"
        responsiveHide={['isActive', 'interCode', 'decimals', 'code', 'myData']}
        expandable={(r) => <MembersPanel row={r} />}
        emptyState={<p className="py-8 text-center text-[length:var(--fs-13)] text-muted-foreground">Δεν υπάρχουν μονάδες. Πάτησε «Συγχρονισμός».</p>}
      />
      {lastSync && <p className="text-[length:var(--fs-11)] text-muted-foreground">Τελευταίος συγχρονισμός: {new Date(lastSync).toLocaleString('el-GR')}</p>}
      {canManage && <UnitIconDialog row={iconRow} onOpenChange={(o) => { if (!o) setIconRow(null); }} onChanged={() => router.refresh()} />}
      {canManage && <UnitDialog open={dialog != null} onOpenChange={(o) => { if (!o) setDialog(null); }} row={dialog?.row ?? null} onSaved={() => router.refresh()} />}
    </div>
  );
}
