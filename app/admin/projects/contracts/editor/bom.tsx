'use client';

// BOM στη φόρμα προσφοράς: λίστα υλικών ανά είδος (ανάγκη · απόθεμα · παραγγελία) ή ανά χώρο της κάτοψης,
// με εξαγωγή CSV. Οι αριθμοί βγαίνουν από τις ίδιες γραμμές με την προσφορά — καμία δεύτερη πηγή.
import * as React from 'react';
import { toast } from 'sonner';
import { FiDownload, FiLayers } from 'react-icons/fi';
import { bomCsv, buildBom, type BomLine, type BomRoomRef } from '@/lib/contracts/bom-core';
import type { StockInfo } from '@/lib/contracts/stock-core';
import { stockLabel } from './stock';
import { FiAlertTriangle, FiCheckCircle, FiHelpCircle, FiXCircle } from 'react-icons/fi';
import { cn } from '@/lib/utils';

const q = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });
const TONE = {
  ok: { text: 'text-emerald-700', icon: FiCheckCircle },
  short: { text: 'text-amber-800', icon: FiAlertTriangle },
  none: { text: 'text-rose-700', icon: FiXCircle },
  unknown: { text: 'text-muted-foreground', icon: FiHelpCircle },
} as const;
const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });

export function BomSection({ lines, rooms, stock, loading, fileName }: {
  lines: BomLine[]; rooms: BomRoomRef[]; stock: Record<number, StockInfo>; loading: boolean; fileName: string;
}) {
  const [view, setView] = React.useState<'items' | 'rooms'>('items');
  const bom = React.useMemo(() => buildBom(lines, rooms, stock), [lines, rooms, stock]);
  const usedRooms = rooms.filter((r) => bom.items.some((i) => i.perRoom[r.id]));

  const download = () => {
    const blob = new Blob([bomCsv(bom, rooms)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName.replace(/[^\p{L}\p{N}-]+/gu, '_')}-BOM.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast.success('Το BOM κατέβηκε (CSV για Excel)');
  };

  if (!lines.some((l) => l.qty > 0)) {
    return <p className="text-(length:--fs-13) text-muted-foreground">Η λίστα υλικών φτιάχνεται αυτόματα από τα «Υλικά & εργασίες».</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Προβολή BOM" className="inline-flex rounded-lg bg-muted p-0.5">
          {([['items', 'Ανά είδος'], ['rooms', 'Ανά χώρο']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={cn('min-h-8 cursor-pointer rounded-md px-3 text-(length:--fs-12) font-medium', view === k ? 'bg-background shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-(length:--fs-12) text-muted-foreground" aria-live="polite">
          {loading ? 'Έλεγχος αποθέματος…' : <>{bom.items.length} είδη · <b className={bom.totals.toOrder ? 'text-amber-900' : 'text-foreground'}>{bom.totals.toOrder} προς παραγγελία</b>{bom.totals.unknown ? ` · ${bom.totals.unknown} για έλεγχο` : ''}</>}
        </p>
        <button type="button" onClick={download} className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-(length:--fs-12) font-medium hover:bg-muted">
          <FiDownload className="size-3.5" aria-hidden /> CSV
        </button>
      </div>

      {view === 'items' ? (
        bom.items.length === 0 ? <p className="text-(length:--fs-13) text-muted-foreground">Δεν υπάρχουν υλικά από το μητρώο ειδών.</p> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[440px] table-fixed text-(length:--fs-11-5) leading-snug">
              <colgroup><col /><col className="w-[92px]" /><col className="w-[132px]" /><col className="w-[84px]" /></colgroup>
              <thead className="border-b border-border bg-muted/40 text-(length:--fs-10) uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-2.5 py-1.5 text-left font-semibold">Είδος</th>
                  <th scope="col" className="px-2.5 py-1.5 text-right font-semibold">Ανάγκη</th>
                  <th scope="col" className="px-2.5 py-1.5 text-left font-semibold">Απόθεμα</th>
                  <th scope="col" className="px-2.5 py-1.5 text-right font-semibold">Αξία</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bom.items.map((i) => {
                  const t = TONE[i.status];
                  const Icon = t.icon;
                  const rooms = [...usedRooms.filter((r) => i.perRoom[r.id]).map((r) => `${r.name} ${q(i.perRoom[r.id])}`), ...(i.perRoom[''] ? [`Γενικά ${q(i.perRoom[''])}`] : [])];
                  return (
                    <tr key={i.mtrl} className="align-top">
                      <td className="px-2.5 py-1.5">
                        <span className="line-clamp-2 font-medium text-foreground" title={i.name}>{i.name}</span>
                        <span className="mt-0.5 block truncate text-(length:--fs-10) text-muted-foreground" title={rooms.join(' · ')}>
                          {i.code && <span className="font-mono">{i.code}</span>}
                          {i.code && rooms.length > 0 && usedRooms.length > 1 ? ' · ' : ''}
                          {usedRooms.length > 1 ? rooms.join(' · ') : ''}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold tabular-nums">{q(i.need)} <span className="font-normal text-muted-foreground">{i.unit ?? ''}</span></td>
                      <td className="px-2.5 py-1.5" title={stockLabel(i).long}>
                        <span className={cn('inline-flex items-center gap-1 font-medium', t.text)}>
                          <Icon className="size-3 shrink-0" aria-hidden />
                          <span className="tabular-nums">{i.status === 'ok' ? 'Επαρκεί' : i.status === 'unknown' ? 'Έλεγχος' : `+${q(i.short)} ${i.unit ?? ''}`}</span>
                        </span>
                        <span className="block text-(length:--fs-10) tabular-nums text-muted-foreground">{i.stockUnit ? `απόθ. ${q(i.have)} ${i.stockUnit}` : 'χωρίς απόθεμα'}</span>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{eur(i.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-border bg-muted/30 font-semibold">
                <tr>
                  <td className="px-2.5 py-1.5" colSpan={3}>Σύνολο υλικών</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{eur(bom.items.reduce((a, i) => a + i.value, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      ) : (
        <ul className="space-y-2">
          {bom.rooms.map((r) => (
            <li key={r.id || 'none'} className="rounded-lg border border-border">
              <p className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/30 px-2.5 py-1.5 text-(length:--fs-12) font-semibold">
                <span className="inline-flex items-center gap-1.5"><FiLayers className="size-3.5 text-muted-foreground" aria-hidden />{r.name}</span>
                <span className="text-(length:--fs-11) font-normal tabular-nums text-muted-foreground">υλικά {eur(r.materials)} · εργασίες {eur(r.services)}</span>
              </p>
              <ul className="divide-y divide-border">
                {r.lines.map((l, k) => (
                  <li key={k} className="grid grid-cols-[52px_1fr_auto] items-center gap-2 px-2.5 py-1 text-(length:--fs-11-5)">
                    <span className={cn('justify-self-start rounded px-1 py-px text-(length:--fs-10) font-semibold uppercase', l.kind === 'MATERIAL' ? 'bg-sky-50 text-sky-800' : 'bg-violet-50 text-violet-800')}>{l.kind === 'MATERIAL' ? 'Υλικό' : 'Εργασ.'}</span>
                    <span className="min-w-0 truncate" title={l.name}>{l.name}</span>
                    <span className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{q(l.qty)} {l.unit ?? ''}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {bom.unlinked.length > 0 && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-(length:--fs-12) text-muted-foreground">
          {bom.unlinked.length} υλικ{bom.unlinked.length === 1 ? 'ό' : 'ά'} χωρίς είδος μητρώου ({bom.unlinked.slice(0, 3).map((u) => u.name).join(', ')}{bom.unlinked.length > 3 ? '…' : ''}) — δεν ελέγχεται απόθεμα και δεν περνούν στον προϋπολογισμό του έργου.
        </p>
      )}
      <p className="text-(length:--fs-11) text-muted-foreground">Με την ενεργοποίηση της σύμβασης, η λίστα περνά στον προϋπολογισμό του έργου (με κόστος από την τελευταία αγορά).</p>
    </div>
  );
}
