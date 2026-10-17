import { FiUsers } from 'react-icons/fi';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { listPartners, partnerLinkOptions } from '@/lib/partners';
import { PageHeader } from '@/components/admin/page-header';
import { PartnersTableClient } from './partners-table-client';

export const dynamic = 'force-dynamic';

// Συνεργάτες — τοπικό μητρώο εταιριών/προσώπων, με πρόσωπα επικοινωνίας και συσχέτιση με
// πελάτες και έργα του SoftOne. Ομάδα μενού «Operations».
export default async function PartnersPage() {
  await requirePermission('partners.read');
  const [rows, options, canManage] = await Promise.all([listPartners(), partnerLinkOptions(), hasPermission('partners.manage')]);
  const companies = rows.filter((r) => r.type === 'COMPANY').length;

  return (
    <div className="w-full">
      <PageHeader
        icon={<FiUsers />}
        title="Συνεργάτες"
        description={`${rows.length.toLocaleString('el-GR')} συνεργάτες · ${companies} εταιρίες, ${rows.length - companies} πρόσωπα`}
        helpAnchor="partners"
      />
      <PartnersTableClient rows={rows} options={options} canManage={canManage} />
    </div>
  );
}
