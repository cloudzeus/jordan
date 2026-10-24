import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/rbac';
import { customerProjects, customerSalesDoc } from '@/lib/portal-erp';
import { siteProducts } from '@/lib/site-catalog';
import { prisma } from '@/lib/db';
import { Container } from '@/components/site/ui';
import { PortalShell } from '../../../portal-shell';
import { PageTitle } from '../../_ui/bits';
import { OrderForm, type CartLine } from './order-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Νέα παραγγελία' };

const ids = (v: string | undefined) => (v ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);

/**
 * Νέο αίτημα παραγγελίας από τον κατάλογο. Προσυμπλήρωση: `?add=mtrl,…` (από τη σελίδα υλικού),
 * `?repeat=findoc` (επανάληψη δικής του παραγγελίας), `?project=prjc`.
 */
export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ add?: string; repeat?: string; project?: string }> }) {
  const user = await requireCustomer();
  const sp = await searchParams;
  const [projects, org, repeat] = await Promise.all([
    customerProjects(user.customerTrdr),
    prisma.softoneTrader.findUnique({ where: { trdr: user.customerTrdr }, select: { name: true } }),
    sp.repeat && /^\d+$/.test(sp.repeat) ? customerSalesDoc(user.customerTrdr, Number(sp.repeat)).catch(() => null) : null,
  ]);
  const wantedQty = new Map<number, number>();
  for (const m of ids(sp.add)) wantedQty.set(m, 1);
  for (const l of repeat?.lines ?? []) wantedQty.set(l.mtrl, (wantedQty.get(l.mtrl) ?? 0) + l.qty);
  const catalog = wantedQty.size ? await siteProducts({ mtrls: [...wantedQty.keys()], take: 50 }) : { items: [] };
  const initial: CartLine[] = catalog.items.map((i) => ({ mtrl: i.mtrl, code: i.code, name: i.name, unit: i.unit, photo: i.photo, qty: wantedQty.get(i.mtrl) ?? 1, note: '' }));
  const project = Number(sp.project ?? repeat?.doc.prjc ?? 0);

  return (
    <PortalShell user={user} org={org?.name ?? null} active="new-order">
      <Container className="py-14 md:py-20">
        <PageTitle eyebrow="Παραγγελία υλικών" title="Νέα παραγγελία" back={{ href: '/dashboard/customer/orders', label: 'Παραγγελίες' }}>
          Διαλέξτε υλικά και ποσότητες. Πριν προχωρήσουμε σας επιβεβαιώνουμε τιμή, διαθεσιμότητα και ημερομηνία παράδοσης — μέχρι τότε δεν δεσμεύεστε σε τίποτα.
        </PageTitle>
        {repeat && <p className="mt-4 text-(length:--fs-14) text-(--s-ink-2)">Προσυμπληρώθηκε από το {repeat.doc.fincode}{initial.length < (repeat.lines.length || 0) ? ' — όσα υλικά δεν είναι πλέον στον κατάλογο παραλείφθηκαν' : ''}.</p>}
        <div className="mt-12">
          <OrderForm
            initial={initial}
            projects={projects.filter((p) => p.state === 'active' || p.prjc === project).map((p) => ({ prjc: p.prjc, label: `${p.code} · ${p.name}` }))}
            initialProject={projects.some((p) => p.prjc === project) ? project : null}
          />
        </div>
      </Container>
    </PortalShell>
  );
}
