'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  FiAlertTriangle, FiCheck, FiCheckCircle, FiDatabase, FiLink, FiLoader, FiMoreVertical, FiPlay, FiRotateCcw, FiSearch, FiTrash2, FiXCircle,
} from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { canTransition, type ContractAction } from '@/lib/contracts/core';
import type { ContractView } from '@/lib/contracts/service';
import { contractTransitionAction, createPrjcAction, deleteContractAction, linkProjectAction, previewPrjcAction } from '../actions';

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';

const ACTIONS: { action: ContractAction; label: string; icon: React.ReactNode; confirm?: string }[] = [
  { action: 'accept', label: 'Αποδοχή από τον πελάτη → Σύμβαση', icon: <FiCheck className="size-3.5" /> },
  { action: 'activate', label: 'Ενεργοποίηση (εργασίες & ημερολόγιο)', icon: <FiPlay className="size-3.5" />, confirm: 'Ενεργοποίηση της σύμβασης;\nΤα milestones γίνονται εργασίες του έργου και οι επιλεγμένοι υπάλληλοι παίρνουν προσκλήσεις ημερολογίου.' },
  { action: 'complete', label: 'Ολοκλήρωση', icon: <FiCheckCircle className="size-3.5" /> },
  { action: 'cancel', label: 'Ακύρωση', icon: <FiXCircle className="size-3.5" />, confirm: 'Ακύρωση της σύμβασης;\nΟι εργασίες που δημιουργήθηκαν από τα milestones θα αφαιρεθούν.' },
  { action: 'reopen', label: 'Άνοιγμα ξανά', icon: <FiRotateCcw className="size-3.5" /> },
];

