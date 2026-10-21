import type { Metadata } from 'next';
import { requireParty } from '@/lib/rbac';
import { partyAssignments, partyName, paymentSummary } from '@/lib/portal-party';
import { Container } from '@/components/site/ui';
import { Grid } from '@/components/site/blueprint';
import { PortalShell } from '../portal-shell';
import { PageTitle, Stat } from '../customer/_ui/bits';
import { eur, MilestoneList } from '../_party/ui';
import { NotLinked } from '../_party/party-home';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Πληρωμές' };

/** Τα χρήματα του συνεργάτη/συνεργείου, από τα ορόσημα των αναθέσεών του. */
export default async function PaymentsPage() {
  const { user, party } = await requireParty();
  if (!party) return <NotLinked user={user} />;
  const [org, all] = await Promise.all([partyName(party), partyAssignments(party)]);
  const pay = paymentSummary(all);
  return (
    <PortalShell user={user} org={org} active="payments">
      <section className="relative overflow-hidden bg-(--s-paper)">
        <Grid />
        <Container className="relative py-14 md:py-20">
          <PageTitle eyebrow="Χρήματα" title="Πληρωμές">
            Κάθε ανάθεση πληρώνεται σε ορόσημα: όταν παραδώσετε ένα στάδιο, το βλέπετε εδώ ως «Παραδόθηκε» μέχρι να εξοφληθεί.
          </PageTitle>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <Stat label="Πληρώθηκαν" value={eur(pay.paid)} hint={`${pay.history.length} ορόσημα`} />
            <Stat label="Οφείλονται" value={eur(pay.due)} hint="παραδόθηκαν, περιμένουν εξόφληση" />
            <Stat label="Έρχονται" value={eur(pay.upcoming)} hint="με την ολοκλήρωση των σταδίων" />
          </div>
        </Container>
      </section>
      <Container className="grid gap-14 py-14 md:py-20 lg:grid-cols-2">
        <section aria-labelledby="next">
          <h2 id="next" className="font-site text-(length:--fs-24) font-light">Εκκρεμούν</h2>
          <div className="mt-6"><MilestoneList items={pay.next} showContract /></div>
        </section>
        <section aria-labelledby="hist">
          <h2 id="hist" className="font-site text-(length:--fs-24) font-light">Ιστορικό εξοφλήσεων</h2>
          <div className="mt-6"><MilestoneList items={pay.history} showContract /></div>
        </section>
      </Container>
    </PortalShell>
  );
}
