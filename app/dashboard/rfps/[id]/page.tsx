import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiArrowLeft } from 'react-icons/fi';
import { requireParty } from '@/lib/rbac';
import { partyName } from '@/lib/portal-party';
import { partyRecipient, publicView } from '@/lib/rfp/service';
import { Container } from '@/components/site/ui';
import { RfpResponse } from '@/components/rfp/rfp-response';
import { PortalShell } from '../../portal-shell';
import { NotLinked } from '../../_party/party-home';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Αίτημα προσφοράς' };

/** Ένα αίτημα προσφοράς στο portal — ίδια σελίδα απάντησης με τον σύνδεσμο του email. */
export default async function RfpDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, party } = await requireParty();
  if (!party) return <NotLinked user={user} />;
  const { id } = await params;
  const [org, r] = await Promise.all([partyName(party), partyRecipient(party, id)]);
  if (!r) notFound();
  return (
    <PortalShell user={user} org={org} active="rfps">
      <Container className="py-12 md:py-16">
        <Link href="/dashboard/rfps" className="mb-6 inline-flex items-center gap-1.5 text-(length:--fs-14) text-(--s-mute) hover:text-(--s-ink)"><FiArrowLeft className="size-4" aria-hidden />Αιτήματα προσφοράς</Link>
        <RfpResponse initial={publicView(r)} apiBase={`/api/portal/rfp/${r.id}`} readOnly={!!user.viewAs} />
      </Container>
    </PortalShell>
  );
}
