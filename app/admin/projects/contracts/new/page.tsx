import Link from 'next/link';
import { FiArrowLeft, FiPlusCircle } from 'react-icons/fi';
import { requirePermission } from '@/lib/rbac';
import { staffOptions } from '@/lib/contracts/service';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/admin/page-header';
import { ContractEditor } from '../contract-editor';

export const dynamic = 'force-dynamic';

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ trdr?: string }> }) {
  await requirePermission('projects.manage');
  const trdr = Number((await searchParams).trdr);
  // «Νέα προσφορά…» από το μενού του πελάτη: ο πελάτης έρχεται προεπιλεγμένος.
  const [staff, customer] = await Promise.all([
    staffOptions(),
    Number.isInteger(trdr) && trdr > 0 ? prisma.softoneTrader.findUnique({ where: { trdr }, select: { trdr: true, name: true, email: true, phone: true } }) : null,
  ]);
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link href="/admin/projects/contracts" className="mb-2 inline-flex items-center gap-1 text-(length:--fs-12) text-muted-foreground hover:text-foreground"><FiArrowLeft className="size-3.5" /> Συμβάσεις & Προσφορές</Link>
      <PageHeader icon={<FiPlusCircle />} title="Νέο έργο" description="Περίληψη, τύπος, υλικά & υπηρεσίες, συνεργεία, τοποθεσία και milestones — ξεκινά ως προσφορά" helpAnchor="contracts" />
      <ContractEditor initial={null} staff={staff} customer={customer} />
    </div>
  );
}
