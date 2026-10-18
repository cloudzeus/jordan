import { cn } from '@/lib/utils';

/**
 * Αρχιτεκτονικά στοιχεία σχεδίου για το B2B website: γραμμές διάστασης (κότες), σημάδια κοπής,
 * σήμανση τομής. Καθαρά διακοσμητικά (aria-hidden) — δίνουν στη σελίδα την αίσθηση «σχεδίου».
 */

/** Οριζόντια γραμμή διάστασης με βελάκια/τικ και ετικέτα στη μέση: |←— 6.00 —→| */
export function DimLine({ label, className, tone = 'currentColor' }: { label: string; className?: string; tone?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none flex items-center gap-2 text-[length:var(--fs-11)] tracking-[0.2em]', className)} style={{ color: tone }}>
      <span className="h-3 w-px bg-current" />
      <span className="relative h-px flex-1 bg-current opacity-60"><span className="absolute -left-px -top-[3px] size-[7px] rotate-45 border-b border-l border-current" /></span>
      <span className="font-num shrink-0 tabular-nums">{label}</span>
      <span className="relative h-px flex-1 bg-current opacity-60"><span className="absolute -right-px -top-[3px] size-[7px] rotate-45 border-r border-t border-current" /></span>
      <span className="h-3 w-px bg-current" />
    </div>
  );
}

/** Κάθετη γραμμή διάστασης. */
export function DimLineV({ label, className, tone = 'currentColor' }: { label: string; className?: string; tone?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none flex flex-col items-center gap-2 text-[length:var(--fs-11)] tracking-[0.2em]', className)} style={{ color: tone }}>
      <span className="h-px w-3 bg-current" />
      <span className="w-px flex-1 bg-current opacity-60" />
      <span className="font-num shrink-0 tabular-nums [writing-mode:vertical-rl] rotate-180">{label}</span>
      <span className="w-px flex-1 bg-current opacity-60" />
      <span className="h-px w-3 bg-current" />
    </div>
  );
}

/** Σημάδια κοπής στις τέσσερις γωνίες ενός πλαισίου (το γονικό θέλει `relative`). */
export function CropMarks({ className, size = 18 }: { className?: string; size?: number }) {
  const s = { width: size, height: size };
  const c = 'absolute border-current';
  return (
    <span aria-hidden className={cn('pointer-events-none absolute inset-0', className)}>
      <span className={cn(c, '-left-2 -top-2 border-l border-t')} style={s} />
      <span className={cn(c, '-right-2 -top-2 border-r border-t')} style={s} />
      <span className={cn(c, '-bottom-2 -left-2 border-b border-l')} style={s} />
      <span className={cn(c, '-bottom-2 -right-2 border-b border-r')} style={s} />
    </span>
  );
}

/** Σήμανση τομής/λεπτομέρειας: κύκλος με γράμμα και αριθμό φύλλου (A / 01). */
export function SectionMark({ letter, sheet, className }: { letter: string; sheet: string; className?: string }) {
  return (
    <span aria-hidden className={cn('pointer-events-none inline-grid size-14 shrink-0 grid-rows-2 place-items-center rounded-full border border-current text-[length:var(--fs-12)]', className)}>
      <span className="font-num w-full border-b border-current text-center leading-6">{letter}</span>
      <span className="font-num leading-6">{sheet}</span>
    </span>
  );
}

/** Λεπτό πλέγμα σχεδίου (για φόντο). */
export function Grid({ className, size = 48, opacity = 0.06, color = '#1C3241' }: { className?: string; size?: number; opacity?: number; color?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0', className)}
      style={{ opacity, backgroundImage: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`, backgroundSize: `${size}px ${size}px` }} />
  );
}
