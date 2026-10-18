'use client';

import * as React from 'react';
import Link from 'next/link';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { FiArrowRight, FiCheck, FiMail, FiX } from 'react-icons/fi';
import { inputCls, Notice } from '@/components/site/ui';
import { useLinkModal } from '@/components/site/link-modal';
import { cn } from '@/lib/utils';

export const NEWSLETTER_PATH = '/newsletter';

type Result = 'pending' | 'already' | 'resent-too-soon';
const DONE: Record<Result, string> = {
  pending: 'Σας στείλαμε email — πατήστε τον σύνδεσμο για να επιβεβαιώσετε την εγγραφή.',
  already: 'Είστε ήδη εγγεγραμμένοι. Ευχαριστούμε!',
  'resent-too-soon': 'Μόλις σας στείλαμε email επιβεβαίωσης — ελέγξτε και τα ανεπιθύμητα.',
};

/**
 * Εγγραφή στο newsletter (double opt-in). `tone="dark"` για το footer, `light` για modal/σελίδα.
 */
export function NewsletterForm({ tone = 'light', source = 'footer', idPrefix = 'nl', withName = false }: { tone?: 'light' | 'dark'; source?: 'footer' | 'modal' | 'page'; idPrefix?: string; withName?: boolean }) {
  const [state, setState] = React.useState<'form' | 'sending' | Result>('form');
  const [error, setError] = React.useState<string | null>(null);
  const dark = tone === 'dark';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState('sending'); setError(null);
    const res = await fetch('/api/public/newsletter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: f.get('email')?.toString() ?? '', name: f.get('name')?.toString() ?? '', consent: f.get('consent') === '1', source, website: f.get('website')?.toString() ?? '' }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) { setState(body.result as Result); return; }
    setState('form');
    setError(body.message ?? 'Δεν ολοκληρώθηκε η εγγραφή. Δοκιμάστε ξανά σε λίγο.');
  }

  if (state !== 'form' && state !== 'sending') {
    return (
      <p role="status" className={cn('flex items-start gap-3 text-[length:var(--fs-15)]', dark ? 'text-white/85' : 'text-[var(--s-ink)]')}>
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', dark ? 'bg-white/10 text-[#BEF264]' : 'bg-[#15803D]/10 text-[#15803D]')}><FiCheck className="size-4" aria-hidden /></span>
        {DONE[state]}
      </p>
    );
  }

  const field = dark
    ? 'block h-12 w-full min-w-0 rounded-none border border-white/20 bg-white/5 px-4 text-[length:var(--fs-16)] text-white placeholder:text-white/40 focus:border-white focus:outline-none'
    : inputCls;
  return (
    <form onSubmit={submit} className="space-y-3">
      {error && (dark ? <p role="alert" className="text-[length:var(--fs-14)] text-[#FCA5A5]">{error}</p> : <Notice tone="error">{error}</Notice>)}
      {withName && (
        <div>
          <label htmlFor={`${idPrefix}-name`} className="sr-only">Ονοματεπώνυμο</label>
          <input id={`${idPrefix}-name`} name="name" autoComplete="name" placeholder="Ονοματεπώνυμο (προαιρετικά)" className={field} />
        </div>
      )}
      <div className="flex gap-2">
        <label htmlFor={`${idPrefix}-email`} className="sr-only">Email</label>
        <input id={`${idPrefix}-email`} name="email" type="email" required autoComplete="email" inputMode="email" placeholder="Το email σας" className={field} />
        <button type="submit" disabled={state === 'sending'} aria-label="Εγγραφή"
          className={cn('inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center gap-2 px-5 text-[length:var(--fs-15)] font-medium transition-colors disabled:opacity-50', dark ? 'bg-white text-[#0B1620] hover:bg-[#E8D5BF]' : 'bg-[var(--s-ink)] text-white hover:bg-[#2C4556]')}>
          <span className="hidden sm:inline">{state === 'sending' ? 'Αποστολή…' : 'Εγγραφή'}</span><FiArrowRight className="size-4" aria-hidden />
        </button>
      </div>
      <div aria-hidden className="absolute -left-[9999px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className={cn('flex cursor-pointer items-start gap-3 text-[length:var(--fs-13)]', dark ? 'text-white/60' : 'text-[var(--s-ink-2)]')}>
        <input type="checkbox" name="consent" value="1" required className={cn('mt-0.5 size-5 shrink-0', dark ? 'accent-white' : 'accent-[var(--s-ink)]')} />
        <span>Συμφωνώ να λαμβάνω email από το atelier. Μπορώ να διαγραφώ όποτε θέλω. <Link href="/legal/privacy" target="_blank" className={cn('s-link', dark ? 'text-white/80' : 'text-[var(--s-ink)]')}>Απόρρητο</Link></span>
      </label>
    </form>
  );
}

/** Modal εγγραφής: ανοίγει από κάθε σύνδεσμο προς /newsletter (η σελίδα μένει ως εναλλακτική). */
export function NewsletterModalHost() {
  const [open, setOpen] = React.useState(false);
  const [key, setKey] = React.useState(0);
  useLinkModal(NEWSLETTER_PATH, () => { setKey((k) => k + 1); setOpen(true); }, open);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-[#0B1620]/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content aria-describedby="nl-desc"
          className="site fixed inset-x-0 bottom-0 z-[91] bg-white p-6 text-[var(--s-ink)] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)] outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 sm:p-10 md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(34rem,calc(100vw-3rem))] md:-translate-x-1/2 md:-translate-y-1/2">
          <DialogPrimitive.Close className="absolute right-3 top-3 grid size-11 cursor-pointer place-items-center text-[var(--s-ink-2)] hover:text-[var(--s-ink)]" aria-label="Κλείσιμο"><FiX className="size-5" aria-hidden /></DialogPrimitive.Close>
          <span className="grid size-12 place-items-center rounded-full bg-[var(--s-paper)] text-[var(--s-accent)]"><FiMail className="size-5" aria-hidden /></span>
          <DialogPrimitive.Title className="font-display mt-5 text-[length:var(--fs-36)]">Τα νέα του atelier</DialogPrimitive.Title>
          <p id="nl-desc" className="mt-2 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">Νέα υλικά, δυναμικές προσφορές container και εκδηλώσεις — λίγες φορές τον μήνα, μόνο για επαγγελματίες.</p>
          <div className="mt-6"><NewsletterForm key={key} source="modal" idPrefix="nlm" withName /></div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

