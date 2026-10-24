'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiCheck, FiMoreVertical, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { listCustomerChanges } from '@/lib/customer-changes';
import { decideCustomerChangeAction } from './actions';

type Row = Awaited<ReturnType<typeof listCustomerChanges>>[number];
const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Σε αναμονή', cls: 'bg-amber-50 text-amber-900 ring-amber-200' },
  APPLIED: { label: 'Πέρασε στο SoftOne', cls: 'bg-emerald-50 text-emerald-900 ring-emerald-200' },
  REJECTED: { label: 'Απορρίφθηκε', cls: 'bg-rose-50 text-rose-900 ring-rose-200' },
};
const when = (iso: string) => new Date(iso).toLocaleString('el-GR', { timeZone: 'Europe/Athens', dateStyle: 'short', timeStyle: 'short' });

export function ChangesList({ rows, canManage }: { rows: Row[]; canManage: boolean }) {
  const router = useRouter();
  const [decision, setDecision] = React.useState<{ row: Row; status: 'APPLIED' | 'REJECTED' } | null>(null);
  const [reply, setReply] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (!decision) return;
    setBusy(true);
    const r = await decideCustomerChangeAction({ id: decision.row.id, status: decision.status, reply });
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success(decision.status === 'APPLIED' ? 'Σημειώθηκε ως περασμένο' : 'Το αίτημα απορρίφθηκε');
    setDecision(null); setReply(''); router.refresh();
  };
  if (!rows.length) return <div className="rounded-lg border border-dashed p-8 text-center text-(length:--fs-13) text-muted-foreground">Κανένα αίτημα. Όταν ένας πελάτης ζητήσει αλλαγή στοιχείων από την πύλη, θα εμφανιστεί εδώ.</div>;
  return (
    <>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className={`rounded-lg border bg-card p-4 ${r.status === 'PENDING' ? 'border-amber-300' : ''}`}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-(length:--fs-12) text-muted-foreground">
                  <span className={`rounded px-1.5 py-0.5 text-(length:--fs-11) font-semibold ring-1 ${STATUS[r.status]?.cls ?? ''}`}>{STATUS[r.status]?.label ?? r.status}</span>
                  <span>{when(r.at)}</span><span>· {r.by}</span>
                </p>
                <p className="mt-1 text-(length:--fs-14) font-semibold">{r.customer}{r.code ? <span className="font-normal text-muted-foreground"> · {r.code}</span> : null}</p>
                <table className="mt-2 text-(length:--fs-13)">
                  <tbody>
                    {r.changes.map((c) => (
                      <tr key={c.field}>
                        <td className="py-0.5 pr-4 text-muted-foreground">{c.label}</td>
                        <td className="py-0.5 pr-4 text-muted-foreground line-through">{c.from ?? '—'}</td>
                        <td className="py-0.5 font-medium">{c.to ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {r.note && <p className="mt-2 text-(length:--fs-13) text-muted-foreground">Σημείωση πελάτη: {r.note}</p>}
                {r.reply && <p className="mt-1 text-(length:--fs-13)">Απάντηση: {r.reply}</p>}
              </div>
              {canManage && r.status === 'PENDING' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label="Ενέργειες αιτήματος"><FiMoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="cursor-pointer gap-2 text-(length:--fs-12)" onSelect={() => setDecision({ row: r, status: 'APPLIED' })}><FiCheck className="size-3.5" />Πέρασε στο SoftOne</DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer gap-2 text-(length:--fs-12) text-destructive" onSelect={() => setDecision({ row: r, status: 'REJECTED' })}><FiX className="size-3.5" />Απόρριψη</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!decision} onOpenChange={(o) => { if (!o) setDecision(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision?.status === 'APPLIED' ? 'Η αλλαγή πέρασε στο SoftOne;' : 'Απόρριψη αιτήματος'}</DialogTitle>
            <DialogDescription>
              {decision?.status === 'APPLIED'
                ? 'Επιβεβαιώστε αφού ενημερώσετε τον πελάτη στο SoftOne με το χέρι — η εφαρμογή δεν γράφει εταιρικά στοιχεία εκεί. Ο καθρέφτης θα ενημερωθεί στον επόμενο συγχρονισμό.'
                : 'Ο πελάτης θα δει την απάντησή σας στο προφίλ του.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label htmlFor="cc-reply" className="text-(length:--fs-12) font-medium">Μήνυμα προς τον πελάτη (προαιρετικό)</label>
            <textarea id="cc-reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={600} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-(length:--fs-13) outline-hidden focus-visible:ring-2 focus-visible:ring-ring" />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>Άκυρο</Button>
            <Button onClick={() => void submit()} disabled={busy} variant={decision?.status === 'REJECTED' ? 'destructive' : 'default'}>{decision?.status === 'APPLIED' ? 'Ναι, πέρασε' : 'Απόρριψη'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
