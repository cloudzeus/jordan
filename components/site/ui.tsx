import Link from 'next/link';
import { FiAlertCircle, FiCheck } from 'react-icons/fi';
import { cn } from '@/lib/utils';

/**
 * Μικρό kit του δημόσιου website (μόνο κάτω από `.site`): ορθογώνια κουμπιά χωρίς σκιές, λεπτές
 * γραμμές, labels πάντα ορατά. Χρώματα ΜΟΝΟ από τα `--s-*` tokens του app/globals.css.
 */
export const btn = {
  primary: 'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 bg-[var(--s-ink)] px-6 text-[length:var(--fs-15)] font-medium text-white transition-colors duration-200 hover:bg-[#2C4556] disabled:cursor-not-allowed disabled:opacity-50',
  ghost: 'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 border border-[var(--s-ink)] px-6 text-[length:var(--fs-15)] font-medium text-[var(--s-ink)] transition-colors duration-200 hover:bg-[var(--s-ink)] hover:text-white',
};

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-12', className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[length:var(--fs-12)] font-medium uppercase tracking-[0.18em] text-[var(--s-mute)]', className)}>{children}</p>;
}

export function ArrowLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn('group/a inline-flex min-h-11 items-center gap-2 text-[length:var(--fs-15)] font-medium text-[var(--s-ink)]', className)}>
      <span className="s-link">{children}</span>
      <span aria-hidden className="transition-transform duration-200 group-hover/a:translate-x-1 motion-reduce:transition-none">→</span>
    </Link>
  );
}

export const inputCls =
  'block h-12 w-full rounded-none border border-[var(--s-line)] bg-white px-4 text-[length:var(--fs-16)] text-[var(--s-ink)] placeholder:text-[#A8A29E] transition-colors focus:border-[var(--s-ink)] focus:outline-none read-only:bg-[var(--s-paper)] read-only:text-[var(--s-ink-2)]';

export function Field({ label, hint, htmlFor, aside, children }: { label: string; hint?: string; htmlFor: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[length:var(--fs-14)] font-medium text-[var(--s-ink)]">{label}</label>
        {aside}
      </div>
      {children}
      {hint && <p id={`${htmlFor}-hint`} className="text-[length:var(--fs-13)] text-[var(--s-mute)]">{hint}</p>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const Icon = tone === 'success' ? FiCheck : FiAlertCircle;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 border-l-2 px-4 py-3 text-[length:var(--fs-14)]',
        tone === 'error' && 'border-[#B42318] bg-[#FDF3F2] text-[#8A1C12]',
        tone === 'success' && 'border-[#2F6B3A] bg-[#F1F6F1] text-[#24532D]',
        tone === 'info' && 'border-[var(--s-ink)] bg-[var(--s-paper)] text-[var(--s-ink-2)]',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
