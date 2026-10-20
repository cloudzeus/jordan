'use client';

// Εμπορική κατηγορία συναλλασσομένου (TRDBUSINESS) σε συσχετιζόμενα combo boxes, από το γενικό στο ειδικό:
//   Κατηγορία (π.χ. Οικοδομικών Υλικών) → Υποκατηγορία (π.χ. Πλακίδια & πέτρα).
// Ένα combo ανά επίπεδο κάτω από τη ρίζα, όσο ο επιλεγμένος κόμβος έχει παιδιά. Η ιεραρχία έρχεται από
// τη βάση (`/api/admin/trader-classes`)· η λογική από lib/trader-class-select.ts.
import * as React from 'react';
import { FiLayers, FiZap } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Field, FormSection, FormSelect, RowHint } from '@/components/admin/form-kit';
import {
  choose, leafOf, levelOptions, pathLabel, pathTo, samePath, softoneValue, type ClassPath, type ClassRow,
} from '@/lib/trader-class-select';

const BASIS_LABEL: Record<string, string> = {
  kad: 'από τον κύριο ΚΑΔ (ΑΑΔΕ)', purchases: 'από τα τιμολόγια αγοράς', legal_form: 'από τη νομική μορφή (ΑΑΔΕ)',
  foreign: 'πελάτης εξωτερικού', no_afm: 'χωρίς ΑΦΜ', invalid_afm: 'μη έγκυρο ΑΦΜ', aade_not_found: 'το ΑΦΜ δεν βρέθηκε στην ΑΑΔΕ',
  no_activity: 'χωρίς δραστηριότητα στην ΑΑΔΕ', former_business: 'πρώην επιτηδευματίας', kad_unmatched: 'ΚΑΔ εκτός κανόνων',
  unverified: 'δεν εξακριβώθηκε', manual: 'χειροκίνητα',
};
const LEVEL_LABEL = ['Κατηγορία', 'Υποκατηγορία', 'Ειδικότερα'];

export interface ClassProposal {
  leafId: number | null; basis: string; rule?: string | null; needsReview?: boolean;
  primaryKad?: string | null; primaryKadDescr?: string | null;
  /** Τεχνίτες/συνεργεία: ειδικότητα από τον ΚΑΔ (πρόταση για πίνακα χρήστη, δεν γράφεται). */
  specialty?: string | null;
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
  rows: ClassRow[]; loading?: boolean; value: ClassPath; onChange: (v: ClassPath) => void;
  disabled?: boolean; proposal?: ClassProposal | null; idPrefix?: string;
}) {
  const levels = levelOptions(rows, value);
  const proposed = proposal?.leafId != null ? pathTo(rows, proposal.leafId) : null;
  const proposedDiffers = !!proposed && proposed.length > 0 && !samePath(proposed, value);
  const { pending } = softoneValue(rows, value);
  const leaf = leafOf(rows, value);
  const incomplete = value.length > 0 && leaf == null;

  return (
    <FormSection tone="amber" icon={<FiLayers />} title="Εμπορική κατηγορία"
      aside={leaf ? <span className="truncate">{pathLabel(rows, value)}</span> : <span>χωρίς κατηγορία</span>}>
      {loading && <RowHint>Φόρτωση κατηγοριών…</RowHint>}
      {!loading && rows.length === 0 && <RowHint tone="warn">Δεν έχουν οριστεί κατηγορίες για αυτόν τον τύπο συναλλασσομένου.</RowHint>}
      {levels.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {levels.map((opts, depth) => (
            <Field key={depth} label={LEVEL_LABEL[depth] ?? `Επίπεδο ${depth + 1}`} htmlFor={`${idPrefix}-l${depth}`}>
              <FormSelect id={`${idPrefix}-l${depth}`} value={value[depth] != null ? String(value[depth]) : ''} disabled={disabled}
                onChange={(v) => onChange(choose(value, depth, v ? Number(v) : null))}
                ariaLabel={LEVEL_LABEL[depth] ?? `Επίπεδο ${depth + 1}`} opts={opts.map((r) => ({ id: String(r.id), name: r.name }))}
                placeholder={`— ${LEVEL_LABEL[depth] ?? 'Επιλογή'} —`} />
            </Field>
          ))}
        </div>
      )}
      {incomplete && <RowHint tone="warn">Διάλεξε και {LEVEL_LABEL[value.length]?.toLocaleLowerCase('el') ?? 'το επόμενο επίπεδο'} — στην καρτέλα μπαίνει μόνο η πιο ειδική κατηγορία.</RowHint>}
      {proposal && (proposed?.length || proposal.needsReview) ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-(length:--fs-12)">
          <FiZap aria-hidden className="size-3.5 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">
            {proposed?.length ? <>Πρόταση: <strong className="font-medium">{pathLabel(rows, proposed)}</strong></> : <>Χωρίς πρόταση</>}
            <span className="text-muted-foreground"> — {BASIS_LABEL[proposal.basis] ?? proposal.basis}
              {proposal.primaryKad ? ` · ΚΑΔ ${proposal.primaryKad}` : ''}
              {proposal.specialty ? ` · ειδικότητα: ${proposal.specialty}` : ''}
              {proposal.needsReview ? ' · θέλει έλεγχο' : ''}</span>
          </span>
          {proposedDiffers && !disabled && (
            <Button type="button" size="sm" variant="outline" onClick={() => onChange(proposed!)}>Εφαρμογή πρότασης</Button>
          )}
        </div>
      ) : null}
      {pending && (
        <RowHint>
          Η κατηγορία «{pending.name}» δεν έχει δημιουργηθεί ακόμα στο SoftOne: η επιλογή κρατιέται στην εφαρμογή
          και η καρτέλα του SoftOne δεν αλλάζει.
        </RowHint>
      )}
    </FormSection>
  );
}
