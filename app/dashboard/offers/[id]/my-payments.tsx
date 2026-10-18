import Link from 'next/link';
import { FiCheck, FiCreditCard, FiRotateCcw } from 'react-icons/fi';
import { bookerOf } from '@/lib/container-offers';
import { myPayments } from '@/lib/viva-payments';
import { formatEur } from '@/lib/viva-core';
import { Container } from '@/components/site/ui';

const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });

/** Οι πληρωμές των ΔΙΚΩΝ μου εγκεκριμένων κρατήσεων σε αυτό το container — με τον σύνδεσμο όσο εκκρεμεί. */
export async function MyPayments({ offerId, user }: { offerId: string; user: { customerTrdr: number | null; partnerId: string | null } }) {
  const b = bookerOf(user);
  if (!b) return null;
  const list = await myPayments(offerId, b);
  if (!list.length) return null;
  return (
    <section aria-labelledby="my-payments" className="border-b border-[var(--s-line)] bg-[var(--s-bg)]">
      <Container className="py-6">
        <h2 id="my-payments" className="flex items-center gap-2 text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-mute)]"><FiCreditCard className="size-4" aria-hidden /> Πληρωμές κρατήσεων</h2>
        <ul className="mt-3 divide-y divide-[var(--s-line)]">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-[length:var(--fs-15)] text-[var(--s-ink)]">{num(p.pallets)} παλέτες «{p.product}» <span className="text-[var(--s-mute)]">· {num(p.quantity)} {p.unit}</span></p>
                <p className="font-num text-[length:var(--fs-13)] text-[var(--s-ink-2)]">
                  {p.status === 'PENDING' ? `Προς πληρωμή ${formatEur(p.amountCents)} (με ΦΠΑ)` : `Πληρώθηκε ${formatEur(p.paidCents ?? p.amountCents)}${p.paidAt ? ` · ${new Date(p.paidAt).toLocaleDateString('el-GR')}` : ''}`}
                  {p.refundedCents > 0 && <span className="ml-2 inline-flex items-center gap-1"><FiRotateCcw className="size-3" aria-hidden /> επιστράφηκαν {formatEur(p.refundedCents)}</span>}
                </p>
              </div>
              {p.url ? (
                <Link href={p.url} className="inline-flex min-h-11 items-center bg-[var(--s-ink)] px-5 text-[length:var(--fs-14)] font-medium text-white hover:opacity-90">Πληρωμή {formatEur(p.amountCents)}</Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[length:var(--fs-14)] text-[#15803D]"><FiCheck className="size-4" aria-hidden /> {p.status === 'REFUNDED' ? 'Επιστράφηκε' : 'Εξοφλήθηκε'}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[length:var(--fs-13)] text-[var(--s-mute)]">Αν στο κλείσιμο του container ισχύσει χαμηλότερη τιμή, η διαφορά επιστρέφεται στο ίδιο μέσο πληρωμής.</p>
      </Container>
    </section>
  );
}
