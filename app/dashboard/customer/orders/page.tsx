import Link from 'next/link';
import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/rbac';
import { customerSalesDocs } from '@/lib/portal-erp';
import { customerOrderRequests } from '@/lib/order-requests';
import { CUSTOMER_DOC_LABEL, type CustomerDocKind } from '@/lib/portal-erp-core';
import { requestCode } from '@/lib/order-requests-core';
import { prisma } from '@/lib/db';
import { btn, Container, Notice } from '@/components/site/ui';
import { cn } from '@/lib/utils';
import { PortalShell } from '../../portal-shell';
import { Empty, ErpUnavailable, PageTitle } from '../_ui/bits';
import { DocTable } from '../_ui/doc-table';
import { RequestList } from './request-list';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Παραγγελίες' };

const FILTERS: { key: 'all' | CustomerDocKind; label: string }[] = [
  { key: 'all', label: 'Όλα' },
  { key: 'order', label: 'Παραγγελίες' },
  { key: 'delivery', label: 'Δελτία' },
  { key: 'invoice', label: 'Τιμολόγια' },
  { key: 'credit', label: 'Πιστωτικά' },
  { key: 'quote', label: 'Προσφορές' },
];

/** Παραγγελίες πελάτη: τα αιτήματα από το portal + τα παραστατικά πωλήσεων του SoftOne. */
export default async function CustomerOrdersPage({ searchParams }: { searchParams: Promise<{ kind?: string; requested?: string }> }) {
  const user = await requireCustomer();
  const sp = await searchParams;
  const kind = FILTERS.some((f) => f.key === sp.kind) ? (sp.kind as 'all' | CustomerDocKind) : 'all';
  const [docs, requests, org] = await Promise.all([
    customerSalesDocs(user.customerTrdr).then((d) => d, () => null),
    customerOrderRequests(user.customerTrdr),
    prisma.softoneTrader.findUnique({ where: { trdr: user.customerTrdr }, select: { name: true } }),
  ]);
  const shown = docs ? (kind === 'all' ? docs : docs.filter((d) => d.kind === kind)) : [];
  const count = (k: 'all' | CustomerDocKind) => (docs ? (k === 'all' ? docs.length : docs.filter((d) => d.kind === k).length) : 0);
  const requested = sp.requested && /^\d+$/.test(sp.requested) ? requestCode(Number(sp.requested)) : null;

  return (
    <PortalShell user={user} org={org?.name ?? null} active="orders">
      <Container className="py-14 md:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <PageTitle eyebrow="Παραγγελίες & παραστατικά" title="Παραγγελίες">
            Η πορεία κάθε παραγγελίας ως το δελτίο και το τιμολόγιο, όπως καταχωρίζεται στο σύστημά μας.
          </PageTitle>
          <Link href="/dashboard/customer/orders/new" className={btn.primary}>Νέα παραγγελία</Link>
        </div>

        {requested && <div className="mt-8"><Notice tone="success">Το αίτημα <b className="font-medium">{requested}</b> στάλθηκε. Θα το επιβεβαιώσουμε και θα εμφανιστεί ως παραγγελία παρακάτω.</Notice></div>}

        {requests.length > 0 && (
          <section className="mt-14" aria-labelledby="requests">
            <h2 id="requests" className="font-site text-(length:--fs-24) font-medium">Αιτήματα από το portal</h2>
            <p className="mt-1 text-(length:--fs-14) text-(--s-ink-2)">Ό,τι στείλατε από εδώ, μέχρι να καταχωριστεί ως παραγγελία.</p>
            <div className="mt-6"><RequestList requests={requests} /></div>
          </section>
        )}

        <section className="mt-14" aria-labelledby="docs">
          <h2 id="docs" className="font-site text-(length:--fs-24) font-medium">Παραστατικά</h2>
          <nav aria-label="Φίλτρο παραστατικών" className="mt-5 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link key={f.key} href={f.key === 'all' ? '/dashboard/customer/orders' : `/dashboard/customer/orders?kind=${f.key}`}
                aria-current={f.key === kind ? 'page' : undefined}
                className={cn('inline-flex min-h-11 items-center gap-1.5 border px-4 text-(length:--fs-14) transition-colors',
                  f.key === kind ? 'border-(--s-ink) bg-(--s-ink) text-white' : 'border-(--s-line) text-(--s-ink-2) hover:border-(--s-ink)')}>
                {f.label}<span className="tabular-nums opacity-70">{count(f.key)}</span>
              </Link>
            ))}
          </nav>
          <div className="mt-6">
            {!docs ? <ErpUnavailable /> : shown.length ? <DocTable docs={shown} /> : (
              <Empty title={kind === 'all' ? 'Δεν υπάρχουν παραστατικά' : `Δεν υπάρχουν ${CUSTOMER_DOC_LABEL[kind as CustomerDocKind].toLowerCase()}`} />
            )}
          </div>
        </section>
      </Container>
    </PortalShell>
  );
}
