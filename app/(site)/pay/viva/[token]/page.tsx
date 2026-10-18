import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { FiAlertCircle, FiCheck, FiClock, FiLock } from 'react-icons/fi';
import { openCheckout, peekPayment } from '@/lib/viva-payments';
import { formatEur } from '@/lib/viva-core';
import { btn, Container } from '@/components/site/ui';

export const metadata: Metadata = { title: 'Πληρωμή κράτησης', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });
const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });

/**
 * Ο προσωπικός σύνδεσμος πληρωμής (από το email / το portal). Το GET ΔΕΝ μιλά με το Viva — μόνο το κουμπί
 * (server action) φτιάχνει payment order και ανακατευθύνει στο Smart Checkout. `?result=` = επιστροφή από εκεί.
 */
export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ result?: string; e?: string }> }) {
  const [{ token }, { result, e }] = await Promise.all([params, searchParams]);
  const p = await peekPayment(token);

  async function pay() {
    'use server';
    const r = await openCheckout(token);
    if (r.kind === 'redirect') redirect(r.url);
    redirect(`/pay/viva/${encodeURIComponent(token)}?e=${r.status}`);
  }

  const icon = (tone: string, Icon: typeof FiCheck) => (
    <span className="grid size-14 place-items-center rounded-full" style={{ color: tone, backgroundColor: `color-mix(in srgb, ${tone} 10%, transparent)` }}><Icon className="size-6" aria-hidden /></span>
  );
  const portal = p ? <Link href={`/dashboard/offers/${p.offerId}`} className={btn.ghost}>Στην προσφορά</Link> : null;

  return (
    <Container className="py-20 md:py-28">
      <div className="mx-auto max-w-xl">
        {!p ? (
          <>
            {icon('#B42318', FiAlertCircle)}
            <h1 className="font-display mt-6 text-[length:var(--fs-48)]">Ο σύνδεσμος δεν ισχύει</h1>
            <p className="mt-4 text-[length:var(--fs-16)] text-[var(--s-ink-2)]">Ελέγξτε ότι αντιγράψατε ολόκληρο τον σύνδεσμο από το email, ή επικοινωνήστε μαζί μας.</p>
            <div className="mt-10"><Link href="/" className={btn.primary}>Στην αρχική</Link></div>
          </>
        ) : p.status === 'PAID' || p.status === 'REFUNDED' ? (
          <>
            {icon('#15803D', FiCheck)}
            <h1 className="font-display mt-6 text-[length:var(--fs-48)]">{result === 'success' ? 'Ευχαριστούμε — η πληρωμή ολοκληρώθηκε' : 'Η κράτηση έχει πληρωθεί'}</h1>
            <p className="mt-4 text-[length:var(--fs-16)] text-[var(--s-ink-2)]">
              {formatEur(p.paidCents ?? p.amountCents)} για {num(p.pallets)} παλέτες «{p.product}»{p.paidAt ? ` · ${new Date(p.paidAt).toLocaleDateString('el-GR')}` : ''}.
              {p.refundedCents > 0 && <> Σας έχουν επιστραφεί {formatEur(p.refundedCents)}.</>}
            </p>
            <p className="mt-3 text-[length:var(--fs-14)] text-[var(--s-mute)]">Αν μέχρι το κλείσιμο του container ισχύσει χαμηλότερη τιμή, η διαφορά επιστρέφεται στο ίδιο μέσο πληρωμής.</p>
            <div className="mt-10 flex flex-wrap gap-3">{portal}</div>
          </>
        ) : p.status === 'CANCELLED' ? (
          <>
            {icon('#8A847C', FiAlertCircle)}
            <h1 className="font-display mt-6 text-[length:var(--fs-48)]">Το αίτημα πληρωμής ακυρώθηκε</h1>
            <p className="mt-4 text-[length:var(--fs-16)] text-[var(--s-ink-2)]">Η κράτηση δεν είναι πλέον ενεργή ή το αίτημα αντικαταστάθηκε. Για απορίες επικοινωνήστε μαζί μας.</p>
            <div className="mt-10 flex flex-wrap gap-3">{portal}</div>
          </>
        ) : (
          <>
            <p className="s-kicker text-[var(--s-accent)]">Κοινό container · πληρωμή κράτησης</p>
            <h1 className="font-display mt-4 text-[length:var(--fs-48)]">{p.product}</h1>
            {p.offerTitle && !p.offerTitle.startsWith(p.product) && <p className="mt-2 text-[length:var(--fs-16)] text-[var(--s-ink-2)]">{p.offerTitle}</p>}

            {result === 'failure' && (
              <p role="alert" className="mt-6 border-l-2 border-[#B42318] pl-4 text-[length:var(--fs-15)] text-[#B42318]">Η πληρωμή δεν ολοκληρώθηκε. Δεν έγινε χρέωση — μπορείτε να δοκιμάσετε ξανά.</p>
            )}
            {result === 'success' && (
              <p role="status" className="mt-6 flex items-center gap-2 border-l-2 border-[var(--s-accent)] pl-4 text-[length:var(--fs-15)]"><FiClock className="size-4" aria-hidden /> Η πληρωμή επεξεργάζεται — θα ενημερωθεί σε λίγα λεπτά.</p>
            )}
            {e && (
              <p role="alert" className="mt-6 border-l-2 border-[#B42318] pl-4 text-[length:var(--fs-15)] text-[#B42318]">
                {e === 'unavailable' ? 'Η σύνδεση με το σύστημα πληρωμών δεν ήταν δυνατή. Δοκιμάστε ξανά σε λίγο.' : 'Το αίτημα δεν είναι πλέον διαθέσιμο.'}
              </p>
            )}

            <dl className="mt-10 divide-y divide-[var(--s-line)] border-y border-[var(--s-line)] text-[length:var(--fs-15)]">
              {[
                ['Ποσότητα', `${num(p.pallets)} παλέτες · ${num(p.quantity)} ${p.unit}`],
                [`Τιμή κλιμακίου W0${p.level}`, `${eur(p.unitPrice)} / ${p.unit}`],
                ['Καθαρό', formatEur(p.netCents)],
                [`ΦΠΑ ${num(p.vatRate)}%`, formatEur(p.vatCents)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3"><dt className="text-[var(--s-mute)]">{k}</dt><dd className="font-num text-right">{v}</dd></div>
              ))}
              <div className="flex justify-between gap-4 py-4 text-[length:var(--fs-20)]"><dt>Σύνολο</dt><dd className="font-num font-medium">{formatEur(p.amountCents)}</dd></div>
            </dl>

            <form action={pay} className="mt-10 flex flex-wrap items-center gap-3">
              <button type="submit" className={btn.primary}><FiLock className="mr-2 inline size-4 align-[-2px]" aria-hidden />Πληρωμή {formatEur(p.amountCents)}</button>
              {portal}
            </form>
            <p className="mt-6 text-[length:var(--fs-14)] text-[var(--s-mute)]">Κάρτα, Apple Pay, Google Pay, IRIS και άλλοι τρόποι, με ασφάλεια μέσω Viva. Αν η τιμή έχει πέσει στο μεταξύ, χρεώνεστε απευθείας τη χαμηλότερη· αν πέσει μετά την πληρωμή, η διαφορά σας επιστρέφεται.</p>
            {p.env === 'demo' && <p className="mt-3 text-[length:var(--fs-13)] font-medium text-[#B45309]">Δοκιμαστικό περιβάλλον Viva (demo) — καμία πραγματική χρέωση.</p>}
          </>
        )}
      </div>
    </Container>
  );
}
