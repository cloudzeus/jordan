'use client';

// Εκδόσεις προσφοράς: η τρέχουσα (σε επεξεργασία) και οι παγωμένες (στάλθηκε / PDF / «Νέα έκδοση»), με
// προβολή, επαναφορά (μόνο πριν από την αποδοχή) και νέα προσφορά από οποιαδήποτε έκδοση.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiChevronDown, FiCopy, FiEye, FiGitBranch, FiLoader, FiMoreVertical, FiRotateCcw } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { eur, lineNet, qtyEl } from '@/lib/contracts/core';
import type { RevisionDetail, RevisionRow } from '@/lib/contracts/revisions';
import { cn } from '@/lib/utils';
import { duplicateContractAction, freezeRevisionAction, getRevisionAction, restoreRevisionAction } from '../actions';

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const REASON: Record<RevisionRow['reason'], string> = { MANUAL: 'Νέα έκδοση', SENT: 'Στάλθηκε', DOCUMENT: 'PDF', RESTORE: 'Επαναφορά' };
const when = (iso: string) => new Date(iso).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function RevisionsPanel({ contractId, current, currentGross, revisions, canManage, canRestore }: {
  contractId: string;
  current: number;
  currentGross: number;
  revisions: RevisionRow[];
  canManage: boolean;
  /** Προσφορά πριν από την αποδοχή: επιτρέπεται η επαναφορά παλιάς έκδοσης. */
  canRestore: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [view, setView] = React.useState<RevisionDetail | null>(null);
  const frozenCurrent = revisions.some((r) => r.revision === current);

  const freeze = async () => {
    setBusy(true);
    const r = await freezeRevisionAction(contractId, note);
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    setNewOpen(false); setNote('');
    toast.success(`Η έκδοση ${r.data.revision - 1} κρατήθηκε· συνεχίζετε στην έκδοση ${r.data.revision}`);
  };
  const open = async (rev: number) => {
    const r = await getRevisionAction(contractId, rev);
    if (!r.ok) { toast.error(r.message); return; }
    setView(r.data);
  };
  const restore = async (rev: number) => {
    if (!(await confirmAction(`Επαναφορά της έκδοσης ${rev};\nΗ τρέχουσα μορφή κρατιέται στο ιστορικό και η φόρμα γίνεται ξανά όπως στην έκδοση ${rev} (ως νέα έκδοση).`))) return;
    setBusy(true);
    const r = await restoreRevisionAction(contractId, rev);
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    setView(null);
    toast.success(`Επαναφέρθηκε η έκδοση ${rev}`);
  };
  const duplicate = async (rev: number | null) => {
    setBusy(true);
    const r = await duplicateContractAction(contractId, rev);
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success('Δημιουργήθηκε νέα πρόχειρη προσφορά');
    router.push(`/admin/projects/contracts/${r.data.id}`);
  };

  return (
    <section aria-labelledby="rev-h" className="rounded-xl border border-border bg-card shadow-xs">
      {/* Accordion: κλειστό — στην κεφαλίδα η τρέχουσα έκδοση και πόσες είναι παγωμένες. */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
          <FiChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" aria-hidden />
          <span id="rev-h" role="heading" aria-level={2} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-(length:--fs-14) font-semibold">
            <FiGitBranch className="size-4 text-muted-foreground" aria-hidden /> Εκδόσεις
            <span className="text-(length:--fs-12) font-normal text-muted-foreground">· τρέχουσα έκδοση {current}{frozenCurrent ? ' (παγωμένη)' : ''} · {revisions.length} παγωμένες</span>
          </span>
        </summary>
        <div className="border-t border-border px-4 pb-3 pt-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
                    <p className="text-(length:--fs-12) text-muted-foreground">
            Τρέχουσα: <b className="text-foreground">έκδοση {current}</b>{frozenCurrent ? ' · παγωμένη — η επόμενη αποθήκευση ανοίγει νέα' : ' · σε επεξεργασία'}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => setNewOpen(true)}><FiGitBranch className="size-3.5" aria-hidden /> Νέα έκδοση</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="ghost" aria-label="Περισσότερα για τις εκδόσεις"><FiMoreVertical className="size-4" aria-hidden /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-60">
                <DropdownMenuItem className={ITEM} onSelect={() => void duplicate(null)}><FiCopy className="size-3.5" />Νέα προσφορά από την τρέχουσα</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {revisions.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-(length:--fs-12) text-muted-foreground">
          Καμία παγωμένη έκδοση ακόμη. Κάθε έκδοση κρατιέται αυτόματα όταν συντάσσεται PDF ή στέλνεται η προσφορά — ή με «Νέα έκδοση».
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-border rounded-lg border border-border">
          {revisions.map((r) => {
            const diff = currentGross - r.gross;
            return (
              <li key={r.revision} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-(length:--fs-12) font-semibold tabular-nums">{r.revision}</span>
                <span className="min-w-0 flex-1 basis-48">
                  <span className="flex flex-wrap items-center gap-2 text-(length:--fs-13)">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-(length:--fs-11) font-medium">{REASON[r.reason]}</span>
                    <span className="truncate text-muted-foreground">{r.note ?? ''}</span>
                  </span>
                  <span className="block text-(length:--fs-11) text-muted-foreground">{when(r.createdAt)}{r.createdBy ? ` · ${r.createdBy}` : ''} · {r.lineCount} γραμμές</span>
                </span>
                <span className="text-right">
                  <span className="block text-(length:--fs-13) font-semibold tabular-nums">{eur(r.gross)}</span>
                  {Math.abs(diff) >= 0.01 && <span className={cn('block text-(length:--fs-11) tabular-nums', diff > 0 ? 'text-emerald-800' : 'text-rose-800')}>τώρα {diff > 0 ? '+' : '−'}{eur(Math.abs(diff))}</span>}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ενέργειες για την έκδοση ${r.revision}`}>
                    <FiMoreVertical className="size-4" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuItem className={ITEM} onSelect={() => void open(r.revision)}><FiEye className="size-3.5" />Προβολή</DropdownMenuItem>
                    {canManage && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className={ITEM} disabled={!canRestore || busy} onSelect={() => void restore(r.revision)}><FiRotateCcw className="size-3.5" />Επαναφορά αυτής της έκδοσης</DropdownMenuItem>
                        <DropdownMenuItem className={ITEM} disabled={busy} onSelect={() => void duplicate(r.revision)}><FiCopy className="size-3.5" />Νέα προσφορά από αυτή</DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ol>
      )}
        </div>
      </details>

      {/* Νέα έκδοση: προαιρετική σημείωση για το τι αλλάζει */}
      <Dialog open={newOpen} onOpenChange={(o) => !busy && setNewOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Νέα έκδοση</DialogTitle>
            <DialogDescription>Η έκδοση {current} κρατιέται όπως είναι· οι αλλαγές σας γίνονται στην έκδοση {current + 1}.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label htmlFor="rev-note" className="mb-1 block text-(length:--fs-12) font-medium">Σημείωση για την έκδοση {current} (προαιρετικό)</label>
            <Input id="rev-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="π.χ. Πριν από την αλλαγή σε τραβερτίνο στο μπάνιο" maxLength={300} />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)} disabled={busy}>Άκυρο</Button>
            <Button onClick={() => void freeze()} disabled={busy} className="gap-1.5">{busy ? <FiLoader className="size-4 animate-spin" /> : <FiGitBranch className="size-4" />}Δημιουργία έκδοσης {current + 1}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Προβολή παγωμένης έκδοσης */}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="sm:max-w-3xl">
          {view && (
            <>
              <DialogHeader>
                <DialogTitle>Έκδοση {view.revision} · {REASON[view.reason]}</DialogTitle>
                <DialogDescription>{when(view.createdAt)}{view.note ? ` · ${view.note}` : ''} — {view.input.title}</DialogDescription>
              </DialogHeader>
              <DialogBody className="max-h-[65dvh] space-y-4 overflow-y-auto">
                <dl className="grid grid-cols-3 gap-3 text-(length:--fs-12)">
                  <div className="rounded-lg bg-muted/50 p-2.5"><dt className="text-muted-foreground">Καθαρή αξία</dt><dd className="text-(length:--fs-15) font-semibold tabular-nums">{eur(view.totals.net)}</dd></div>
                  <div className="rounded-lg bg-muted/50 p-2.5"><dt className="text-muted-foreground">Σύνολο με ΦΠΑ</dt><dd className="text-(length:--fs-15) font-semibold tabular-nums">{eur(view.totals.gross)}</dd></div>
                  <div className="rounded-lg bg-muted/50 p-2.5"><dt className="text-muted-foreground">Διαφορά με τώρα</dt><dd className="text-(length:--fs-15) font-semibold tabular-nums">{eur(currentGross - view.totals.gross)}</dd></div>
                </dl>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-(length:--fs-12)">
                    <thead className="bg-muted/40 text-left text-muted-foreground">
                      <tr><th className="px-2.5 py-1.5 font-medium">Γραμμή</th><th className="px-2.5 py-1.5 text-right font-medium">Ποσότητα</th><th className="px-2.5 py-1.5 text-right font-medium">Τιμή</th><th className="px-2.5 py-1.5 text-right font-medium">Αξία</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {view.input.lines.map((l, i) => (
                        <tr key={i}>
                          <td className="max-w-0 px-2.5 py-1.5"><span className="block truncate" title={l.name}>{l.name}</span>{l.notes && <span className="block truncate text-(length:--fs-11) text-muted-foreground">{l.notes}</span>}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{qtyEl(l.qty)} {l.unit ?? ''}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{eur(l.unitPrice)}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{eur(lineNet(l))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {view.input.milestones.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-(length:--fs-12) font-semibold">Πληρωμές</h3>
                    <ul className="space-y-1 text-(length:--fs-12)">
                      {view.input.milestones.map((m, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{m.title}{m.dueDate ? ` · ${m.dueDate}` : ''}</span><span className="tabular-nums">{eur(m.amount)}</span></li>)}
                    </ul>
                  </div>
                )}
                {view.input.customerText && (
                  <div>
                    <h3 className="mb-1 text-(length:--fs-12) font-semibold">Κείμενο για τον πελάτη</h3>
                    <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-(length:--fs-12) leading-relaxed">{view.input.customerText}</p>
                  </div>
                )}
              </DialogBody>
              <DialogFooter>
                {canManage && <Button variant="outline" disabled={busy} onClick={() => void duplicate(view.revision)} className="gap-1.5"><FiCopy className="size-4" />Νέα προσφορά από αυτή</Button>}
                {canManage && canRestore && <Button disabled={busy} onClick={() => void restore(view.revision)} className="gap-1.5"><FiRotateCcw className="size-4" />Επαναφορά</Button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
