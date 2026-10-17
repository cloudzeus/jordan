import { requirePortalUser } from '@/lib/rbac';
import { Portal } from '../portal';

export const dynamic = 'force-dynamic';

export default async function CollaboratorHome() {
  const user = await requirePortalUser();
  return <Portal user={user} />;
}
