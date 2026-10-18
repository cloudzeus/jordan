import { FiShoppingCart } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { listOrderRequests } from '@/lib/order-requests';
import { getSetting } from '@/lib/settings';
import { PageHeader } from '@/components/admin/page-header';
import { RequestsClient } from './requests-client';

export const dynamic = 'force-dynamic';

// Αιτήματα παραγγελίας από το B2B portal — Operations. Δεν γράφουν στο SoftOne.
export default async function OrderRequestsPage() {
  await requirePermission('order_requests.read');
  const [rows, canManage, notify, inbox] = await Promise.all([
    listOrderRequests(), hasPermission('order_requests.manage'), getSetting<string>('orders.notifyEmail'), getSetting<string>('company.email'),
  ]);
  const pending = rows.filter((r) => r.status === 'SUBMITTED').length;
  const notifyTo = notify?.trim().toLowerCase() === 'off' ? null : notify?.trim() || inbox?.trim() || null;
  return (
    <div className="w-full">
      <PageHeader
        icon={<FiShoppingCart />}
        title="Αιτήματα παραγγελίας"
        description={`Από πελάτες στο B2B portal · ${pending} νέα από ${rows.length} · ειδοποίηση: ${notifyTo ?? 'καμία (email ανενεργό)'}`}
        helpAnchor="order-requests"
      />
      <RequestsClient rows={rows} canManage={canManage} />
    </div>
  );
}
