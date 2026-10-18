'use client';

// Κατηγορία συναλλασσομένου σε 3 συσχετιζόμενα combo boxes, από το γενικό στο ειδικό:
//   Λογ. κατηγορία (TRDCATEGORY) → Εμπορ. κατηγορία / κλάδος (TRDBUSINESS) → Ομάδα (TRDGROUP).
// Η ιεραρχία έρχεται από τη βάση (`/api/admin/trader-classes`)· η λογική από lib/trader-class-select.ts.
import * as React from 'react';
import { FiLayers, FiZap } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Field, FormSection, FormSelect, RowHint } from '@/components/admin/form-kit';
import {
  changeLevel, level1Options, level2Options, level3Options, selectionFromLeaf, selectionLabel, softoneValues,
  type ClassRow, type ClassSelection,
} from '@/lib/trader-class-select';

const BASIS_LABEL: Record<string, string> = {
  kad: 'από τον κύριο ΚΑΔ (ΑΑΔΕ)', purchases: 'από τα τιμολόγια αγοράς', legal_form: 'από τη νομική μορφή (ΑΑΔΕ)',
  foreign: 'πελάτης εξωτερικού', no_afm: 'χωρίς ΑΦΜ', invalid_afm: 'μη έγκυρο ΑΦΜ', aade_not_found: 'το ΑΦΜ δεν βρέθηκε στην ΑΑΔΕ',
  no_activity: 'χωρίς δραστηριότητα στην ΑΑΔΕ', former_business: 'πρώην επιτηδευματίας', kad_unmatched: 'ΚΑΔ εκτός κανόνων',
  unverified: 'δεν εξακριβώθηκε', manual: 'χειροκίνητα',
};

export interface ClassProposal {
  leafId: number | null; basis: string; rule?: string | null; needsReview?: boolean; primaryKad?: string | null; primaryKadDescr?: string | null;
  /** Λογ. κατηγορία που προκύπτει ανεξάρτητα από το φύλλο (π.χ. ξένος → ΕΕ). */
  l1Id?: number | null;
}

/** Η ιεραρχία μιας πλευράς (12 προμηθευτές · 13 πελάτες). */
export function useTraderClassRows(sodtype: number | null | undefined): { rows: ClassRow[]; loading: boolean } {
  const [rows, setRows] = React.useState<ClassRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (sodtype !== 12 && sodtype !== 13) { setRows([]); return; }
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/trader-classes?sodtype=${sodtype}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setRows(d?.rows ?? []); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sodtype]);
  return { rows, loading };
}

export function TraderClassPicker({ rows, loading, value, onChange, disabled, proposal, idPrefix = 'tc' }: {
  rows: ClassRow[]; loading?: boolean; value: ClassSelection; onChange: (v: ClassSelection) => void;
  disabled?: boolean; proposal?: ClassProposal | null; idPrefix?: string;
}) {
  const opt = (list: ClassRow[]) => list.map((r) => ({ id: String(r.id), name: r.name }));
  const pick = (level: 1 | 2 | 3) => (v: string) => onChange(changeLevel(rows, value, level, v ? Number(v) : null));
  const proposed = proposal?.leafId != null ? selectionFromLeaf(rows, proposal.leafId, proposal.l1Id ?? value.l1) : null;
  const proposedDiffers = !!proposed && proposed.l3 !== value.l3;
  const { pending } = softoneValues(rows, value);

  return (
    <FormSection tone="amber" icon={<FiLayers />} title="Κατηγοριοποίηση"
      aside={value.l3 ? <span className="truncate">{selectionLabel(rows, value)}</span> : <span>χωρίς κατηγορία</span>}>
      {loading && <RowHint>Φόρτωση κατηγοριών…</RowHint>}
      {!loading && rows.length === 0 && <RowHint tone="warn">Δεν έχουν οριστεί κατηγορίες για αυτόν τον τύπο συναλλασσομένου.</RowHint>}
      {rows.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Field label="Λογ. κατηγορία" htmlFor={`${idPrefix}-l1`}>
            <FormSelect id={`${idPrefix}-l1`} value={value.l1 != null ? String(value.l1) : ''} onChange={pick(1)} disabled={disabled}
              ariaLabel="Λογιστική κατηγορία" opts={opt(level1Options(rows))} placeholder="— Λογ. κατηγορία —" />
          </Field>
          <Field label="Κλάδος (εμπορ. κατηγορία)" htmlFor={`${idPrefix}-l2`}>
            <FormSelect id={`${idPrefix}-l2`} value={value.l2 != null ? String(value.l2) : ''} onChange={pick(2)} disabled={disabled || value.l1 == null}
              ariaLabel="Κλάδος" opts={opt(level2Options(rows, value.l1))} placeholder={value.l1 == null ? 'Πρώτα λογ. κατηγορία' : '— Κλάδος —'} />
          </Field>
          <Field label="Ομάδα" htmlFor={`${idPrefix}-l3`}>
            <FormSelect id={`${idPrefix}-l3`} value={value.l3 != null ? String(value.l3) : ''} onChange={pick(3)} disabled={disabled || value.l2 == null}
              ariaLabel="Ομάδα" opts={opt(level3Options(rows, value.l2))} placeholder={value.l2 == null ? 'Πρώτα κλάδος' : '— Ομάδα —'} />
          </Field>
        </div>
      )}
      {proposal && proposed && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-[length:var(--fs-12)]">
          <FiZap aria-hidden className="size-3.5 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">
            Πρόταση: <strong className="font-medium">{selectionLabel(rows, proposed)}</strong>
            <span className="text-muted-foreground"> — {BASIS_LABEL[proposal.basis] ?? proposal.basis}
              {proposal.primaryKad ? ` · ΚΑΔ ${proposal.primaryKad}${proposal.primaryKadDescr ? ` ${proposal.primaryKadDescr.toLocaleLowerCase('el')}` : ''}` : ''}
              {proposal.needsReview ? ' · θέλει έλεγχο' : ''}</span>
          </span>
          {proposedDiffers && !disabled && (
            <Button type="button" size="sm" variant="outline" onClick={() => onChange(proposed)}>Εφαρμογή πρότασης</Button>
          )}
        </div>
      )}
      {pending.length > 0 && (
        <RowHint tone="warn">
          {pending.map((p) => `«${p.name}»`).join(', ')} δεν έχει δημιουργηθεί ακόμα στο SoftOne: η επιλογή κρατιέται στην εφαρμογή
          και θα περάσει στην καρτέλα μόλις δημιουργηθούν οι κατηγορίες.
        </RowHint>
      )}
    </FormSection>
  );
}
