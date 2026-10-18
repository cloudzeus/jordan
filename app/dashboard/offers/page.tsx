import type { Metadata } from 'next';
import { requirePortalUser } from '@/lib/rbac';
import { portalData } from '@/lib/portal-data';
import { DimLine, Grid } from '@/components/site/blueprint';
import { PortalShell } from '../portal-shell';
import { OfferCard } from '../offer-card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Δυναμικές προσφορές' };

/** Όλα τα κοινά container που στάλθηκαν στον πελάτη/συνεργάτη: ζωντανά πρώτα, μετά το ιστορικό. */
export default async function OffersPage() {
  const user = await requirePortalUser();
  const data = await portalData(user);
  const open = data.offers.filter((o) => o.status === 'OPEN');
  const closed = data.offers.filter((o) => o.status === 'CLOSED');

  return (
    <PortalShell user={user} org={data.org} active="offers">
      <section className="relative overflow-hidden bg-[var(--s-paper)]">
        <Grid />
        <div className="relative mx-auto w-full max-w-[1440px] px-5 pb-12 pt-10 sm:px-8 lg:px-12 lg:pb-16 lg:pt-14">
          <p className="s-kicker text-[var(--s-accent)]">Δυναμικές προσφορές</p>
          <h1 className="s-rise font-display mt-5 max-w-4xl text-[length:var(--fs-56)] lg:text-[length:var(--fs-72)]">Όσο γεμίζει, <em>τόσο πέφτει.</em></h1>
          <p style={{ ["--d" as string]: "0.12s" }} className="s-rise mt-5 max-w-2xl text-[length:var(--fs-18)] text-[var(--s-ink-2)]">Κάθε κοινό container έχει ένα ή περισσότερα υλικά. Κλείνετε όσες παλέτες χρειάζεστε — κάθε νέα κράτηση, δική σας ή άλλου επαγγελματία, κατεβάζει την τιμή για όλους.</p>
          <DimLine label={`${open.length} ΑΝΟΙΧΤΑ · ${closed.length} ΚΛΕΙΣΜΕΝΑ`} className="mt-10 max-w-2xl text-[var(--s-mute)]" />
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1440px] px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        {open.length === 0 ? (
          <div className="border border-dashed border-[var(--s-line)] px-6 py-16 text-center">
            <p className="font-display text-[length:var(--fs-32)]">Κανένα ανοιχτό container αυτή τη στιγμή</p>
            <p className="mt-2 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">Θα σας ειδοποιήσουμε με email μόλις ανοίξει νέο.</p>
          </div>
        ) : (
          <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-reveal data-stagger>
            {open.map((o) => <li key={o.id}><OfferCard o={o} /></li>)}
          </ul>
        )}
        {closed.length > 0 && (
          <div className="mt-20">
            <p className="s-kicker text-[var(--s-mute)]">Ιστορικό</p>
            <h2 className="font-display mt-3 text-[length:var(--fs-32)]">Κλεισμένα container</h2>
            <ul className="mt-8 grid gap-6 opacity-90 md:grid-cols-2 xl:grid-cols-3">
              {closed.map((o) => <li key={o.id}><OfferCard o={o} /></li>)}
            </ul>
          </div>
        )}
      </section>
    </PortalShell>
  );
}
