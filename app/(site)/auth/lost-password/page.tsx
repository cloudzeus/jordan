import Link from 'next/link';
import type { Metadata } from 'next';
import { btn, Eyebrow, Field, inputCls, Notice } from '@/components/site/ui';
import { SubmitButton } from '@/components/site/auth-fields';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Ξέχασα τον κωδικό' };

const ERRORS: Record<string, string> = {
  email: 'Το email δεν φαίνεται σωστό. Ελέγξτε το και δοκιμάστε ξανά.',
  send: 'Δεν μπορέσαμε να στείλουμε το email αυτή τη στιγμή. Δοκιμάστε σε λίγο.',
};

export default async function LostPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const err = sp.error ? ERRORS[sp.error] ?? 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.' : null;
  return (
    <div>
      <Eyebrow>Βήμα 1 από 2</Eyebrow>
      <h1 className="font-site mt-4 text-[length:var(--fs-32)] font-light leading-none">Ξεχάσατε τον κωδικό;</h1>
      <p className="mt-4 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">Γράψτε το email του λογαριασμού σας. Θα σας στείλουμε εξαψήφιο κωδικό για να ορίσετε νέο.</p>

      <form action="/api/auth/otp/send" method="post" className="mt-8 space-y-6">
        {err && <Notice tone="error">{err}</Notice>}
        <input type="hidden" name="mode" value="reset" />
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus className={inputCls} />
        </Field>
        <SubmitButton className={cn(btn.primary, 'w-full')} pendingLabel="Αποστολή…">Στείλτε μου κωδικό</SubmitButton>
      </form>

      <p className="mt-10 border-t border-[var(--s-line)] pt-6 text-[length:var(--fs-14)]">
        <Link href="/auth/signin" className="s-link text-[var(--s-ink)]">← Πίσω στην είσοδο</Link>
      </p>
    </div>
  );
}
