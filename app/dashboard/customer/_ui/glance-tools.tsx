'use client';

// Μικρά εργαλεία του «Με μια ματιά»: αντιγραφή IBAN με επιβεβαίωση (εικονίδιο + κείμενο, aria-live).
import * as React from 'react';
import { FiCheck, FiCopy } from 'react-icons/fi';

export function CopyIban({ bank, iban }: { bank: string; iban: string }) {
  const [done, setDone] = React.useState(false);
  const copy = () => navigator.clipboard.writeText(iban.replace(/\s+/g, '')).then(() => { setDone(true); setTimeout(() => setDone(false), 2500); }, () => null);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-(--s-line) py-2.5 first:border-t-0">
      <span className="min-w-0">
        <span className="block text-(length:--fs-12) uppercase tracking-[0.12em] text-(--s-mute)">{bank}</span>
        <span className="font-num block truncate text-(length:--fs-15) tabular-nums text-(--s-ink)">{iban}</span>
      </span>
      <button type="button" onClick={copy} aria-label={`Αντιγραφή IBAN ${bank}`}
        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 px-2 text-(length:--fs-13) text-(--s-ink) transition-colors hover:text-(--s-accent)">
        {done ? <FiCheck className="size-4 text-[#15803D]" aria-hidden /> : <FiCopy className="size-4" aria-hidden />}
        <span aria-live="polite">{done ? 'Αντιγράφηκε' : 'Αντιγραφή'}</span>
      </button>
    </div>
  );
}
