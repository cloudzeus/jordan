'use client';

// Απόθεμα στη φόρμα προσφοράς: ένα αίτημα για όλα τα είδη (καθρέφτης SoftOne), ένδειξη ανά γραμμή
// και λίστα «προς παραγγελία». Η ένδειξη έχει πάντα εικονίδιο + κείμενο (όχι μόνο χρώμα).
import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { FiAlertTriangle, FiCheckCircle, FiCopy, FiHelpCircle, FiPackage, FiXCircle } from 'react-icons/fi';
import { stockNeeds, type NeedLine, type StockInfo, type StockNeed } from '@/lib/contracts/stock-core';
import { stockAction } from '../actions';

const q = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });
const LIMIT = 6;
/** Σύντομες μονάδες για τη λίστα (οι ονομασίες του SoftOne είναι μακριές). */
const UNIT: Record<string, string> = { 'τετραγωνικά μέτρα': 'm²', 'τετραγωνικό μέτρο': 'm²', 'κιλά': 'kg', 'κιλό': 'kg', 'τεμάχια': 'τεμ.', 'τεμάχιο': 'τεμ.', 'μέτρα': 'm', 'μέτρο': 'm', 'λίτρα': 'lt', 'λίτρο': 'lt', 'κιβώτια': 'κιβ.', 'σακιά': 'σακ.' };
const unit = (u: string | null | undefined) => (u ? UNIT[u.trim().toLowerCase()] ?? u : '');

/** Απόθεμα για τα είδη των γραμμών· ξαναζητείται μόνο όταν αλλάξει το σύνολο των ειδών. */
export function useStock(lines: NeedLine[]): { needs: StockNeed[]; byMtrl: Map<number, StockNeed>; stock: Record<number, StockInfo>; loading: boolean } {
  const key = [...new Set(lines.filter((l) => l.kind === 'MATERIAL' && l.mtrl != null).map((l) => l.mtrl as number))].sort((a, b) => a - b).join(',');
  const [stock, setStock] = React.useState<Record<number, StockInfo>>({});
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (!key) return;
    let ignore = false;
    const t = setTimeout(() => {
      setLoading(true);
      stockAction(key.split(',').map(Number))
        .then((s) => { if (!ignore) setStock((cur) => ({ ...cur, ...s })); })
        .catch(() => null)
        .finally(() => { if (!ignore) setLoading(false); });
    }, 250);
    return () => { ignore = true; clearTimeout(t); };
  }, [key]);
  const needs = React.useMemo(() => stockNeeds(lines, stock), [lines, stock]);
  const byMtrl = React.useMemo(() => new Map(needs.map((n) => [n.mtrl, n])), [needs]);
  return { needs, byMtrl, stock, loading };
}

const TONE = {
  ok: { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icon: FiCheckCircle },
  short: { cls: 'bg-amber-50 text-amber-900 ring-amber-200', icon: FiAlertTriangle },
  none: { cls: 'bg-rose-50 text-rose-800 ring-rose-200', icon: FiXCircle },
  unknown: { cls: 'bg-muted text-muted-foreground ring-border', icon: FiHelpCircle },
} as const;

export function stockLabel(n: StockNeed): { short: string; long: string } {
  const su = n.stockUnit ?? n.unit ?? '';
  if (n.status === 'ok') return { short: `Επαρκεί · ${q(n.have)} ${su}`, long: `Χρειάζονται ${q(n.need)} ${n.unit ?? ''} · απόθεμα ${q(n.have)} ${su}` };
  if (n.status === 'short') return { short: `Λείπουν ${q(n.short)} ${n.unit ?? ''}`, long: `Χρειάζονται ${q(n.need)} ${n.unit ?? ''} · απόθεμα μόνο ${q(n.have)} ${su}` };
  if (n.status === 'none') return { short: `Χωρίς απόθεμα · παραγγελία ${q(n.short)} ${n.unit ?? ''}`, long: `Χρειάζονται ${q(n.need)} ${n.unit ?? ''} · απόθεμα 0` };
  return { short: n.stockUnit ? `Απόθεμα ${q(n.have)} ${n.stockUnit}` : 'Απόθεμα: —', long: n.stockUnit ? `Η γραμμή είναι σε ${n.unit ?? '—'}, η αποθήκη σε ${n.stockUnit} — ελέγξτε χειροκίνητα` : 'Δεν βρέθηκε απόθεμα για το είδος' };
}

