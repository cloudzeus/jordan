import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { FiAlertCircle, FiCheck } from 'react-icons/fi';
import { confirmNewsletter, peekNewsletterToken } from '@/lib/newsletter';
import { btn, Container } from '@/components/site/ui';

export const metadata: Metadata = { title: 'Επιβεβαίωση εγγραφής', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Ο σύνδεσμος του email επιβεβαίωσης (double opt-in). Το GET ΔΕΝ επιβεβαιώνει — τα φίλτρα ασφαλείας
 * των mail servers «ανοίγουν» τους συνδέσμους μόνα τους. Επιβεβαιώνει μόνο το κουμπί (server action)·
 * εκεί, και μόνο εκεί, η εγγραφή γίνεται lead.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token = '', done } = await searchParams;
  const sub = await peekNewsletterToken(token);

  async function confirm() {
    'use server';
    const r = await confirmNewsletter(token);
    redirect(`/newsletter/confirm?token=${encodeURIComponent(token)}&done=${r.ok ? '1' : '0'}`);
  }

  const confirmed = sub?.status === 'CONFIRMED';
  return (
    <Container className="py-20 md:py-28">
      <div className="mx-auto max-w-xl">
        {!sub ? (
          <>
            <span className="grid size-14 place-items-center rounded-full bg-[#B42318]/10 text-[#B42318]"><FiAlertCircle className="size-6" aria-hidden /></span>
            <h1 className="font-display mt-6 text-[length:var(--fs-48)]">Ο σύνδεσμος δεν ισχύει</h1>
            <p className="mt-4 text-[length:var(--fs-16)] text-[var(--s-ink-2)]">Ίσως αντικαταστάθηκε από νεότερο email. Κάντε ξανά την εγγραφή για να λάβετε νέο σύνδεσμο.</p>
            <div className="mt-10 flex flex-wrap gap-3"><Link href="/newsletter" className={btn.primary}>Νέα εγγραφή</Link><Link href="/" className={btn.ghost}>Στην αρχική</Link></div>
          </>
        ) : confirmed ? (
          <>
            <span className="grid size-14 place-items-center rounded-full bg-[#15803D]/10 text-[#15803D]"><FiCheck className="size-6" aria-hidden /></span>
            <h1 className="font-display mt-6 text-[length:var(--fs-48)]">{done ? 'Η εγγραφή επιβεβαιώθηκε' : 'Είστε ήδη εγγεγραμμένοι'}</h1>
            <p className="mt-4 text-[length:var(--fs-16)] text-[var(--s-ink-2)]">Θα λαμβάνετε τα νέα του atelier στο <strong className="font-medium text-[var(--s-ink)]">{sub.email}</strong>. Κάθε email έχει σύνδεσμο διαγραφής.</p>
            <div className="mt-10"><Link href="/" className={btn.primary}>Στην αρχική</Link></div>
          </>
        ) : (
          <>
            <p className="s-kicker text-[var(--s-accent)]">Newsletter</p>
            <h1 className="font-display mt-4 text-[length:var(--fs-48)]">Επιβεβαιώστε την εγγραφή</h1>
            <p className="mt-4 text-[length:var(--fs-16)] text-[var(--s-ink-2)]">Θα στέλνουμε τα νέα του atelier στο <strong className="font-medium text-[var(--s-ink)]">{sub.email}</strong>.</p>
            <form action={confirm} className="mt-10"><button type="submit" className={btn.primary}>Ναι, θέλω να εγγραφώ</button></form>
          </>
        )}
      </div>
    </Container>
  );
}
