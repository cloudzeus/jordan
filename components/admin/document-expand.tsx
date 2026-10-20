'use client';

import * as React from 'react';
import Link from 'next/link';
import { FiChevronRight, FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import type { DocDetail } from '@/lib/document-detail';

const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const qtyFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 3 });
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : '—');
const TH = 'px-1.5 py-1 text-left text-(length:--fs-10) font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap';
const TD = 'px-1.5 py-1 text-(length:--fs-12) align-top';
const NUM = 'text-right tabular-nums whitespace-nowrap';

// Μνήμη ανά παραστατικό για τη σελίδα: δεύτερο άνοιγμα χωρίς νέα κλήση στο SoftOne.
const cache = new Map<number, DocDetail>();

/** Κεφαλή + γραμμές ενός παραστατικού (ζωντανά από το SoftOne). */
export function DocumentDetailPanel({ findoc }: { findoc: number }) {
  const [doc, setDoc] = React.useState<DocDetail | null>(cache.get(findoc) ?? null);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/admin/documents/${findoc}`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.doc) { setError(d.message ?? 'Το παραστατικό δεν διαβάστηκε από το SoftOne.'); return; }
      cache.set(findoc, d.doc);
      setDoc(d.doc);
    } catch {
      setError('Σφάλμα δικτύου.');
    }
  }, [findoc]);
  React.useEffect(() => { if (!cache.has(findoc)) void load(); }, [findoc, load]);

  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-(length:--fs-12) text-destructive">
        <FiAlertTriangle className="size-3.5" aria-hidden /> {error}
        <button type="button" onClick={() => void load()} className="inline-flex cursor-pointer items-center gap-1 underline"><FiRefreshCw className="size-3" aria-hidden /> Ξανά</button>
      </div>
    );
  }
  if (!doc) return <div className="h-16 animate-pulse rounded bg-muted motion-reduce:animate-none" aria-busy="true" aria-label="Φόρτωση γραμμών από το SoftOne" />;

  const meta: [string, React.ReactNode][] = [
    ['Σειρά', doc.seriesName ?? doc.series],
    ['Ημ/νία', fmtDate(doc.date)],
    ['Συναλλασσόμενος', doc.trader ? <>{doc.trader.name}{doc.trader.code && <span className="ml-1 font-mono text-(length:--fs-11) text-muted-foreground">{doc.trader.code}</span>}</> : '—'],
    ['Έργο', doc.project ? <Link href={`/admin/projects/${doc.project.prjc}`} className="text-primary hover:underline">{doc.project.code} · {doc.project.name}</Link> : '—'],
  ];
  if (doc.mark) meta.push(['ΜΑΡΚ', <span key="m" className="font-mono">{doc.mark}</span>]);
  if (doc.sources.length) meta.push(['Από', doc.sources.map((s) => s.fincode).join(', ')]);
  if (doc.comments) meta.push(['Σχόλια', doc.comments]);

  return (
    <div className="space-y-2">
      <dl className="flex flex-wrap gap-x-5 gap-y-1.5">
        {meta.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-(length:--fs-10) font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="text-(length:--fs-12) text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      {doc.lines.length === 0 ? (
        <p className="text-(length:--fs-12) text-muted-foreground">Το παραστατικό δεν έχει γραμμές ειδών (π.χ. έμβασμα ή παραστατικό χωρίς είδη).</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <table className="w-full border-collapse">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th scope="col" className={cn(TH, 'w-8')}>#</th>
                <th scope="col" className={TH}>Είδος</th>
                <th scope="col" className={cn(TH, 'text-right')}>Ποσότητα</th>
                <th scope="col" className={cn(TH, 'hidden text-right sm:table-cell')}>Τιμή</th>
                <th scope="col" className={cn(TH, 'hidden text-right md:table-cell')}>Έκπτ.</th>
                <th scope="col" className={cn(TH, 'text-right')}>Αξία</th>
                <th scope="col" className={cn(TH, 'hidden text-right sm:table-cell')}>ΦΠΑ</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((l) => (
                <tr key={l.lineNo} className="border-t border-border/60">
                  <td className={cn(TD, 'tabular-nums text-muted-foreground')}>{l.lineNo}</td>
                  <td className={TD}>
                    <span className="text-foreground">{l.name}</span>
                    {l.code && <span className="ml-1.5 font-mono text-(length:--fs-11) text-muted-foreground">{l.code}</span>}
                    {l.isService && <span className="ml-1.5 rounded-sm bg-muted px-1 text-(length:--fs-10) text-muted-foreground">υπηρεσία</span>}
                    {l.comments && <span className="block text-(length:--fs-11) text-muted-foreground">{l.comments}</span>}
                    {doc.project && l.prjc && l.prjc !== doc.project.prjc && <span className="block text-(length:--fs-11) text-amber-700 dark:text-amber-300">άλλο έργο (#{l.prjc})</span>}
                  </td>
                  <td className={cn(TD, NUM)}>{qtyFmt.format(l.qty)}{l.unit && <span className="ml-1 text-(length:--fs-11) text-muted-foreground">{l.unit}</span>}</td>
                  <td className={cn(TD, NUM, 'hidden sm:table-cell')}>{eur.format(l.price)}</td>
                  <td className={cn(TD, NUM, 'hidden text-muted-foreground md:table-cell')}>{l.discPct ? `${l.discPct.toLocaleString('el-GR', { maximumFractionDigits: 2 })}%` : '—'}</td>
                  <td className={cn(TD, NUM, 'font-medium text-foreground')}>{eur.format(l.value)}</td>
                  <td className={cn(TD, NUM, 'hidden text-muted-foreground sm:table-cell')}>{l.vatPct != null ? `${l.vatPct}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/20">
              {doc.docDiscount !== 0 && (
                <tr>
                  <td colSpan={5} className={cn(TD, 'text-right text-muted-foreground')}>{doc.docDiscount > 0 ? 'Έκπτωση παραστατικού' : 'Επιβάρυνση παραστατικού'}</td>
                  <td className={cn(TD, NUM)}>{eur.format(-doc.docDiscount)}</td>
                  <td className="hidden sm:table-cell" />
                </tr>
              )}
              <tr>
                <td colSpan={5} className={cn(TD, 'text-right text-muted-foreground')}>Καθαρή · ΦΠΑ · <strong className="text-foreground">Σύνολο</strong></td>
                <td colSpan={2} className={cn(TD, 'text-right tabular-nums')}>
                  {eur.format(doc.net)} · {eur.format(doc.vat)} · <strong className="whitespace-nowrap text-foreground">{eur.format(doc.total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {doc.linesMismatch && (
        <p className="text-(length:--fs-11) text-muted-foreground">Οι γραμμές δεν αθροίζουν ακριβώς στο καθαρό του παραστατικού (υπάρχουν χρεώσεις χωρίς είδος ή στρογγυλοποιήσεις).</p>
      )}
      <p className="text-(length:--fs-11) text-muted-foreground">Καταχώριση {fmtDate(doc.createdAt)} · τελευταία αλλαγή {fmtDate(doc.updatedAt)} · από το SoftOne</p>
    </div>
  );
}

/**
 * Γραμμή πίνακα παραστατικού με «άνοιγμα»: πρώτο κελί το βελάκι, και από κάτω ολόκληρη η κεφαλή και οι
 * γραμμές του παραστατικού. `colSpan` = όλες οι στήλες του πίνακα (μαζί με τη στήλη του βέλους).
 */
export function ExpandableDocRow({ findoc, fincode, colSpan, className, style, children }: {
  findoc: number; fincode: string; colSpan: number; className?: string; style?: React.CSSProperties; children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = `doc-${findoc}-detail`;
  return (
    <>
      <tr className={cn(className, open && 'bg-(--cx-expanded-bg) shadow-[inset_3px_0_0_var(--cx-expanded-edge)]')} style={style}>
        <td className="w-7 px-0.5 py-1 align-top">
          <button
            type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId}
            aria-label={`${open ? 'Κλείσιμο' : 'Άνοιγμα'} στοιχείων του ${fincode}`}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FiChevronRight className={cn('size-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-90')} aria-hidden />
          </button>
        </td>
        {children}
      </tr>
      {open && (
        <tr id={panelId} className="border-t border-border/60 shadow-[inset_3px_0_0_var(--cx-expanded-edge)]">
          <td colSpan={colSpan} className="bg-(--cx-expanded-bg) px-2 py-2.5 sm:px-3">
            {/* w-0 + min-w-full: το panel παίρνει το πλάτος του κελιού χωρίς να φουσκώνει τον πίνακα —
                σε στενή οθόνη κυλά μόνο ο πίνακας γραμμών του, όχι όλη η καρτέλα. */}
            <div className="w-0 min-w-full">
              <DocumentDetailPanel findoc={findoc} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
