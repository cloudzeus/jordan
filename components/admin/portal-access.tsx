'use client';

// Πρόσβαση πελάτη/συνεργάτη στο portal: παράθυρο νέας πρόσβασης ή αλλαγής κωδικού, ένδειξη
// κατάστασης και οι ενέργειες του μενού ⋮ (κανόνας: διαχείριση ΠΑΝΤΑ από dropdown).
import * as React from 'react';
import { FiKey, FiEye, FiEyeOff, FiRefreshCw, FiCopy, FiLoader, FiCheck, FiLock, FiUnlock, FiUserX, FiMail, FiShield } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Field, FormSection, RowHint, fieldCls } from '@/components/admin/form-kit';
import { useViewAs } from '@/components/admin/view-as-button';

export type AccessKind = 'customer-contact' | 'partner-contact' | 'partner';
export type AccessUser = { id: string; email: string; isActive: boolean; createdAt: string; lastLogin: string | null } | null;

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';

/** Τυχαίος κωδικός 12 χαρακτήρων: γράμματα (χωρίς μπερδεμένα l/I/O/0) + αριθμοί + σύμβολο. */
export function generatePassword(len = 12): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits + '!#%+=?';
  const rnd = (n: number) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const out = [letters[rnd(letters.length)], digits[rnd(digits.length)]];
  while (out.length < len) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}

export function passwordProblem(p: string): string | null {
  if (p.length < 8) return 'Τουλάχιστον 8 χαρακτήρες';
  if (!/[A-Za-zΑ-Ωα-ω]/.test(p) || !/\d/.test(p)) return 'Γράμματα και αριθμοί';
  return null;
}

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message ?? 'Η ενέργεια απέτυχε');
  return d;
}

