'use client';

// «Προϋπολογισμός έργου»: το BOM της σύμβασης περνά στον προϋπολογισμό του έργου με την ενεργοποίηση·
// εδώ φαίνεται πόσες γραμμές πέρασαν και ξαναγίνεται η μεταφορά αν άλλαξαν οι γραμμές.
import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { FiLoader, FiRefreshCw, FiTrendingUp } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { syncBudgetAction } from '../actions';

export function BudgetPanel({ contractId, prjc, state, canManage }: {
  contractId: string; prjc: number; state: { lines: number; at: string | null }; canManage: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    setBusy(true);
    const r = await syncBudgetAction(contractId).catch(() => null);
    setBusy(false);
    if (!r?.ok) { toast.error(r && 'error' in r ? String(r.error) : 'Η μεταφορά δεν έγινε'); return; }
    const { created, skipped } = r.data;
    toast.success(`Ο προϋπολογισμός του έργου ενημερώθηκε · ${created} γραμμές`, skipped.length ? { description: `${skipped.length} γραμμές χωρίς είδος μητρώου δεν πέρασαν: ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}` } : undefined);
  };
  return (
    <section aria-labelledby="budget-h" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="budget-h" className="flex items-center gap-2 text-(length:--fs-14) font-semibold"><FiTrendingUp className="size-4 text-muted-foreground" aria-hidden /> Προϋπολογισμός έργου (BOM)</h2>
          <p className="mt-1 text-(length:--fs-12) text-muted-foreground">
            {state.lines
              ? <>Στο έργο υπάρχουν <b className="text-foreground">{state.lines}</b> γραμμές από αυτή τη σύμβαση{state.at ? ` · ${new Date(state.at).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}. Η ενημέρωση αντικαθιστά μόνο αυτές· οι χειροκίνητες γραμμές του έργου μένουν.</>
              : 'Τα υλικά και οι εργασίες της σύμβασης δεν έχουν περάσει ακόμη στον προϋπολογισμό του έργου.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="ghost"><Link href={`/admin/projects/${prjc}`}>Στο έργο →</Link></Button>
          {canManage && (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={run} className="gap-1.5">
              {busy ? <FiLoader className="size-3.5 animate-spin" aria-hidden /> : <FiRefreshCw className="size-3.5" aria-hidden />}
              {state.lines ? 'Ενημέρωση από τη σύμβαση' : 'Μεταφορά στο έργο'}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
