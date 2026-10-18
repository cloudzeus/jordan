import { FiMail } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { emailBrand } from '@/lib/email/brand';
import { EMAIL_CATALOG, GROUP_LABEL } from '@/lib/email/catalog';
import { PageHeader } from '@/components/admin/page-header';
import { EmailsClient, type TemplateView } from './emails-client';

export const dynamic = 'force-dynamic';

// Όλα τα email της εφαρμογής με δείγμα δεδομένων + κατάσταση λογαριασμού πελάτη (email & PDF).
export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ tab?: string; trdr?: string }> }) {
  const u = await requirePermission('metadata.read');
  const [brand, customers, canSend, sp] = await Promise.all([
    emailBrand(),
    prisma.softoneTrader.findMany({ where: { sodtype: 13 }, orderBy: { name: 'asc' }, select: { trdr: true, code: true, name: true, afm: true, email: true, isActive: true } }),
    hasPermission('metadata.manage'),
    searchParams,
  ]);
  const templates: TemplateView[] = EMAIL_CATALOG.map((e) => {
    const m = e.render(brand);
    return { id: e.id, group: e.group, groupLabel: GROUP_LABEL[e.group], title: e.title, audience: e.audience, trigger: e.trigger, attachments: e.attachments ?? [], subject: m.subject, html: m.html, text: m.text };
  });
  return (
    <div className="w-full">
      <PageHeader
        icon={<FiMail />}
        title="Πρότυπα email"
        description={`${templates.length} email σε κοινό σχέδιο · προεπισκόπηση με δείγμα δεδομένων · κατάσταση λογαριασμού πελάτη (email + PDF)`}
        helpAnchor="email-templates"
      />
      <EmailsClient
        templates={templates}
        customers={customers.map((c) => ({ trdr: c.trdr, label: `${c.code} · ${c.name}${c.afm ? ` · ${c.afm}` : ''}${c.isActive ? '' : ' (ανενεργός)'}`, email: c.email }))}
        me={u.email}
        canSend={canSend}
        banks={brand.bankAccounts?.length ?? 0}
        initialTab={sp.tab === 'statement' ? 'statement' : 'templates'}
        initialTrdr={sp.trdr && /^\d+$/.test(sp.trdr) ? Number(sp.trdr) : null}
      />
    </div>
  );
}
