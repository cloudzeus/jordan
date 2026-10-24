'use client';

// Ιστορικό επικοινωνίας (προσφορά ή έργο): μηνύματα με τον πελάτη και συμβάντα σε χρονολογική σειρά,
// με φίλτρο (όλα / πελάτης / συμβάντα) και εξαγωγή CSV. Δεν σβήνεται τίποτα από εδώ.
import * as React from 'react';
import Link from 'next/link';
import { FiAlertTriangle, FiCheck, FiChevronDown, FiClock, FiDownload, FiMessageCircle, FiFlag, FiPaperclip } from 'react-icons/fi';
import { historyCsv, type HistoryEntry, type HistoryMessage } from '@/lib/contracts/history-core';
import { cn } from '@/lib/utils';

const when = (iso: string) => new Date(iso).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const FILTERS = [['all', 'Όλα'], ['customer', 'Πελάτης'], ['events', 'Συμβάντα']] as const;

export function HistoryPanel({ entries, title = 'Ιστορικό επικοινωνίας', fileName, showRef = false, initial = 5, open: startOpen = false }: {
  entries: HistoryEntry[]; title?: string; fileName: string; showRef?: boolean; initial?: number;
  /** Ανοιχτό από την αρχή (π.χ. σε δική του καρτέλα). */
  open?: boolean;
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
    <section aria-labelledby="hist-h" className="rounded-xl border border-border bg-card shadow-xs">
      {/* Accordion: κλειστό — στην κεφαλίδα πλήθος, ανοιχτά αιτήματα και η τελευταία καταγραφή. */}
      <details className="group" open={startOpen}>
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
          <FiChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span id="hist-h" role="heading" aria-level={2} className="flex flex-wrap items-center gap-x-2 text-(length:--fs-14) font-semibold">
              <FiClock className="size-4 text-muted-foreground" aria-hidden />{title}
              <span className="text-(length:--fs-12) font-normal text-muted-foreground">· {entries.length} καταγραφές</span>
              {open > 0 && <span className="rounded bg-amber-100 px-1.5 text-(length:--fs-11) font-semibold text-amber-900">{open} ανοιχτ{open === 1 ? 'ό αίτημα' : 'ά αιτήματα'}</span>}
            </span>
            {entries[0] && (
              <span className="block truncate text-(length:--fs-12) text-muted-foreground group-open:hidden">
                Τελευταία: <span className="text-foreground">{entries[0].title}</span> · {entries[0].who} · {when(entries[0].at)}
              </span>
            )}
          </span>
        </summary>
        <div className="border-t border-border px-4 pb-3 pt-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-(length:--fs-12) text-muted-foreground">Δεν σβήνεται τίποτα από εδώ.</p>
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
                  {e.target && !e.message && <span>· {e.target}</span>}
                </p>
                {e.message ? <MessageCard m={e.message} />
                  : <p className="line-clamp-2 whitespace-pre-wrap text-(length:--fs-12)" title={e.body}>{e.body}</p>}
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
        </div>
      </details>
    </section>
  );
}

/** Απεσταλμένο μήνυμα: ίδια κάρτα με τις ενότητες της διαχείρισης — θέμα, μορφοποιημένο κείμενο (κλειστό σε λίγες
 *  γραμμές, «Όλο το μήνυμα» για τα υπόλοιπα) και μία γραμμή με παραλήπτη, κανάλια, κοινοποίηση, συνημμένα, κωδικό. */
function MessageCard({ m }: { m: HistoryMessage }) {
  const [full, setFull] = React.useState(false);
  const [long, setLong] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el) setLong(el.scrollHeight > el.clientHeight + 2);
  }, [m.html, m.text]);
  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-(length:--fs-13) font-semibold" title={m.subject}>{m.subject}</span>
        {m.code && <span className="font-mono text-(length:--fs-11) text-muted-foreground" title="Κωδικός αναφοράς — συνδέει τις απαντήσεις">#{m.code}</span>}
      </div>
      <div ref={bodyRef} className={cn('relative px-3 py-2', !full && 'max-h-24 overflow-hidden')}>
        {m.html
          ? <div className="rte-content text-(length:--fs-12) leading-relaxed" dangerouslySetInnerHTML={{ __html: m.html }} />
          : <p className="whitespace-pre-wrap text-(length:--fs-12) leading-relaxed">{m.text}</p>}
        {!full && long && <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-background to-transparent" />}
      </div>
      {(long || m.to || m.channels.length > 0 || m.cc.length > 0 || m.attachments > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-1.5 text-(length:--fs-11) text-muted-foreground">
          {m.to && <span>Προς <span className="font-medium text-foreground">{m.to}</span></span>}
          {m.channels.map((c) => (
            <span key={c.label} className={cn('inline-flex items-center gap-1', c.ok ? 'text-emerald-700' : 'text-amber-800')} title={c.note}>
              {c.ok ? <FiCheck className="size-3" aria-hidden /> : <FiAlertTriangle className="size-3" aria-hidden />}{c.label}{c.note ? ` · ${c.note}` : ''}
            </span>
          ))}
          {m.cc.length > 0 && <span className="min-w-0 truncate" title={m.cc.join(', ')}>Κοιν. {m.cc.join(', ')}</span>}
          {m.attachments > 0 && <span className="inline-flex items-center gap-1"><FiPaperclip className="size-3" aria-hidden />{m.attachments} συνημμέν{m.attachments === 1 ? 'ο' : 'α'}</span>}
          {long && (
            <button type="button" onClick={() => setFull((x) => !x)} className="ml-auto min-h-6 cursor-pointer font-medium text-primary hover:underline">
              {full ? 'Λιγότερα' : 'Όλο το μήνυμα'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
