'use client';

// Νέος / αλλαγή δυνητικού πελάτη — μόνο στην εφαρμογή. Στο SoftOne γράφεται όταν γίνει αποδεκτή μια
// προσφορά του (και τότε με επιβεβαίωση). Χρησιμοποιείται από τη φόρμα προσφοράς και τη λίστα.
import * as React from 'react';
import { toast } from 'sonner';
import { FiBriefcase, FiLoader, FiMapPin, FiUserPlus } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FormSection, RowHint, fieldCls } from '@/components/admin/form-kit';
import { prospectInput } from '@/lib/prospects-core';
import { saveProspectAction } from '@/app/admin/prospects/actions';

export type ProspectValue = {
  id: number; name: string; contactName: string | null; email: string | null; phone: string | null; afm: string | null; doy: string | null;
  profession: string | null; address: string | null; zip: string | null; city: string | null; notes: string | null; trdr: number | null;
};
type Form = Record<'name' | 'contactName' | 'email' | 'phone' | 'afm' | 'doy' | 'profession' | 'address' | 'zip' | 'city' | 'notes', string>;
const EMPTY: Form = { name: '', contactName: '', email: '', phone: '', afm: '', doy: '', profession: '', address: '', zip: '', city: '', notes: '' };
const toForm = (p: Partial<ProspectValue> | null): Form => Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (p?.[k as keyof Form] as string | null) ?? ''])) as Form;

export function ProspectDialog({ open, onOpenChange, initial, defaultName, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  /** Υπάρχων (αλλαγή) ή `null` (νέος). */
  initial?: ProspectValue | null;
  /** Νέος: προσυμπλήρωση επωνυμίας από ό,τι γράφτηκε στην αναζήτηση. */
  defaultName?: string;
  onSaved: (p: ProspectValue) => void;
}) {
  const [f, setF] = React.useState<Form>(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [prevOpen, setPrevOpen] = React.useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setF(initial ? toForm(initial) : { ...EMPTY, name: defaultName ?? '' }); setErr(null); }
  }
  const converted = !!initial?.trdr;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = prospectInput.safeParse(f);
    if (!v.success) { setErr(v.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία'); return; }
    setBusy(true);
    const r = await saveProspectAction(initial?.id ?? null, v.data);
    setBusy(false);
    if (!r.ok) { setErr(r.message); return; }
    toast.success(initial ? 'Αποθηκεύτηκε' : 'Ο δυνητικός πελάτης καταχωρίστηκε — μόνο στην εφαρμογή');
    onSaved(r.data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="w-[95vw] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <form onSubmit={submit} noValidate>
          <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-2.5 pr-12">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-800"><FiUserPlus className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-(length:--fs-15)">{initial ? 'Δυνητικός πελάτης' : 'Νέος δυνητικός πελάτης'}</DialogTitle>
              <DialogDescription className="text-(length:--fs-11)">
                {converted ? 'Έγινε πελάτης SoftOne — τα στοιχεία αλλάζουν πλέον εκεί· εδώ μόνο οι σημειώσεις.' : 'Μένει μόνο στην εφαρμογή. Στο SoftOne γράφεται ως πελάτης όταν αποδεχθεί μια προσφορά.'}
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 px-4 py-3">
            <fieldset disabled={converted || busy} className="space-y-3">
              <FormSection tone="amber" icon={<FiBriefcase />} title="Στοιχεία">
                <div className="grid grid-cols-12 gap-x-3 gap-y-2">
                  <Field label="Επωνυμία ή ονοματεπώνυμο" required htmlFor="pr-name" className="col-span-12 sm:col-span-7">
                    <Input id="pr-name" value={f.name} onChange={set('name')} className={fieldCls} autoFocus maxLength={128} />
                  </Field>
                  <Field label="Υπεύθυνος επικοινωνίας" htmlFor="pr-contact" className="col-span-12 sm:col-span-5">
                    <Input id="pr-contact" value={f.contactName} onChange={set('contactName')} className={fieldCls} maxLength={120} />
                  </Field>
                  <Field label="Email" htmlFor="pr-email" className="col-span-12 sm:col-span-7">
                    <Input id="pr-email" type="email" value={f.email} onChange={set('email')} className={fieldCls} autoComplete="email" />
                  </Field>
                  <Field label="Τηλέφωνο" htmlFor="pr-phone" className="col-span-12 sm:col-span-5">
                    <Input id="pr-phone" type="tel" value={f.phone} onChange={set('phone')} className={fieldCls} autoComplete="tel" />
                  </Field>
                  <Field label="ΑΦΜ" htmlFor="pr-afm" className="col-span-6 sm:col-span-3">
                    <Input id="pr-afm" inputMode="numeric" value={f.afm} onChange={set('afm')} className={`${fieldCls} tabular-nums`} maxLength={20} />
                  </Field>
                  <Field label="ΔΟΥ" htmlFor="pr-doy" className="col-span-6 sm:col-span-4">
                    <Input id="pr-doy" value={f.doy} onChange={set('doy')} className={fieldCls} maxLength={64} />
                  </Field>
                  <Field label="Επάγγελμα" htmlFor="pr-prof" className="col-span-12 sm:col-span-5">
                    <Input id="pr-prof" value={f.profession} onChange={set('profession')} className={fieldCls} maxLength={64} />
                  </Field>
                </div>
                <RowHint>Με ΑΦΜ ή email ελέγχεται στην αποδοχή αν υπάρχει ήδη πελάτης στο SoftOne — τότε συνδέεται, δεν γίνεται διπλότυπο.</RowHint>
              </FormSection>
              <FormSection tone="slate" icon={<FiMapPin />} title="Διεύθυνση τιμολόγησης">
                <div className="grid grid-cols-12 gap-x-3 gap-y-2">
                  <Field label="Οδός & αριθμός" htmlFor="pr-addr" className="col-span-12 sm:col-span-6">
                    <Input id="pr-addr" value={f.address} onChange={set('address')} className={fieldCls} maxLength={128} autoComplete="street-address" />
                  </Field>
                  <Field label="ΤΚ" htmlFor="pr-zip" className="col-span-4 sm:col-span-2">
                    <Input id="pr-zip" inputMode="numeric" value={f.zip} onChange={set('zip')} className={`${fieldCls} tabular-nums`} maxLength={10} autoComplete="postal-code" />
                  </Field>
                  <Field label="Πόλη" htmlFor="pr-city" className="col-span-8 sm:col-span-4">
                    <Input id="pr-city" value={f.city} onChange={set('city')} className={fieldCls} maxLength={64} autoComplete="address-level2" />
                  </Field>
                </div>
              </FormSection>
            </fieldset>
            <Field label="Σημειώσεις" htmlFor="pr-notes">
              <textarea id="pr-notes" value={f.notes} onChange={set('notes')} rows={2} maxLength={2000} disabled={busy}
                className="field-sizing-content min-h-14 w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-(length:--fs-13) shadow-2xs outline-hidden focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
            </Field>
            {err && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12) text-destructive">{err}</p>}
          </div>
          <DialogFooter className="m-0 rounded-none px-4 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>{busy && <FiLoader className="size-3.5 animate-spin" aria-hidden />}{initial ? 'Αποθήκευση' : 'Καταχώριση'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
