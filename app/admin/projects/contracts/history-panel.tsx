'use client';

// Ιστορικό επικοινωνίας (προσφορά ή έργο): μηνύματα με τον πελάτη και συμβάντα σε χρονολογική σειρά,
// με φίλτρο (όλα / πελάτης / συμβάντα) και εξαγωγή CSV. Δεν σβήνεται τίποτα από εδώ.
import * as React from 'react';
import Link from 'next/link';
import { FiClock, FiDownload, FiMessageCircle, FiFlag } from 'react-icons/fi';
import { historyCsv, type HistoryEntry } from '@/lib/contracts/history-core';
import { cn } from '@/lib/utils';

const when = (iso: string) => new Date(iso).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const FILTERS = [['all', 'Όλα'], ['customer', 'Πελάτης'], ['events', 'Συμβάντα']] as const;

export function HistoryPanel({ entries, title = 'Ιστορικό επικοινωνίας', fileName, showRef = false, initial = 5 }: {
  entries: HistoryEntry[]; title?: string; fileName: string; showRef?: boolean; initial?: number;
}) {
  const [f, setF] = React.useState<(typeof FILTERS)[number][0]>('all');
  const [more, setMore] = React.useState(false);
  const list = entries.filter((e) => (f === 'all' ? true : f === 'events' ? e.source === 'EVENT' : e.fromCustomer || (e.source === 'NOTE' && e.title === 'Απάντηση')));
  const shown = more ? list : list.slice(0, initial);
  const open = entries.filter((e) => e.open).length;
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([historyCsv(list)], { type: 'text/csv;charset=utf-8' }));
    a.download = `${fileName.replace(/[^\p{L}\p{N}-]+/gu, '_')}-ιστορικό.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <section aria-labelledby="hist-h" className="rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="hist-h" className="flex items-center gap-2 text-(length:--fs-14) font-semibold"><FiClock className="size-4 text-muted-foreground" aria-hidden />{title}</h2>
          <p className="mt-0.5 text-(length:--fs-12) text-muted-foreground">{entries.length} καταγραφές{open ? ` · ${open} ανοιχτά αιτήματα πελάτη` : ''} · δεν σβήνονται</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Φίλτρο ιστορικού" className="inline-flex rounded-lg bg-muted p-0.5">
            {FILTERS.map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={f === v} onClick={() => setF(v)}
                className={cn('min-h-8 cursor-pointer rounded-md px-2.5 text-(length:--fs-12) font-medium', f === v ? 'bg-background shadow-xs' : 'text-muted-foreground hover:text-foreground')}>{l}</button>
            ))}
          </div>
          <button type="button" onClick={download} disabled={!list.length} className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-(length:--fs-12) font-medium hover:bg-muted disabled:opacity-50">
            <FiDownload className="size-3.5" aria-hidden />CSV
          </button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 text-(length:--fs-13) text-muted-foreground">Τίποτα ακόμη.</p>
      ) : (
        <ol className="mt-3 space-y-2 border-l border-border pl-4">
          {shown.map((e) => {
            const Icon = e.source === 'EVENT' ? FiFlag : FiMessageCircle;
            return (
              <li key={`${e.source}-${e.id}`} className="relative">
                <span aria-hidden className={cn('absolute -left-[25px] top-0.5 inline-flex size-[17px] items-center justify-center rounded-full ring-2 ring-card',
                  e.source === 'EVENT' ? 'bg-slate-700 text-white' : e.fromCustomer ? 'bg-amber-500 text-white' : 'bg-sky-600 text-white')}>
                  <Icon className="size-2.5" />
                </span>
                <p className="flex flex-wrap items-center gap-x-1.5 text-(length:--fs-11) text-muted-foreground">
                  <span className="font-semibold text-foreground">{e.title}</span>
                  {e.open && <span className="rounded bg-amber-100 px-1.5 font-medium text-amber-900">ανοιχτό</span>}
                  <span>· {e.who}</span>
                  <time dateTime={e.at} className="tabular-nums">· {when(e.at)}</time>
                  {showRef && e.contractRef && <Link href={`/admin/projects/contracts/${e.contractId}`} className="font-medium text-primary hover:underline">· {e.contractRef}</Link>}
                  {e.revision != null && <span>· έκδ. {e.revision}</span>}
                  {e.target && <span>· {e.target}</span>}
                </p>
                <p className="line-clamp-2 whitespace-pre-wrap text-(length:--fs-12)" title={e.body}>{e.body}</p>
              </li>
            );
          })}
        </ol>
      )}
      {list.length > initial && (
        <button type="button" onClick={() => setMore((m) => !m)} className="mt-1.5 min-h-7 cursor-pointer text-(length:--fs-12) font-medium text-primary hover:underline">
          {more ? 'Λιγότερα' : `Όλα (${list.length})`}
        </button>
      )}
    </section>
  );
}
