import Link from 'next/link';
import type { CustomerDoc } from '@/lib/portal-erp-core';
import { date, eur, Status } from './bits';
import { orderTone } from './tones';

/** Πίνακας παραστατικών πελάτη. Σε κινητό γίνεται λίστα (καμία οριζόντια κύλιση). */
export function DocTable({ docs, link = true }: { docs: CustomerDoc[]; link?: boolean }) {
  return (
    <ul className="border-t border-(--s-line)">
      {docs.map((d) => {
        const href = link && d.kind !== 'payment' ? `/dashboard/customer/orders/${d.findoc}` : null;
        const body = (
          <>
            <span className="min-w-0">
              <span className="block text-(length:--fs-15) font-medium tabular-nums">{d.fincode}</span>
              <span className="block text-(length:--fs-13) text-(--s-ink-2)">{d.seriesName ?? d.kindLabel} · {date(d.date)}</span>
            </span>
            <span className="flex flex-wrap items-center justify-between gap-3 sm:contents">
              <span className="sm:w-44">
                {d.cancelled ? <Status label="Ακυρωμένο" tone="bad" /> : d.state ? <Status label={d.stateLabel!} tone={orderTone[d.state]} /> : <span className="text-(length:--fs-13) text-(--s-mute)">{d.kindLabel}</span>}
              </span>
              <span className={`font-num text-right text-(length:--fs-16) tabular-nums sm:w-32 ${d.cancelled ? 'text-(--s-mute) line-through' : ''}`}>{d.kind === 'credit' ? '−' : ''}{eur(d.total)}</span>
            </span>
          </>
        );
        const cls = 'grid gap-2 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6';
        return (
          <li key={d.findoc} className="border-b border-(--s-line)">
            {href ? <Link href={href} className={`${cls} hover:bg-(--s-paper)`}>{body}</Link> : <div className={cls}>{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}
