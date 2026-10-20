import type { Metadata } from 'next';
import { FiMapPin, FiPhone } from 'react-icons/fi';
import { siteCompany } from '@/lib/site-company';
import { BookingForm } from '@/components/site/booking';
import { Container } from '@/components/site/ui';
import { CropMarks, DimLine } from '@/components/site/blueprint';

export const metadata: Metadata = {
  title: 'Κλείστε ραντεβού στο atelier',
  description: 'Το atelier λειτουργεί μόνο με ραντεβού. Διαλέξτε μια ελεύθερη ώρα για να δείτε και να αγγίξετε τα υλικά του έργου σας.',
};

/**
 * Σελίδα ραντεβού — η «πραγματική» διεύθυνση των συνδέσμων «Κλείστε ραντεβού». Με JavaScript οι
 * σύνδεσμοι ανοίγουν το ίδιο περιεχόμενο σε modal (BookingModalHost)· εδώ φτάνει κανείς χωρίς JS,
 * με Ctrl/⌘-κλικ ή από εξωτερικό σύνδεσμο.
 */
export default async function AppointmentPage() {
  const c = await siteCompany();
  return (
    <Container className="py-14 md:py-20">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div className="relative lg:pt-2">
          <p className="s-kicker text-(--s-accent)">Μόνο με ραντεβού</p>
          <h1 className="font-display mt-4 text-(length:--fs-56) leading-[1.05]">Κλείστε ραντεβού στο <em>atelier.</em></h1>
          <p className="mt-6 max-w-md text-(length:--fs-18) leading-relaxed text-(--s-ink-2)">Μεγάλες επιφάνειες για κάθε υλικό, mock-ups και meeting room. Φέρτε τα σχέδια του έργου — βρίσκουμε μαζί το σωστό υλικό.</p>
          <ul className="mt-8 space-y-3 text-(length:--fs-15) text-(--s-ink)">
            <li className="flex items-start gap-3"><FiMapPin className="mt-1 size-4 shrink-0 text-(--s-accent)" aria-hidden />{c.address}</li>
            <li className="flex items-start gap-3"><FiPhone className="mt-1 size-4 shrink-0 text-(--s-accent)" aria-hidden /><a className="s-link tabular-nums" href={`tel:${c.phones[0].replace(/\s/g, '')}`}>{c.phones[0]}</a></li>
          </ul>
          <DimLine label={c.hours.toUpperCase()} className="mt-10 max-w-md text-(--s-mute)" />
        </div>
        <div className="relative min-w-0 border border-(--s-line) bg-white p-4 sm:p-8 lg:p-10">
          <CropMarks className="text-(--s-ink)" size={18} />
          <BookingForm idPrefix="bkp" TitleAs="h2" />
        </div>
      </div>
    </Container>
  );
}
