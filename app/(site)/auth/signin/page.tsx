import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUserWithPermissions } from '@/lib/rbac';
import { homeFor } from '@/lib/auth-home';
import { btn, Eyebrow, Field, inputCls, Notice } from '@/components/site/ui';
import { PasswordInput, SubmitButton } from '@/components/site/auth-fields';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Είσοδος' };

const ERRORS: Record<string, string> = {
  invalid: 'Το email ή ο κωδικός δεν είναι σωστός. Ελέγξτε τα και δοκιμάστε ξανά.',
  missing: 'Συμπληρώστε email και κωδικό.',
  inactive: 'Ο λογαριασμός σας είναι ανενεργός. Επικοινωνήστε μαζί μας για να ενεργοποιηθεί.',
  expired: 'Η διαδικασία έληξε. Ξεκινήστε πάλι από την αρχή.',
  email: 'Το email δεν φαίνεται σωστό.',
  send: 'Δεν μπορέσαμε να στείλουμε το email αυτή τη στιγμή. Δοκιμάστε σε λίγο.',
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; mode?: string; success?: string }> }) {
  const sp = await searchParams;
  // Ήδη συνδεδεμένος → κατευθείαν στη σελίδα του.
  const user = await getCurrentUserWithPermissions().catch(() => null);
  if (user) redirect(homeFor(user.role.key));

  const otp = sp.mode === 'otp';
  const err = sp.error ? ERRORS[sp.error] ?? 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.' : null;
  const tab = (on: boolean) => cn('inline-flex min-h-11 flex-1 items-center justify-center border-b-2 text-[length:var(--fs-14)] transition-colors', on ? 'border-[var(--s-ink)] font-medium text-[var(--s-ink)]' : 'border-transparent text-[var(--s-mute)] hover:text-[var(--s-ink)]');

  return (
    <div>
      <Eyebrow>B2B πύλη · μόνο για επαγγελματίες</Eyebrow>
      <h1 className="font-display mt-4 text-[length:var(--fs-48)]">Είσοδος</h1>
      <p className="mt-4 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">Με τον λογαριασμό που σας δώσαμε. Θα σας οδηγήσουμε αυτόματα στη σωστή σελίδα.</p>

      <nav aria-label="Τρόπος εισόδου" className="mt-8 flex border-b border-[var(--s-line)]">
        <Link href="/auth/signin" className={tab(!otp)} aria-current={!otp ? 'page' : undefined}>Με κωδικό</Link>
        <Link href="/auth/signin?mode=otp" className={tab(otp)} aria-current={otp ? 'page' : undefined}>Με κωδικό μέσω email</Link>
      </nav>

      <div className="mt-8 space-y-6">
        {sp.success === 'reset' && <Notice tone="success">Ο νέος κωδικός ορίστηκε. Συνδεθείτε τώρα με αυτόν.</Notice>}
        {err && <Notice tone="error">{err}</Notice>}

        {!otp ? (
          <form action="/api/auth/password" method="post" className="space-y-6">
            <Field label="Email" htmlFor="email">
              <input id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus className={inputCls} />
            </Field>
            <Field
              label="Κωδικός" htmlFor="password"
              aside={<Link href="/auth/lost-password" className="s-link text-[length:var(--fs-13)] text-[var(--s-ink-2)]">Ξεχάσατε τον κωδικό;</Link>}
            >
              <PasswordInput id="password" name="password" autoComplete="current-password" />
            </Field>
            <SubmitButton className={cn(btn.primary, 'w-full')} pendingLabel="Σύνδεση…">Σύνδεση</SubmitButton>
          </form>
        ) : (
          <form action="/api/auth/otp/send" method="post" className="space-y-6">
            <input type="hidden" name="mode" value="login" />
            <Field label="Email" htmlFor="email" hint="Θα λάβετε εξαψήφιο κωδικό, έγκυρο για 15 λεπτά. Χωρίς κωδικό πρόσβασης." >
              <input id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus aria-describedby="email-hint" className={inputCls} />
            </Field>
            <SubmitButton className={cn(btn.primary, 'w-full')} pendingLabel="Αποστολή…">Στείλτε μου κωδικό</SubmitButton>
          </form>
        )}
      </div>

      <div className="mt-10 space-y-3 border-t border-[var(--s-line)] pt-6 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
        <p>Δεν έχετε λογαριασμό; <Link href="/auth/register" className="s-link font-medium text-[var(--s-ink)]">Ζητήστε πρόσβαση</Link></p>
        {process.env.MICROSOFT_CLIENT_ID && (
          <p>Προσωπικό: <a href="/api/auth/signin/microsoft-entra-id" className="s-link text-[var(--s-ink)]">είσοδος με Microsoft</a></p>
        )}
      </div>
    </div>
  );
}
