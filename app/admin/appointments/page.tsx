import Link from 'next/link';
import { FiCalendar, FiSettings } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { listAppointments, listBlocks, loadAvailability } from '@/lib/appointments';
import { zonedParts } from '@/lib/appointments-core';
import { staffRecipient } from '@/lib/lead-mail';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { AppointmentsClient } from './appointments-client';

export const dynamic = 'force-dynamic';

// Ραντεβού στο atelier από το website — ημερολόγιο (ημέρα/εβδομάδα/μήνας) και λίστα.
export default async function AppointmentsPage() {
  await requirePermission('appointments.read');
  const now = Date.now();
  const [rows, blocks, availability, canManage, notifyTo] = await Promise.all([
    listAppointments(new Date(now - 180 * 86_400_000), new Date(now + 366 * 86_400_000)),
    listBlocks(new Date(now - 180 * 86_400_000)),
    loadAvailability(),
    hasPermission('appointments.manage'),
    staffRecipient(),
  ]);
  const pending = rows.filter((r) => r.status === 'PENDING' && new Date(r.end).getTime() > now).length;
  return (
    <div className="w-full">
      <PageHeader
        icon={<FiCalendar />}
        title="Ραντεβού atelier"
        description={`Από το website · ${pending} σε αναμονή επιβεβαίωσης · ειδοποίηση: ${notifyTo ?? 'καμία (off)'}`}
        helpAnchor="appointments"
        actions={canManage ? <Button asChild variant="outline" size="sm"><Link href="/admin/appointments/availability" aria-label="Ωράριο & αποκλεισμοί"><FiSettings className="size-3.5" aria-hidden /><span className="hidden sm:inline">Ωράριο & αποκλεισμοί</span></Link></Button> : undefined}
      />
      <AppointmentsClient rows={rows} blocks={blocks} availability={availability} canManage={canManage} today={zonedParts(new Date()).date} />
    </div>
  );
}
