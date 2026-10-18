import Link from 'next/link';
import type { IconType } from 'react-icons';
import { FiArrowRight } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { Container } from '@/components/site/ui';

/**
 * Οπτική γλώσσα της B2B πύλης — ίδια με τη «δημοπρασία» των δυναμικών προσφορών:
 * χαρτί + λεπτό πλέγμα σχεδίου, μικρές κεφαλαίες ετικέτες, μεγάλοι λεπτοί αριθμοί, λευκά «αιωρούμενα»
 * πάνελ με βαθιά απαλή σκιά, χρώμα μόνο εκεί που σημαίνει κάτι. Χρώματα ΜΟΝΟ από τα `--s-*`.
 */

export const PANEL_SHADOW = 'shadow-[0_24px_60px_-28px_rgba(28,50,65,0.35)]';

/** Σκηνή: χαρτί με πλέγμα «σχεδίου» και φωτεινό κέντρο — η κορυφή κάθε σελίδας της πύλης. */
export function Stage({ children, className, inner }: { children: React.ReactNode; className?: string; inner?: string }) {
  return (
    <section className={cn('relative overflow-hidden bg-[var(--s-paper)] text-[var(--s-ink)]', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(#1C3241_1px,transparent_1px),linear-gradient(90deg,#1C3241_1px,transparent_1px)] [background-size:48px_48px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_30%_40%,rgba(255,255,255,0.95),transparent_70%)]" />
      <Container className={cn('relative py-10 lg:py-14', inner)}>{children}</Container>
    </section>
  );
}

/** Μικρή κεφαλαία ετικέτα (ίδια με «Τιμή τώρα», «Δραστηριότητα»). */
export function Label({ children, className, icon: Icon }: { children: React.ReactNode; className?: string; icon?: IconType }) {
  return (
    <p className={cn('flex items-center gap-2 text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]', className)}>
      {Icon && <Icon className="size-3.5" aria-hidden />}{children}
    </p>
  );
}

/** Λευκό πάνελ που «αιωρείται» πάνω στη σκηνή. */
export function Panel({ children, className, as: Tag = 'div', ...rest }: { children: React.ReactNode; className?: string; as?: 'div' | 'aside' | 'section' } & React.HTMLAttributes<HTMLElement>) {
  return <Tag className={cn('min-w-0 border border-[var(--s-line)] bg-white p-5 sm:p-6', PANEL_SHADOW, className)} {...rest}>{children}</Tag>;
}

/** Μεγάλος αριθμός με ετικέτα — για επισκόπηση, όχι λογιστική. */
export function Figure({ label, value, hint, tone, icon, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: string; icon?: IconType; href?: string }) {
  const body = (
    <>
      <Label icon={icon}>{label}</Label>
      <p className="font-display mt-3 text-[length:var(--fs-64)] leading-none tabular-nums" style={tone ? { color: tone } : undefined}>{value}</p>
      {hint && <p className="mt-2 text-[length:var(--fs-13)] text-[var(--s-ink-2)]">{hint}</p>}
    </>
  );
  return href
    ? <Link href={href} className="group block min-w-0 border-t border-[var(--s-ink)] pt-4 transition-colors hover:border-[var(--s-accent)]">{body}</Link>
    : <div className="min-w-0 border-t border-[var(--s-ink)] pt-4">{body}</div>;
}

/** Ετικέτα κατάστασης: κουκκίδα + κείμενο, ήπιο φόντο στο χρώμα της κατάστασης (ποτέ μόνο χρώμα). */
export const TONES = {
  neutral: '#6B7378', active: '#1C3241', good: '#15803D', warn: '#B45309', bad: '#B42318', live: '#B42318',
} as const;
export type Tone = keyof typeof TONES;

export function Pill({ label, tone = 'neutral', pulse = false, className }: { label: string; tone?: Tone; pulse?: boolean; className?: string }) {
  const c = TONES[tone];
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap px-2.5 py-1 text-[length:var(--fs-12)] font-medium', className)} style={{ color: c, background: `${c}14` }}>
      <span className="relative flex size-2" aria-hidden>
        {pulse && <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden" style={{ background: c }} />}
        <span className="relative inline-flex size-2 rounded-full" style={{ background: c }} />
      </span>
      {label}
    </span>
  );
}

/** «Ζωντανά» — ίδιο σήμα με τη δημοπρασία. */
export function LiveBadge({ label = 'Ζωντανά' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 border border-[#FCA5A5] bg-white px-2.5 py-1 text-[length:var(--fs-12)] font-medium uppercase tracking-[0.16em] text-[#B42318]">
      <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#F87171] opacity-75 motion-reduce:hidden" /><span className="relative inline-flex size-2 rounded-full bg-[#EF4444]" /></span>
      {label}
    </span>
  );
}

/** Μεγάλη κάρτα ενέργειας: εικονίδιο, τίτλος, μία πρόταση, βέλος. Για «τι θέλετε να κάνετε;». */
export function ActionCard({ href, icon: Icon, title, text, emphasis = false }: { href: string; icon: IconType; title: string; text: string; emphasis?: boolean }) {
  return (
    <Link href={href} className={cn('group flex min-h-full flex-col justify-between gap-6 border p-5 transition-[box-shadow,background-color,border-color] duration-200 sm:p-6',
      emphasis ? 'border-[var(--s-ink)] bg-[var(--s-ink)] text-white hover:bg-[#2C4556]' : 'border-[var(--s-line)] bg-white hover:border-[var(--s-ink)] hover:shadow-[0_12px_40px_rgba(11,22,32,0.12)]')}>
      <span className={cn('grid size-11 place-items-center border', emphasis ? 'border-white/30' : 'border-[var(--s-line)] text-[var(--s-ink)]')}><Icon className="size-5" aria-hidden /></span>
      <span>
        <span className="font-site block text-[length:var(--fs-20)] font-light leading-snug">{title}</span>
        <span className={cn('mt-1 block text-[length:var(--fs-14)]', emphasis ? 'text-white/80' : 'text-[var(--s-ink-2)]')}>{text}</span>
        <span className={cn('mt-4 inline-flex items-center gap-1.5 text-[length:var(--fs-13)] font-medium', emphasis ? 'text-white' : 'text-[var(--s-ink)]')}>
          Άνοιγμα <FiArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
        </span>
      </span>
    </Link>
  );
}

/** Κεφαλίδα ενότητας μέσα στη σελίδα: ετικέτα, τίτλος, προαιρετικός σύνδεσμος δεξιά. */
export function SectionHead({ label, title, action, id }: { label: string; title: string; action?: { href: string; text: string }; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Label>{label}</Label>
        <h2 id={id} className="font-site mt-2 text-[length:var(--fs-24)] font-light">{title}</h2>
      </div>
      {action && (
        <Link href={action.href} className="group inline-flex min-h-11 items-center gap-1.5 text-[length:var(--fs-14)] font-medium text-[var(--s-ink)]">
          <span className="s-link">{action.text}</span><FiArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Βήματα πορείας (π.χ. Παραγγελία → Αποστολή → Τιμολόγηση): ορατά χωρίς να ξέρει κανείς λογιστική. */
export function Journey({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  return (
    <ol className={cn('grid gap-2', className)} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0,1fr))` }} aria-label="Πορεία">
      {steps.map((s, i) => {
        const done = i <= current;
        return (
          <li key={s} aria-current={i === current ? 'step' : undefined} className="min-w-0">
            <span className="block h-1" style={{ background: done ? (i === current ? 'var(--s-ink)' : '#15803D') : 'var(--s-line)' }} />
            <span className={cn('mt-2 block truncate text-[length:var(--fs-12)]', done ? 'text-[var(--s-ink)]' : 'text-[var(--s-mute)]', i === current && 'font-medium')}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}
