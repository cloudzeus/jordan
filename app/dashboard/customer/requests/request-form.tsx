'use client';

// Νέο αίτημα προσφοράς: τι θέλετε, περιγραφή, χώρος, πότε, φωτογραφίες ή κάτοψη. Ύφος website.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiCamera, FiCheck, FiLoader, FiSend, FiX } from 'react-icons/fi';
import { createOfferRequestAction } from './actions';
import { SitePicker, type PickSite } from './site-picker';

const field = 'mt-1 w-full border border-(--s-line) bg-white px-3 text-(length:--fs-15) outline-hidden focus-visible:border-(--s-ink)';

export function RequestForm({ disabledReason, sites = [] }: { disabledReason?: string | null; sites?: PickSite[] }) {
  const router = useRouter();
  const [kind, setKind] = React.useState<'PRODUCT_INSTALL' | 'PRODUCT'>('PRODUCT_INSTALL');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [site, setSite] = React.useState('');
  const [siteId, setSiteId] = React.useState(() => (sites.find((s) => s.isDefault) ?? sites[0])?.id ?? '');
  const [wanted, setWanted] = React.useState('');
  const [files, setFiles] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const [tried, setTried] = React.useState(false);
  const hasSite = !!siteId || site.trim().length >= 2;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!hasSite) { document.getElementById(sites.length ? 'rq-site-text' : 'rq-site')?.focus(); return; }
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set('data', JSON.stringify({ title, description, site: siteId ? null : site, siteId: siteId || null, wanted: wanted || null, kind }));
      for (const f of files) fd.append('photos', f);
      const r = await createOfferRequestAction(fd);
      if (!r.ok) { setError(r.message); return; }
      setSent(r.data.ref);
      setTitle(''); setDescription(''); setSite(''); setWanted(''); setFiles([]); setTried(false);
      router.refresh();
    });
  };

  if (disabledReason) return <p className="border-l-2 border-(--s-accent) bg-(--s-paper) px-5 py-4 text-(length:--fs-14) text-(--s-ink-2)">{disabledReason}</p>;

  return (
    <form onSubmit={submit} className="space-y-5 border border-(--s-line) bg-white p-5 md:p-6">
      <fieldset>
        <legend className="text-(length:--fs-13) text-(--s-mute)">Τι χρειάζεστε;</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {([['PRODUCT_INSTALL', 'Υλικά & τοποθέτηση', 'Αναλαμβάνουμε και την εφαρμογή'], ['PRODUCT', 'Μόνο υλικά', 'Τα τοποθετεί δικό σας συνεργείο']] as const).map(([v, l, h]) => (
            <label key={v} className={`flex min-h-12 cursor-pointer items-start gap-2 border px-3 py-2.5 text-(length:--fs-14) transition-colors ${kind === v ? 'border-(--s-ink) bg-(--s-paper)' : 'border-(--s-line) hover:border-(--s-ink)'}`}>
              <input type="radio" name="rq-kind" value={v} checked={kind === v} onChange={() => setKind(v)} className="sr-only" />
              <span className={`mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full border ${kind === v ? 'border-(--s-ink) bg-(--s-ink) text-white' : 'border-(--s-line)'}`}>{kind === v && <FiCheck className="size-3" aria-hidden />}</span>
              <span><span className="block text-(--s-ink)">{l}</span><span className="block text-(length:--fs-12) text-(--s-mute)">{h}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="rq-title" className="block text-(length:--fs-13) text-(--s-mute)">Σύντομος τίτλος <span aria-hidden>*</span></label>
        <input id="rq-title" required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="π.χ. Πέτρινο δάπεδο σαλονιού & διαδρόμου" className={`${field} min-h-12`} />
      </div>
      <div>
        <label htmlFor="rq-desc" className="block text-(length:--fs-13) text-(--s-mute)">Περιγραφή <span aria-hidden>*</span></label>
        <textarea id="rq-desc" required value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={4000}
          placeholder="Χώροι, περίπου τετραγωνικά, υλικό ή στυλ που σας αρέσει, τι υπάρχει σήμερα (π.χ. παλιά πλακάκια)…" className={`${field} py-2`} />
        <p className="mt-1 text-(length:--fs-12) text-(--s-mute)">Μια φωτογραφία ή μια κάτοψη μάς βοηθά να σας δώσουμε ακριβή τιμή.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SitePicker id="rq-site" sites={sites} value={siteId} onChange={setSiteId} text={site} onText={setSite} field={field} showError={tried} />
        <div>
          <label htmlFor="rq-when" className="block text-(length:--fs-13) text-(--s-mute)">Πότε θα θέλατε να ξεκινήσουμε</label>
          <input id="rq-when" type="date" value={wanted} onChange={(e) => setWanted(e.target.value)} className={`${field} min-h-12`} />
        </div>
      </div>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 bg-(--s-paper) px-2 py-1 text-(length:--fs-13)">
              <FiCamera className="size-3.5" aria-hidden /><span className="max-w-40 truncate">{f.name}</span>
              <button type="button" aria-label={`Αφαίρεση ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="inline-flex size-8 cursor-pointer items-center justify-center text-(--s-mute) hover:text-(--s-ink)"><FiX className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="border-l-2 border-[#B42318] bg-[#B42318]/5 px-3 py-2 text-(length:--fs-13) text-[#B42318]">{error}</p>}
      {sent && <p role="status" className="border-l-2 border-[#2F6B3A] bg-(--s-paper) px-3 py-2 text-(length:--fs-14) text-(--s-ink-2)">Λάβαμε το αίτημα <b className="font-medium text-(--s-ink)">{sent}</b>. Θα σας ειδοποιήσουμε μόλις η προσφορά είναι έτοιμη — σας στείλαμε και επιβεβαίωση με email.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-(length:--fs-14) text-(--s-ink) focus-within:underline">
          <FiCamera className="size-4 text-(--s-accent)" aria-hidden /><span className="s-link">Φωτογραφίες ή κάτοψη</span>
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { const l = e.target.files; if (l) setFiles((x) => [...x, ...[...l]].slice(0, 8)); e.target.value = ''; }} />
        </label>
        <button type="submit" disabled={pending || title.trim().length < 3 || description.trim().length < 10} className="p-btn p-btn-primary">
          {pending ? <FiLoader className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FiSend className="size-4" aria-hidden />}
          {pending ? 'Αποστολή…' : 'Αποστολή αιτήματος'}
        </button>
      </div>
    </form>
  );
}