/** Νέα πρόσβαση (email + κωδικός) ή αλλαγή κωδικού για υπάρχουσα. */
export function AccessDialog({ open, onOpenChange, kind, holderId, holderName, defaultEmail, mode, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; kind: AccessKind; holderId: string; holderName: string;
  defaultEmail?: string | null; mode: 'grant' | 'password'; onDone: () => void;
}) {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(true);
  const [welcome, setWelcome] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  // Reset με «adjust state while rendering» (αρχικό `[]` ⇒ και στο πρώτο render, όπως το effect).
  const [prevDeps, setPrevDeps] = React.useState<readonly unknown[]>([]);
  if (prevDeps.length === 0 || !Object.is(prevDeps[0], open) || !Object.is(prevDeps[1], defaultEmail)) {
    setPrevDeps([open, defaultEmail]);
    if (open) { setEmail(defaultEmail ?? ''); setPassword(generatePassword()); setShow(true); setWelcome(true); }
  }

  const pwErr = passwordProblem(password);
  const emailOk = mode === 'password' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const copy = async () => { try { await navigator.clipboard.writeText(password); toast.success('Ο κωδικός αντιγράφηκε'); } catch { toast.error('Δεν επετράπη η αντιγραφή'); } };

  const save = async () => {
    setBusy(true);
    try {
      if (mode === 'grant') {
        const d = await call(`/api/admin/access/${kind}/${holderId}`, 'POST', { email: email.trim(), password, sendWelcome: welcome });
        toast.success(`Δημιουργήθηκε πρόσβαση για ${d.email}${d.welcome === 'sent' ? ' · στάλθηκε email καλωσορίσματος' : d.welcome === 'failed' ? ' · ΤΟ EMAIL ΑΠΕΤΥΧΕ' : ''}`);
      } else {
        await call(`/api/admin/access/${kind}/${holderId}`, 'PATCH', { password });
        toast.success('Ο κωδικός άλλαξε');
      }
      onDone();
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[92dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-2.5 pr-12 text-left">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-sisyphus-50 text-sisyphus-600 dark:bg-sisyphus-500/15 [&_svg]:size-4"><FiKey /></span>
          <div className="min-w-0">
            <DialogTitle className="text-(length:--fs-15)">{mode === 'grant' ? 'Πρόσβαση στην πλατφόρμα' : 'Αλλαγή κωδικού'}</DialogTitle>
            <DialogDescription className="truncate text-(length:--fs-11)">{holderName}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-3 bg-muted/20 px-4 py-3">
          <FormSection tone="blue" icon={<FiShield />} title="Στοιχεία σύνδεσης">
            {mode === 'grant' && (
              <Field label="Email (όνομα χρήστη)" required htmlFor="acc-email">
                <Input id="acc-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldCls} autoFocus={!defaultEmail} />
              </Field>
            )}
            <Field label={mode === 'grant' ? 'Κωδικός' : 'Νέος κωδικός'} required htmlFor="acc-pass" error={password && pwErr ? pwErr : null}>
              <div className="flex gap-1.5">
                <Input id="acc-pass" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={cn(fieldCls, 'font-mono')} />
                <Button type="button" variant="outline" size="sm" className="size-8 shrink-0 p-0" onClick={() => setShow((v) => !v)} aria-label={show ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}>{show ? <FiEyeOff className="size-3.5" /> : <FiEye className="size-3.5" />}</Button>
                <Button type="button" variant="outline" size="sm" className="size-8 shrink-0 p-0" onClick={() => setPassword(generatePassword())} aria-label="Νέος τυχαίος κωδικός" title="Νέος τυχαίος κωδικός"><FiRefreshCw className="size-3.5" /></Button>
                <Button type="button" variant="outline" size="sm" className="size-8 shrink-0 p-0" onClick={copy} aria-label="Αντιγραφή κωδικού" title="Αντιγραφή"><FiCopy className="size-3.5" /></Button>
              </div>
            </Field>
            <RowHint>Τουλάχιστον 8 χαρακτήρες με γράμματα και αριθμούς. Δώσε τον κωδικό στον χρήστη με ασφαλή τρόπο (π.χ. τηλεφωνικά) — <strong>δεν</strong> στέλνεται με email.</RowHint>
            {mode === 'grant' && (
              <label className="flex cursor-pointer items-start gap-2 text-(length:--fs-12)">
                <input type="checkbox" className="mt-0.5 size-4 accent-[#0369A1]" checked={welcome} onChange={(e) => setWelcome(e.target.checked)} />
                <span><strong>Email καλωσορίσματος</strong> — με το όνομα χρήστη και τον σύνδεσμο σύνδεσης (χωρίς τον κωδικό).</span>
              </label>
            )}
            {mode === 'password' && <RowHint tone="warn">Ο χρήστης αποσυνδέεται και μπαίνει ξανά με τον νέο κωδικό.</RowHint>}
          </FormSection>
        </DialogBody>
        <DialogFooter className="mx-0 mb-0 items-center gap-2 border-t border-border bg-card px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button size="sm" onClick={save} disabled={busy || !!pwErr || !emailOk}>
            {busy ? <FiLoader className="mr-1.5 size-3.5 animate-spin" /> : <FiCheck className="mr-1.5 size-3.5" />}
            {mode === 'grant' ? 'Δημιουργία πρόσβασης' : 'Αλλαγή κωδικού'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ένδειξη πρόσβασης: «Χωρίς πρόσβαση» / «Ενεργή · τελευταία σύνδεση …» / «Απενεργοποιημένη». */
export function AccessStatus({ user, compact }: { user: AccessUser; compact?: boolean }) {
  if (!user) return <span className="text-(length:--fs-11) text-muted-foreground">{compact ? '—' : 'Χωρίς πρόσβαση'}</span>;
  const last = user.lastLogin ? new Date(user.lastLogin).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  return (
    <span className="inline-flex min-w-0 flex-col">
      <span className={cn('inline-flex w-fit items-center gap-1 rounded-sm px-1.5 py-0.5 text-(length:--fs-10) font-semibold', user.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200')}>
        {user.isActive ? <FiUnlock className="size-3" aria-hidden /> : <FiLock className="size-3" aria-hidden />}
        {user.isActive ? 'Πρόσβαση' : 'Απενεργοποιημένη'}
      </span>
      {!compact && <span className="truncate text-(length:--fs-10) text-muted-foreground" title={user.email}>{user.email}{last ? ` · ${last}` : ' · δεν συνδέθηκε ακόμη'}</span>}
    </span>
  );
}

/** Τα στοιχεία μενού ⋮ για την πρόσβαση ενός προσώπου. */
export function AccessMenuItems({ kind, holderId, holderName, user, onGrant, onPassword, onChanged }: {
  kind: AccessKind; holderId: string; holderName: string; user: AccessUser;
  onGrant: () => void; onPassword: () => void; onChanged: () => void;
}) {
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error((e as Error).message); } };
  const url = `/api/admin/access/${kind}/${holderId}`;
  const viewAs = useViewAs();
  if (!user) {
    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={ITEM} onSelect={onGrant}><FiKey className="size-3.5" style={{ color: '#0369A1' }} aria-hidden /> Πρόσβαση στην πλατφόρμα…</DropdownMenuItem>
      </>
    );
  }
  return (
    <>
      <DropdownMenuSeparator />
      {user.isActive && <DropdownMenuItem className={ITEM} disabled={viewAs.pending} onSelect={() => viewAs.open(user.id)}><FiEye className="size-3.5" style={{ color: '#0369A1' }} aria-hidden /> Προβολή portal (ως {holderName})</DropdownMenuItem>}
      <DropdownMenuItem className={ITEM} onSelect={onPassword}><FiKey className="size-3.5" aria-hidden /> Αλλαγή κωδικού…</DropdownMenuItem>
      <DropdownMenuItem className={ITEM} onSelect={() => run(() => call(`${url}/welcome`, 'POST'), `Στάλθηκε email στο ${user.email}`)}><FiMail className="size-3.5" aria-hidden /> Email καλωσορίσματος ξανά</DropdownMenuItem>
      {user.isActive
        ? <DropdownMenuItem className={ITEM} onSelect={() => run(() => call(url, 'PATCH', { isActive: false }), 'Η πρόσβαση απενεργοποιήθηκε')}><FiLock className="size-3.5" aria-hidden /> Απενεργοποίηση πρόσβασης</DropdownMenuItem>
        : <DropdownMenuItem className={ITEM} onSelect={() => run(() => call(url, 'PATCH', { isActive: true }), 'Η πρόσβαση ενεργοποιήθηκε')}><FiUnlock className="size-3.5" style={{ color: '#047857' }} aria-hidden /> Ενεργοποίηση πρόσβασης</DropdownMenuItem>}
      <DropdownMenuItem variant="destructive" className={ITEM} onSelect={async () => {
        if (await confirmAction({ title: 'Αφαίρεση πρόσβασης', message: `Διαγραφή του χρήστη ${user.email} (${holderName}); Το πρόσωπο επικοινωνίας μένει.`, confirmLabel: 'Αφαίρεση', destructive: true })) {
          await run(() => call(url, 'DELETE'), 'Η πρόσβαση αφαιρέθηκε');
        }
      }}><FiUserX className="size-3.5" aria-hidden /> Αφαίρεση πρόσβασης</DropdownMenuItem>
    </>
  );
}
