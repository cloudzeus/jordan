import { FiTrendingDown } from 'react-icons/fi';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { listOffers } from '@/lib/container-offers';
import { PageHeader } from '@/components/admin/page-header';
import { OffersClient } from './offers-client';

export const dynamic = 'force-dynamic';

// Δυναμικές προσφορές (κοινό container) — Operations.
export default async function DynamicOffersPage() {
  await requirePermission('metadata.read');
  const [offers, canManage] = await Promise.all([listOffers(), hasPermission('metadata.manage')]);
  const open = offers.filter((o) => o.status === 'OPEN').length;
  return (
    <div className="w-full">
      <PageHeader
        icon={<FiTrendingDown />}
        title="Δυναμικές προσφορές"
        description={`Κοινό container: η τιμή πέφτει για όλους όσο γεμίζει · ${open} ανοιχτές από ${offers.length}`}
        helpAnchor="dynamic-offers"
      />
      <OffersClient offers={offers} canManage={canManage} />
    </div>
  );
}