/** Μικρή ένδειξη αποθέματος δίπλα σε γραμμή υλικού. */
export function StockBadge({ need }: { need: StockNeed | undefined }) {
  if (!need) return null;
  const t = TONE[need.status];
  const Icon = t.icon;
  const l = stockLabel(need);
  return (
    <span title={l.long} className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-(length:--fs-11) font-medium ring-1 ring-inset ${t.cls}`}>
      <Icon className="size-3 shrink-0" aria-hidden /><span className="truncate">{l.short}</span>
    </span>
  );
}

/** Κάρτα «Απόθεμα & παραγγελία»: τι επαρκεί και τι πρέπει να παραγγελθεί (με αντιγραφή λίστας). */
export function StockCard({ needs, loading }: { needs: StockNeed[]; loading: boolean }) {
  const toOrder = needs.filter((n) => n.status === 'short' || n.status === 'none');
  const unknown = needs.filter((n) => n.status === 'unknown').length;
  const ok = needs.filter((n) => n.status === 'ok').length;
  const [all, setAll] = React.useState(false);
  const copy = () => {
    const text = toOrder.map((n) => `${n.code ? `${n.code} · ` : ''}${n.name} — ${q(n.short)} ${n.unit ?? ''}`).join('\n');
    navigator.clipboard.writeText(text).then(() => toast.success('Η λίστα παραγγελίας αντιγράφηκε'), () => toast.error('Δεν επετράπη η αντιγραφή'));
  };
  return (
    <section aria-labelledby="stock-h" className="rounded-xl border border-border bg-card p-3 shadow-xs">
      <h2 id="stock-h" className="flex items-center gap-2 text-(length:--fs-13) font-semibold"><FiPackage className="size-4 text-muted-foreground" aria-hidden /> Απόθεμα & παραγγελία</h2>
      {!needs.length ? (
        <p className="mt-1.5 text-(length:--fs-12) text-muted-foreground">Θα δείτε εδώ αν επαρκεί το απόθεμα μόλις προσθέσετε υλικά από το μητρώο.</p>
      ) : (
        <>
          <p className="mt-1.5 text-(length:--fs-12) text-muted-foreground" aria-live="polite">
            {loading ? 'Έλεγχος αποθέματος…' : toOrder.length
              ? <><b className="text-foreground">{toOrder.length}</b> είδ{toOrder.length === 1 ? 'ος' : 'η'} θέλ{toOrder.length === 1 ? 'ει' : 'ουν'} παραγγελία{ok ? ` · ${ok} επαρκ${ok === 1 ? 'εί' : 'ούν'}` : ''}{unknown ? ` · ${unknown} για έλεγχο` : ''}</>
              : <>Όλα τα υλικά επαρκούν{unknown ? ` · ${unknown} για έλεγχο` : ''}.</>}
          </p>
          {toOrder.length > 0 && (
            // Πυκνός πίνακας: μία γραμμή ανά είδος· σύντομες μονάδες· τα πρώτα 6, τα υπόλοιπα με «όλα».
            <table className="mt-2 w-full table-fixed text-(length:--fs-12)">
              <thead>
                <tr className="border-b border-border text-left text-(length:--fs-11) text-muted-foreground">
                  <th scope="col" className="py-1 pr-2 font-medium">Είδος</th>
                  <th scope="col" className="w-16 py-1 pr-2 text-right font-medium">Απόθ.</th>
                  <th scope="col" className="w-24 py-1 text-right font-medium">Παραγγελία</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(all ? toOrder : toOrder.slice(0, LIMIT)).map((n) => (
                  <tr key={n.mtrl}>
                    <td className="truncate py-1 pr-2" title={n.name}>
                      <span aria-hidden className={`mr-1.5 inline-block size-1.5 rounded-full align-middle ${n.status === 'none' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                      {n.name}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground" title={`Απόθεμα ${q(n.have)} ${n.stockUnit ?? ''}`}>{q(n.have)}</td>
                    <td className="py-1 text-right font-semibold tabular-nums text-amber-900">+{q(n.short)} <span className="font-normal text-muted-foreground">{unit(n.unit)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {toOrder.length > LIMIT && (
            <button type="button" onClick={() => setAll((x) => !x)} className="mt-1 min-h-7 cursor-pointer text-(length:--fs-11) font-medium text-muted-foreground hover:text-foreground">
              {all ? 'Λιγότερα' : `Όλα (${toOrder.length})`}
            </button>
          )}
          {toOrder.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3">
              <button type="button" onClick={copy} className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 text-(length:--fs-12) font-medium text-primary hover:underline"><FiCopy className="size-3.5" aria-hidden /> Αντιγραφή λίστας</button>
              <Link href="/admin/order-requests" className="inline-flex min-h-8 items-center text-(length:--fs-12) font-medium text-primary hover:underline">Αιτήματα παραγγελίας →</Link>
            </div>
          )}
          <p className="mt-1 text-(length:--fs-11) text-muted-foreground">Όλες οι αποθήκες · τελευταίος συγχρονισμός SoftOne.</p>
        </>
      )}
    </section>
  );
}
