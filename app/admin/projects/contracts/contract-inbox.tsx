// Εισερχόμενα προσφορών: νέα αιτήματα από την πύλη και ερωτήσεις πελατών που περιμένουν απάντηση.
import Link from 'next/link';
import { FiHelpCircle, FiInbox } from 'react-icons/fi';
import type { InboxItem } from '@/lib/contracts/inbox';

const when = (iso: string) => new Date(iso).toLocaleString('el-GR', { timeZone: 'Europe/Athens', dateStyle: 'short', timeStyle: 'short' });

export function ContractInbox({ items }: { items: InboxItem[] }) {
  if (!items.length) return null;
  const requests = items.filter((i) => i.kind === 'REQUEST').length;
  const questions = items.length - requests;
  const head = [requests ? `${requests} ${requests === 1 ? 'νέο αίτημα προσφοράς' : 'νέα αιτήματα προσφοράς'}` : null,
    questions ? `${questions} ${questions === 1 ? 'ερώτηση πελάτη' : 'ερωτήσεις πελατών'} χωρίς απάντηση` : null].filter(Boolean).join(' · ');
  return (
    <section aria-labelledby="inbox-h" className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60">
      <h2 id="inbox-h" className="flex items-center gap-2 border-b border-amber-200 px-4 py-2.5 text-(length:--fs-13) font-semibold text-amber-950">
        <FiInbox className="size-4" aria-hidden /> Περιμένουν εμάς · {head}
      </h2>
      <ul className="divide-y divide-amber-200/70">
        {items.slice(0, 8).map((i) => (
          <li key={`${i.kind}-${i.contractId}-${i.at}`}>
            <Link href={`/admin/projects/contracts/${i.contractId}${i.kind === 'QUESTION' ? '#c-requests' : ''}`}
              className="flex items-start gap-3 px-4 py-2.5 hover:bg-amber-100/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
              {i.kind === 'REQUEST'
                ? <span className="mt-0.5 shrink-0 rounded bg-amber-600 px-1.5 py-0.5 text-(length:--fs-11) font-semibold text-white">Νέο αίτημα</span>
                : <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded bg-white px-1.5 py-0.5 text-(length:--fs-11) font-semibold text-amber-900 ring-1 ring-amber-300"><FiHelpCircle className="size-3" aria-hidden /> Ερώτηση</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-(length:--fs-13) font-medium text-foreground">{i.ref} · {i.title}{i.customer ? ` — ${i.customer}` : ''}</span>
                <span className="line-clamp-1 text-(length:--fs-12) text-muted-foreground">{i.body}</span>
              </span>
              <time dateTime={i.at} className="shrink-0 text-(length:--fs-12) text-muted-foreground tabular-nums">{when(i.at)}</time>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > 8 && <p className="px-4 py-2 text-(length:--fs-12) text-amber-900">και {items.length - 8} ακόμη</p>}
    </section>
  );
}
