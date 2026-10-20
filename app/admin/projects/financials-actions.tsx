'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FiMoreVertical, FiRefreshCw, FiPercent, FiHelpCircle, FiTool, FiTrash2, FiLoader, FiFileText } from 'react-icons/fi';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { COST_CATEGORIES, COST_CATEGORY_LABEL, overheadKey } from '@/lib/project-profit/calc';
import type { OverheadRateRow } from '@/lib/overheads';

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(COST_CATEGORIES.map((c) => [overheadKey(c), COST_CATEGORY_LABEL[c]]));
const categoryLabel = (c: string | null) => (c == null ? 'Γενικό (όλες οι κατηγορίες)' : CATEGORY_LABEL[c] ?? c);
const fmtDay = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : 'ανοιχτό');

/**
 * Ενέργειες οικονομικών έργων ως στοιχεία μενού + ο διάλογος ποσοστών — για να μπαίνουν στο ΙΔΙΟ ⋮
 * με τις υπόλοιπες ενέργειες (λίστα: δικό τους ⋮ στην κεφαλίδα· καρτέλα έργου: μέσα στο ⋮ του έργου).
 */
export function useFinancialsActions(canManage: boolean, prjc?: number) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [ratesOpen, setRatesOpen] = React.useState(false);

  const refresh = async () => {
    setBusy(true);
    const t = toast.loading('Υπολογισμός οικονομικών όλων των έργων από το SoftOne…');
    try {
      const r = await fetch('/api/admin/projects/financials/refresh', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message ?? 'Αποτυχία υπολογισμού');
      toast.success(`Υπολογίστηκαν ${d.projects} έργα · ${d.issues} θέματα δεδομένων`, { id: t });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setBusy(false);
    }
  };

  const items = (
    <>
      <DropdownMenuLabel className="text-(length:--fs-11) font-semibold text-muted-foreground">Οικονομικά έργων</DropdownMenuLabel>
      <DropdownMenuItem className={ITEM} disabled={busy} onSelect={() => void refresh()}>
        <FiRefreshCw className={`size-3.5 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden /> Ανανέωση οικονομικών από SoftOne
      </DropdownMenuItem>
      {canManage && (
        <DropdownMenuItem className={ITEM} onSelect={() => setRatesOpen(true)}>
          <FiPercent className="size-3.5" aria-hidden /> Ποσοστά γενικών εξόδων…
        </DropdownMenuItem>
      )}
      {prjc != null && <ExportItem prjc={prjc} />}
      <ExportItem prjc={null} />
      <DropdownMenuItem className={ITEM} onSelect={() => router.push('/admin/accounting/questions')}>
        <FiHelpCircle className="size-3.5" aria-hidden /> Ερωτήματα λογιστή
      </DropdownMenuItem>
      <DropdownMenuItem className={ITEM} onSelect={() => router.push('/admin/accounting/integrator')}>
        <FiTool className="size-3.5" aria-hidden /> Αναφορά integrator
      </DropdownMenuItem>
    </>
  );
  const dialog = canManage ? <OverheadRatesDialog open={ratesOpen} onOpenChange={setRatesOpen} /> : null;
  return { items, dialog, busy };
}

/** Λήψη του Word με τις κατευθύνσεις (ανά ομάδα παραληπτών) — ενός έργου ή όλων των ανοιχτών θεμάτων. */
export function ExportItem({ prjc }: { prjc: number | null }) {
  return (
    <DropdownMenuItem className={ITEM} asChild>
      <a href={prjc == null ? '/api/admin/projects/instructions' : `/api/admin/projects/${prjc}/instructions`} download onClick={(e) => e.stopPropagation()}>
        <FiFileText className="size-3.5" style={{ color: '#2B579A' }} aria-hidden />
        {prjc == null ? 'Κατευθύνσεις όλων των έργων (Word)' : 'Κατευθύνσεις έργου (Word)'}
      </a>
    </DropdownMenuItem>
  );
}

/** ⋮ ενέργειες οικονομικών στην κεφαλίδα της λίστας έργων. */
export function FinancialsMenu({ canManage }: { canManage: boolean }) {
  const { items, dialog, busy } = useFinancialsActions(canManage);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground"
          aria-label="Ενέργειες οικονομικών"
        >
          {busy ? <FiLoader className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FiMoreVertical className="size-4" aria-hidden />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">{items}</DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </>
  );
}

function OverheadRatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [rates, setRates] = React.useState<OverheadRateRow[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ validFrom: `${new Date().getFullYear()}-01-01`, validTo: '', percent: '', category: '', note: '' });

  const load = React.useCallback(async () => {
    const r = await fetch('/api/admin/projects/overheads');
    const d = await r.json().catch(() => ({}));
    setRates(r.ok ? d.rates : []);
  }, []);
  React.useEffect(() => { if (open) void load(); }, [open, load]);

  const percentN = Number(form.percent.replace(',', '.'));
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.percent.trim() || !Number.isFinite(percentN)) { setError('Συμπλήρωσε ποσοστό'); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/admin/projects/overheads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validFrom: form.validFrom, validTo: form.validTo || null, percent: percentN, category: form.category || null, note: form.note || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message ?? 'Δεν αποθηκεύτηκε');
      toast.success('Αποθηκεύτηκε — τα έργα ξαναϋπολογίστηκαν');
      setForm((f) => ({ ...f, percent: '', note: '' }));
      await load();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    setBusy(true);
    const r = await fetch(`/api/admin/projects/overheads/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) { toast.error('Δεν διαγράφηκε'); return; }
    toast.success('Διαγράφηκε');
    await load();
    router.refresh();
  };

  const field = 'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-(length:--fs-13) outline-hidden focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="px-5 pt-4 pb-3">
          <DialogTitle className="text-(length:--fs-16)">Ποσοστά γενικών εξόδων</DialogTitle>
          <DialogDescription className="text-(length:--fs-12)">
            Ποσοστό επί του άμεσου κόστους, ανά περίοδο. Το γενικό ισχύει για όλες τις κατηγορίες· ένα ποσοστό κατηγορίας το παρακάμπτει. Ίδια ποσοστά χρησιμοποιεί και το «Πραγματικό κόστος».
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-(length:--fs-12)">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr><th className="px-2.5 py-1.5 font-medium">Περίοδος</th><th className="px-2.5 py-1.5 font-medium">Κατηγορία</th><th className="px-2.5 py-1.5 text-right font-medium">%</th><th className="w-10"><span className="sr-only">Ενέργειες</span></th></tr>
              </thead>
              <tbody>
                {rates == null && <tr><td colSpan={4} className="px-2.5 py-3 text-muted-foreground">Φόρτωση…</td></tr>}
                {rates?.length === 0 && <tr><td colSpan={4} className="px-2.5 py-3 text-muted-foreground">Δεν έχει οριστεί ποσοστό — τα γενικά έξοδα μετρούν 0.</td></tr>}
                {rates?.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-2.5 py-1.5 tabular-nums">{fmtDay(r.validFrom)} – {fmtDay(r.validTo)}{r.note && <span className="block text-(length:--fs-11) text-muted-foreground">{r.note}</span>}</td>
                    <td className="px-2.5 py-1.5">{categoryLabel(r.category)}</td>
                    <td className="px-2.5 py-1.5 text-right font-medium tabular-nums">{r.percent.toLocaleString('el-GR')}%</td>
                    <td className="px-1 py-1 text-right">
                      <button type="button" disabled={busy} onClick={() => void remove(r.id)} aria-label="Διαγραφή ποσοστού"
                        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive">
                        <FiTrash2 className="size-3.5" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form id="overhead-form" onSubmit={add} className="grid grid-cols-2 gap-3 sm:grid-cols-4" noValidate>
            <div><Label htmlFor="oh-from" className="mb-1 block text-(length:--fs-12)">Από</Label><input id="oh-from" type="date" required className={field} value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></div>
            <div><Label htmlFor="oh-to" className="mb-1 block text-(length:--fs-12)">Έως</Label><input id="oh-to" type="date" className={field} value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></div>
            <div><Label htmlFor="oh-pct" className="mb-1 block text-(length:--fs-12)">Ποσοστό %</Label><Input id="oh-pct" inputMode="decimal" className="tabular-nums" placeholder="π.χ. 12" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} /></div>
            <div>
              <Label htmlFor="oh-cat" className="mb-1 block text-(length:--fs-12)">Κατηγορία</Label>
              <select id="oh-cat" className={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">Γενικό</option>
                {COST_CATEGORIES.map((c) => <option key={c} value={overheadKey(c)}>{COST_CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-4"><Label htmlFor="oh-note" className="mb-1 block text-(length:--fs-12)">Σημείωση</Label><Input id="oh-note" maxLength={300} placeholder="Προαιρετικά — π.χ. ενοίκια, μισθοδοσία γραφείου, λογιστής" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          </form>
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12) text-destructive">{error}</p>}
        </DialogBody>
        <DialogFooter className="m-0 border-t border-border px-5 py-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Κλείσιμο</Button>
          <Button type="submit" form="overhead-form" disabled={busy}>
            {busy && <FiLoader className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}Προσθήκη ποσοστού
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IssueLinks() {
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      <Link href="/admin/accounting/questions" className="font-medium underline underline-offset-2 hover:no-underline">Ερωτήματα λογιστή</Link>
      <Link href="/admin/accounting/integrator" className="font-medium underline underline-offset-2 hover:no-underline">Αναφορά integrator</Link>
    </span>
  );
}
