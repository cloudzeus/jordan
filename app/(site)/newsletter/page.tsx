import type { Metadata } from 'next';
import { NewsletterForm } from '@/components/site/newsletter';
import { Container } from '@/components/site/ui';
import { DimLine } from '@/components/site/blueprint';

export const metadata: Metadata = { title: 'Newsletter', description: 'Νέα υλικά, δυναμικές προσφορές container και εκδηλώσεις του atelier — μόνο για επαγγελματίες.' };

// Εναλλακτική σελίδα των συνδέσμων «Newsletter» (με JavaScript ανοίγει το NewsletterModalHost).
export default function NewsletterPage() {
  return (
    <Container className="py-16 md:py-24">
      <div className="mx-auto max-w-xl">
        <p className="s-kicker text-(--s-accent)">Newsletter</p>
        <h1 className="font-display mt-4 text-(length:--fs-56) leading-[1.05]">Τα νέα του <em>atelier.</em></h1>
        <p className="mt-5 text-(length:--fs-18) leading-relaxed text-(--s-ink-2)">Νέα υλικά, δυναμικές προσφορές κοινού container και εκδηλώσεις — λίγες φορές τον μήνα. Θα σας στείλουμε email για να επιβεβαιώσετε την εγγραφή.</p>
        <div className="mt-10"><NewsletterForm source="page" idPrefix="nlp" withName /></div>
        <DimLine label="DOUBLE OPT-IN · ΔΙΑΓΡΑΦΗ ΜΕ ΕΝΑ ΚΛΙΚ" className="mt-12 text-(--s-mute)" />
      </div>
    </Container>
  );
}
