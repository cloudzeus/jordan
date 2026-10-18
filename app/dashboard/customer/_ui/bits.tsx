import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Μικρά κοινά κομμάτια των σελίδων πελάτη (έργα, παραγγελίες) — ύφος website, χωρίς χρωματιστά badges. */
export const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
export const qty = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 3 });
export const date = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : '—');

export function PageTitle({ eyebrow, title, children, back }: { eyebrow: string; title: string; children?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div>
      {back && <Link href={back.href} className="s-link inline-flex min-h-11 items-center text-[length:var(--fs-14)] text-[var(--s-ink-2)]">← {back.label}</Link>}
      <p className={cn('s-kicker text-[var(--s-accent)]', back ? 'mt-3' : undefined)}>{eyebrow}</p>
      <h1 data-split="now" className="font-display mt-4 text-[length:var(--fs-48)] lg:text-[length:var(--fs-64)]">{title}</h1>
      {children && <div className="mt-4 max-w-2xl text-[length:var(--fs-16)] text-[var(--s-ink-2)]">{children}</div>}
    </div>
  );
}

/** Ήσυχη ετικέτα κατάστασης: κουκκίδα + κείμενο (το χρώμα μόνο στην κουκκίδα). */
const TONE = { neutral: '#A8A29E', active: '#1C3241', good: '#2F6B3A', warn: '#B7791F', bad: '#B42318' } as const;
export type Tone = keyof typeof TONE;
export function Status({ label, tone = 'neutral', className }: { label: string; tone?: Tone; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap text-[length:var(--fs-13)] text-[var(--s-ink-2)]', className)}>
      <span aria-hidden className="size-2 rounded-full" style={{ background: TONE[tone] }} />{label}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="border border-dashed border-[var(--s-line)] px-6 py-14 text-center">
      <p className="font-display text-[length:var(--fs-28)]">{title}</p>
      {children && <div className="mt-2 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-t border-[var(--s-ink)] pt-4">
      <p className="text-[length:var(--fs-13)] text-[var(--s-mute)]">{label}</p>
      <p className="font-display mt-2 text-[length:var(--fs-40)] tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-[length:var(--fs-13)] text-[var(--s-mute)]">{hint}</p>}
    </div>
  );
}

/** Σφάλμα SoftOne: η σελίδα δεν «σπάει» — δείχνει τι συνέβη και πώς να συνεχίσει ο πελάτης. */
export function ErpUnavailable() {
  return (
    <div role="status" className="border-l-2 border-[var(--s-ink)] bg-[var(--s-paper)] px-4 py-3 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
      Τα παραστατικά δεν είναι διαθέσιμα αυτή τη στιγμή (το σύστημα ERP δεν απάντησε). Δοκιμάστε ξανά σε λίγο.
    </div>
  );
}
