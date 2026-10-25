import Link from 'next/link';
import { FiArrowLeft, FiPlusCircle } from 'react-icons/fi';
import { requirePermission } from '@/lib/rbac';
import { staffOptions } from '@/lib/contracts/service';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/admin/page-header';
import { ContractEditor } from '../contract-editor';
import { listTemplates } from '@/lib/project-tasks';
import { zonedParts } from '@/lib/appointments-core';

export const dynamic = 'force-dynamic';

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ trdr?: string; prospect?: string }> }) {
  await requirePermission('projects.manage');
  const sp = await searchParams;
  const trdr = Number(sp.trdr);
  const prospectId = Number(sp.prospect);
  // «Νέα προσφορά…» από το μενού του πελάτη ή του δυνητικού πελάτη: ο πελάτης έρχεται προεπιλεγμένος.
  const [staff, trader, prospect, templates] = await Promise.all([
    staffOptions(),
    Number.isInteger(trdr) && trdr > 0 ? prisma.softoneTrader.findUnique({ where: { trdr }, select: { trdr: true, name: true, email: true, phone: true } }) : null,
    Number.isInteger(prospectId) && prospectId > 0 ? prisma.prospect.findUnique({ where: { id: prospectId }, select: { id: true, name: true, email: true, phone: true, trdr: true } }) : null,
    listTemplates(),
  ]);
  // Δυνητικός που έγινε ήδη πελάτης: η προσφορά πάει στον πελάτη SoftOne.
  const customer = trader ? { ...trader, prospectId: null }
    : prospect ? { trdr: prospect.trdr, prospectId: prospect.trdr ? null : prospect.id, name: prospect.name, email: prospect.email, phone: prospect.phone } : null;
  return (
    <div className="mx-auto w-full max-w-7xl">
      <Link href="/admin/projects/contracts" className="mb-2 inline-flex items-center gap-1 text-(length:--fs-12) text-muted-foreground hover:text-foreground"><FiArrowLeft className="size-3.5" /> Συμβάσεις & Προσφορές</Link>
      <PageHeader icon={<FiPlusCircle />} title="Νέο έργο" description="Πελάτης, κάτοψη & χώροι, υλικά, περιγραφή και πληρωμές — ξεκινά ως προσφορά" helpAnchor="contracts" />
      <ContractEditor templates={templates} today={zonedParts(new Date()).date} initial={null} staff={staff} customer={customer} />
    </div>
  );
}
