'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FiMoreVertical, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import type { OrderRequestView } from '@/lib/order-requests';
import { date, qty, Status } from '../_ui/bits';
import { requestTone } from '../_ui/tones';

/** Τα αιτήματα παραγγελίας του πελάτη· ενέργειες στο ⋮ (ακύρωση μόνο όσο «Υποβλήθηκε»). */
export function RequestList({ requests }: { requests: OrderRequestView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function cancel(r: OrderRequestView) {
    if (!(await confirmAction({ title: `Ακύρωση αιτήματος ${r.code};`, message: 'Το αίτημα δεν θα προχωρήσει. Μπορείτε να στείλετε νέο όποτε θέλετε.', confirmLabel: 'Ακύρωση αιτήματος' }))) return;
    setBusy(r.id);
    const res = await fetch(`/api/portal/order-requests/${r.id}/cancel`, { method: 'POST' });
    setBusy(null);
    if (!res.ok) { toast.error((await res.json().catch(() => null))?.message ?? 'Δεν έγινε η ακύρωση'); return; }
    toast.success(`Το αίτημα ${r.code} ακυρώθηκε`);
    router.refresh();
  }

  return (
    <ul className="border-t border-(--s-line)">
      {requests.map((r) => (
        <li key={r.id} className="border-b border-(--s-line) py-4">
          <div className="flex items-start gap-3">
            <details className="group min-w-0 flex-1">
              <summary className="grid cursor-pointer list-none gap-2 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block text-(length:--fs-15) font-medium tabular-nums">{r.code}{r.customerRef ? <span className="font-normal text-(--s-ink-2)"> · {r.customerRef}</span> : null}</span>
                  <span className="block text-(length:--fs-13) text-(--s-ink-2)">
                    {date(r.createdAt)} · {r.lines.length} {r.lines.length === 1 ? 'υλικό' : 'υλικά'}{r.project ? ` · ${r.project.name}` : ''}{r.softoneFincode ? ` · ${r.softoneFincode}` : ''}
                  </span>
                </span>
                <Status label={r.statusLabel} tone={requestTone[r.status]} />
              </summary>
              <div className="mt-4 bg-(--s-paper) px-4 py-3">
                <ul className="divide-y divide-(--s-line)">
                  {r.lines.map((l) => (
                    <li key={l.id} className="flex items-baseline justify-between gap-4 py-2 text-(length:--fs-14)">
                      <span className="min-w-0">{l.name}{l.code ? <span className="text-(--s-mute)"> · {l.code}</span> : null}{l.note ? <span className="block text-(length:--fs-13) text-(--s-ink-2)">{l.note}</span> : null}</span>
                      <span className="shrink-0 tabular-nums">{qty(l.qty)} {l.unit ?? ''}</span>
                    </li>
                  ))}
                </ul>
                {(r.deliveryDate || r.deliveryAddress || r.notes) && (
                  <p className="mt-3 text-(length:--fs-13) text-(--s-ink-2)">
                    {[r.deliveryDate && `Παράδοση ${date(r.deliveryDate)}`, r.deliveryAddress, r.notes].filter(Boolean).join(' · ')}
                  </p>
                )}
                {r.staffNote && <p className="mt-3 border-l-2 border-(--s-ink) pl-3 text-(length:--fs-14)">{r.staffNote}</p>}
              </div>
            </details>
            {r.canCancel && (
              <DropdownMenu>
                <DropdownMenuTrigger disabled={busy === r.id} className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center text-(--s-ink-2) hover:text-(--s-ink)" aria-label={`Ενέργειες αιτήματος ${r.code}`}>
                  <FiMoreVertical className="size-4" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2" onSelect={() => cancel(r)}><FiX className="size-3.5" aria-hidden /> Ακύρωση αιτήματος</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
