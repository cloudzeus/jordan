import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Μικρά κοινά κομμάτια των σελίδων πελάτη (έργα, παραγγελίες) — ύφος website, χωρίς χρωματιστά badges. */
export const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
export const qty = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 3 });
export const date = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : '—');

/** Κεφαλίδα σελίδας: πίσω, kicker, τίτλος (serif display — ο μόνος serif της σελίδας) και σύντομη εξήγηση. */
export function PageTitle({ eyebrow, title, children, back }: { eyebrow: string; title: string; children?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div>
      {back && (
        <Link href={back.href} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-(length:--fs-14) font-medium text-(--s-ink-2) transition-colors hover:bg-(--s-paper) hover:text-(--s-ink)">
          <span aria-hidden>←</span> {back.label}
        </Link>
      )}
      <p className={cn('s-kicker text-(--s-accent)', back ? 'mt-4' : undefined)}>{eyebrow}</p>
      <h1 className="s-rise font-display mt-4 max-w-4xl text-(length:--fs-40) leading-[1.08] text-balance lg:text-(length:--fs-56)">{title}</h1>
      {children && <div className="mt-5 max-w-2xl text-(length:--fs-17) leading-relaxed text-(--s-ink-2)">{children}</div>}
    </div>
  );
}

/** Ετικέτα κατάστασης: κουκκίδα + κείμενο σε απαλό φόντο του ίδιου χρώματος (ποτέ μόνο χρώμα). */
const TONE = { neutral: '#64748B', active: '#2563EB', good: '#15803D', warn: '#B45309', bad: '#B42318' } as const;
export type Tone = keyof typeof TONE;
export function Status({ label, tone = 'neutral', className }: { label: string; tone?: Tone; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1 text-(length:--fs-13) font-semibold', className)} style={{ color: TONE[tone], background: `${TONE[tone]}12` }}>
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: TONE[tone] }} />{label}
    </span>
  );
}

/** Κενή κατάσταση: τι θα εμφανιστεί εδώ και πότε — ήρεμη, όχι «σπασμένη». */
export function Empty({ title, children, icon: Icon }: { title: string; children?: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl bg-(--s-paper) px-6 py-12 text-center">
      {Icon && <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-white text-(--s-accent) ring-1 ring-(--s-line)"><Icon className="size-5" /></span>}
      <p className="text-(length:--fs-20) font-semibold text-(--s-ink)">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-(length:--fs-15) text-(--s-ink-2)">{children}</div>}
    </div>
  );
}

/** Αριθμός-σύνοψη: ετικέτα, τιμή (sans, όχι serif), εξήγηση. `quiet` όταν δεν υπάρχει ακόμη τίποτα να μετρηθεί. */
export function Stat({ label, value, hint, quiet = false }: { label: string; value: string; hint?: string; quiet?: boolean }) {
  return (
    <div className="border-t-2 border-(--s-ink) pt-4" style={quiet ? { borderColor: 'var(--s-line)' } : undefined}>
      <p className="p-label text-(--s-ink-2)">{label}</p>
      <p className={cn('p-amount mt-2 text-(length:--fs-32) leading-none', quiet ? 'text-(--s-mute)' : 'text-(--s-ink)')}>{value}</p>
      {hint && <p className="mt-2 text-(length:--fs-14) text-(--s-ink-2)">{hint}</p>}
    </div>
  );
}

/** Σφάλμα SoftOne: η σελίδα δεν «σπάει» — δείχνει τι συνέβη και πώς να συνεχίσει ο πελάτης. */
export function ErpUnavailable() {
  return (
    <div role="status" className="border-l-2 border-(--s-ink) bg-(--s-paper) px-4 py-3 text-(length:--fs-14) text-(--s-ink-2)">
      Τα παραστατικά δεν είναι διαθέσιμα αυτή τη στιγμή (το σύστημα ERP δεν απάντησε). Δοκιμάστε ξανά σε λίγο.
    </div>
  );
}
