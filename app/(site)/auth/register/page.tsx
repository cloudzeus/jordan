import Link from 'next/link';
import type { Metadata } from 'next';
import { btn, Eyebrow, Field, inputCls, Notice } from '@/components/site/ui';
import { SubmitButton } from '@/components/site/auth-fields';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Αίτημα πρόσβασης' };

const ERRORS: Record<string, string> = {
  missing: 'Συμπληρώστε ονοματεπώνυμο και επωνυμία εταιρείας.',
  vat: 'Συμπληρώστε τον ΑΦΜ της εταιρείας — η πύλη απευθύνεται μόνο σε επαγγελματίες.',
  terms: 'Για να συνεχίσετε, αποδεχτείτε τους όρους χρήσης.',
  email: 'Το email δεν φαίνεται σωστό.',
  send: 'Δεν μπορέσαμε να στείλουμε το αίτημα αυτή τη στιγμή. Δοκιμάστε σε λίγο ή τηλεφωνήστε μας.',
};

/**
 * B2B: ο λογαριασμός ΔΕΝ ανοίγει αυτόματα — το αίτημα πάει στην εταιρεία, που δίνει πρόσβαση από την
 * καρτέλα του πελάτη/συνεργάτη (ώστε ο χρήστης να «δεθεί» με τον σωστό πελάτη και να δει τις δικές του τιμές).
 */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const sp = await searchParams;
  if (sp.success) {
    return (
      <div>
        <Eyebrow>Ευχαριστούμε</Eyebrow>
        <h1 className="font-display mt-4 text-[length:var(--fs-48)]">Το αίτημα στάλθηκε</h1>
        <p className="mt-4 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">Θα το δούμε και θα σας στείλουμε email με τα στοιχεία εισόδου μόλις ενεργοποιηθεί ο λογαριασμός σας — συνήθως μέσα σε μία εργάσιμη.</p>
        <div className="mt-8"><Link href="/" className={btn.ghost}>Στην αρχική</Link></div>
      </div>
    );
  }
  const err = sp.error ? ERRORS[sp.error] ?? 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.' : null;
  const radio = 'peer sr-only';
  const pill = 'inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center border border-[var(--s-line)] text-[length:var(--fs-15)] text-[var(--s-ink-2)] transition-colors peer-checked:border-[var(--s-ink)] peer-checked:bg-[var(--s-ink)] peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2';

  return (
    <div>
      <Eyebrow>Για επαγγελματίες</Eyebrow>
      <h1 className="font-display mt-4 text-[length:var(--fs-48)]">Αίτημα πρόσβασης</h1>
      <p className="mt-4 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">Η πύλη απευθύνεται μόνο σε επαγγελματίες: δυναμικές προσφορές κοινού container, τα έργα και οι παραγγελίες σας, παραγγελίες από τον κατάλογο. Πείτε μας ποιοι είστε.</p>

      <form action="/api/auth/register" method="post" className="mt-8 space-y-6">
        {err && <Notice tone="error">{err}</Notice>}
        <fieldset>
          <legend className="text-[length:var(--fs-14)] font-medium">Είστε</legend>
          <div className="mt-2 flex gap-2">
            <label className="flex flex-1"><input type="radio" name="kind" value="customer" defaultChecked className={radio} /><span className={pill}>Πελάτης</span></label>
            <label className="flex flex-1"><input type="radio" name="kind" value="partner" className={radio} /><span className={pill}>Συνεργάτης</span></label>
          </div>
        </fieldset>
        <Field label="Ονοματεπώνυμο *" htmlFor="name"><input id="name" name="name" required autoComplete="name" className={inputCls} /></Field>
        <Field label="Εταιρεία *" htmlFor="company"><input id="company" name="company" required autoComplete="organization" className={inputCls} /></Field>
        <Field label="Δραστηριότητα" htmlFor="profession">
          <select id="profession" name="profession" defaultValue="" className={inputCls}>
            <option value="">— Επιλέξτε —</option>
            {['Αρχιτέκτονας / αρχιτεκτονικό γραφείο', 'Τεχνικό γραφείο / μηχανικός', 'Κατασκευαστική εταιρεία', 'Εργολάβος / συνεργείο', 'Διακοσμητής', 'Άλλο'].map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Email *" htmlFor="email"><input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className={inputCls} /></Field>
          <Field label="Τηλέφωνο" htmlFor="phone"><input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" className={inputCls} /></Field>
        </div>
        <Field label="ΑΦΜ εταιρείας *" htmlFor="vat" hint="Μόνο για επαγγελματίες — μας βοηθά να σας βρούμε στο αρχείο μας."><input id="vat" name="vat" required inputMode="numeric" maxLength={20} aria-describedby="vat-hint" className={inputCls} /></Field>
        <Field label="Μήνυμα" htmlFor="message">
          <textarea id="message" name="message" rows={4} maxLength={2000} className={cn(inputCls, 'h-auto py-3')} />
        </Field>
        {/* Honeypot: κρυφό από ανθρώπους, τα bots το συμπληρώνουν. */}
        <div aria-hidden className="absolute -left-[9999px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <label className="flex cursor-pointer items-start gap-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
          <input type="checkbox" name="terms" value="1" required className="mt-0.5 size-5 shrink-0 accent-[var(--s-ink)]" />
          <span>Δηλώνω ότι ενεργώ για λογαριασμό επιχείρησης και αποδέχομαι τους <Link href="/legal/terms" className="s-link text-[var(--s-ink)]" target="_blank">όρους χρήσης</Link>. *</span>
        </label>
        <SubmitButton className={cn(btn.primary, 'w-full')} pendingLabel="Αποστολή…">Αποστολή αιτήματος</SubmitButton>
        <p className="text-[length:var(--fs-13)] text-[var(--s-mute)]">* υποχρεωτικά πεδία. Χρησιμοποιούμε τα στοιχεία μόνο για να σας απαντήσουμε — δείτε την <Link href="/legal/privacy" className="s-link" target="_blank">πολιτική απορρήτου</Link>.</p>
      </form>

      <p className="mt-10 border-t border-[var(--s-line)] pt-6 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
        Έχετε ήδη λογαριασμό; <Link href="/auth/signin" className="s-link font-medium text-[var(--s-ink)]">Είσοδος</Link>
      </p>
    </div>
  );
}
