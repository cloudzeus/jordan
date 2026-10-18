'use client';

// Πληρωμές Viva στις κρατήσεις: η κατάσταση (στήλη «Πληρωμή») και οι ενέργειες του ⋮.
import * as React from 'react';
import { FiCopy, FiCreditCard, FiMail, FiRefreshCw, FiRotateCcw, FiSend, FiSlash } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { formatEur, PAYMENT_LABELS } from '@/lib/viva-core';
import type { PaymentSummary } from '@/lib/viva-payments';

export type PaymentCaps = { read: boolean; manage: boolean; refund: boolean };

const TONES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  PAID: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  REFUNDED: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  CANCELLED: 'bg-muted text-muted-foreground',
};

export function PaymentBadge({ p, reservationStatus }: { p: PaymentSummary | undefined; reservationStatus: string }) {
  if (!p) return <span className="text-[length:var(--fs-11)] text-muted-foreground">{reservationStatus === 'ACTIVE' ? 'Χωρίς αίτημα' : '—'}</span>;
  const title = [
    p.email ? `Email: ${p.email}${p.emailSentAt ? ` · ${new Date(p.emailSentAt).toLocaleString('el-GR')}` : ''}` : null,
    p.emailError ? `Email: ${p.emailError}` : null,
    p.lastError, p.env === 'demo' ? 'Viva demo' : null,
  ].filter(Boolean).join('\n');
  return (
    <span className="inline-flex flex-col items-start gap-0.5" title={title || undefined}>
      <span className={cn('rounded-sm px-1.5 py-0.5 text-[length:var(--fs-10)] font-semibold', TONES[p.status] ?? TONES.CANCELLED)}>
        {PAYMENT_LABELS[p.status] ?? p.status}{p.env === 'demo' ? ' · demo' : ''}
      </span>
      <span className="text-[length:var(--fs-11)] tabular-nums text-muted-foreground">
        {formatEur(p.paidCents ?? p.amountCents)}{p.refundedCents > 0 && ` · −${formatEur(p.refundedCents)}`}
      </span>
      {p.refund && <span className="text-[length:var(--fs-11)] font-medium text-sky-700">Οφείλεται επιστροφή {formatEur(p.refund.cents)}</span>}
      {(p.lastError || p.emailError) && <span className="max-w-44 truncate text-[length:var(--fs-11)] text-destructive">{p.lastError ?? p.emailError}</span>}
    </span>
  );
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message ?? 'Αποτυχία');
  return d;
}

