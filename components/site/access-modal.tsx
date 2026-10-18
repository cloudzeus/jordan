'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { FiArrowRight, FiCheck, FiX } from 'react-icons/fi';
import { btn, Field, inputCls, Notice } from '@/components/site/ui';
import { cn } from '@/lib/utils';

const ERRORS: Record<string, string> = {
  missing: 'Συμπληρώστε ονοματεπώνυμο και επωνυμία εταιρείας.',
  email: 'Το email δεν φαίνεται σωστό.',
  vat: 'Συμπληρώστε τον ΑΦΜ της εταιρείας.',
  terms: 'Για να συνεχίσετε, αποδεχτείτε τους όρους χρήσης.',
  send: 'Δεν μπορέσαμε να στείλουμε το αίτημα αυτή τη στιγμή. Δοκιμάστε σε λίγο ή τηλεφωνήστε μας.',
};

const PROFESSIONS = ['Αρχιτέκτονας / αρχιτεκτονικό γραφείο', 'Τεχνικό γραφείο / μηχανικός', 'Κατασκευαστική εταιρεία', 'Εργολάβος / συνεργείο', 'Διακοσμητής', 'Άλλο'];

/**
 * «Αίτημα πρόσβασης» σε modal, πάνω σε οποιαδήποτε σελίδα του website. Ανοίγει από ΚΑΘΕ σύνδεσμο προς
 * /auth/register (ο σύνδεσμος μένει πραγματικός: χωρίς JavaScript, ή με Ctrl/⌘-κλικ, ανοίγει η σελίδα).
 * Στέλνει στο ίδιο endpoint με τη σελίδα (/api/auth/register) και δείχνει το αποτέλεσμα μέσα στο modal.
 */
