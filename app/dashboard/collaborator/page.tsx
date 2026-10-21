import { requireParty } from '@/lib/rbac';
import { NotLinked, PartyHome } from '../_party/party-home';

export const dynamic = 'force-dynamic';

export default async function CollaboratorHome() {
  const { user, party } = await requireParty();
  return party ? <PartyHome user={user} party={party} /> : <NotLinked user={user} />;
}
