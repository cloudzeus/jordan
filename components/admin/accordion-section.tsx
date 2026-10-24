'use client';

// Ενότητα-accordion της διαχείρισης (docs/design/admin.md §4): κλειστή, με σύνοψη στην κεφαλίδα
// ώστε να ξέρεις αν χρειάζεται να την ανοίξεις· ανοίγει μόνη της όταν ο σύνδεσμος δείχνει σε αυτή (#id).
import * as React from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { cn } from '@/lib/utils';

export function AccordionSection({ id, title, icon, summary, badge, actions, defaultOpen = false, className, children }: {
  id: string;
  title: string;
  icon?: React.ReactNode;
  /** Μία γραμμή κάτω από τον τίτλο όσο είναι κλειστή (π.χ. «5 αρχεία · τελευταίο 21/10»). */
  summary?: React.ReactNode;
  /** Δίπλα στον τίτλο: πλήθος ή σήμα προβλήματος (χρώμα + κείμενο). */
  badge?: React.ReactNode;
  /** Ενέργειες της ενότητας — εμφανίζονται όταν είναι ανοιχτή. */
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const det = React.useRef<HTMLDetailsElement>(null);
  React.useEffect(() => {
    const sync = () => { if (window.location.hash === `#${id}` && det.current) det.current.open = true; };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [id]);
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn('scroll-mt-20 rounded-xl border border-border bg-card shadow-xs', className)}>
      <details ref={det} open={defaultOpen} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
          <FiChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span id={`${id}-h`} role="heading" aria-level={2} className="flex flex-wrap items-center gap-x-2 text-(length:--fs-14) font-semibold">
              {icon && <span className="text-muted-foreground [&_svg]:size-4" aria-hidden>{icon}</span>}
              {title}{badge}
            </span>
            {summary && <span className="block truncate text-(length:--fs-12) text-muted-foreground group-open:hidden">{summary}</span>}
          </span>
        </summary>
        <div className="border-t border-border px-4 pb-3 pt-2.5">
          {actions && <div className="mb-2 flex flex-wrap justify-end gap-2">{actions}</div>}
          {children}
        </div>
      </details>
    </section>
  );
}
