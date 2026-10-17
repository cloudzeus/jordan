'use client';

import * as React from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { inputCls } from '@/components/site/ui';
import { cn } from '@/lib/utils';

/** Πεδίο κωδικού με «εμφάνιση/απόκρυψη» (44px στόχος, προσβάσιμο). */
export function PasswordInput({ id, name, autoComplete, describedBy, autoFocus, minLength }: {
  id: string; name: string; autoComplete: 'current-password' | 'new-password'; describedBy?: string; autoFocus?: boolean; minLength?: number;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <input
        id={id} name={name} type={show ? 'text' : 'password'} autoComplete={autoComplete} required minLength={minLength}
        autoFocus={autoFocus} aria-describedby={describedBy} className={cn(inputCls, 'pr-14')}
      />
      <button
        type="button" onClick={() => setShow((s) => !s)}
        className="absolute right-0 top-0 grid size-12 cursor-pointer place-items-center text-[var(--s-mute)] transition-colors hover:text-[var(--s-ink)]"
        aria-label={show ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'} aria-pressed={show} aria-controls={id}
      >
        {show ? <FiEyeOff className="size-4" aria-hidden /> : <FiEye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

/** Κουμπί υποβολής που «κλειδώνει» στο πάτημα — όχι διπλές αποστολές email/κωδικών. */
export function SubmitButton({ children, className, pendingLabel = 'Παρακαλώ περιμένετε…' }: { children: React.ReactNode; className: string; pendingLabel?: string }) {
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const on = () => setBusy(true);
    form.addEventListener('submit', on);
    // Επιστροφή με «πίσω» (bfcache): ξεκλείδωμα.
    const reset = () => setBusy(false);
    window.addEventListener('pageshow', reset);
    return () => { form.removeEventListener('submit', on); window.removeEventListener('pageshow', reset); };
  }, []);
  return (
    <button ref={ref} type="submit" aria-disabled={busy} className={cn(className, busy && 'pointer-events-none opacity-70')}>
      {busy ? pendingLabel : children}
    </button>
  );
}
