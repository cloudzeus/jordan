'use client';

// Η σελίδα απάντησης σε αίτημα προσφοράς — ίδια για τον μοναδικό σύνδεσμο (/rfp/[token]) και το portal
// (/dashboard/rfps/[id]). Ύφος website. Κάθε ενέργεια καταγράφεται στο server (IP, browser, session)
// ως αποδεικτικό· το άνοιγμα της σελίδας καταγράφεται με ένα POST μόλις φορτώσει.
import * as React from 'react';
import { FiCheck, FiDownload, FiLoader, FiShield, FiX } from 'react-icons/fi';
import { RFP_TERMS } from '@/lib/rfp/core';
import type { RfpPublicView } from '@/lib/rfp/service';

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const day = (s: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
const field = 'min-h-12 w-full border border-(--s-line) bg-white px-3 text-(length:--fs-15) text-(--s-ink) outline-none focus:border-(--s-ink)';

export function RfpResponse({ initial, apiBase, readOnly = false }: {
  initial: RfpPublicView;
  /** `/api/public/rfp/[token]` ή `/api/portal/rfp/[id]`. */
  apiBase: string;
  /** «Προβολή ως» του admin: μόνο ανάγνωση. */
  readOnly?: boolean;
}) {
  const [v, setV] = React.useState(initial);
  const [editing, setEditing] = React.useState(!initial.bid && !initial.declinedAt);
  const [amount, setAmount] = React.useState(initial.bid?.amount != null ? String(initial.bid.amount).replace('.', ',') : '');
  const [startDate, setStartDate] = React.useState(initial.bid?.startDate ?? '');
  const [duration, setDuration] = React.useState(initial.bid?.durationDays != null ? String(initial.bid.durationDays) : '');
  const [notes, setNotes] = React.useState(initial.bid?.notes ?? '');
  const [terms, setTerms] = React.useState(false);
  const [declining, setDeclining] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  // Καταγραφή «άνοιξε τη σελίδα» — μία φορά ανά φόρτωση (και στο StrictMode, που τρέχει το effect δύο φορές).
  const opened = React.useRef(false);
  React.useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void fetch(`${apiBase}/open`, { method: 'POST' }).catch(() => null);
  }, [apiBase]);

  const amountN = Number(amount.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  const post = (path: string, body: unknown) => start(async () => {
    setError(null);
    const r = await fetch(`${apiBase}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => null);
    if (!r.ok) { setError(d?.message ?? 'Κάτι πήγε στραβά — δοκιμάστε ξανά.'); return; }
    setV(d.view); setEditing(false); setDeclining(false); setTerms(false);
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(amountN > 0)) { setError('Δώστε το συνολικό ποσό (χωρίς ΦΠΑ).'); return; }
    if (!terms) { setError('Πρέπει να αποδεχτείτε τους όρους.'); return; }
    post('bid', { amount: amountN, startDate: startDate || null, durationDays: duration || null, notes: notes || null, termsAccepted: true });
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Αίτημα */}
      <section>
        <p className="text-(length:--fs-12) uppercase tracking-[0.2em] text-(--s-mute)">Αίτημα προσφοράς · {v.ref}</p>
        <h1 className="font-display mt-2 text-(length:--fs-36) leading-tight">{v.title}</h1>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-(--s-line) py-4 text-(length:--fs-14) sm:grid-cols-3">
          <div><dt className="text-(--s-mute)">Περιοχή</dt><dd className="mt-0.5 text-(--s-ink)">{v.area ?? '—'}</dd></div>
          <div><dt className="text-(--s-mute)">Είδος</dt><dd className="mt-0.5 text-(--s-ink)">{v.kindLabel}</dd></div>
          <div><dt className="text-(--s-mute)">Προθεσμία</dt><dd className="mt-0.5 text-(--s-ink)">{v.dueDate ? day(v.dueDate) : 'Το συντομότερο'}</dd></div>
        </dl>
        {v.scope && <div className="mt-6 whitespace-pre-line text-(length:--fs-15) leading-relaxed text-(--s-ink-2)">{v.scope}</div>}
        {v.hasSpecs && (
          <a href={`${apiBase}/specs`} target="_blank" rel="noopener" className="mt-6 inline-flex min-h-12 items-center gap-2 border border-(--s-ink) px-5 text-(length:--fs-15) font-medium text-(--s-ink) transition-colors hover:bg-(--s-ink) hover:text-white">
            <FiDownload className="size-4" aria-hidden />Specs του έργου (PDF) — εργασίες, ποσότητες, κάτοψη
          </a>
        )}
        <div className="mt-8">
          <p className="text-(length:--fs-13) font-medium uppercase tracking-[0.15em] text-(--s-mute)">Όροι</p>
          <ul className="mt-3 space-y-2 text-(length:--fs-14) text-(--s-ink-2)">
            {RFP_TERMS.map((t) => <li key={t} className="flex gap-2"><FiCheck className="mt-1 size-3.5 shrink-0 text-(--s-accent)" aria-hidden />{t}</li>)}
          </ul>
        </div>
      </section>

      {/* Απάντηση */}
      <section className="lg:pt-8">
        <div className="border border-(--s-ink) bg-white p-5 md:p-6">
          {v.bid && !editing && (
            <div>
              <p className="flex items-center gap-2 text-(length:--fs-14) font-medium text-[#047857]"><FiCheck className="size-4" aria-hidden />Η προσφορά σας καταχωρίστηκε</p>
              <p className="font-num mt-3 text-(length:--fs-36) tabular-nums">{eur(v.bid.amount ?? 0)}</p>
              <p className="text-(length:--fs-13) text-(--s-mute)">χωρίς ΦΠΑ · {new Date(v.bid.submittedAt).toLocaleString('el-GR')}</p>
              <dl className="mt-4 space-y-1 text-(length:--fs-14)">
                <div className="flex justify-between gap-4"><dt className="text-(--s-mute)">Έναρξη</dt><dd>{day(v.bid.startDate)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-(--s-mute)">Διάρκεια</dt><dd>{v.bid.durationDays ? `${v.bid.durationDays} ημέρες` : '—'}</dd></div>
              </dl>
              {v.bid.notes && <p className="mt-3 whitespace-pre-line border-l-2 border-(--s-line) pl-3 text-(length:--fs-14) text-(--s-ink-2)">{v.bid.notes}</p>}
            </div>
          )}
          {v.declinedAt && !editing && <p className="flex items-center gap-2 text-(length:--fs-15) text-(--s-ink-2)"><FiX className="size-4" aria-hidden />Δηλώσατε ότι δεν θα δώσετε προσφορά ({new Date(v.declinedAt).toLocaleDateString('el-GR')}).</p>}
          {v.status === 'AWARDED' && <p className="mt-4 border-l-2 border-[#047857] bg-[#ECFDF5] px-4 py-3 text-(length:--fs-14) text-[#065F46]">Η προσφορά σας επιλέχθηκε. Θα επικοινωνήσουμε μαζί σας για τη σύμβαση ανάθεσης.</p>}

          {!v.canRespond && v.closedReason && v.status !== 'AWARDED' && <p className="mt-4 border-l-2 border-(--s-accent) bg-(--s-paper) px-4 py-3 text-(length:--fs-14) text-(--s-ink-2)">{v.closedReason}</p>}

          {v.canRespond && !readOnly && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="mt-5 inline-flex min-h-12 w-full cursor-pointer items-center justify-center border border-(--s-line) text-(length:--fs-14) text-(--s-ink) hover:border-(--s-ink)">
              {v.bid ? 'Διόρθωση προσφοράς' : 'Τελικά θα δώσω προσφορά'}
            </button>
          )}

          {v.canRespond && !readOnly && editing && !declining && (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <p className="font-site text-(length:--fs-20) font-light">Η προσφορά σας</p>
              <label className="block">
                <span className="text-(length:--fs-13) text-(--s-mute)">Συνολικό ποσό χωρίς ΦΠΑ (€) *</span>
                <input inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="π.χ. 4.850" className={`${field} font-num mt-1 text-(length:--fs-20) tabular-nums`} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-(length:--fs-13) text-(--s-mute)">Πιθανή έναρξη</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${field} mt-1`} />
                </label>
                <label className="block">
                  <span className="text-(length:--fs-13) text-(--s-mute)">Διάρκεια (ημέρες)</span>
                  <input inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} placeholder="π.χ. 10" className={`${field} mt-1`} />
                </label>
              </div>
              <label className="block">
                <span className="text-(length:--fs-13) text-(--s-mute)">Σχόλια (τι περιλαμβάνει, αποκλίσεις στις ποσότητες κ.λπ.)</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={4000} className={`${field} mt-1 py-2`} />
              </label>
              <label className="flex cursor-pointer items-start gap-3 text-(length:--fs-14) text-(--s-ink)">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#1C3241]" />
                <span>Αποδέχομαι τους όρους του αιτήματος και δεσμεύομαι για την προσφορά μου για 30 ημέρες, με βάση τα specs του PDF.</span>
              </label>
              {error && <p role="alert" className="border-l-2 border-[#B42318] bg-[#B42318]/5 px-3 py-2 text-(length:--fs-13) text-[#B42318]">{error}</p>}
              <button type="submit" disabled={pending} className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 bg-(--s-ink) text-(length:--fs-15) font-medium text-white transition-colors hover:bg-[#2C4556] disabled:opacity-50">
                {pending ? <FiLoader className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FiCheck className="size-4" aria-hidden />}
                {v.bid ? 'Αποθήκευση διόρθωσης' : 'Υποβολή προσφοράς'}
              </button>
              {!v.bid && (
                <button type="button" onClick={() => { setDeclining(true); setError(null); }} className="w-full cursor-pointer text-center text-(length:--fs-13) text-(--s-mute) underline-offset-4 hover:text-(--s-ink) hover:underline">
                  Δεν θα δώσω προσφορά
                </button>
              )}
            </form>
          )}

          {v.canRespond && !readOnly && declining && (
            <div className="space-y-4">
              <p className="font-site text-(length:--fs-20) font-light">Δεν θα δώσετε προσφορά;</p>
              <label className="block">
                <span className="text-(length:--fs-13) text-(--s-mute)">Λόγος (προαιρετικά)</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} className={`${field} mt-1 py-2`} />
              </label>
              {error && <p role="alert" className="border-l-2 border-[#B42318] bg-[#B42318]/5 px-3 py-2 text-(length:--fs-13) text-[#B42318]">{error}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setDeclining(false)} className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center border border-(--s-line) text-(length:--fs-14) text-(--s-ink-2) hover:border-(--s-ink)">Πίσω</button>
                <button type="button" disabled={pending} onClick={() => post('decline', { reason })} className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 bg-(--s-ink) text-(length:--fs-14) text-white disabled:opacity-50">
                  {pending && <FiLoader className="size-4 animate-spin" aria-hidden />}Επιβεβαίωση
                </button>
              </div>
            </div>
          )}
          {readOnly && <p className="mt-4 text-(length:--fs-13) text-(--s-mute)">Προβολή ως — μόνο ανάγνωση.</p>}
        </div>
        <p className="mt-4 flex gap-2 text-(length:--fs-12) leading-relaxed text-(--s-mute)">
          <FiShield className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Για λόγους απόδειξης καταγράφονται η ημερομηνία/ώρα, η διεύθυνση IP και η συσκευή σε κάθε ενέργεια (άνοιγμα, λήψη PDF, υποβολή).
            {v.specsSha256 && <> Αποτύπωμα του PDF: <span className="font-mono break-all">{v.specsSha256.slice(0, 16)}…</span></>}
          </span>
        </p>
      </section>
    </div>
  );
}
