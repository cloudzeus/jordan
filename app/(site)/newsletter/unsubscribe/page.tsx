import Link from 'next/link';
import type { Metadata } from 'next';
import { unsubscribeNewsletter } from '@/lib/newsletter';
import { btn, Container } from '@/components/site/ui';

export const metadata: Metadata = { title: 'Διαγραφή από το newsletter', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const r = await unsubscribeNewsletter(token ?? '');
  return (
    <Container className="py-20 md:py-28">
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-(length:--fs-48)">{r.ok ? 'Διαγραφήκατε' : 'Ο σύνδεσμος δεν ισχύει'}</h1>
        <p className="mt-4 text-(length:--fs-16) text-(--s-ink-2)">{r.ok ? `Το ${r.email} δεν θα λαμβάνει πλέον το newsletter του atelier.` : 'Γράψτε μας και θα σας διαγράψουμε αμέσως.'}</p>
        <div className="mt-10"><Link href="/" className={btn.primary}>Στην αρχική</Link></div>
      </div>
    </Container>
  );
}
