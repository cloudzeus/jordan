'use client';

import * as React from 'react';
import { FiPackage, FiTool, FiX, FiLoader } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RegistrySearch, type RegistryPick } from '@/components/admin/registry-search';
import { emitProjectRefresh } from './project-events';

type Kind = 'product' | 'service';

const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });

/** «1.234,5» ή «1234.5» → 1234.5 · κενό/άκυρο → NaN. */
function parseNum(v: string): number {
  const s = v.trim().replace(/\s/g, '');
  if (!s) return NaN;
  const normalised = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return Number(normalised);
}

const KIND_TONE: Record<Kind, string> = { product: '#B45309', service: '#7C3AED' };

/**
 * Modal «Προσθήκη υλικού/υπηρεσίας» στον ΠΡΟΫΠΟΛΟΓΙΣΜΟ ενός έργου. Γράφει μόνο στη δική μας
 * βάση (ProjectBudgetLine) — το SoftOne δεν αγγίζεται.
 */
export function AddBudgetLineDialog({
  open, onOpenChange, prjc, projectLabel, defaultKind = 'product',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prjc: number;
  projectLabel: string;
  defaultKind?: Kind;
}) {
  const [kind, setKind] = React.useState<Kind>(defaultKind);
  const [pick, setPick] = React.useState<RegistryPick | null>(null);
  const [qty, setQty] = React.useState('1');
  const [price, setPrice] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Κάθε άνοιγμα ξεκινά καθαρό — δεν κουβαλά την προηγούμενη επιλογή σε άλλο έργο.
  React.useEffect(() => {
    if (!open) return;
    setKind(defaultKind); setPick(null); setQty('1'); setPrice(''); setNotes('');
    setTouched(false); setServerError(null);
  }, [open, defaultKind]);

  const qtyN = parseNum(qty);
  const priceN = price.trim() === '' ? 0 : parseNum(price);
  const qtyError = !Number.isFinite(qtyN) || qtyN <= 0 ? 'Δώσε ποσότητα μεγαλύτερη από 0.' : null;
  const priceError = !Number.isFinite(priceN) || priceN < 0 ? 'Η τιμή πρέπει να είναι αριθμός ≥ 0.' : null;
  const pickError = !pick ? (kind === 'product' ? 'Διάλεξε υλικό από το μητρώο.' : 'Διάλεξε υπηρεσία από το μητρώο.') : null;
  const valid = !qtyError && !priceError && !pickError;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || !pick) return;
    setBusy(true);
    setServerError(null);
    try {
      const res = await fetch(`/api/admin/projects/${prjc}/budget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mtrl: pick.id, qty: qtyN, unitPrice: priceN, notes: notes.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Αποτυχία αποθήκευσης');
      toast.success(`Προστέθηκε στον προϋπολογισμό: ${pick.name}`);
      emitProjectRefresh(prjc, 'budget');
      onOpenChange(false);
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tone = KIND_TONE[kind];
  const fieldErr = (msg: string | null) => (touched && msg
    ? <p role="alert" className="mt-1 text-[length:var(--fs-11)] text-destructive">{msg}</p>
    : null);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader className="px-5 pt-4 pb-3">
            <DialogTitle className="text-[length:var(--fs-16)]">Προσθήκη στον προϋπολογισμό</DialogTitle>
            <DialogDescription className="text-[length:var(--fs-12)]">
              Έργο <span className="font-medium text-foreground">{projectLabel}</span>. Αποθηκεύεται μόνο στην εφαρμογή — το SoftOne δεν αλλάζει.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {/* Υλικό ή υπηρεσία — segmented control με ρόλο radiogroup. */}
            <div role="radiogroup" aria-label="Τύπος" className="inline-flex rounded-lg border border-border p-0.5">
              {([['product', 'Υλικό', FiPackage], ['service', 'Υπηρεσία', FiTool]] as const).map(([k, label, Icon]) => {
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => { setKind(k); setPick(null); }}
                    className={cn(
                      'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[length:var(--fs-12)] font-medium transition-colors duration-150',
                      active ? 'text-white shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                    style={active ? { backgroundColor: KIND_TONE[k] } : undefined}
                  >
                    <Icon className="size-3.5" aria-hidden /> {label}
                  </button>
                );
              })}
            </div>

            <div>
              <Label htmlFor="budget-item" className="mb-1 block text-[length:var(--fs-12)]">
                {kind === 'product' ? 'Υλικό' : 'Υπηρεσία'} <span className="text-destructive">*</span>
              </Label>
              {pick ? (
                <div
                  className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
                  style={{ borderColor: `color-mix(in srgb, ${tone} 35%, var(--border))`, backgroundColor: `color-mix(in srgb, ${tone} 7%, var(--background))` }}
                >
                  {kind === 'product' ? <FiPackage className="size-4 shrink-0" style={{ color: tone }} aria-hidden /> : <FiTool className="size-4 shrink-0" style={{ color: tone }} aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[length:var(--fs-13)] font-medium text-foreground">{pick.name}</p>
                    <p className="font-mono text-[length:var(--fs-11)] text-muted-foreground">{pick.code}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPick(null)}
                    className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Αλλαγή επιλογής"
                  >
                    <FiX className="size-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <RegistrySearch key={kind} id="budget-item" kind={kind} onPick={setPick} label="" />
              )}
              {fieldErr(pickError)}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="budget-qty" className="mb-1 block text-[length:var(--fs-12)]">
                  Ποσότητα <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="budget-qty" inputMode="decimal" autoComplete="off" value={qty}
                  onChange={(e) => setQty(e.target.value)} onBlur={() => setTouched(true)}
                  aria-invalid={touched && !!qtyError} className="tabular-nums"
                />
                {fieldErr(qtyError)}
              </div>
              <div>
                <Label htmlFor="budget-price" className="mb-1 block text-[length:var(--fs-12)]">Τιμή μονάδας (€)</Label>
                <Input
                  id="budget-price" inputMode="decimal" autoComplete="off" placeholder="0,00" value={price}
                  onChange={(e) => setPrice(e.target.value)} onBlur={() => setTouched(true)}
                  aria-invalid={touched && !!priceError} className="tabular-nums"
                />
                {fieldErr(priceError)}
              </div>
            </div>

            <div>
              <Label htmlFor="budget-notes" className="mb-1 block text-[length:var(--fs-12)]">Σημειώσεις</Label>
              <textarea
                id="budget-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-[length:var(--fs-13)] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Προαιρετικά — π.χ. φάση, χώρος, προμηθευτής"
              />
            </div>

            <div className="flex items-baseline justify-between rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-[length:var(--fs-12)] text-muted-foreground">Αξία γραμμής</span>
              <span className="text-[length:var(--fs-16)] font-semibold tabular-nums text-foreground">
                {valid || (Number.isFinite(qtyN) && Number.isFinite(priceN)) ? eur.format((Number.isFinite(qtyN) ? qtyN : 0) * (Number.isFinite(priceN) ? priceN : 0)) : '—'}
              </span>
            </div>

            {serverError && (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)] text-destructive">
                {serverError}
              </p>
            )}
          </DialogBody>

          <DialogFooter className="m-0 border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
            <Button type="submit" disabled={busy} style={{ backgroundColor: tone }} className="text-white hover:opacity-90">
              {busy && <FiLoader className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
              {busy ? 'Αποθήκευση…' : 'Προσθήκη'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
