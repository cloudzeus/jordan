import { FiTool } from 'react-icons/fi';
import { prisma } from '@/lib/db';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { getSetting } from '@/lib/settings';
import { PageHeader } from '@/components/admin/page-header';
import { ItemsTableClient } from '@/components/admin/items-table-client';
import { primaryThumbs } from '@/lib/item-media/thumbs';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  await requirePermission('metadata.read');
  const [items, canManage, lastSync, thumbs] = await Promise.all([
    prisma.softoneItem.findMany({ where: { isService: true }, orderBy: { name: 'asc' } }),
    hasPermission('metadata.manage'),
    getSetting<string>('integrations.softoneItemsLastSync'),
    primaryThumbs(),
  ]);
  const rows = items.map((i) => ({ ...i, thumbUrl: thumbs.get(i.mtrl) ?? null }));

  return (
    <div className="w-full">
      <PageHeader
        icon={<FiTool />}
        title="Υπηρεσίες"
        description={`Μητρώο υπηρεσιών από SoftOne (${rows.length.toLocaleString('el-GR')}).`}
        helpAnchor="services"
      />
      <ItemsTableClient rows={rows} variant="services" canManage={canManage} lastSync={lastSync ?? null} />
    </div>
  );
}