/** Τα στοιχεία του ⋮ για την πληρωμή μιας κράτησης (μετά από διαχωριστικό). Κενό = τίποτα να δείξει. */
export function paymentMenuItems(opts: {
  offerId: string; reservation: { id: string; status: string; customer: string }; p: PaymentSummary | undefined; caps: PaymentCaps; onDone: () => void;
}): React.ReactNode[] {
  const { offerId, reservation: r, p, caps, onDone } = opts;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); onDone(); } catch (e) { toast.error((e as Error).message); }
  };
  const act = (action: string) => post(`/api/admin/dynamic-offers/${offerId}/payments/${p!.id}`, { action });
  const cls = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';
  const items: React.ReactNode[] = [];
  if (caps.manage && r.status === 'ACTIVE' && (!p || p.status === 'CANCELLED')) {
    items.push(<DropdownMenuItem key="create" className={cls} onSelect={() => run(() => post(`/api/admin/dynamic-offers/${offerId}/payments`, { action: 'create', reservationId: r.id }), 'Το αίτημα πληρωμής δημιουργήθηκε')}><FiSend className="size-3.5 text-sky-600" aria-hidden /> Αίτημα πληρωμής</DropdownMenuItem>);
  }
  if (p && p.status === 'PENDING') {
    items.push(<DropdownMenuItem key="copy" className={cls} onSelect={() => navigator.clipboard.writeText(p.url).then(() => toast.success('Ο σύνδεσμος αντιγράφηκε'), () => toast.error(p.url))}><FiCopy className="size-3.5" aria-hidden /> Αντιγραφή συνδέσμου</DropdownMenuItem>);
    if (caps.manage) {
      items.push(<DropdownMenuItem key="resend" className={cls} onSelect={() => run(() => act('resend'), 'Το email στάλθηκε ξανά')}><FiMail className="size-3.5" aria-hidden /> Επαναποστολή email</DropdownMenuItem>);
      items.push(<DropdownMenuItem key="sync" className={cls} onSelect={() => run(() => act('sync'), 'Ελέγχθηκε στο Viva')}><FiRefreshCw className="size-3.5" aria-hidden /> Έλεγχος στο Viva</DropdownMenuItem>);
      items.push(<DropdownMenuItem key="cancel" variant="destructive" className={cls} onSelect={async () => {
        if (!(await confirmAction({ title: 'Ακύρωση αιτήματος πληρωμής', message: `Ο σύνδεσμος πληρωμής του «${r.customer}» δεν θα δέχεται πια πληρωμή. Η κράτηση μένει ως έχει.`, confirmLabel: 'Ακύρωση αιτήματος', destructive: true }))) return;
        await run(() => act('cancel'), 'Το αίτημα πληρωμής ακυρώθηκε');
      }}><FiSlash className="size-3.5" aria-hidden /> Ακύρωση αιτήματος</DropdownMenuItem>);
    }
  }
  if (p && p.status === 'PAID' && caps.manage) {
    items.push(<DropdownMenuItem key="sync" className={cls} onSelect={() => run(() => act('sync'), 'Ελέγχθηκε στο Viva')}><FiRefreshCw className="size-3.5" aria-hidden /> Έλεγχος στο Viva</DropdownMenuItem>);
  }
  if (p?.refund && caps.refund) {
    const label = p.refund.kind === 'PRICE_DIFF' ? 'Επιστροφή διαφοράς τιμής' : 'Επιστροφή ποσού';
    items.push(<DropdownMenuItem key="refund" className={cls} onSelect={async () => {
      if (!(await confirmAction({ title: label, message: `Επιστροφή ${formatEur(p.refund!.cents)} στον «${r.customer}», στο μέσο με το οποίο πλήρωσε${p.env === 'demo' ? ' (Viva demo)' : ''}. Δεν αναιρείται.`, confirmLabel: `Επιστροφή ${formatEur(p.refund!.cents)}`, destructive: true }))) return;
      await run(() => act('refund'), 'Η επιστροφή ολοκληρώθηκε');
    }}><FiRotateCcw className="size-3.5 text-sky-600" aria-hidden /> {label}</DropdownMenuItem>);
  }
  if (!items.length) return [];
  return [<DropdownMenuSeparator key="sep" />, <DropdownMenuLabel key="lbl" className="flex items-center gap-1.5 text-[length:var(--fs-10)] uppercase tracking-wide text-muted-foreground"><FiCreditCard className="size-3" aria-hidden /> Πληρωμή</DropdownMenuLabel>, ...items];
}

/** Κλεισμένο container: επιστροφή όλων των διαφορών τιμής με ένα κουμπί. */
export function RefundDiffsButton({ offerId, payments, onDone }: { offerId: string; payments: Record<string, PaymentSummary>; onDone: () => void }) {
  const due = Object.values(payments).filter((p) => p.refund?.kind === 'PRICE_DIFF');
  const [busy, setBusy] = React.useState(false);
  if (!due.length) return null;
  const total = due.reduce((a, p) => a + (p.refund?.cents ?? 0), 0);
  const go = async () => {
    if (!(await confirmAction({ title: 'Επιστροφή διαφορών τιμής', message: `Η τελική τιμή είναι χαμηλότερη από αυτή που πληρώθηκε σε ${due.length} κρατήσεις. Επιστροφή συνολικά ${formatEur(total)} μέσω Viva; Δεν αναιρείται.`, confirmLabel: `Επιστροφή ${formatEur(total)}`, destructive: true }))) return;
    setBusy(true);
    try {
      const d = await post(`/api/admin/dynamic-offers/${offerId}/payments`, { action: 'refund_diffs' });
      if (d.failed?.length) toast.error(`${d.done} επιστροφές έγιναν, ${d.failed.length} απέτυχαν: ${d.failed[0]}`);
      else toast.success(`${d.done} επιστροφές · ${formatEur(d.cents)}`);
      onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={go} disabled={busy} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 text-[length:var(--fs-12)] font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
      <FiRotateCcw className="size-3.5" aria-hidden /> Επιστροφή διαφορών ({due.length}) · {formatEur(total)}
    </button>
  );
}
