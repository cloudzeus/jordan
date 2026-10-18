import Link from 'next/link';
import { FiArrowLeft, FiClock } from 'react-icons/fi';
import { requirePermission } from '@/lib/rbac';
import { listBlocks, loadAvailability } from '@/lib/appointments';
import { zonedParts } from '@/lib/appointments-core';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { AvailabilityClient } from './availability-client';

export const dynamic = 'force-dynamic';

// Ωράριο ραντεβού, διάρκεια/χωρητικότητα και κλειστές μέρες — ό,τι βλέπει ο επισκέπτης ως «ελεύθερο».
export default async function AvailabilityPage() {
  await requirePermission('appointments.manage');
  const [availability, blocks] = await Promise.all([loadAvailability(), listBlocks(new Date(Date.now() - 86_400_000))]);
  return (
    <div className="w-full">
      <PageHeader
        icon={<FiClock />}
        title="Ωράριο & αποκλεισμοί ραντεβού"
        description="Οι ελεύθερες ώρες που βλέπει ο επισκέπτης στο website — ώρα Αθήνας"
        helpAnchor="appointments-availability"
        actions={<Button asChild variant="outline" size="sm"><Link href="/admin/appointments" aria-label="Ημερολόγιο"><FiArrowLeft className="size-3.5" aria-hidden /><span className="hidden sm:inline">Ημερολόγιο</span></Link></Button>}
      />
      <AvailabilityClient availability={availability} blocks={blocks} today={zonedParts(new Date()).date} />
    </div>
  );
}
