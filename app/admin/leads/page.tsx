import { FiTarget } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { listLeads, softoneLeadsEnabled } from '@/lib/leads';
import { listSubscribers } from '@/lib/newsletter';
import { PageHeader } from '@/components/admin/page-header';
import { LeadsClient } from './leads-client';

export const dynamic = 'force-dynamic';

// Leads του website (ραντεβού, newsletter) και συνδρομητές newsletter.
export default async function LeadsPage() {
  await requirePermission('leads.read');
  const [leads, subscribers, canManage, softone] = await Promise.all([listLeads(), listSubscribers(), hasPermission('leads.manage'), softoneLeadsEnabled()]);
  const confirmed = subscribers.filter((s) => s.status === 'CONFIRMED').length;
  return (
    <div className="w-full">
      <PageHeader
        icon={<FiTarget />}
        title="Leads & newsletter"
        description={`${leads.length} leads · ${confirmed} επιβεβαιωμένοι συνδρομητές · SoftOne: ${softone ? 'ενεργό (υποψήφιοι πελάτες)' : 'κλειστό — τα leads μένουν στην εφαρμογή'}`}
        helpAnchor="leads"
      />
      <LeadsClient leads={leads} subscribers={subscribers} canManage={canManage} softoneEnabled={softone} />
    </div>
  );
}
