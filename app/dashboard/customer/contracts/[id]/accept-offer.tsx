'use client';

import * as React from 'react';
import { FiCheck, FiLoader } from 'react-icons/fi';
import { acceptOfferAction } from '../actions';

/**
 * Αποδοχή προσφοράς: δύο βήματα — «Αποδοχή προσφοράς» ανοίγει την επιβεβαίωση με το σύνολο και
 * ρητή συναίνεση στους όρους· μόνο τότε ενεργοποιείται το τελικό κουμπί. Ύφος website.
 */
export function AcceptOffer({ id, total, validUntil, disabledReason }: { id: string; total: string; validUntil: string | null; disabledReason?: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [agreed, setAgreed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  if (disabledReason) {
    return <p className="border-l-2 border-(--s-accent) bg-(--s-paper) px-5 py-4 text-(length:--fs-14) text-(--s-ink-2)">{disabledReason}</p>;
  }

  const submit = () => start(async () => {
    setError(null);
    const r = await acceptOfferAction(id, agreed);
    if (!r.ok) setError(r.message);
  });

  return (
    <div className="border border-(--s-ink) bg-white p-5">
      <p className="font-site text-(length:--fs-20) font-light leading-snug">Θέλετε να προχωρήσουμε;</p>
      <p className="mt-1 text-(length:--fs-14) text-(--s-ink-2)">Με την αποδοχή η προσφορά γίνεται σύμβαση και προγραμματίζουμε την εκτέλεση.{validUntil ? ` Ισχύει έως ${validUntil}.` : ''}</p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="p-btn p-btn-primary mt-4 w-full">
          <FiCheck className="size-4" aria-hidden />Αποδοχή προσφοράς
        </button>
      ) : (
        <div className="mt-4 space-y-4 border-t border-(--s-line) pt-4">
          <p className="flex items-baseline justify-between text-(length:--fs-14)"><span className="text-(--s-mute)">Σύνολο με ΦΠΑ</span><span className="font-num text-(length:--fs-24) tabular-nums">{total}</span></p>
          <label className="flex cursor-pointer items-start gap-3 text-(length:--fs-14) text-(--s-ink)">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#1C3241]" />
            <span>Αποδέχομαι την προσφορά, τις γραμμές, τις τιμές και το χρονοδιάγραμμα πληρωμών όπως εμφανίζονται εδώ και στο PDF.</span>
          </label>
          {error && <p role="alert" className="border-l-2 border-[#B42318] bg-[#B42318]/5 px-3 py-2 text-(length:--fs-13) text-[#B42318]">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => { setOpen(false); setAgreed(false); setError(null); }} disabled={pending} className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center border border-(--s-line) text-(length:--fs-14) text-(--s-ink-2) hover:border-(--s-ink) hover:text-(--s-ink)">Άκυρο</button>
            <button type="button" onClick={submit} disabled={!agreed || pending} className="p-btn p-btn-primary flex-2">
              {pending ? <FiLoader className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FiCheck className="size-4" aria-hidden />}
              {pending ? 'Αποδοχή…' : 'Επιβεβαίωση αποδοχής'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
