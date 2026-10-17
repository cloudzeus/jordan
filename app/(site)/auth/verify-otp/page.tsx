import Link from 'next/link';
import type { Metadata } from 'next';
import { readPending } from '@/lib/auth-flow';
import { btn, Eyebrow, Field, inputCls, Notice } from '@/components/site/ui';
import { PasswordInput, SubmitButton } from '@/components/site/auth-fields';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Κωδικός επιβεβαίωσης' };

const ERRORS: Record<string, string> = {
  invalid: 'Ο κωδικός δεν είναι σωστός ή έληξε. Μετά από 5 λάθη ζητήστε νέο.',
  missing_password: 'Γράψτε τον νέο κωδικό.',
  weak: 'Ο νέος κωδικός χρειάζεται τουλάχιστον 8 χαρακτήρες.',
  mismatch: 'Οι δύο κωδικοί δεν ταιριάζουν.',
};

/** Βήμα 2: ο εξαψήφιος κωδικός (+ νέος κωδικός στην επαναφορά). Το email έρχεται από httpOnly cookie, όχι από το URL. */
export default async function VerifyOtpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const pending = await readPending();

  if (!pending) {
    return (
      <div>
        <h1 className="font-site text-[length:var(--fs-28)] font-light leading-tight">Η διαδικασία έληξε</h1>
        <p className="mt-4 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">Οι κωδικοί ισχύουν 15 λεπτά. Ξεκινήστε πάλι — παίρνει ένα λεπτό.</p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/auth/lost-password" className={btn.primary}>Νέος κωδικός</Link>
          <Link href="/auth/signin" className={btn.ghost}>Είσοδος</Link>
        </div>
      </div>
    );
  }

  const reset = pending.mode === 'reset';
  const err = sp.error ? ERRORS[sp.error] ?? 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.' : null;
  return (
    <div>
      <Eyebrow>{reset ? 'Βήμα 2 από 2' : 'Είσοδος με κωδικό email'}</Eyebrow>
      <h1 className="font-site mt-4 text-[length:var(--fs-32)] font-light leading-none">{reset ? 'Νέος κωδικός' : 'Ελέγξτε το email σας'}</h1>
      <p className="mt-4 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">
        Αν υπάρχει λογαριασμός για το <strong className="font-medium text-[var(--s-ink)]">{pending.email}</strong>, μόλις στείλαμε εξαψήφιο κωδικό. Κοιτάξτε και στα ανεπιθύμητα.
      </p>

      <form action="/api/auth/otp/verify" method="post" className="mt-8 space-y-6">
        {err && <Notice tone="error">{err}</Notice>}
        <Field label="Κωδικός από το email" htmlFor="code">
          <input
            id="code" name="code" required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
            title="6 ψηφία" className={cn(inputCls, 'h-14 text-center font-mono text-[length:var(--fs-24)] tracking-[0.5em]')}
          />
        </Field>
        {reset && (
          <>
            {/* Κρυφό username: οι password managers αποθηκεύουν τον νέο κωδικό στον σωστό λογαριασμό. */}
            <input type="text" name="username" autoComplete="username" value={pending.email} readOnly hidden />
            <Field label="Νέος κωδικός" htmlFor="password" hint="Τουλάχιστον 8 χαρακτήρες.">
              <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} describedBy="password-hint" />
            </Field>
            <Field label="Επανάληψη νέου κωδικού" htmlFor="confirm">
              <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={8} />
            </Field>
          </>
        )}
        <SubmitButton className={cn(btn.primary, 'w-full')} pendingLabel="Έλεγχος…">{reset ? 'Αποθήκευση κωδικού' : 'Είσοδος'}</SubmitButton>
      </form>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--s-line)] pt-6 text-[length:var(--fs-14)]">
        <form action="/api/auth/otp/send" method="post">
          <input type="hidden" name="mode" value={pending.mode} />
          <input type="hidden" name="email" value={pending.email} />
          <button type="submit" className="s-link inline-flex min-h-11 cursor-pointer items-center text-[var(--s-ink)]">Δεν ήρθε; Στείλτε νέο κωδικό</button>
        </form>
        <Link href={reset ? '/auth/lost-password' : '/auth/signin?mode=otp'} className="s-link inline-flex min-h-11 items-center text-[var(--s-ink-2)]">Άλλο email</Link>
      </div>
    </div>
  );
}
