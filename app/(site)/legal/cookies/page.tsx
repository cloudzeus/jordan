import Link from 'next/link';
import type { Metadata } from 'next';
import { LegalPage, Section } from '@/components/site/legal';

export const metadata: Metadata = { title: 'Cookies', description: 'Ποια cookies χρησιμοποιεί η B2B πύλη.' };

// Ο πίνακας αντιστοιχεί σε ό,τι ορίζει ο κώδικας: lib/session.ts, lib/auth-flow.ts, app/api/me/locale.
const COOKIES = [
  { name: 'erp_session', purpose: 'Κρατά τη σύνδεσή σας στην περιοχή πελατών (HttpOnly — δεν διαβάζεται από scripts).', duration: '30 ημέρες ή ως την αποσύνδεση', kind: 'Απαραίτητο' },
  { name: 'auth_pending', purpose: 'Θυμάται το βήμα εισόδου όταν ζητήσατε κωδικό μίας χρήσης στο email.', duration: 'Λίγα λεπτά', kind: 'Απαραίτητο' },
  { name: 'dg-locale', purpose: 'Θυμάται τη γλώσσα που επιλέξατε.', duration: '12 μήνες', kind: 'Λειτουργικό' },
];

/** Η πύλη χρησιμοποιεί ΜΟΝΟ απαραίτητα/λειτουργικά cookies — γι' αυτό δεν χρειάζεται banner συγκατάθεσης. */
export default function CookiesPage() {
  return (
    <LegalPage title="Cookies" current="/legal/cookies" intro={<p>Η πύλη χρησιμοποιεί μόνο τα cookies που χρειάζονται για να λειτουργεί: τη σύνδεση και τη γλώσσα. Δεν χρησιμοποιούμε cookies διαφήμισης, στατιστικών ή κοινωνικών δικτύων τρίτων — γι&apos; αυτό δεν σας ζητάμε συγκατάθεση με banner.</p>}>
      <Section n={1} title="Ποια cookies ορίζουμε">
        <div className="border-t border-(--s-line)">
          {COOKIES.map((k) => (
            <div key={k.name} className="grid gap-1 border-b border-(--s-line) py-4 sm:grid-cols-[10rem_1fr_9rem] sm:gap-4">
              <p className="font-mono text-(length:--fs-14) text-(--s-ink)">{k.name}</p>
              <p>{k.purpose}<span className="block text-(length:--fs-13) text-(--s-mute)">{k.kind}</span></p>
              <p className="text-(length:--fs-14) sm:text-right">{k.duration}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section n={2} title="Τοπική αποθήκευση του browser">
        <p>Μερικές προτιμήσεις εμφάνισης (π.χ. ποιες ενότητες είναι ανοιχτές) αποθηκεύονται τοπικά στον browser σας και δεν στέλνονται σε εμάς.</p>
      </Section>
      <Section n={3} title="Πώς τα ελέγχετε">
        <p>Μπορείτε να διαγράψετε ή να μπλοκάρετε cookies από τις ρυθμίσεις του browser σας. Χωρίς τα απαραίτητα cookies δεν είναι δυνατή η είσοδος στην περιοχή πελατών.</p>
        <p>Για περισσότερα δείτε την <Link href="/legal/privacy" className="s-link text-(--s-ink)">Πολιτική απορρήτου</Link>.</p>
      </Section>
    </LegalPage>
  );
}
