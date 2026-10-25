import Link from 'next/link';
import { FiAlertCircle, FiCheck, FiCpu, FiHelpCircle, FiImage, FiInbox, FiX } from 'react-icons/fi';
import { requirePermission } from '@/lib/rbac';
import { listOfferRequests, type OfferRequestRow } from '@/lib/contracts/offer-requests';
import type { RequestBucket } from '@/lib/contracts/offer-requests-core';
import { PageHeader } from '@/components/admin/page-header';
import { cn } from '@/lib/utils';
import { RowMenu } from './row-menu';

export const dynamic = 'force-dynamic';

// Αιτήματα προσφοράς από την πύλη πελατών — όλη η διαδρομή: αίτημα → προσφορά → αποδοχή → έργο.
const TABS: { key: RequestBucket | 'ALL'; label: string }[] = [
  { key: 'NEW', label: 'Νέα' }, { key: 'OPEN', label: 'Σε εξέλιξη' }, { key: 'CLOSED', label: 'Κλειστά' }, { key: 'ALL', label: 'Όλα' },
];
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit' }) : null);
const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });

function Flow({ r }: { r: OfferRequestRow }) {
  return (
    <ol className="grid grid-cols-3 gap-y-3 sm:grid-cols-6" aria-label="Πορεία αιτήματος">
      {r.steps.map((s, i) => (
        <li key={s.key} className="relative flex flex-col items-start gap-1 pr-2" aria-current={s.current ? 'step' : undefined}>
          {i > 0 && <span aria-hidden className={cn('absolute top-2.5 hidden h-px sm:block', s.done ? 'bg-emerald-500' : 'bg-border')} style={{ left: 'calc(-100% + 1.75rem)', width: 'calc(100% - 2rem)' }} />}
          <span className={cn('relative z-10 grid size-5 place-items-center rounded-full ring-1',
            s.done ? 'bg-emerald-600 text-white ring-emerald-600'
              : s.current ? 'bg-amber-50 text-amber-700 ring-amber-500'
                : r.cancelledAt ? 'bg-muted text-muted-foreground ring-border' : 'bg-background text-muted-foreground ring-border')}>
            {s.done ? <FiCheck className="size-3" aria-hidden /> : <span className="text-(length:--fs-10) font-semibold">{i + 1}</span>}
          </span>
          <span className={cn('text-(length:--fs-12) leading-tight', s.done || s.current ? 'font-medium text-foreground' : 'text-muted-foreground')}>{s.label}</span>
          <span className="text-(length:--fs-11) tabular-nums text-muted-foreground">{s.at ? day(s.at) : s.current ? 'επόμενο' : '\u00a0'}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function OfferRequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission('projects.read');
  const { tab: raw } = await searchParams;
  const rows = await listOfferRequests();
  const count = (k: RequestBucket) => rows.filter((r) => r.bucket === k).length;
  const tab = (TABS.some((t) => t.key === raw) ? raw : count('NEW') ? 'NEW' : 'OPEN') as RequestBucket | 'ALL';
  const shown = tab === 'ALL' ? rows : rows.filter((r) => r.bucket === tab);
  return (
    <div className="w-full">
      <PageHeader
        icon={<FiInbox />}
        title="Αιτήματα προσφοράς"
        description="Από πελάτες στην πύλη (βοηθός AI ή φόρμα) — η πορεία του καθενός από το αίτημα ως το έργο"
        helpAnchor="offer-requests"
      />
      <nav aria-label="Φίλτρο αιτημάτων" className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const n = t.key === 'ALL' ? rows.length : count(t.key);
          return (
            <Link key={t.key} href={`?tab=${t.key}`} aria-current={tab === t.key ? 'page' : undefined}
              className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-(length:--fs-13) font-medium ring-1 ring-inset',
                tab === t.key ? 'bg-foreground text-background ring-foreground' : 'text-muted-foreground ring-border hover:text-foreground')}>
              {t.label}<span className="tabular-nums opacity-70">{n}</span>
            </Link>
          );
        })}
      </nav>
      {!shown.length ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-(length:--fs-13) text-muted-foreground">
          {tab === 'NEW' ? 'Κανένα νέο αίτημα. Όταν ένας πελάτης ζητήσει προσφορά από την πύλη, θα εμφανιστεί εδώ και στο σήμα του μενού.' : 'Δεν υπάρχουν αιτήματα σε αυτή την ομάδα.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.id} className={cn('rounded-lg border bg-card p-4', r.bucket === 'NEW' && 'border-amber-300 bg-amber-50/40')}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-(length:--fs-12) text-muted-foreground">
                    <span className="font-medium text-foreground/80">{r.ref}</span>
                    {r.requestedAt && <span>· {new Date(r.requestedAt).toLocaleString('el-GR', { timeZone: 'Europe/Athens', dateStyle: 'short', timeStyle: 'short' })}</span>}
                    {r.bucket === 'NEW' && <span className="rounded bg-amber-600 px-1.5 py-0.5 text-(length:--fs-11) font-semibold text-white">Νέο</span>}
                    {r.status === 'CANCELLED' ? <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-(length:--fs-11) font-semibold text-rose-800 ring-1 ring-rose-200"><FiX className="size-3" aria-hidden /> Ακυρώθηκε</span> : null}
                  </p>
                  <Link href={`/admin/projects/contracts/${r.id}`} className="mt-0.5 block text-(length:--fs-15) font-semibold leading-snug hover:underline">{r.title}</Link>
                  <p className="text-(length:--fs-13) text-muted-foreground">{r.customer} · {r.city ?? <span className="font-medium text-amber-800">χωρίς τοποθεσία</span>}{r.email ? ` · ${r.email}` : ''}{r.onBehalfBy && <span className="ml-1.5 rounded bg-violet-50 px-1.5 text-(length:--fs-11) font-medium text-violet-800 ring-1 ring-violet-200">από {r.onBehalfBy} εκ μέρους του πελάτη</span>}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-(length:--fs-11) text-muted-foreground">Προσφορά{r.revision > 1 ? ` · έκδ. ${r.revision}` : ''}</p>
                  <p className="text-(length:--fs-14) font-semibold tabular-nums">{r.gross != null ? eur(r.gross) : <span className="font-normal text-muted-foreground">χωρίς γραμμές</span>}</p>
                </div>
                <RowMenu id={r.id} prjc={r.prjc} questions={r.openQuestions} />
              </div>
              <div className="mt-4"><Flow r={r} /></div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-(length:--fs-12)">
                <span className={cn('inline-flex items-center gap-1 font-medium', r.bucket === 'CLOSED' ? 'text-muted-foreground' : 'text-amber-800')}>
                  <FiAlertCircle className="size-3.5" aria-hidden /> {r.next}
                </span>
                {r.openQuestions > 0 && <span className="inline-flex items-center gap-1 text-foreground"><FiHelpCircle className="size-3.5" aria-hidden /> {r.openQuestions} {r.openQuestions === 1 ? 'ανοιχτή ερώτηση' : 'ανοιχτές ερωτήσεις'}</span>}
                {r.photos > 0 && <span className="inline-flex items-center gap-1 text-muted-foreground"><FiImage className="size-3.5" aria-hidden /> {r.photos} φωτογραφίες</span>}
                {r.aiVerdict && <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground"><FiCpu className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">Βοηθός: {r.aiVerdict}</span></span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
