import type { Metadata } from 'next';
import { FiAlertCircle } from 'react-icons/fi';
import { Container } from '@/components/site/ui';
import { RfpResponse } from '@/components/rfp/rfp-response';
import { publicView, recipientByToken } from '@/lib/rfp/service';

export const metadata: Metadata = { title: 'Αίτημα προσφοράς', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Ο μοναδικός σύνδεσμος του συνεργείου (από το email): το αίτημα, τα specs και η φόρμα απάντησης —
 * χωρίς λογαριασμό. Το άνοιγμα, η λήψη του PDF και η υποβολή καταγράφονται (απόδειξη).
 */
export default async function RfpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await recipientByToken(token);
  return (
    <Container className="py-16 md:py-24">
      {!r ? (
        <div className="mx-auto max-w-xl">
          <span className="grid size-14 place-items-center rounded-full bg-[#B42318]/10 text-[#B42318]"><FiAlertCircle className="size-6" aria-hidden /></span>
          <h1 className="font-display mt-6 text-(length:--fs-36)">Ο σύνδεσμος δεν ισχύει</h1>
          <p className="mt-3 text-(length:--fs-16) text-(--s-ink-2)">Ίσως αντικαταστάθηκε από νεότερο. Ελέγξτε το πιο πρόσφατο email μας ή επικοινωνήστε μαζί μας.</p>
        </div>
      ) : (
        <RfpResponse initial={publicView(r)} apiBase={`/api/public/rfp/${encodeURIComponent(token)}`} />
      )}
    </Container>
  );
}
