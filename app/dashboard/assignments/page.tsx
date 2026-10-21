import type { Metadata } from 'next';
import { requireParty } from '@/lib/rbac';
import { partyAssignments, partyName } from '@/lib/portal-party';
import { Container } from '@/components/site/ui';
import { PortalShell } from '../portal-shell';
import { Empty, PageTitle } from '../customer/_ui/bits';
import { AssignmentCard, eur } from '../_party/ui';
import { NotLinked } from '../_party/party-home';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Οι αναθέσεις μου' };

/** Όλες οι αναθέσεις του συνεργάτη/συνεργείου: πρώτα όσες τρέχουν, μετά οι ολοκληρωμένες. */
export default async function AssignmentsPage() {
  const { user, party } = await requireParty();
  if (!party) return <NotLinked user={user} />;
  const [org, all] = await Promise.all([partyName(party), partyAssignments(party)]);
  const running = all.filter((a) => a.status !== 'COMPLETED');
  const done = all.filter((a) => a.status === 'COMPLETED');
  const fees = all.reduce((t, a) => t + a.feeTotal, 0);
  return (
    <PortalShell user={user} org={org} active="assignments">
      <Container className="py-14 md:py-20">
        <PageTitle eyebrow="Αναθέσεις" title="Τι έχετε αναλάβει">
          {all.length ? `${all.length === 1 ? 'Μία ανάθεση' : `${all.length} αναθέσεις`} · ${running.length} σε εξέλιξη · συνολική αμοιβή ${eur(fees)}.` : null} Σε κάθε ανάθεση βρίσκετε το εργοτάξιο, τις εργασίες, τα ορόσημα πληρωμής και τη σύμβασή σας.
        </PageTitle>
        {all.length === 0 ? (
          <div className="mt-12"><Empty title="Καμία ανάθεση ακόμη">Μόλις υπογραφεί σύμβαση που σας αφορά, θα εμφανιστεί εδώ.</Empty></div>
        ) : (
          <>
            {running.length > 0 && (
              <ul className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3" data-reveal data-stagger>
                {running.map((a) => <li key={a.contractId}><AssignmentCard a={a} /></li>)}
              </ul>
            )}
            {done.length > 0 && (
              <>
                <h2 className="font-site mt-16 text-(length:--fs-24) font-light">Ολοκληρωμένες</h2>
                <ul className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {done.map((a) => <li key={a.contractId}><AssignmentCard a={a} /></li>)}
                </ul>
              </>
            )}
          </>
        )}
      </Container>
    </PortalShell>
  );
}