export function AccessModalHost() {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<'form' | 'sending' | 'done'>('form');
  const [error, setError] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState<'customer' | 'partner'>('customer');

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest('a');
      if (!a || new URL(a.href, location.href).pathname !== '/auth/register' || location.pathname === '/auth/register') return;
      e.preventDefault();
      setState('form'); setError(null); setOpen(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  React.useEffect(() => {
    const lenis = (window as unknown as { __lenis?: { stop: () => void; start: () => void } }).__lenis;
    if (open) lenis?.stop(); else lenis?.start();
  }, [open]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setState('sending');
    const res = await fetch('/api/auth/register', { method: 'POST', body: new FormData(e.currentTarget) }).catch(() => null);
    const url = res ? new URL(res.url, location.href) : null;
    if (url?.searchParams.get('success')) { setState('done'); return; }
    setState('form');
    setError(ERRORS[url?.searchParams.get('error') ?? 'send'] ?? ERRORS.send);
  }

  const pill = (on: boolean) => cn('inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center border text-[length:var(--fs-15)] transition-colors', on ? 'border-[var(--s-ink)] bg-[var(--s-ink)] text-white' : 'border-[var(--s-line)] text-[var(--s-ink-2)] hover:border-[var(--s-ink)]');

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-[#0B1620]/70 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          className="site fixed inset-x-0 bottom-0 z-[91] max-h-[92dvh] overflow-hidden bg-white text-[var(--s-ink)] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)] outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[88dvh] md:w-[min(64rem,calc(100vw-3rem))] md:-translate-x-1/2 md:-translate-y-1/2"
          aria-describedby="access-desc">
          <div className="grid max-h-[92dvh] md:max-h-[88dvh] md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            {/* Αριστερά: το atelier */}
            <aside className="relative hidden overflow-hidden bg-[#0B1620] text-white md:block">
              <Image src="/site/brand/lab.jpg" alt="" fill sizes="28rem" className="object-cover opacity-60" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B1620] via-[#0B1620]/40 to-transparent" />
              <div className="relative flex h-full flex-col justify-between p-8">
                <Image src="/site/brand/logo-white.png" alt="Atelier by Damask" width={835} height={438} className="h-auto w-[110px]" />
                <div>
                  <p className="font-display text-[length:var(--fs-36)]">Καλώς ήρθατε στο <em className="text-[#E8D5BF]">atelier.</em></p>
                  <ul className="mt-6 space-y-3 text-[length:var(--fs-14)] text-white/80">
                    {['Δυναμικές προσφορές κοινού container', 'Τα έργα και οι παραγγελίες σας online', 'Παραγγελίες από τον κατάλογο'].map((t) => (
                      <li key={t} className="flex items-start gap-3"><FiCheck className="mt-0.5 size-4 shrink-0 text-[#BEF264]" aria-hidden />{t}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </aside>

            {/* Δεξιά: φόρμα */}
            <div className="relative overflow-y-auto overscroll-contain p-6 sm:p-8 lg:p-10" data-lenis-prevent>
              <DialogPrimitive.Close className="absolute right-3 top-3 grid size-11 cursor-pointer place-items-center text-[var(--s-ink-2)] hover:text-[var(--s-ink)]" aria-label="Κλείσιμο">
                <FiX className="size-5" aria-hidden />
              </DialogPrimitive.Close>

              {state === 'done' ? (
                <div className="flex min-h-[24rem] flex-col justify-center">
                  <span className="grid size-14 place-items-center rounded-full bg-[#15803D]/10 text-[#15803D]"><FiCheck className="size-6" aria-hidden /></span>
                  <DialogPrimitive.Title className="font-display mt-6 text-[length:var(--fs-40)]">Το αίτημα στάλθηκε</DialogPrimitive.Title>
                  <p id="access-desc" className="mt-3 max-w-md text-[length:var(--fs-16)] text-[var(--s-ink-2)]">Θα σας στείλουμε email με τα στοιχεία εισόδου μόλις ενεργοποιηθεί ο λογαριασμός — συνήθως μέσα σε μία εργάσιμη.</p>
                  <DialogPrimitive.Close className={cn(btn.primary, 'mt-8 self-start')}>Εντάξει</DialogPrimitive.Close>
                </div>
              ) : (
                <>
                  <p className="s-kicker text-[var(--s-accent)]">Για επαγγελματίες</p>
                  <DialogPrimitive.Title className="font-display mt-3 text-[length:var(--fs-40)]">Αίτημα πρόσβασης</DialogPrimitive.Title>
                  <p id="access-desc" className="mt-2 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">Πείτε μας ποιοι είστε — σας συνδέουμε με την καρτέλα σας, ώστε να βλέπετε τις δικές σας τιμές.</p>

                  <form onSubmit={submit} className="mt-6 space-y-5">
                    {error && <Notice tone="error">{error}</Notice>}
                    <fieldset>
                      <legend className="text-[length:var(--fs-14)] font-medium">Είστε</legend>
                      <input type="hidden" name="kind" value={kind} />
                      <div className="mt-2 flex gap-2">
                        <button type="button" className={pill(kind === 'customer')} aria-pressed={kind === 'customer'} onClick={() => setKind('customer')}>Πελάτης</button>
                        <button type="button" className={pill(kind === 'partner')} aria-pressed={kind === 'partner'} onClick={() => setKind('partner')}>Συνεργάτης</button>
                      </div>
                    </fieldset>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Ονοματεπώνυμο *" htmlFor="am-name"><input id="am-name" name="name" required autoComplete="name" className={inputCls} /></Field>
                      <Field label="Εταιρεία *" htmlFor="am-company"><input id="am-company" name="company" required autoComplete="organization" className={inputCls} /></Field>
                      <Field label="Email *" htmlFor="am-email"><input id="am-email" name="email" type="email" required autoComplete="email" inputMode="email" className={inputCls} /></Field>
                      <Field label="Τηλέφωνο" htmlFor="am-phone"><input id="am-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" className={inputCls} /></Field>
                      <Field label="ΑΦΜ εταιρείας *" htmlFor="am-vat"><input id="am-vat" name="vat" required inputMode="numeric" maxLength={20} className={inputCls} /></Field>
                      <Field label="Δραστηριότητα" htmlFor="am-prof">
                        <select id="am-prof" name="profession" defaultValue="" className={inputCls}>
                          <option value="">— Επιλέξτε —</option>
                          {PROFESSIONS.map((o) => <option key={o}>{o}</option>)}
                        </select>
                      </Field>
                    </div>
                    <Field label="Μήνυμα" htmlFor="am-msg"><textarea id="am-msg" name="message" rows={3} maxLength={2000} className={cn(inputCls, 'h-auto py-3')} /></Field>
                    <div aria-hidden className="absolute -left-[9999px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
                    <label className="flex cursor-pointer items-start gap-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
                      <input type="checkbox" name="terms" value="1" required className="mt-0.5 size-5 shrink-0 accent-[var(--s-ink)]" />
                      <span>Αποδέχομαι τους <Link href="/legal/terms" target="_blank" className="s-link text-[var(--s-ink)]">όρους χρήσης</Link> και την <Link href="/legal/privacy" target="_blank" className="s-link text-[var(--s-ink)]">πολιτική απορρήτου</Link>. *</span>
                    </label>
                    <button type="submit" disabled={state === 'sending'} className={cn(btn.primary, 'w-full')}>
                      {state === 'sending' ? 'Αποστολή…' : <>Αποστολή αιτήματος <FiArrowRight className="size-4" aria-hidden /></>}
                    </button>
                    <p className="text-center text-[length:var(--fs-14)] text-[var(--s-ink-2)]">Έχετε ήδη λογαριασμό; <Link href="/auth/signin" onClick={() => setOpen(false)} className="s-link font-medium text-[var(--s-ink)]">Είσοδος</Link></p>
                  </form>
                </>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