/** Μενού ⋮ της σύμβασης: μεταβάσεις, έργο SoftOne (σύνδεση / δημιουργία), διαγραφή. */
export function ContractActions({ contract: c }: { contract: ContractView }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [link, setLink] = React.useState(false);
  const [create, setCreate] = React.useState(false);

  const run = async (a: (typeof ACTIONS)[number]) => {
    if (a.confirm && !(await confirmAction(a.confirm))) return;
    setBusy(true);
    const r = await contractTransitionAction(c.id, a.action);
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    // Αποδοχή προσφοράς πελάτη χωρίς έργο: αμέσως η δημιουργία του έργου στον πελάτη (με επιβεβαίωση
    // πριν γραφτεί οτιδήποτε στο SoftOne).
    if (a.action === 'accept' && !c.prjc && c.trdr) {
      toast.success('Η προσφορά έγινε αποδεκτή — δημιούργησε τώρα το έργο στον πελάτη');
      setCreate(true);
    } else toast.success(a.action === 'activate' ? 'Ενεργοποιήθηκε — οι εργασίες μπήκαν στο έργο και στο ημερολόγιο' : 'Ενημερώθηκε');
  };
  const remove = async () => {
    if (!(await confirmAction(`Διαγραφή της ${c.ref} «${c.title}»;\nΤα PDF μένουν στα αρχεία.`))) return;
    const r = await deleteContractAction(c.id);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success('Διαγράφηκε');
    router.push('/admin/projects/contracts');
  };

  const available = ACTIONS.filter((a) => canTransition(c.status, a.action));
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted" aria-label="Ενέργειες σύμβασης" disabled={busy}>
          {busy ? <FiLoader className="size-4 animate-spin" /> : <FiMoreVertical className="size-4" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuLabel className="text-(length:--fs-11) text-muted-foreground">Κατάσταση</DropdownMenuLabel>
          {available.map((a) => (
            <DropdownMenuItem key={a.action} className={ITEM} variant={a.action === 'cancel' ? 'destructive' : 'default'} onSelect={() => void run(a)}>{a.icon}{a.label}</DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-(length:--fs-11) text-muted-foreground">Έργο SoftOne</DropdownMenuLabel>
          <DropdownMenuItem className={ITEM} onSelect={() => setLink(true)} disabled={c.status === 'ACTIVE'}><FiLink className="size-3.5" />{c.prjc ? 'Αλλαγή συνδεδεμένου έργου' : 'Σύνδεση με υπάρχον έργο'}</DropdownMenuItem>
          {!c.prjc && <DropdownMenuItem className={ITEM} onSelect={() => setCreate(true)} disabled={!c.trdr}><FiDatabase className="size-3.5" />Δημιουργία έργου στο SoftOne…</DropdownMenuItem>}
          {c.status !== 'ACTIVE' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => void remove()}><FiTrash2 className="size-3.5" />Διαγραφή</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <LinkDialog open={link} onOpenChange={setLink} contract={c} />
      <CreatePrjcDialog open={create} onOpenChange={setCreate} contract={c} />
    </>
  );
}

function LinkDialog({ open, onOpenChange, contract: c }: { open: boolean; onOpenChange: (o: boolean) => void; contract: ContractView }) {
  const [q, setQ] = React.useState('');
  const [opts, setOpts] = React.useState<{ prjc: number; code: string; name: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/admin/contracts/options?kind=projects&q=${encodeURIComponent(q.trim() || c.customerName?.split(' ')[0] || '')}`, { signal: ctl.signal })
        .then((r) => r.json()).then((b) => setOpts(b.options ?? [])).catch(() => null);
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open, c.customerName]);
  const pick = async (prjc: number) => {
    setBusy(true);
    const r = await linkProjectAction(c.id, prjc);
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success('Συνδέθηκε με το έργο — τα PDF αντιγράφηκαν στα αρχεία του');
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Σύνδεση με έργο SoftOne</DialogTitle>
          <DialogDescription>Μόνο ανάγνωση από τον καθρέφτη — τίποτα δεν γράφεται στο SoftOne.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-2">
          <div className="relative">
            <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Κωδικός ή όνομα έργου…" className="h-9 pl-8" autoFocus aria-label="Αναζήτηση έργου" />
          </div>
          <ul className="max-h-72 overflow-auto rounded-md border border-border">
            {opts.map((p) => (
              <li key={p.prjc}>
                <button type="button" disabled={busy} onClick={() => pick(p.prjc)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted">
                  <span className="font-mono text-(length:--fs-11) text-muted-foreground">{p.code}</span>
                  <span className="truncate text-(length:--fs-13)">{p.name}</span>
                </button>
              </li>
            ))}
            {!opts.length && <li className="px-3 py-3 text-(length:--fs-12) text-muted-foreground">Κανένα έργο.</li>}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** Δημιουργία PRJC: πρώτα προεπισκόπηση (dry-run), μετά ρητή επιβεβαίωση με checkbox. */
function CreatePrjcDialog({ open, onOpenChange, contract: c }: { open: boolean; onOpenChange: (o: boolean) => void; contract: ContractView }) {
  const [plan, setPlan] = React.useState<{ code: string; payload: unknown } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [agree, setAgree] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Επαναφορά στο άνοιγμα (adjust-state-while-rendering)· η προεπισκόπηση στο effect.
  const [prevDeps, setPrevDeps] = React.useState({ open: false, id: c.id });
  if (prevDeps.open !== open || prevDeps.id !== c.id) {
    setPrevDeps({ open, id: c.id });
    if (open) { setPlan(null); setError(null); setAgree(false); }
  }
  React.useEffect(() => {
    if (!open) return;
    void (async () => {
      const r = await previewPrjcAction(c.id);
      if (!r.ok) setError(r.message); else setPlan(r.data);
    })();
  }, [open, c.id]);
  const go = async () => {
    if (!plan) return;
    setBusy(true);
    const r = await createPrjcAction(c.id, plan.code);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    toast.success(`Δημιουργήθηκε το έργο ${r.data.code} στο SoftOne`);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Δημιουργία έργου στο SoftOne</DialogTitle>
          <DialogDescription>Θα γραφτεί νέα εγγραφή «Έργα» (PRJC) στο SoftOne με τα παρακάτω στοιχεία.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {error && <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-(length:--fs-12) text-destructive"><FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" />{error}</p>}
          {!plan && !error && <p className="text-(length:--fs-12) text-muted-foreground"><FiLoader className="mr-1 inline size-3 animate-spin" />Προεπισκόπηση…</p>}
          {plan && (
            <>
              <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-(length:--fs-11)">{JSON.stringify(plan.payload, null, 2)}</pre>
              <label className="flex items-start gap-2 text-(length:--fs-13)">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
                <span>Επιβεβαιώνω ότι θέλω να <strong>γραφτεί</strong> το έργο {plan.code} στο SoftOne.</span>
              </label>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button onClick={go} disabled={!plan || !agree || busy} className="gap-1.5">{busy ? <FiLoader className="size-4 animate-spin" /> : <FiDatabase className="size-4" />}Εγγραφή στο SoftOne</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Αποδεκτή προσφορά πελάτη χωρίς έργο (π.χ. αποδοχή από το portal, ή «Αργότερα» στο παράθυρο): μπάρα
 * με «Δημιουργία έργου στον πελάτη» — ίδιο παράθυρο με επιβεβαίωση πριν γραφτεί κάτι στο SoftOne.
 */
export function CreateProjectBanner({ contract: c }: { contract: ContractView }) {
  const [open, setOpen] = React.useState(false);
  if (c.prjc || !c.trdr || c.stage !== 'CONTRACT' || c.status === 'CANCELLED') return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: '#6EE7B7', background: '#ECFDF5' }}>
        <FiCheckCircle className="size-5 shrink-0" style={{ color: '#047857' }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-(length:--fs-13) font-semibold" style={{ color: '#065F46' }}>Η προσφορά έγινε αποδεκτή — δεν υπάρχει ακόμη έργο</p>
          <p className="text-(length:--fs-12)" style={{ color: '#047857' }}>Δημιούργησε το έργο στον πελάτη στο SoftOne (ή σύνδεσέ το με υπάρχον από το μενού ⋮)· εκεί μπαίνουν τα αρχεία, η κάτοψη και οι εργασίες.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} style={{ background: '#047857', color: '#fff' }}><FiDatabase className="size-3.5" aria-hidden /> Δημιουργία έργου…</Button>
      </div>
      <CreatePrjcDialog open={open} onOpenChange={setOpen} contract={c} />
    </>
  );
}
