'use client';

// Αποδοχή προσφοράς με τις εγγραφές του SoftOne σε ΕΝΑ βήμα: πρώτα προεπισκόπηση (τίποτα δεν γράφεται),
// μετά ρητή επιβεβαίωση. Σειρά: πελάτης (νέος / σύνδεση με υπάρχοντα / ήδη πελάτης) → αποδοχή → έργο.
// Χρησιμοποιείται και ως «Ολοκλήρωση εγγραφών SoftOne» όταν η αποδοχή έγινε χωρίς αυτές.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiAlertTriangle, FiBriefcase, FiCheck, FiCheckCircle, FiDatabase, FiLink, FiLoader, FiUser, FiUserPlus } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AcceptPlan } from '@/lib/prospects-core';
import { acceptAndRegisterAction, acceptPlanAction } from '../actions';

export function AcceptDialog({ open, onOpenChange, contractId }: { open: boolean; onOpenChange: (o: boolean) => void; contractId: string }) {
  const router = useRouter();
  const [plan, setPlan] = React.useState<AcceptPlan | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [agree, setAgree] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [prev, setPrev] = React.useState({ open: false, contractId });
  if (prev.open !== open || prev.contractId !== contractId) {
    setPrev({ open, contractId });
    if (open) { setPlan(null); setError(null); setAgree(false); }
  }
  React.useEffect(() => {
    if (!open) return;
    let ignore = false;
    void acceptPlanAction(contractId).then((r) => { if (!ignore) { if (r.ok) setPlan(r.data); else setError(r.message); } });
    return () => { ignore = true; };
  }, [open, contractId]);

  const writes = !!plan && (plan.customer.mode === 'create' || plan.customer.mode === 'link' || plan.project.mode === 'create');
  const go = async () => {
    if (!plan) return;
    setBusy(true);
    const r = await acceptAndRegisterAction(contractId, {
      customerCode: plan.customer.mode === 'create' ? plan.customer.code : null,
      projectCode: plan.project.mode === 'create' ? plan.project.code : null,
    });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    const d = r.data;
    if (d.warning) toast.warning(d.warning, { duration: 10_000 });
    else toast.success([d.accepted && 'Η προσφορά έγινε αποδεκτή', d.customer && (d.customer.linked ? `συνδέθηκε με τον πελάτη ${d.customer.code}` : `νέος πελάτης ${d.customer.code}`), d.project && `έργο ${d.project.code}`].filter(Boolean).join(' · '));
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{plan && !plan.accept ? 'Ολοκλήρωση εγγραφών SoftOne' : 'Αποδοχή προσφοράς'}</DialogTitle>
          <DialogDescription>{plan ? `${plan.ref} · ${plan.title}` : 'Τι θα γίνει — τίποτα δεν έχει γραφτεί ακόμη.'}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {error && <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-(length:--fs-12) text-destructive"><FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{error}</p>}
          {!plan && !error && <p className="py-4 text-center text-(length:--fs-12) text-muted-foreground"><FiLoader className="mr-1 inline size-3 animate-spin" aria-hidden />Έλεγχος στο SoftOne…</p>}
          {plan && (
            <ol className="space-y-2" aria-label="Βήματα">
              <Step n={1} icon={plan.customer.mode === 'create' ? <FiUserPlus /> : plan.customer.mode === 'link' ? <FiLink /> : <FiUser />}
                title={plan.customer.mode === 'create' ? `Νέος πελάτης στο SoftOne · κωδικός ${plan.customer.code}` : plan.customer.mode === 'link' ? `Σύνδεση με υπάρχοντα πελάτη ${plan.customer.code}` : 'Πελάτης SoftOne'}
                tone={plan.customer.mode === 'existing' ? 'done' : 'write'}>
                <p className="font-medium text-foreground">{plan.customer.name}</p>
                {plan.customer.mode === 'link' && <p>Βρέθηκε στο SoftOne με ίδιο {plan.customer.by === 'afm' ? 'ΑΦΜ' : 'email'} — δεν δημιουργείται διπλή καρτέλα.</p>}
                {plan.customer.mode === 'create' && (
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    {plan.customer.fields.map((f) => <React.Fragment key={f.label}><dt className="text-muted-foreground">{f.label}</dt><dd className="min-w-0 break-words text-foreground">{f.value}</dd></React.Fragment>)}
                  </dl>
                )}
                {plan.customer.mode !== 'existing' && <p className="mt-1">Οι προσφορές, οι κατόψεις και τα αρχεία του δυνητικού περνούν στον πελάτη.</p>}
              </Step>
              <Step n={2} icon={<FiCheck />} title={plan.accept ? 'Αποδοχή — η προσφορά γίνεται σύμβαση' : 'Η προσφορά έχει ήδη γίνει αποδεκτή'} tone={plan.accept ? 'app' : 'done'}>
                {plan.accept && <p>Καταγράφεται στο ιστορικό ως αποδοχή από το προσωπικό.</p>}
              </Step>
              <Step n={3} icon={<FiBriefcase />} tone={plan.project.mode === 'create' ? 'write' : 'done'}
                title={plan.project.mode === 'create' ? `Νέο έργο στο SoftOne · ${plan.project.code}` : plan.project.mode === 'exists' ? `Συνδεδεμένο έργο ${plan.project.code ?? ''}` : 'Χωρίς έργο'}>
                {plan.project.mode === 'create' && <p className="font-medium text-foreground">{plan.project.name}</p>}
                {plan.project.mode === 'skip' && <p>{plan.project.reason}</p>}
              </Step>
            </ol>
          )}
          {plan && writes && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-(length:--fs-13) text-amber-950">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 accent-(--primary)" />
              <span>Επιβεβαιώνω ότι θέλω να <strong>γραφτούν στο SoftOne</strong> τα βήματα με το <FiDatabase className="inline size-3" aria-label="SoftOne" />.</span>
            </label>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button onClick={go} disabled={!plan || (writes && !agree) || busy} aria-busy={busy} className="gap-1.5">
            {busy ? <FiLoader className="size-4 animate-spin" aria-hidden /> : <FiCheckCircle className="size-4" aria-hidden />}
            {!plan || plan.accept ? (writes ? 'Αποδοχή & εγγραφή στο SoftOne' : 'Αποδοχή') : 'Εγγραφή στο SoftOne'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ένα βήμα: `write` = γράφει στο SoftOne, `app` = μόνο στην εφαρμογή, `done` = υπάρχει ήδη. */
function Step({ n, icon, title, tone, children }: { n: number; icon: React.ReactNode; title: string; tone: 'write' | 'app' | 'done'; children?: React.ReactNode }) {
  return (
    <li className={cn('flex gap-3 rounded-lg border p-3', tone === 'write' ? 'border-sisyphus-500/30 bg-sisyphus-50/50' : 'border-border bg-card')}>
      <span aria-hidden className={cn('grid size-7 shrink-0 place-items-center rounded-full text-(length:--fs-12) font-semibold [&_svg]:size-3.5',
        tone === 'write' ? 'bg-sisyphus-500/15 text-sisyphus-700' : tone === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground')}>
        {tone === 'done' ? <FiCheck /> : icon}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5 text-(length:--fs-12) text-muted-foreground">
        <p className="flex items-center gap-1.5 text-(length:--fs-13) font-semibold text-foreground">
          <span className="sr-only">Βήμα {n}: </span>{title}
          {tone === 'write' && <span className="inline-flex items-center gap-1 rounded-full bg-sisyphus-500/10 px-1.5 py-0.5 text-(length:--fs-11) font-medium text-sisyphus-700"><FiDatabase className="size-3" aria-hidden />SoftOne</span>}
        </p>
        {children}
      </div>
    </li>
  );
}
